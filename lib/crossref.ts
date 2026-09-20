// Crossref (free, keyless) gives what Semantic Scholar lacks for citations:
// authors already split into given/family names, issue, article number,
// month and the ISO/NLM journal abbreviation. Fetched on demand per DOI when
// the user copies or exports a citation, and cached (bounded, see cache.ts).
//
// DOIs registered with DataCite (e.g. arXiv's 10.48550) are not in Crossref:
// they answer 404 and the formatter falls back to Semantic Scholar's data.

export interface CrossrefAuthor {
  given?: string
  family?: string
  // Organizations come as a single "name" instead of given/family.
  name?: string
}

export interface CrossrefMeta {
  authors: CrossrefAuthor[]
  title?: string
  journal?: string
  journalShort?: string
  volume?: string
  issue?: string
  pages?: string
  articleNumber?: string
  year?: number
  month?: number
  type?: string
  publisher?: string
}

export const CROSSREF_PREFIX = "nextpaper_crossref_v1_"
export const CROSSREF_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const CROSSREF_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const CROSSREF_MAX_ENTRIES = 500

// Optional: put PLASMO_PUBLIC_CROSSREF_MAILTO in .env.local to join
// Crossref's "polite" pool. Never set by default (it would send an email
// address to a third party).
const MAILTO = process.env.PLASMO_PUBLIC_CROSSREF_MAILTO

const MIN_INTERVAL_MS = 300

interface StoredEntry {
  m: CrossrefMeta | null
  at: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let queue: Promise<unknown> = Promise.resolve()
let lastStart = 0

// Crossref asks clients to be gentle: one request at a time, spaced out.
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastStart + MIN_INTERVAL_MS - Date.now())
    if (wait > 0) await sleep(wait)
    lastStart = Date.now()
    return task()
  })
  queue = run.catch(() => undefined)
  return run
}

const stripMarkup = (text: string) =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()

const clean = (value?: string | null) => value?.trim() || undefined

export function parseCrossref(message: any): CrossrefMeta {
  const issued: number[] = message?.issued?.["date-parts"]?.[0] ?? []
  const title = clean(message?.title?.[0])

  return {
    authors: (message?.author ?? []).map((a: any) => ({
      given: clean(a.given),
      family: clean(a.family),
      name: clean(a.name)
    })),
    title: title ? stripMarkup(title) : undefined,
    journal: clean(message?.["container-title"]?.[0]),
    journalShort: clean(message?.["short-container-title"]?.[0]),
    volume: clean(message?.volume),
    issue: clean(message?.issue),
    pages: clean(message?.page),
    articleNumber: clean(message?.["article-number"]),
    year: issued[0] || undefined,
    month: issued[1] || undefined,
    type: clean(message?.type),
    publisher: clean(message?.publisher)
  }
}

async function fetchMeta(
  doi: string
): Promise<CrossrefMeta | null | undefined> {
  const url =
    `https://api.crossref.org/works/${encodeURIComponent(doi)}` +
    (MAILTO ? `?mailto=${encodeURIComponent(MAILTO)}` : "")

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await throttled(() => fetch(url))
      if (response.status === 404) return null
      if (response.ok) return parseCrossref((await response.json()).message)
      if (response.status !== 429 && response.status < 500) return undefined
    } catch {
      // network error: retry below
    }
    await sleep(1000 * 2 ** attempt)
  }
  return undefined // transient failure: not cached, retried next time
}

// Returns the metadata, or null when Crossref has no record for this DOI (or
// the request failed): callers then fall back to Semantic Scholar's data.
export async function getCrossref(doi: string): Promise<CrossrefMeta | null> {
  const key = CROSSREF_PREFIX + doi.toLowerCase()
  const stored = (await chrome.storage.local.get([key]))[key] as
    | StoredEntry
    | undefined

  if (stored) {
    const ttl = stored.m ? CROSSREF_TTL_MS : CROSSREF_MISS_TTL_MS
    if (Date.now() - stored.at < ttl) return stored.m
  }

  const meta = await fetchMeta(doi)
  if (meta === undefined) return null

  const entry: StoredEntry = { m: meta, at: Date.now() }
  try {
    await chrome.storage.local.set({ [key]: entry })
  } catch {
    // Not being able to cache is harmless: the citation still works.
  }
  return meta
}
