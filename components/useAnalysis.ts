import { useEffect, useRef, useState } from "react"

import { getCachedResult } from "~lib/cache"
import { jobKey, type JobState } from "~lib/job"
import type { AnalysisResult } from "~lib/pipeline"

// How often a still-"loading" job is re-requested (rule 10).
export const WATCHDOG_MS = 25_000

// The popup only observes an analysis that runs in the background worker:
//  - it asks the worker to analyze `ref` and follows the job state in storage;
//  - while the job is "loading" it asks again every WATCHDOG_MS, because a
//    suspended worker would otherwise leave the job "loading" forever (asking
//    is idempotent and restarts the analysis if the worker died);
//  - the finished result is read from the compressed cache, not from the job.
export function useAnalysis(ref: string | null | undefined) {
  const [job, setJob] = useState<JobState>({ phase: "loading" })
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const staleRetries = useRef(new Set<string>())
  const freshStart = useRef(false)
  const phaseRef = useRef(job.phase)
  phaseRef.current = job.phase

  useEffect(() => {
    if (!ref) return

    const key = jobKey(ref)
    let active = true

    // Never show the previous paper's state while the new one loads.
    setJob({ phase: "loading" })
    // After a retry the stored state is the OLD one (the error, or the stale
    // "done"): reading it would bring it back until the worker overwrites it.
    // The worker's own "loading" arrives through onChanged.
    if (freshStart.current) {
      freshStart.current = false
    } else {
      chrome.storage.local.get([key]).then((stored) => {
        if (active && stored[key]) setJob(stored[key])
      })
    }

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[key]?.newValue) {
        setJob(changes[key].newValue)
      }
    }
    chrome.storage.onChanged.addListener(onChanged)

    // The worker keeps going even if this popup is closed; reopening just
    // resumes observing its state.
    chrome.runtime.sendMessage({ type: "analyze", ref })

    const watchdog = setInterval(() => {
      if (phaseRef.current === "loading") {
        chrome.runtime.sendMessage({ type: "analyze", ref })
      }
    }, WATCHDOG_MS)

    return () => {
      active = false
      clearInterval(watchdog)
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [ref, attempt])

  useEffect(() => {
    if (job.phase !== "done" || !ref) {
      setResult(null)
      return
    }

    let live = true
    getCachedResult(ref).then((cached) => {
      if (!live) return
      if (cached) {
        setResult(cached)
        return
      }
      // A "done" job without a cached result is a leftover (expired, pruned
      // or written by an older version): analyze again, once per paper.
      setResult(null)
      if (!staleRetries.current.has(ref)) {
        staleRetries.current.add(ref)
        freshStart.current = true
        setJob({ phase: "loading" })
        setAttempt((n) => n + 1)
      }
    })
    return () => {
      live = false
    }
  }, [job.phase, ref])

  const retry = () => {
    freshStart.current = true
    setJob({ phase: "loading" })
    setAttempt((n) => n + 1)
  }

  return { job, result, retry }
}
