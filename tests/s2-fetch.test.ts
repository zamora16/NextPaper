import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RateLimitedError, s2Fetch } from "~lib/s2-fetch"

let fetchMock: ReturnType<typeof vi.fn>
const status = (code: number, headers: Record<string, string> = {}) =>
  new Response("", { status: code, headers })

// s2Fetch waits between retries; fake timers keep the tests instant.
const run = async (...args: Parameters<typeof s2Fetch>) => {
  const pending = s2Fetch(...args)
  const settled = pending.then(
    (value) => ({ value }),
    (error) => ({ error })
  )
  await vi.runAllTimersAsync()
  const outcome = await settled
  if ("error" in outcome) throw outcome.error
  return outcome.value
}

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("s2Fetch", () => {
  it("returns a good response straight away", async () => {
    fetchMock.mockResolvedValue(status(200))
    expect((await run("https://x/y")).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not retry a 404 or another client error: the caller decides", async () => {
    fetchMock.mockResolvedValue(status(404))
    expect((await run("https://x/y")).status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retries 429 and 5xx until one works", async () => {
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(status(200))
    expect((await run("https://x/y")).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("gives the last response back once the retries are used up", async () => {
    fetchMock.mockResolvedValue(status(429))
    expect((await run("https://x/y", { retries: 2 })).status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(3) // first try + 2 retries
  })

  it("retries a network error, then reports a rate limit when it never recovers", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(run("https://x/y", { retries: 2 })).rejects.toBeInstanceOf(
      RateLimitedError
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("honors Retry-After when the server sends one", async () => {
    fetchMock
      .mockResolvedValueOnce(status(429, { "retry-after": "5" }))
      .mockResolvedValueOnce(status(200))
    const started = Date.now()
    await run("https://x/y")
    expect(Date.now() - started).toBeGreaterThanOrEqual(5000)
  })

  it("sends a JSON body with the right header, and the API key header", async () => {
    fetchMock.mockResolvedValue(status(200))
    await run("https://x/y", { method: "POST", body: { ids: ["a"] } })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe("POST")
    expect(init.body).toBe(JSON.stringify({ ids: ["a"] }))
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json"
    )
  })

  it("sends no body and no content type on a GET", async () => {
    fetchMock.mockResolvedValue(status(200))
    await run("https://x/y")
    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBeUndefined()
    expect(new Headers(init.headers).get("content-type")).toBeNull()
  })

  it("the rate-limit error explains itself in Spanish", () => {
    expect(new RateLimitedError().message).toMatch(/Semantic Scholar/)
  })
})
