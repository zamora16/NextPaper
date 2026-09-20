import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createLimiter } from "~lib/rate-limit"
import { retryDelay } from "~lib/s2-fetch"

describe("createLimiter", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Runs `count` tasks of `durationMs` each and records concurrency and starts.
  async function drive(maxConcurrent: number, minGapMs: number, count: number, durationMs: number) {
    const limiter = createLimiter(maxConcurrent, minGapMs)
    let active = 0
    let peak = 0
    const starts: number[] = []

    const results = Array.from({ length: count }, (_, i) =>
      limiter.run(async () => {
        starts.push(Date.now())
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, durationMs))
        active--
        return i
      })
    )

    await vi.runAllTimersAsync()
    return { values: await Promise.all(results), peak, starts }
  }

  it("never runs more tasks at once than allowed", async () => {
    const { peak, values } = await drive(3, 0, 10, 100)
    expect(peak).toBe(3)
    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it("keeps a minimum gap between starts, so a group never fires at once", async () => {
    const { starts } = await drive(3, 120, 3, 500)
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(120)
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(120)
  })

  it("runs in parallel: 6 tasks of 1 s with 3 slots finish in about 2 s, not 6", async () => {
    const limiter = createLimiter(3, 0)
    const finished: number[] = []
    const t0 = Date.now()
    const all = Array.from({ length: 6 }, () =>
      limiter.run(async () => {
        await new Promise((r) => setTimeout(r, 1000))
        finished.push(Date.now() - t0)
      })
    )
    await vi.runAllTimersAsync()
    await Promise.all(all)
    expect(Math.max(...finished)).toBeLessThanOrEqual(2100)
  })

  it("a failing task does not block the ones queued behind it", async () => {
    const limiter = createLimiter(1, 0)
    const failing = limiter.run(async () => {
      throw new Error("boom")
    })
    const after = limiter.run(async () => "ok")
    // attach the assertions before advancing time so the rejection is handled
    const checks = Promise.all([
      expect(failing).rejects.toThrow("boom"),
      expect(after).resolves.toBe("ok")
    ])
    await vi.runAllTimersAsync()
    await checks
  })
})

describe("retryDelay", () => {
  it("starts short, grows, and is capped", () => {
    const fixed = () => 0
    const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => retryDelay(n, fixed))
    expect(delays[0]).toBe(350)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1])
    }
    expect(Math.max(...delays)).toBe(3000)
  })

  it("adds at most 250 ms of jitter", () => {
    expect(retryDelay(0, () => 1)).toBeCloseTo(350 + 250)
    expect(retryDelay(20, () => 1)).toBeCloseTo(3000 + 250)
  })

  it("total wait over the first five retries stays under 6 s", () => {
    const total = [0, 1, 2, 3, 4].reduce((sum, n) => sum + retryDelay(n, () => 1), 0)
    expect(total).toBeLessThan(6000)
  })
})
