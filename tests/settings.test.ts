import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authHeaders } from "~lib/api-key"
import { isPlausibleRef, MAX_REF_LENGTH } from "~lib/ref"
import { ApiKeyRejectedError, s2Fetch } from "~lib/s2-fetch"
import { getSeed } from "~lib/semantic-scholar"
import {
  checkApiKey,
  finishSetup,
  getSettings,
  maskKey,
  normalizeApiKey,
  removeApiKey,
  saveApiKey,
  SETTINGS_KEY
} from "~lib/settings"
import { httpUrl } from "~lib/url"

import { installChrome, type FakeChrome } from "./helpers/chrome"

// A realistic key: about 40 letters and digits.
const KEY = "AbCdEf0123456789AbCdEf0123456789AbCdEf01"

let chrome: FakeChrome
beforeEach(() => {
  chrome = installChrome()
})
afterEach(() => vi.unstubAllGlobals())

describe("normalizeApiKey", () => {
  it("accepts a key and cleans whitespace and quotes around it", () => {
    expect(normalizeApiKey(KEY)).toBe(KEY)
    expect(normalizeApiKey(`  ${KEY}\n`)).toBe(KEY)
    expect(normalizeApiKey(`"${KEY}"`)).toBe(KEY)
    expect(normalizeApiKey(`'${KEY}'`)).toBe(KEY)
  })

  it("rejects things that are clearly not a key", () => {
    expect(normalizeApiKey("")).toBeNull()
    expect(normalizeApiKey("abc")).toBeNull() // too short
    expect(normalizeApiKey("x-api-key: " + KEY)).toBeNull() // header pasted
    expect(normalizeApiKey("mi clave es " + KEY)).toBeNull() // a sentence
    expect(normalizeApiKey(KEY + "\n" + KEY)).toBeNull() // two lines
    expect(normalizeApiKey("a".repeat(500))).toBeNull() // absurdly long
    expect(normalizeApiKey(null)).toBeNull()
    expect(normalizeApiKey({ key: KEY })).toBeNull()
  })
})

describe("maskKey", () => {
  it("shows only the last four characters", () => {
    expect(maskKey(KEY)).toBe("••••••••Ef01")
    expect(maskKey(KEY)).not.toContain(KEY.slice(0, 20))
  })
})

describe("settings storage", () => {
  it("starts with no key and the first-run screen pending", async () => {
    expect(await getSettings()).toEqual({ setupDone: false, s2ApiKey: null })
  })

  it("saving a key also finishes the setup", async () => {
    await saveApiKey(KEY)
    expect(await getSettings()).toEqual({ setupDone: true, s2ApiKey: KEY })
  })

  it("'continue without a key' finishes the setup and keeps no key", async () => {
    await finishSetup()
    expect(await getSettings()).toEqual({ setupDone: true, s2ApiKey: null })
  })

  it("removing the key keeps the setup done (the first-run screen does not come back)", async () => {
    await saveApiKey(KEY)
    await removeApiKey()
    expect(await getSettings()).toEqual({ setupDone: true, s2ApiKey: null })
  })

  it("does not trust what is stored: a corrupt or edited value never becomes a key", async () => {
    chrome.data.set(SETTINGS_KEY, {
      setupDone: "yes",
      s2ApiKey: "bad key\r\nx-injected: 1"
    })
    expect(await getSettings()).toEqual({ setupDone: false, s2ApiKey: null })
  })

  it("survives storage pruning: it is a key pruneStorage does not know", async () => {
    await saveApiKey(KEY)
    const { pruneStorage } = await import("~lib/cache")
    await pruneStorage()
    expect((await getSettings()).s2ApiKey).toBe(KEY)
  })

  it("keeps concurrent changes (queued read-modify-write)", async () => {
    await Promise.all([finishSetup(), saveApiKey(KEY)])
    expect(await getSettings()).toEqual({ setupDone: true, s2ApiKey: KEY })
  })
})

describe("checkApiKey", () => {
  const respond = (...statuses: (number | "network")[]) => {
    const fetchMock = vi.fn()
    for (const status of statuses) {
      if (status === "network")
        fetchMock.mockRejectedValueOnce(new TypeError("x"))
      else fetchMock.mockResolvedValueOnce(new Response("{}", { status }))
    }
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }
  const run = async (key = KEY) => {
    const pending = checkApiKey(key)
    await vi.runAllTimersAsync()
    return pending
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("says valid when Semantic Scholar accepts it, and sends the key as a header", async () => {
    const fetchMock = respond(200)
    expect(await run()).toBe("valid")
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain("api.semanticscholar.org")
    expect(init.headers["x-api-key"]).toBe(KEY)
  })

  it("says invalid on 403 (and 401), without retrying", async () => {
    const fetchMock = respond(403)
    expect(await run()).toBe("invalid")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    respond(401)
    expect(await run()).toBe("invalid")
  })

  it("retries a 429 or a network error, because those say nothing about the key", async () => {
    const fetchMock = respond(429, "network", 200)
    expect(await run()).toBe("valid")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("says unknown, not invalid, when it could not be checked", async () => {
    respond(429, 429, 429)
    expect(await run()).toBe("unknown")
    respond("network", 500, "network")
    expect(await run()).toBe("unknown")
  })
})

describe("the key in requests", () => {
  const fetchMock = () => {
    const mock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", mock)
    return mock
  }

  it("sends no key header until the user sets one", async () => {
    expect(await authHeaders()).toBeUndefined()
    const mock = fetchMock()
    await s2Fetch("https://api.semanticscholar.org/x")
    const headers = new Headers((mock.mock.calls[0] as any)[1].headers)
    expect(headers.has("x-api-key")).toBe(false)
  })

  it("sends the user's key once saved, and stops when it is removed", async () => {
    await saveApiKey(KEY)
    const mock = fetchMock()
    await s2Fetch("https://api.semanticscholar.org/x")
    expect(
      new Headers((mock.mock.calls[0] as any)[1].headers).get("x-api-key")
    ).toBe(KEY)

    await removeApiKey()
    await s2Fetch("https://api.semanticscholar.org/x")
    expect(
      new Headers((mock.mock.calls[1] as any)[1].headers).has("x-api-key")
    ).toBe(false)
  })

  it("explains a rejected key instead of pretending it is a rate limit", async () => {
    await saveApiKey(KEY)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 403 }))
    )
    const error = await getSeed("DOI:10.1/x").catch((e) => e)
    expect(error).toBeInstanceOf(ApiKeyRejectedError)
    expect(error.message).toMatch(/clave/i)
    expect(error.message).toMatch(/Ajustes/)
  })
})

describe("httpUrl", () => {
  it("lets only http(s) links through", () => {
    expect(httpUrl("https://example.org/a")).toBe("https://example.org/a")
    expect(httpUrl("HTTP://example.org")).toBe("HTTP://example.org")
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "//evil.org",
      "ftp://x",
      "",
      null,
      5,
      {}
    ]) {
      expect(httpUrl(bad as any), String(bad)).toBeUndefined()
    }
  })
})

describe("isPlausibleRef", () => {
  it("accepts the kinds of reference the app uses", () => {
    for (const ref of [
      "DOI:10.1186/s40337-024-01004-0",
      "ARXIV:1706.03762",
      "PMID:123",
      "a".repeat(40),
      "QUERY:body image and eating disorders"
    ]) {
      expect(isPlausibleRef(ref), ref).toBe(true)
    }
  })

  it("rejects what could only come from something hostile or broken", () => {
    expect(isPlausibleRef("")).toBe(false)
    expect(isPlausibleRef(5)).toBe(false)
    expect(isPlausibleRef(null)).toBe(false)
    expect(isPlausibleRef("x".repeat(MAX_REF_LENGTH + 1))).toBe(false)
    expect(isPlausibleRef("DOI:10.1/a\nx-api-key: 1")).toBe(false)
    expect(isPlausibleRef("DOI:10.1/\u0000")).toBe(false)
  })
})
