// Optional: set PLASMO_PUBLIC_S2_API_KEY in a .env.local file to raise the
// Semantic Scholar rate limit above the shared anonymous pool. Get a free
// key at https://www.semanticscholar.org/product/api#api-key-form
// Note this ends up in the built extension bundle, visible to anyone who
// inspects it — acceptable for a free, rate-limit-only key, not a secret.
const API_KEY = process.env.PLASMO_PUBLIC_S2_API_KEY

export function authHeaders(): HeadersInit | undefined {
  return API_KEY ? { "x-api-key": API_KEY } : undefined
}
