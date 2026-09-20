import type { ReadStatus, SavedPaper } from "~lib/library"

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

// A backup file is untrusted input: only http(s) links survive, so a crafted
// file cannot plant a javascript: URL behind a card's link.
const safeUrl = (value: unknown): string | undefined =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? value : undefined

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback

export function normalizeSaved(raw: any): SavedPaper | null {
  if (typeof raw?.paperId !== "string" || typeof raw?.title !== "string") {
    return null
  }

  const collections: string[] = Array.isArray(raw.collections)
    ? Array.from(
        new Set<string>(
          raw.collections
            .filter((c: unknown): c is string => typeof c === "string")
            .map((c: string) => c.trim())
            .filter(Boolean)
        )
      )
    : []

  const pdf = safeUrl(raw.openAccessPdf?.url)

  return {
    ...raw,
    paperId: raw.paperId,
    title: raw.title,
    authors: Array.isArray(raw.authors)
      ? raw.authors.filter((a: any) => typeof a?.name === "string")
      : [],
    year: typeof raw.year === "number" ? raw.year : null,
    citationCount: Number(raw.citationCount) || 0,
    venue: text(raw.venue),
    url:
      safeUrl(raw.url) ??
      `https://www.semanticscholar.org/paper/${encodeURIComponent(raw.paperId)}`,
    openAccessPdf: pdf ? { url: pdf } : null,
    similarity: null,
    approximate: false,
    relation: null,
    savedAt: typeof raw.savedAt === "number" ? raw.savedAt : Date.now(),
    status: STATUS_VALUES.includes(raw.status) ? raw.status : "unread",
    note: text(raw.note),
    collections
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
