import { pruneStorage } from "~lib/cache"
import { jobKey, type JobState } from "~lib/job"
import { analyze as analyzeRef } from "~lib/pipeline"
import { checkForUpdates, refreshBadge } from "~lib/updates"

const inFlight = new Map<string, Promise<void>>()
let updatesInFlight: Promise<void> | null = null

const UPDATES_ALARM = "nextpaper-updates"

const setJob = (ref: string, state: JobState) =>
  chrome.storage.local.set({ [jobKey(ref)]: state })

async function analyze(ref: string): Promise<void> {
  try {
    await setJob(ref, { phase: "loading" })
    // analyzeRef stores the result (compressed) in the cache; the job state
    // only signals completion.
    await analyzeRef(ref, (step) => setJob(ref, { phase: "loading", step }))
    await setJob(ref, { phase: "done" })
  } catch (err) {
    await setJob(ref, {
      phase: "error",
      message: err instanceof Error ? err.message : "Error desconocido."
    })
  }
  await pruneStorage(inFlight.keys()).catch(() => {})
}

// Chrome suspends an MV3 service worker after ~30 s without extension
// activity, and a long analysis spends much of its time waiting on rate-limit
// backoffs. Calling a cheap extension API periodically keeps it alive while
// there is work in flight.
let keepAlive: ReturnType<typeof setInterval> | null = null

function syncKeepAlive() {
  const busy = inFlight.size > 0 || updatesInFlight !== null
  if (busy && !keepAlive) {
    keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000)
  } else if (!busy && keepAlive) {
    clearInterval(keepAlive)
    keepAlive = null
  }
}

function runUpdates(): Promise<void> {
  if (!updatesInFlight) {
    // A failed check is recorded in the alerts state (lastError) and shown in
    // the panel, so there is nothing more to do with the error here.
    updatesInFlight = checkForUpdates()
      .catch(() => {})
      .finally(() => {
        updatesInFlight = null
        syncKeepAlive()
      })
    syncKeepAlive()
  }
  return updatesInFlight
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "analyze" && typeof message.ref === "string") {
    if (!inFlight.has(message.ref)) {
      inFlight.set(
        message.ref,
        analyze(message.ref).finally(() => {
          inFlight.delete(message.ref)
          syncKeepAlive()
        })
      )
      syncKeepAlive()
    }
    sendResponse({ started: true })
  }

  if (message?.type === "check-updates") {
    runUpdates()
    sendResponse({ started: true })
  }
})

// Once a day, look for new papers related to what the user saved.
chrome.alarms.get(UPDATES_ALARM).then((alarm) => {
  if (!alarm) {
    chrome.alarms.create(UPDATES_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: 24 * 60
    })
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATES_ALARM) runUpdates()
})

refreshBadge()
pruneStorage().catch(() => {})
