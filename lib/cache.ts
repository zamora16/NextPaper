import { compressJson, decompressJson } from "~lib/compress"
import {
  CROSSREF_MAX_ENTRIES,
  CROSSREF_MISS_TTL_MS,
  CROSSREF_PREFIX,
  CROSSREF_TTL_MS
} from "~lib/crossref"
import { StorageFullError } from "~lib/errors"
import { JOB_PREFIX } from "~lib/job"
import { type AnalysisResult } from "~lib/model"
import {
  UNPAYWALL_MAX_ENTRIES,
  UNPAYWALL_MISS_TTL_MS,
  UNPAYWALL_PREFIX,
  UNPAYWALL_TTL_MS
} from "~lib/unpaywall"

// A week: a paper's related literature changes slowly, and a repeat analysis
// is the most expensive thing the extension does (alerts cover what is new).
const TTL_MS = 7 * 24 * 60 * 60 * 1000
// Keeps the cache bounded no matter how many papers are analyzed.
const MAX_ENTRIES = 40
// Bumped whenever the shape or the retrieval strategy changes, so entries
// produced by an older strategy are never served.
export const KEY_PREFIX = "nextpaper_cache_v14_"
// Keys written by earlier versions (uncompressed results, per-paper embeddings,
// raw recommendation lists). Removed on sight so they don't eat the quota.
const LEGACY_KEYS =
  /^nextpaper_(cache_v([1-9]|1[0-3])|emb_v1|rec_v1|citing_v1)_/

// Per-DOI lookups (citation metadata, free PDF links): each entry is a hit or a
// miss with its own lifetime, and each cache keeps only its newest entries.
// Crossref entries keep their metadata in `m`, Unpaywall ones the link in `u`.
type LookupEntry = { m?: unknown; u?: unknown }

const LOOKUP_CACHES = [
  {
    prefix: CROSSREF_PREFIX,
    max: CROSSREF_MAX_ENTRIES,
    ttl: (entry: LookupEntry) =>
      entry?.m ? CROSSREF_TTL_MS : CROSSREF_MISS_TTL_MS
  },
  {
    prefix: UNPAYWALL_PREFIX,
    max: UNPAYWALL_MAX_ENTRIES,
    ttl: (entry: LookupEntry) =>
      entry?.u ? UNPAYWALL_TTL_MS : UNPAYWALL_MISS_TTL_MS
  }
]

interface CacheEntry {
  z: string // gzip + base64 of the AnalysisResult JSON
  cachedAt: number
}

export async function getCachedResult(
  ref: string
): Promise<AnalysisResult | null> {
  const key = KEY_PREFIX + ref
  const stored = await chrome.storage.local.get([key])
  const entry: CacheEntry | undefined = stored[key]

  if (!entry?.z || Date.now() - entry.cachedAt > TTL_MS) return null

  try {
    return await decompressJson<AnalysisResult>(entry.z)
  } catch {
    return null
  }
}

// Removes expired entries, anything beyond the newest MAX_ENTRIES (and the
// per-DOI lookup caches beyond theirs), legacy keys, and job states that no longer have a cached result (unless their
// analysis is still running). Library and alerts are never touched.
export async function pruneStorage(
  runningRefs: Iterable<string> = []
): Promise<void> {
  const all = await chrome.storage.local.get()
  const remove: string[] = []
  const live: { key: string; ref: string; cachedAt: number }[] = []
  const lookups = LOOKUP_CACHES.map(() => [] as { key: string; at: number }[])

  for (const [key, value] of Object.entries(all)) {
    if (LEGACY_KEYS.test(key)) {
      remove.push(key)
    } else if (LOOKUP_CACHES.some((cache) => key.startsWith(cache.prefix))) {
      const index = LOOKUP_CACHES.findIndex((cache) =>
        key.startsWith(cache.prefix)
      )
      const entry = value as LookupEntry & { at: number }
      if (Date.now() - (entry?.at ?? 0) > LOOKUP_CACHES[index].ttl(entry)) {
        remove.push(key)
      } else lookups[index].push({ key, at: entry.at })
    } else if (key.startsWith(KEY_PREFIX)) {
      const cachedAt = (value as CacheEntry)?.cachedAt ?? 0
      if (Date.now() - cachedAt > TTL_MS) remove.push(key)
      else live.push({ key, ref: key.slice(KEY_PREFIX.length), cachedAt })
    }
  }

  lookups.forEach((entries, index) => {
    entries.sort((a, b) => b.at - a.at)
    entries
      .slice(LOOKUP_CACHES[index].max)
      .forEach((entry) => remove.push(entry.key))
  })

  live.sort((a, b) => b.cachedAt - a.cachedAt)
  live.slice(MAX_ENTRIES).forEach((entry) => remove.push(entry.key))
  const cachedRefs = new Set(live.slice(0, MAX_ENTRIES).map((e) => e.ref))
  const running = new Set(runningRefs)

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(JOB_PREFIX)) continue
    const ref = key.slice(JOB_PREFIX.length)
    const oldShape = (value as { result?: unknown })?.result !== undefined
    if (oldShape || (!cachedRefs.has(ref) && !running.has(ref))) {
      remove.push(key)
    }
  }

  if (remove.length > 0) await chrome.storage.local.remove(remove)
}

export async function setCachedResult(
  ref: string,
  result: AnalysisResult
): Promise<void> {
  const entry: CacheEntry = {
    z: await compressJson(result),
    cachedAt: Date.now()
  }
  const write = () => chrome.storage.local.set({ [KEY_PREFIX + ref]: entry })

  try {
    await write()
  } catch {
    // Out of space: drop every cached result (they are recomputable) and
    // retry once. The library and alerts are separate keys and stay intact.
    const all = await chrome.storage.local.get()
    await chrome.storage.local.remove(
      Object.keys(all).filter((key) => key.startsWith(KEY_PREFIX))
    )
    try {
      await write()
    } catch {
      throw new StorageFullError()
    }
  }
}
