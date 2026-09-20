// State of an analysis, written by the background worker and observed by the
// popup through chrome.storage — so work continues while the popup is closed.
// The result itself is NOT stored here: it lives (compressed) in the cache
// (lib/cache.ts) and the popup reads it from there once the phase is "done".
export type JobState =
  | { phase: "loading"; step?: string }
  | { phase: "done" }
  | { phase: "error"; message: string }

export const JOB_PREFIX = "nextpaper_job_"
export const jobKey = (ref: string) => `${JOB_PREFIX}${ref}`
