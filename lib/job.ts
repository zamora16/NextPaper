import type { ErrorCode } from "~lib/errors"

// What the analysis is doing, as a code plus numbers: the popup turns it into
// text in the user's language. (Stored text would stay in the language that was
// active when the worker wrote it.)
export type Step =
  | { code: "reading" }
  | { code: "gathering" }
  | { code: "scoring"; n: number }
  | { code: "searching" }
  | { code: "analyzing"; n: number }

// State of an analysis, written by the background worker and observed by the
// popup through chrome.storage — so work continues while the popup is closed.
// The result itself is NOT stored here: it lives (compressed) in the cache
// (lib/cache.ts) and the popup reads it from there once the phase is "done".
export type JobState =
  | { phase: "loading"; step?: Step }
  | { phase: "done" }
  | { phase: "error"; error: ErrorCode }

export const JOB_PREFIX = "nextpaper_job_"
export const jobKey = (ref: string) => `${JOB_PREFIX}${ref}`
