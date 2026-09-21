// @vitest-environment jsdom
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react-dom/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAnalysis, WATCHDOG_MS } from "~components/useAnalysis"
import { jobKey } from "~lib/job"
import { type AnalysisResult } from "~lib/model"

import { installChrome, type FakeChrome } from "./helpers/chrome"

// The cache is compressed with browser streams that jsdom does not provide;
// its own behavior is covered in cache.test.ts.
const cached = new Map<string, AnalysisResult>()
vi.mock("~lib/cache", () => ({
  getCachedResult: vi.fn(async (ref: string) => cached.get(ref) ?? null)
}))
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const result = (label: string): AnalysisResult => ({
  groups: [{ label, papers: [] }],
  picks: []
})

let chrome: FakeChrome
let root: Root
let latest: ReturnType<typeof useAnalysis>

function Probe({ refId }: { refId: string | null | undefined }) {
  latest = useAnalysis(refId)
  return null
}

// Lets promises and effects settle.
const flush = () => act(async () => {})
const setJob = (ref: string, state: unknown) =>
  act(async () => {
    await (globalThis as any).chrome.storage.local.set({ [jobKey(ref)]: state })
  })

const mount = async (refId: string | null | undefined) => {
  await act(async () => {
    root.render(createElement(Probe, { refId }))
  })
}
const asked = (ref?: string) =>
  chrome.messages.filter(
    (m: any) => m.type === "analyze" && (ref === undefined || m.ref === ref)
  )

beforeEach(() => {
  chrome = installChrome()
  cached.clear()
  vi.useFakeTimers()
  root = createRoot(document.createElement("div"))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.useRealTimers()
})

describe("useAnalysis", () => {
  it("asks the worker to analyze the paper and starts as loading", async () => {
    await mount("DOI:10.1/x")
    expect(asked("DOI:10.1/x")).toHaveLength(1)
    expect(latest.job).toEqual({ phase: "loading" })
    expect(latest.result).toBeNull()
  })

  it("does nothing without a paper (restricted page)", async () => {
    await mount(null)
    await mount(undefined)
    expect(asked()).toHaveLength(0)
    expect(latest.result).toBeNull()
  })

  it("follows the worker's progress and then reads the finished result from the cache", async () => {
    await mount("R")
    await setJob("R", { phase: "loading", step: "Leyendo el paper..." })
    expect(latest.job).toEqual({
      phase: "loading",
      step: "Leyendo el paper..."
    })

    cached.set("R", result("done"))
    await setJob("R", { phase: "done" })
    expect(latest.job.phase).toBe("done")
    expect(latest.result).toEqual(result("done"))
  })

  it("resumes an analysis that already finished (popup reopened)", async () => {
    cached.set("R", result("earlier"))
    chrome.data.set(jobKey("R"), { phase: "done" })
    await mount("R")
    expect(latest.result).toEqual(result("earlier"))
  })

  it("exposes an error, and retry asks the worker again", async () => {
    await mount("R")
    await setJob("R", { phase: "error", message: "boom" })
    expect(latest.job).toEqual({ phase: "error", message: "boom" })
    expect(asked("R")).toHaveLength(1)

    await act(async () => latest.retry())
    expect(latest.job).toEqual({ phase: "loading" })
    expect(asked("R")).toHaveLength(2)
  })

  it("ignores changes to other papers' jobs", async () => {
    await mount("A")
    await setJob("B", { phase: "error", message: "not mine" })
    expect(latest.job).toEqual({ phase: "loading" })
  })

  describe("watchdog (rule 10)", () => {
    it("asks again every 25 s while the job is still loading", async () => {
      await mount("R")
      expect(asked("R")).toHaveLength(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WATCHDOG_MS)
      })
      expect(asked("R")).toHaveLength(2)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WATCHDOG_MS)
      })
      expect(asked("R")).toHaveLength(3)
    })

    it("stops asking once the job is done or failed", async () => {
      cached.set("R", result("ok"))
      await mount("R")
      await setJob("R", { phase: "done" })
      const before = asked("R").length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 3)
      })
      expect(asked("R")).toHaveLength(before)
    })

    it("stops when the popup closes", async () => {
      await mount("R")
      await act(async () => root.unmount())
      const before = asked("R").length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WATCHDOG_MS * 3)
      })
      expect(asked("R")).toHaveLength(before)
      expect(chrome.listeners.size).toBe(0)
      root = createRoot(document.createElement("div")) // for afterEach
    })
  })

  describe("switching papers (Explorar / Volver)", () => {
    it("shows loading for the new paper, not the previous one's state", async () => {
      cached.set("A", result("a"))
      chrome.data.set(jobKey("A"), { phase: "done" })
      await mount("A")
      expect(latest.result).toEqual(result("a"))

      await mount("B")
      expect(latest.job).toEqual({ phase: "loading" })
      expect(latest.result).toBeNull()
      expect(asked("B")).toHaveLength(1)
    })

    it("going back to a finished paper shows it again from its state", async () => {
      cached.set("A", result("a"))
      chrome.data.set(jobKey("A"), { phase: "done" })
      await mount("A")
      await mount("B")
      await mount("A")
      expect(latest.result).toEqual(result("a"))
    })
  })

  it("after a retry, moving to another finished paper still shows it (the fresh start is only for the retried paper)", async () => {
    cached.set("B", result("b"))
    chrome.data.set(jobKey("B"), { phase: "done" })
    await mount("A")
    await setJob("A", { phase: "error", message: "boom" })
    await act(async () => latest.retry())

    await mount("B")
    expect(latest.result).toEqual(result("b"))
  })

  describe("a 'done' job whose result is no longer cached", () => {
    it("analyzes again, once, instead of showing nothing forever", async () => {
      chrome.data.set(jobKey("R"), { phase: "done" }) // no cached result
      await mount("R")
      await flush()
      expect(latest.result).toBeNull()
      expect(asked("R")).toHaveLength(2) // first request + the self-healing one
      expect(latest.job.phase).toBe("loading")
    })

    it("does not loop if it keeps happening", async () => {
      chrome.data.set(jobKey("R"), { phase: "done" })
      await mount("R")
      await setJob("R", { phase: "done" }) // the worker "finishes" but nothing is cached
      await flush()
      await setJob("R", { phase: "done" })
      await flush()
      expect(asked("R").length).toBeLessThanOrEqual(3)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      const settled = asked("R").length
      await flush()
      expect(asked("R")).toHaveLength(settled)
    })
  })
})
