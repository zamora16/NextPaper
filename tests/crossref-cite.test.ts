import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CROSSREF_PREFIX, getCrossref, parseCrossref } from "~lib/crossref"

import { installChrome, type FakeChrome } from "./helpers/chrome"

const DAY = 24 * 60 * 60 * 1000

const message = {
  author: [
    { given: " Ada ", family: "Lovelace" },
    { name: "World Health Org" }
  ],
  title: ["Effects of <i>x</i> &amp; y on &quot;z&quot;"],
  "container-title": ["Journal of Eating Disorders"],
  "short-container-title": ["J Eat Disord"],
  volume: "12",
  issue: "3",
  page: "10-20",
  "article-number": "55",
  issued: { "date-parts": [[2024, 5]] },
  type: "journal-article",
  publisher: "BMC"
}

describe("parseCrossref", () => {
  it("reads authors, issue, article number, month and the journal abbreviation", () => {
    const meta = parseCrossref(message)
    expect(meta.authors).toEqual([
      { given: "Ada", family: "Lovelace", name: undefined },
      { given: undefined, family: undefined, name: "World Health Org" }
    ])
    expect(meta).toMatchObject({
      journal: "Journal of Eating Disorders",
      journalShort: "J Eat Disord",
      volume: "12",
      issue: "3",
      pages: "10-20",
      articleNumber: "55",
      year: 2024,
      month: 5,
      type: "journal-article",
      publisher: "BMC"
    })
  })

  it("strips markup and entities from the title", () => {
    expect(parseCrossref(message).title).toBe('Effects of x & y on "z"')
  })

  it("leaves missing fields undefined instead of inventing them", () => {
    const meta = parseCrossref({ title: ["Only a title"] })
    expect(meta.authors).toEqual([])
    expect(meta.title).toBe("Only a title")
    expect(meta.journal).toBeUndefined()
    expect(meta.year).toBeUndefined()
    expect(meta.issue).toBeUndefined()
  })

  it("survives an empty or missing record", () => {
    expect(parseCrossref(undefined).authors).toEqual([])
    expect(parseCrossref({}).title).toBeUndefined()
    expect(
      parseCrossref({ issued: { "date-parts": [[null]] } }).year
    ).toBeUndefined()
  })
})

describe("getCrossref", () => {
  let chrome: FakeChrome
  let fetchMock: ReturnType<typeof vi.fn>
  const ok = () => new Response(JSON.stringify({ message }), { status: 200 })
  const status = (code: number) => new Response("", { status: code })

  // Retries wait 1-4 s and requests are spaced 300 ms apart: fake timers keep
  // the tests instant.
  const run = async (doi: string) => {
    const pending = getCrossref(doi)
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

  it("fetches once, then serves the same DOI from the cache", async () => {
    fetchMock.mockResolvedValue(ok())
    const first = await run("10.1186/ABC")
    const second = await run("10.1186/abc") // DOIs are case-insensitive
    expect(first?.issue).toBe("3")
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chrome.data.has(CROSSREF_PREFIX + "10.1186/abc")).toBe(true)
  })

  it("puts the DOI in the path, encoded, and sends no e-mail by default", async () => {
    fetchMock.mockResolvedValue(ok())
    await run("10.1002/(SICI)1097<x>#1")
    const url = String(fetchMock.mock.calls[0][0])
    expect(url.startsWith("https://api.crossref.org/works/10.1002%2F")).toBe(
      true
    )
    expect(url).toContain("%23")
    expect(url).not.toContain("mailto")
  })

  it("remembers that Crossref has no record (404), e.g. arXiv DOIs, and does not ask again", async () => {
    fetchMock.mockResolvedValue(status(404))
    expect(await run("10.48550/arXiv.1706.03762")).toBeNull()
    expect(await run("10.48550/arXiv.1706.03762")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      (chrome.data.get(CROSSREF_PREFIX + "10.48550/arxiv.1706.03762") as any).m
    ).toBeNull()
  })

  it("asks again after the cache expires: a miss after 7 days, a hit after 30", async () => {
    chrome.data.set(CROSSREF_PREFIX + "10.1/miss", {
      m: null,
      at: Date.now() - 8 * DAY
    })
    chrome.data.set(CROSSREF_PREFIX + "10.1/hit", {
      m: { authors: [] },
      at: Date.now() - 29 * DAY
    })
    fetchMock.mockResolvedValue(ok())

    await run("10.1/hit")
    expect(fetchMock).not.toHaveBeenCalled() // 29 days: still fresh
    await run("10.1/miss")
    expect(fetchMock).toHaveBeenCalledTimes(1) // 8 days: retried
  })

  it("retries transient failures and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(status(503))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok())
    expect((await run("10.1/flaky"))?.issue).toBe("3")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("gives up after 3 attempts WITHOUT caching, so it is retried next time", async () => {
    fetchMock.mockResolvedValue(status(500))
    expect(await run("10.1/down")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(chrome.data.has(CROSSREF_PREFIX + "10.1/down")).toBe(false)
  })

  it("does not retry a client error, and does not cache it either", async () => {
    fetchMock.mockResolvedValue(status(400))
    expect(await run("10.1/bad")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chrome.data.has(CROSSREF_PREFIX + "10.1/bad")).toBe(false)
  })

  it("still returns the data when it cannot be cached", async () => {
    fetchMock.mockResolvedValue(ok())
    chrome.quotaBytes = 5
    expect((await run("10.1/full"))?.issue).toBe("3")
  })

  it("spaces requests out (Crossref asks clients to be gentle)", async () => {
    const starts: number[] = []
    fetchMock.mockImplementation(async () => {
      starts.push(Date.now())
      return ok()
    })
    await Promise.all([run("10.1/a"), run("10.1/b"), run("10.1/c")])
    expect(starts).toHaveLength(3)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(300)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(300)
  })
})
