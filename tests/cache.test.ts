import { beforeEach, describe, expect, it } from "vitest"

import {
  getCachedResult,
  KEY_PREFIX,
  pruneStorage,
  setCachedResult
} from "~lib/cache"
import { compressJson } from "~lib/compress"
import { CROSSREF_PREFIX } from "~lib/crossref"
import { StorageFullError } from "~lib/errors"
import { JOB_PREFIX } from "~lib/job"
import { LIBRARY_KEY } from "~lib/library"
import type { AnalysisResult } from "~lib/pipeline"
import { UPDATES_KEY } from "~lib/updates"

import { installChrome, type FakeChrome } from "./helpers/chrome"

const DAY = 24 * 60 * 60 * 1000
const result = (label = "G"): AnalysisResult => ({
  groups: [{ label, papers: [] }],
  picks: [],
  seedYear: 2020
})

let chrome: FakeChrome
beforeEach(() => {
  chrome = installChrome()
})

// Writes a cache entry as the app would, but with a chosen age.
async function putCache(ref: string, ageMs = 0, data = result()) {
  chrome.data.set(KEY_PREFIX + ref, {
    z: await compressJson(data),
    cachedAt: Date.now() - ageMs
  })
}
const keys = () => [...chrome.data.keys()].sort()

describe("cached results", () => {
  it("returns what was stored", async () => {
    await setCachedResult("DOI:10.1/x", result("hello"))
    expect(await getCachedResult("DOI:10.1/x")).toEqual(result("hello"))
  })

  it("is a miss for a paper that was never analyzed", async () => {
    expect(await getCachedResult("DOI:10.1/none")).toBeNull()
  })

  it("stores the result compressed, under the current prefix", async () => {
    await setCachedResult("R", result())
    expect(keys()).toEqual([KEY_PREFIX + "R"])
    const entry = chrome.data.get(KEY_PREFIX + "R") as { z: string }
    expect(typeof entry.z).toBe("string")
    expect(entry.z).not.toContain("groups")
  })

  it("expires after 7 days", async () => {
    await putCache("fresh", 6 * DAY)
    await putCache("stale", 8 * DAY)
    expect(await getCachedResult("fresh")).not.toBeNull()
    expect(await getCachedResult("stale")).toBeNull()
  })

  it("treats a corrupt entry as a miss instead of throwing", async () => {
    chrome.data.set(KEY_PREFIX + "bad", {
      z: "not gzip at all",
      cachedAt: Date.now()
    })
    expect(await getCachedResult("bad")).toBeNull()
    chrome.data.set(KEY_PREFIX + "empty", { cachedAt: Date.now() })
    expect(await getCachedResult("empty")).toBeNull()
  })

  it("never serves entries written by an older strategy", async () => {
    chrome.data.set("nextpaper_cache_v8_R", {
      z: await compressJson(result("old")),
      cachedAt: Date.now()
    })
    expect(await getCachedResult("R")).toBeNull()
  })
})

describe("running out of space", () => {
  it("drops the cached results (recomputable) and retries, keeping the library", async () => {
    const library = { a: { paperId: "a", title: "Saved", note: "keep me" } }
    chrome.data.set(LIBRARY_KEY, library)
    for (let i = 0; i < 4; i++) {
      chrome.data.set(KEY_PREFIX + `old${i}`, {
        z: "x".repeat(1500),
        cachedAt: Date.now()
      })
    }
    chrome.quotaBytes = 2500 // full: the old entries plus a new one do not fit

    await setCachedResult("new", result("fresh"))

    expect(await getCachedResult("new")).toEqual(result("fresh"))
    expect(keys().filter((k) => k.startsWith(KEY_PREFIX))).toEqual([
      KEY_PREFIX + "new"
    ])
    expect(chrome.data.get(LIBRARY_KEY)).toEqual(library)
  })

  it("gives a clear error when even that is not enough", async () => {
    chrome.quotaBytes = 10
    await expect(setCachedResult("R", result())).rejects.toBeInstanceOf(
      StorageFullError
    )
  })
})

describe("pruneStorage", () => {
  it("removes expired entries and keeps fresh ones", async () => {
    await putCache("fresh", DAY)
    await putCache("stale", 8 * DAY)
    await pruneStorage()
    expect(keys()).toEqual([KEY_PREFIX + "fresh"])
  })

  it("keeps only the 40 newest entries", async () => {
    for (let i = 0; i < 45; i++) await putCache(`r${i}`, i * 1000)
    await pruneStorage()
    const left = keys().filter((k) => k.startsWith(KEY_PREFIX))
    expect(left).toHaveLength(40)
    expect(left).toContain(KEY_PREFIX + "r0") // newest
    expect(left).not.toContain(KEY_PREFIX + "r44") // oldest
  })

  it("removes keys written by every earlier version", async () => {
    for (const legacy of [
      "nextpaper_cache_v1_a",
      "nextpaper_cache_v5_a",
      "nextpaper_cache_v8_a",
      "nextpaper_emb_v1_a",
      "nextpaper_rec_v1_a"
    ]) {
      chrome.data.set(legacy, { big: "x".repeat(100) })
    }
    await pruneStorage()
    expect(keys()).toEqual([])
  })

  describe("job states", () => {
    it("keeps a job that still has its cached result", async () => {
      await putCache("R")
      chrome.data.set(JOB_PREFIX + "R", { phase: "done" })
      await pruneStorage()
      expect(keys()).toContain(JOB_PREFIX + "R")
    })

    it("removes an orphan job whose result is gone", async () => {
      chrome.data.set(JOB_PREFIX + "gone", { phase: "done" })
      await pruneStorage()
      expect(keys()).toEqual([])
    })

    it("keeps a job whose analysis is still running", async () => {
      chrome.data.set(JOB_PREFIX + "busy", { phase: "loading" })
      await pruneStorage(["busy"])
      expect(keys()).toEqual([JOB_PREFIX + "busy"])
    })

    it("removes job states written in the old shape, which embedded the whole result", async () => {
      await putCache("R")
      chrome.data.set(JOB_PREFIX + "R", {
        phase: "done",
        result: { groups: [] }
      })
      await pruneStorage()
      expect(keys()).not.toContain(JOB_PREFIX + "R")
    })
  })

  describe("Crossref cache", () => {
    it("expires a hit after 30 days and a miss after 7", async () => {
      const at = (days: number) => Date.now() - days * DAY
      chrome.data.set(CROSSREF_PREFIX + "hit-ok", {
        m: { authors: [] },
        at: at(29)
      })
      chrome.data.set(CROSSREF_PREFIX + "hit-old", {
        m: { authors: [] },
        at: at(31)
      })
      chrome.data.set(CROSSREF_PREFIX + "miss-ok", { m: null, at: at(6) })
      chrome.data.set(CROSSREF_PREFIX + "miss-old", { m: null, at: at(8) })
      await pruneStorage()
      expect(keys()).toEqual([
        CROSSREF_PREFIX + "hit-ok",
        CROSSREF_PREFIX + "miss-ok"
      ])
    })

    it("keeps only the 500 newest entries", async () => {
      for (let i = 0; i < 510; i++) {
        chrome.data.set(CROSSREF_PREFIX + i, {
          m: { authors: [] },
          at: Date.now() - i * 1000
        })
      }
      await pruneStorage()
      const left = keys().filter((k) => k.startsWith(CROSSREF_PREFIX))
      expect(left).toHaveLength(500)
      expect(left).toContain(CROSSREF_PREFIX + "0")
      expect(left).not.toContain(CROSSREF_PREFIX + "509")
    })

    it("tolerates a malformed entry", async () => {
      chrome.data.set(CROSSREF_PREFIX + "broken", null)
      await expect(pruneStorage()).resolves.toBeUndefined()
    })
  })

  // Rule 8: pruning must never touch what the user owns.
  it("never touches the library, the alerts, or keys it does not know", async () => {
    const library = { a: { paperId: "a", note: "important" } }
    const updates = { seen: ["x"], items: [] }
    chrome.data.set(LIBRARY_KEY, library)
    chrome.data.set(UPDATES_KEY, updates)
    chrome.data.set("some_other_key", { keep: true })
    for (let i = 0; i < 50; i++) await putCache(`r${i}`, i * 1000)
    chrome.data.set(JOB_PREFIX + "orphan", { phase: "done" })

    await pruneStorage()

    expect(chrome.data.get(LIBRARY_KEY)).toEqual(library)
    expect(chrome.data.get(UPDATES_KEY)).toEqual(updates)
    expect(chrome.data.get("some_other_key")).toEqual({ keep: true })
  })

  it("does nothing on an empty storage", async () => {
    await expect(pruneStorage()).resolves.toBeUndefined()
    expect(keys()).toEqual([])
  })
})
