import { httpUrl } from "~lib/url"

// Unpaywall (free, keyless) knows legal open-access copies by DOI: repository
// versions and publisher-hosted PDFs Semantic Scholar often lacks. It is asked
// only when the user clicks "Find PDF" on a card, and answers are cached
// (bounded, see cache.ts).

export const UNPAYWALL_PREFIX = "nextpaper_unpaywall_v1_"
export const UNPAYWALL_TTL_MS = 30 * 24 * 60 * 60 * 1000
// A miss is remembered for less: embargoes end and repositories catch up.
export const UNPAYWALL_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const UNPAYWALL_MAX_ENTRIES = 500

// Unpaywall requires a contact address on every request. It is the
// maintainer's, never the user's (see docs/PRIVACY.md).
const CONTACT = "angelzamora1616@gmail.com"

// A free copy: a direct PDF, or (`pdf: false`) a repository or publisher page
// that Unpaywall says is open but does not link a PDF for. The card never
// calls the second kind a PDF.
export interface OpenCopy {
  url: string
  pdf: boolean
}

interface StoredEntry {
  // The link, or null when there is no free copy.
  u: string | null
  p?: boolean
  at: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function openCopyOf(data: any): OpenCopy | null {
  const locations = [data?.best_oa_location, ...(data?.oa_locations ?? [])]
  for (const location of locations) {
    const url = httpUrl(location?.url_for_pdf)
    if (url) return { url, pdf: true }
  }
  if (data?.is_oa === true) {
    for (const location of locations) {
      const url = httpUrl(location?.url)
      if (url) return { url, pdf: false }
    }
  }
  return null
}

const keyOf = (doi: string) => UNPAYWALL_PREFIX + doi.toLowerCase()

async function fetchCopy(doi: string): Promise<OpenCopy | null | undefined> {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(CONTACT)}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url)
      // Not in Unpaywall, or not a DOI it understands: there is no answer.
      if (response.status === 404 || response.status === 422) return null
      if (response.ok) return openCopyOf(await response.json())
      if (response.status !== 429 && response.status < 500) return undefined
    } catch {
      // network error: retry below
    }
    await sleep(600 * 2 ** attempt)
  }
  return undefined // transient failure: not cached, so the user can retry
}

// What an earlier lookup found: a copy, null (no free copy), or undefined
// (never asked, or the answer expired). Storage only, no network.
export async function peekOpenCopy(
  doi: string
): Promise<OpenCopy | null | undefined> {
  const key = keyOf(doi)
  const stored = (await chrome.storage.local.get([key]))[key] as
    | StoredEntry
    | undefined
  if (!stored) return undefined
  const ttl = stored.u ? UNPAYWALL_TTL_MS : UNPAYWALL_MISS_TTL_MS
  if (Date.now() - stored.at >= ttl) return undefined
  return stored.u ? { url: stored.u, pdf: stored.p !== false } : null
}

// A free copy, null when there is none, undefined when Unpaywall could not be
// reached.
export async function findOpenCopy(
  doi: string
): Promise<OpenCopy | null | undefined> {
  const known = await peekOpenCopy(doi)
  if (known !== undefined) return known

  const copy = await fetchCopy(doi)
  if (copy === undefined) return undefined

  try {
    await chrome.storage.local.set({
      [keyOf(doi)]: {
        u: copy?.url ?? null,
        p: copy?.pdf,
        at: Date.now()
      } satisfies StoredEntry
    })
  } catch {
    // Not being able to cache is harmless: the link still works.
  }
  return copy
}
