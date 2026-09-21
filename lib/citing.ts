import { compressJson, decompressJson } from "~lib/compress"
import { getCitationContexts } from "~lib/semantic-scholar"
import { httpUrl } from "~lib/url"

// "How others cite this paper": the sentences of citing papers where Semantic
// Scholar found the citation. That data is extracted from PDFs and is noisy: a
// sentence can belong to a neighbouring reference, or carry broken text. So by
// default only the sentences that NAME the paper are shown (author + year, two
// authors, or a proper name from its title); the rest sit behind an explicit
// "show the others". A missing sentence is better than a wrong one.

export interface CitedPaperMeta {
  title: string
  year: number | null
  authors: string[]
}

// One citation as Semantic Scholar returns it (only what is used).
export interface RawCitation {
  contexts?: unknown
  isInfluential?: boolean
  citingPaper?: {
    paperId?: string
    title?: string
    year?: number | null
    venue?: string
    url?: string
  }
}

export interface CitingSentence {
  text: string
  paperId: string
  title: string
  year: number | null
  venue: string
  url?: string
  // Semantic Scholar's own flag for a citation that builds on the paper.
  influential: boolean
}

export interface CitingResult {
  // Sentences that name the cited paper.
  named: CitingSentence[]
  // Sentences we cannot tie to it by name (may still be about it).
  others: CitingSentence[]
  // Citing papers examined, and how many had any sentence at all.
  scanned: number
  withSentences: number
}

export const MAX_NAMED = 30
export const MAX_OTHERS = 20
const MIN_LENGTH = 40
const MAX_LENGTH = 600
const MIN_WORDS = 6

// Accents are ignored so "Pérez" in a record matches "Perez" in a sentence.
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "")

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// A whole word (or name): not glued to other letters or digits.
const wordPattern = (word: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "u")

export function surnameOf(fullName: string): string | null {
  const cleaned = fullName
    .replace(/\b(?:Jr|Sr|II|III|IV)\b\.?/g, "")
    .replace(/[,.]+$/, "")
    .trim()
  const last = cleaned.split(/\s+/).pop() ?? ""
  return last.length >= 2 ? fold(last) : null
}

// Names a sentence can use to point at the paper: proper names in its title
// (AlphaFold, PRISMA, Scale-2), never plain words.
export function distinctiveTitleTokens(title: string): string[] {
  const words = fold(title)
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length >= 4)
  // A title in capitals has no acronyms to speak of.
  if (words.length && words.every((word) => word === word.toUpperCase())) {
    return []
  }
  return [
    ...new Set(
      words.filter(
        (word) =>
          /[a-z][A-Z]/.test(word) || // AlphaFold
          /^[A-Z][A-Z0-9-]{2,}$/.test(word) || // PRISMA, BERT
          /\d/.test(word) // Scale-2, GPT-4
      )
    )
  ]
}

const normalizeWords = (text: string) =>
  fold(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

// The title up to its first colon or question mark, without a leading article,
// when it is long enough to be a phrase nobody writes by accident.
export function titlePhrase(title: string): string | null {
  const clause = title
    .split(/[:?]/)[0]
    .replace(/^(?:the|a|an|el|la|los|las)\s+/i, "")
  const phrase = normalizeWords(clause)
  return phrase.split(" ").length >= 4 ? phrase : null
}

const YEAR = /(?<!\d)(?:19|20)\d\d[a-z]?(?![\d])/

// Preprint and published years often differ by one ("He et al. 2016" for a
// paper Semantic Scholar dates 2015).
const isYearOf = (year: number, paperYear: number | null) =>
  paperYear === null || Math.abs(year - paperYear) <= 1

// Does this sentence name the cited paper?
export function namesThePaper(
  sentence: string,
  paper: CitedPaperMeta
): boolean {
  const text = fold(sentence)

  // Author + year, "et al.", or the first authors together.
  const surnames = paper.authors
    .slice(0, 3)
    .map(surnameOf)
    .filter((name): name is string => !!name)
  for (const name of surnames) {
    const occurrences = text.matchAll(
      new RegExp(wordPattern(name).source, "gu")
    )
    for (const match of occurrences) {
      const after = text.slice(
        match.index! + name.length,
        match.index! + name.length + 40
      )
      const year = after.match(YEAR)?.[0]
      // A year that is not the paper's is another paper of the same author
      // ("He et al. [2022]"): not this one.
      if (year && !isYearOf(Number(year.slice(0, 4)), paper.year)) continue
      if (/^\s*et\s+al\b/i.test(after)) return true
      if (year) return true
      // "Baron and Kenny": two of the first authors side by side.
      const paired = surnames.some(
        (other) =>
          other !== name &&
          new RegExp(`^\\s*(?:,|&|and|y|e|und)\\s*${escapeRegExp(other)}`).test(
            after
          )
      )
      if (paired) return true
    }
  }

  // A proper name from the title.
  if (
    distinctiveTitleTokens(paper.title).some((token) =>
      wordPattern(token).test(text)
    )
  ) {
    return true
  }

  // The title itself, quoted.
  const phrase = titlePhrase(paper.title)
  return !!phrase && normalizeWords(sentence).includes(phrase)
}

// Text that is too short, too long, or garbled by PDF extraction.
export function isUsableSentence(text: string): boolean {
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return false
  if (text.includes("(cid:")) return false
  const words = text.split(/\s+/).filter((word) => /\p{L}{2,}/u.test(word))
  if (words.length < MIN_WORDS) return false
  const letters = (text.match(/\p{L}/gu) ?? []).length
  return letters / text.length >= 0.6
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim()

// Picks, per citing paper, its best sentence (one that names the paper first),
// and sorts influential citations first, then the most recent.
export function selectCitingSentences(
  rows: RawCitation[],
  paper: CitedPaperMeta
): CitingResult {
  const named: CitingSentence[] = []
  const others: CitingSentence[] = []
  let withSentences = 0
  const seen = new Set<string>()

  for (const row of rows) {
    const contexts = Array.isArray(row?.contexts)
      ? row.contexts.filter((c): c is string => typeof c === "string")
      : []
    if (contexts.length === 0) continue
    withSentences++

    const citing = row.citingPaper
    const usable = contexts.map(clean).filter(isUsableSentence)
    if (!citing?.paperId || usable.length === 0) continue

    const best = usable.find((text) => namesThePaper(text, paper))
    const text = best ?? usable[0]
    const key = fold(text).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const sentence: CitingSentence = {
      text,
      paperId: citing.paperId,
      title: typeof citing.title === "string" ? clean(citing.title) : "",
      year: typeof citing.year === "number" ? citing.year : null,
      venue: typeof citing.venue === "string" ? clean(citing.venue) : "",
      url: httpUrl(citing.url),
      influential: row.isInfluential === true
    }
    ;(best ? named : others).push(sentence)
  }

  const order = (a: CitingSentence, b: CitingSentence) =>
    Number(b.influential) - Number(a.influential) ||
    (b.year ?? 0) - (a.year ?? 0)

  return {
    named: named.sort(order).slice(0, MAX_NAMED),
    others: others.sort(order).slice(0, MAX_OTHERS),
    scanned: rows.length,
    withSentences
  }
}

// The sentences citing `ref`, from the cache or (on demand) Semantic Scholar.
// Null when the request failed, so the caller can offer a retry.
export async function getCitingSentences(
  ref: string
): Promise<CitingResult | null> {
  const cached = await getStoredCiting(ref)
  if (cached) return cached

  const data = await getCitationContexts(ref)
  if (!data) return null

  const result = selectCitingSentences(data.rows, data.paper)
  // A paper nobody cites yet may be cited tomorrow: do not remember "nothing".
  if (result.scanned > 0) await storeCiting(ref, result)
  return result
}

// --- storage: small, compressed and bounded (see pruneStorage) -------------

export const CITING_PREFIX = "nextpaper_citing_v1_"
export const CITING_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const CITING_MAX_ENTRIES = 30

interface StoredCiting {
  z: string
  at: number
}

export async function getStoredCiting(
  ref: string
): Promise<CitingResult | null> {
  const key = CITING_PREFIX + ref
  const entry = (await chrome.storage.local.get([key]))[key] as
    | StoredCiting
    | undefined
  if (!entry?.z || Date.now() - entry.at > CITING_TTL_MS) return null
  try {
    return await decompressJson<CitingResult>(entry.z)
  } catch {
    return null
  }
}

export async function storeCiting(
  ref: string,
  result: CitingResult
): Promise<void> {
  const entry: StoredCiting = { z: await compressJson(result), at: Date.now() }
  try {
    await chrome.storage.local.set({ [CITING_PREFIX + ref]: entry })
  } catch {
    // A full storage must not break the feature: it is only a cache.
  }
}
