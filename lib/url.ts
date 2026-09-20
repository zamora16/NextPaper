// Links in the interface come from data we do not control (Semantic Scholar
// responses, imported files). Only http(s) may become an href: a "javascript:"
// or "data:" URL must never be one.
export function httpUrl(value: unknown): string | undefined {
  return typeof value === "string" && /^https?:\/\//i.test(value)
    ? value
    : undefined
}
