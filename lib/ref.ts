// A paper reference ("DOI:...", "ARXIV:...", a paper id or "QUERY:<text>") ends
// up in request URLs and in storage keys. It comes from a web page's metadata
// or from what the user types, so it is bounded and stripped of anything odd
// before it is used.
export const MAX_REF_LENGTH = 300

export function isPlausibleRef(ref: unknown): ref is string {
  return (
    typeof ref === "string" &&
    ref.length > 0 &&
    ref.length <= MAX_REF_LENGTH &&
    // control characters (including newlines) never belong in an id
    !/[\u0000-\u001f\u007f]/.test(ref)
  )
}
