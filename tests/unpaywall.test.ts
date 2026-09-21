import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  findOpenCopy,
  openCopyOf,
  peekOpenCopy,
  UNPAYWALL_PREFIX
} from "~lib/unpaywall"

import { installChrome, type FakeChrome } from "./helpers/chrome"

const DAY = 24 * 60 * 60 * 1000
const PDF = { url: "https://repo.org/a.pdf", pdf: true }

describe("openCopyOf", () => {
  it("takes the PDF of the best location", () => {
    expect(
      openCopyOf({
        is_oa: true,
        best_oa_location: { url_for_pdf: "https://repo.org/a.pdf" },
        oa_locations: [{ url_for_pdf: "https://other.org/b.pdf" }]
      })
    ).toEqual(PDF)
  })

  it("prefers any PDF to a landing page, even when the best location is a page", () => {
    expect(
      openCopyOf({
        is_oa: true,
        best_oa_location: {
          url: "https://landing.org/page",
          url_for_pdf: null
        },
        oa_locations: [
          { url_for_pdf: null },
          { url_for_pdf: "https://other.org/b.pdf" }
        ]
      })
    ).toEqual({ url: "https://other.org/b.pdf", pdf: true })
  })

  it("offers an open landing page, but never calls it a PDF", () => {
    expect(
      openCopyOf({
        is_oa: true,
        best_oa_location: { url: "https://landing.org/page", url_for_pdf: null }
      })
    ).toEqual({ url: "https://landing.org/page", pdf: false })
  })

  it("does not offer a page of a paper that is not open", () => {
    expect(
      openCopyOf({
        is_oa: false,
        best_oa_location: { url: "https://landing.org/page", url_for_pdf: null }
      })
    ).toBeNull()
  })

  it("never returns a link that is not http(s)", () => {
    expect(
      openCopyOf({
        is_oa: true,
        best_oa_location: {
          url_for_pdf: "javascript:alert(1)",
          url: "data:text/html,x"
        }
      })
    ).toBeNull()
  })

  it("copes with an empty or odd answer", () => {
    expect(openCopyOf(undefined)).toBeNull()
    expect(openCopyOf({})).toBeNull()
    expect(openCopyOf({ oa_locations: null })).toBeNull()
  })
})

describe("findOpenCopy", () => {
  let chrome: FakeChrome
  let fetchMock: ReturnType<typeof vi.fn>
  const found = (url = "https://repo.org/a.pdf") =>
    new Response(
      JSON.stringify({ is_oa: true, best_oa_location: { url_for_pdf: url } }),
      { status: 200 }
    )
  const status = (code: number) => new Response("", { status: code })
  const run = async (doi: string) => {
    const pending = findOpenCopy(doi)
    await vi.runAllTimersAsync()
    return pending
  }

  beforeEach(() => {
    chrome = installChrome()
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("asks once, then serves the same DOI from the cache", async () => {
    fetchMock.mockResolvedValue(found())
    expect(await run("10.1186/ABC")).toEqual(PDF)
    expect(await run("10.1186/abc")).toEqual(PDF)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chrome.data.has(UNPAYWALL_PREFIX + "10.1186/abc")).toBe(true)
  })

  it("puts the DOI in the path, encoded, with the contact address Unpaywall requires", async () => {
    fetchMock.mockResolvedValue(found())
    await run("10.1002/(SICI)1097<x>#1")
    const url = String(fetchMock.mock.calls[0][0])
    expect(url.startsWith("https://api.unpaywall.org/v2/10.1002%2F")).toBe(true)
    expect(url).toContain("%23")
    expect(url).toMatch(/[?&]email=[^&]+%40/)
  })

  it("keeps the difference between a PDF and a page when it comes back from storage", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          is_oa: true,
          best_oa_location: { url: "https://landing.org/p", url_for_pdf: null }
        })
      )
    )
    expect(await run("10.1/page")).toEqual({
      url: "https://landing.org/p",
      pdf: false
    })
    expect(await run("10.1/page")).toEqual({
      url: "https://landing.org/p",
      pdf: false
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("remembers that there is no free copy and does not ask again", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ is_oa: false, oa_locations: [] }))
    )
    expect(await run("10.1/closed")).toBeNull()
    expect(await run("10.1/closed")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      (chrome.data.get(UNPAYWALL_PREFIX + "10.1/closed") as any).u
    ).toBeNull()
  })

  it("treats 404 and 422 as 'no free copy' without retrying", async () => {
    fetchMock.mockResolvedValue(status(404))
    expect(await run("10.48550/arXiv.1")).toBeNull()
    fetchMock.mockResolvedValue(status(422))
    expect(await run("not-a-doi")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries a 429 or a network error, and then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(found())
    expect(await run("10.1/flaky")).toEqual(PDF)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("gives up as 'could not ask' and does not cache that", async () => {
    fetchMock.mockResolvedValue(status(503))
    expect(await run("10.1/down")).toBeUndefined()
    expect(chrome.data.has(UNPAYWALL_PREFIX + "10.1/down")).toBe(false)
    fetchMock.mockResolvedValue(found())
    expect(await run("10.1/down")).toEqual(PDF)
  })

  it("does not retry other client errors", async () => {
    fetchMock.mockResolvedValue(status(403))
    expect(await run("10.1/x")).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("still returns the copy when the cache cannot be written", async () => {
    fetchMock.mockResolvedValue(found())
    chrome.quotaBytes = 0
    expect(await run("10.1/full")).toEqual(PDF)
  })

  it("asks again after the cache expires: a miss after 7 days, a hit after 30", async () => {
    chrome.data.set(UNPAYWALL_PREFIX + "10.1/miss", {
      u: null,
      at: Date.now() - 8 * DAY
    })
    chrome.data.set(UNPAYWALL_PREFIX + "10.1/hit", {
      u: "https://repo.org/old.pdf",
      p: true,
      at: Date.now() - 29 * DAY
    })
    fetchMock.mockResolvedValue(found())

    expect(await run("10.1/hit")).toEqual({
      url: "https://repo.org/old.pdf",
      pdf: true
    })
    expect(fetchMock).not.toHaveBeenCalled() // 29 days: still fresh
    await run("10.1/miss")
    expect(fetchMock).toHaveBeenCalledTimes(1) // 8 days: retried
  })
})

describe("peekOpenCopy", () => {
  let chrome: FakeChrome
  beforeEach(() => {
    chrome = installChrome()
  })

  it("answers from storage only: a copy, null for a known miss, undefined when never asked", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    chrome.data.set(UNPAYWALL_PREFIX + "10.1/a", {
      u: "https://repo.org/a.pdf",
      p: true,
      at: Date.now()
    })
    chrome.data.set(UNPAYWALL_PREFIX + "10.1/b", { u: null, at: Date.now() })
    expect(await peekOpenCopy("10.1/A")).toEqual(PDF)
    expect(await peekOpenCopy("10.1/b")).toBeNull()
    expect(await peekOpenCopy("10.1/never")).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("ignores an expired answer", async () => {
    chrome.data.set(UNPAYWALL_PREFIX + "10.1/old", {
      u: null,
      at: Date.now() - 8 * DAY
    })
    expect(await peekOpenCopy("10.1/old")).toBeUndefined()
  })
})
