import type { ReadStatus, SavedPaper } from "~lib/library"
import { httpUrl } from "~lib/url"

// Pure logic for library backups (no chrome.* here, so it is unit-tested).
export const BACKUP_VERSION = 1

export interface Backup {
  app: "nextpaper"
  version: number
  exportedAt: string
  library: SavedPaper[]
}

export const buildBackup = (library: SavedPaper[]): Backup => ({
  app: "nextpaper",
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  library
})

const STATUS_VALUES: ReadStatus[] = ["unread", "reading", "read"]

// Limits keep a crafted or corrupt file from filling the storage quota.
const MAX_ITEMS = 5000
const MAX_TITLE = 1000
const MAX_TEXT = 10_000 // abstract, tl;dr, note
const MAX_SHORT = 300 // venue, journal fields, author names, ids
const MAX_COLLECTIONS = 50
const MAX_COLLECTION_NAME = 100
const MAX_AUTHORS = 200

// A backup file is untrusted input: only http(s) links survive, so a crafted
// file cannot plant a javascript: URL behind a card's link.
const safeUrl = httpUrl

// The interface renders these fields as they are, and React throws when asked
// to render an object, so every field is rebuilt with its expected type
// instead of being copied from the file.
const text = (value: unknown, max: number): string | undefined =>
  typeof value === "string" ? value.slice(0, max) : undefined

const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined

const strings = (value: unknown, max: number, each: number): string[] =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim().slice(0, each))
            .filter(Boolean)
        )
      ).slice(0, max)
    : []

function normalizeAuthors(raw: unknown): SavedPaper["authors"] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a: any) => typeof a?.name === "string")
    .slice(0, MAX_AUTHORS)
    .map((a: any) => ({
      authorId: text(a.authorId, MAX_SHORT) ?? "",
      name: a.name.slice(0, MAX_SHORT)
    }))
}

function normalizeJournal(raw: any): SavedPaper["journal"] {
  const journal = {
    name: text(raw?.name, MAX_SHORT),
    volume: text(raw?.volume, MAX_SHORT),
    pages: text(raw?.pages, MAX_SHORT)
  }
  return journal.name || journal.volume || journal.pages ? journal : null
}

export function normalizeSaved(raw: any): SavedPaper | null {
  if (
    typeof raw?.paperId !== "string" ||
    raw.paperId === "" ||
    typeof raw?.title !== "string"
  ) {
    return null
  }

  const paperId = raw.paperId.slice(0, MAX_SHORT)
  const pdf = safeUrl(raw.openAccessPdf?.url)
  const doi = text(raw.externalIds?.DOI, MAX_SHORT)
  const tldr = text(raw.tldr?.text, MAX_TEXT)
  const year = count(raw.year)

  return {
    paperId,
    title: raw.title.slice(0, MAX_TITLE),
    authors: normalizeAuthors(raw.authors),
    year: year !== undefined && year >= 1000 && year <= 2200 ? year : null,
    citationCount: count(raw.citationCount) ?? 0,
    venue: text(raw.venue, MAX_SHORT) ?? "",
    url:
      safeUrl(raw.url) ??
      `https://www.semanticscholar.org/paper/${encodeURIComponent(paperId)}`,
    externalIds: doi ? { DOI: doi } : undefined,
    openAccessPdf: pdf ? { url: pdf } : null,
    abstract: text(raw.abstract, MAX_TEXT) ?? null,
    journal: normalizeJournal(raw.journal),
    tldr: tldr ? { text: tldr } : null,
    publicationTypes: strings(raw.publicationTypes, 20, MAX_SHORT),
    influentialCitationCount: count(raw.influentialCitationCount) ?? null,
    // Context of the analysis it was saved from: meaningless here.
    relation: null,
    savedAt: count(raw.savedAt) ?? Date.now(),
    status: STATUS_VALUES.includes(raw.status) ? raw.status : "unread",
    note: text(raw.note, MAX_TEXT) ?? "",
    collections: strings(raw.collections, MAX_COLLECTIONS, MAX_COLLECTION_NAME)
  }
}

// Returns the papers of a NextPaper backup, or null when the text is not one.
export function parseBackup(content: string): SavedPaper[] | null {
  let data: any
  try {
    data = JSON.parse(content)
  } catch {
    return null
  }
  if (data?.app !== "nextpaper" || !Array.isArray(data.library)) return null

  return data.library
    .slice(0, MAX_ITEMS)
    .map(normalizeSaved)
    .filter((p: SavedPaper | null): p is SavedPaper => p !== null)
}

// Merging never destroys what the user already has: existing status and notes
// win, collections are unioned, and only new papers are added.
export function mergeItems(
  existing: Record<string, SavedPaper>,
  incoming: SavedPaper[]
) {
  const library = { ...existing }
  let added = 0
  let updated = 0

  for (const item of incoming) {
    const current = library[item.paperId]
    if (!current) {
      library[item.paperId] = item
      added++
      continue
    }

    const known = current.collections ?? []
    const collections = [...new Set([...known, ...item.collections])]
    const note = current.note || item.note
    if (collections.length !== known.length || note !== current.note) updated++
    library[item.paperId] = { ...current, collections, note }
  }

  return { library, added, updated }
}
