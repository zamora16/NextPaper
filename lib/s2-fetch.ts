import { authHeaders } from "~lib/api-key"
import { throttle } from "~lib/rate-limit"

export class RateLimitedError extends Error {
  constructor() {
    super(
      "Semantic Scholar esta limitando las peticiones. Vuelve a intentarlo en un momento."
    )
  }
}

// A 403 means Semantic Scholar refused the key (revoked, or mistyped in a way
// the format check cannot see). Retrying cannot fix it.
export class ApiKeyRejectedError extends Error {
  constructor() {
    super(
      "Semantic Scholar ha rechazado tu clave de API. Revísala en Ajustes (⚙) o quítala para usar NextPaper sin clave."
    )
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const RETRY_BASE_MS = 350
const RETRY_CAP_MS = 3000

// Failures are random and independent (see rate-limit.ts), so the fastest
// strategy is a short wait and another try: 0.35 s, 0.5 s, 0.8 s, 1.2 s,
// 1.8 s, 2.7 s, then 3 s. The old schedule (1.5 s doubling up to 10 s) turned
// an unlucky request into many seconds of idle time.
export function retryDelay(attempt: number, random = Math.random): number {
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 1.5 ** attempt) + random() * 250
}

// api.semanticscholar.org is declared in host_permissions, so extension
// fetches skip CORS and 429s arrive as real responses. Without that
// permission the browser would hide them behind "Failed to fetch". Rate
// limited or failed requests are retried, honoring Retry-After when present.
export async function s2Fetch(
  url: string,
  init: { retries?: number; method?: string; body?: unknown } = {}
): Promise<Response> {
  const { retries = 8, method = "GET", body } = init

  const headers = new Headers(await authHeaders())
  if (body !== undefined) headers.set("content-type", "application/json")

  for (let attempt = 0; ; attempt++) {
    let retryAfterMs = 0

    try {
      const response = await throttle(() =>
        fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body)
        })
      )
      if (response.status !== 429 && response.status < 500) return response
      if (attempt >= retries) return response
      retryAfterMs = Number(response.headers.get("retry-after") ?? 0) * 1000
    } catch {
      if (attempt >= retries) throw new RateLimitedError()
    }

    await sleep(Math.max(retryAfterMs, retryDelay(attempt)))
  }
}
