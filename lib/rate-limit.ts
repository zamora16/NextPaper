// Concurrency limiter for Semantic Scholar requests.
//
// Measured 2026-09-19 (scripts in docs/PERFORMANCE.md): the API answers 429 to
// ~25-45% of requests at ANY pace (1.5 s, 1.0 s, 0.6 s or 2.5 s apart) — it is
// server-side throttling, not a function of our rate. A fixed 1.5 s pause
// between requests therefore protected nothing and made a cold analysis take
// 15-35 s. What does hurt is a large simultaneous burst (12 at once: 25% ok).
// So: a few requests in flight at a time, and failures are retried quickly
// (see s2-fetch.ts) instead of waiting.

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>
}

export function createLimiter(maxConcurrent: number, minGapMs: number): Limiter {
  let active = 0
  let lastStart = 0
  const waiting: (() => void)[] = []

  const next = () => {
    if (active >= maxConcurrent) return
    const start = waiting.shift()
    if (!start) return
    active++
    start()
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(async () => {
          // Space out request starts so a group never hits at once. The slot
          // is reserved synchronously: tasks released in the same tick would
          // otherwise all read the same `lastStart` and fire together.
          const startAt = Math.max(Date.now(), lastStart + minGapMs)
          lastStart = startAt
          const wait = startAt - Date.now()
          if (wait > 0) await new Promise((r) => setTimeout(r, wait))
          try {
            resolve(await task())
          } catch (error) {
            reject(error)
          } finally {
            active--
            next()
          }
        })
        next()
      })
    }
  }
}

const MAX_CONCURRENT = 3
const MIN_GAP_MS = 120

export const semanticScholarLimiter = createLimiter(MAX_CONCURRENT, MIN_GAP_MS)
export const throttle = <T>(task: () => Promise<T>) =>
  semanticScholarLimiter.run(task)
