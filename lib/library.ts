import { mergeItems } from "~lib/backup"
import type { ScoredPaper } from "~lib/pipeline"
import type { RecommendedPaper } from "~lib/semantic-scholar"

export const LIBRARY_KEY = "nextpaper_library"

export type ReadStatus = "unread" | "reading" | "read"

export const STATUSES: { id: ReadStatus; label: string }[] = [
  { id: "unread", label: "Por leer" },
  { id: "reading", label: "Leyendo" },
  { id: "read", label: "Leído" }
]

export type SavedPaper = ScoredPaper & {
  savedAt: number
  status: ReadStatus
  note: string
  // User-defined groups ("Tesis cap. 2", "Para revisar"...). A paper can be
  // in several. Items saved by older versions have none.
  collections: string[]
}

async function read(): Promise<Record<string, SavedPaper>> {
  const stored = await chrome.storage.local.get([LIBRARY_KEY])
  return stored[LIBRARY_KEY] ?? {}
}

const write = (library: Record<string, SavedPaper>) =>
  chrome.storage.local.set({ [LIBRARY_KEY]: library })

export async function getLibrary(): Promise<SavedPaper[]> {
  const library = await read()
  return Object.values(library)
    .map((p) => ({
      ...p,
      status: p.status ?? "unread",
      note: p.note ?? "",
      collections: p.collections ?? []
    }))
    .sort((a, b) => b.savedAt - a.savedAt)
}

// Collection names in use with their paper counts, biggest first.
export function collectionCounts(library: SavedPaper[]) {
  const counts = new Map<string, number>()
  for (const paper of library) {
    for (const name of paper.collections) {
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// Writes are read-modify-write on a single storage key, so they are queued:
// two quick clicks would otherwise both read the old library and one would
// overwrite the other.
let queue: Promise<unknown> = Promise.resolve()
const serialized = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

const fromRecommended = (
  paper: RecommendedPaper,
  collections: string[]
): SavedPaper => ({
  ...paper,
  similarity: null,
  approximate: false,
  relation: null,
  savedAt: Date.now(),
  status: "unread",
  note: "",
  collections
})

export const toggleSaved = (paper: ScoredPaper) =>
  serialized(async () => {
    const library = await read()
    if (library[paper.paperId]) {
      delete library[paper.paperId]
    } else {
      library[paper.paperId] = {
        ...paper,
        savedAt: Date.now(),
        status: "unread",
        note: "",
        collections: []
      }
    }
    await write(library)
  })

export const updateSaved = (
  paperId: string,
  patch: Partial<Pick<SavedPaper, "status" | "note" | "collections">>
) =>
  serialized(async () => {
    const library = await read()
    if (!library[paperId]) return
    library[paperId] = { ...library[paperId], ...patch }
    await write(library)
  })

// Removes a collection name from every paper (the papers stay saved).
export const deleteCollection = (name: string) =>
  serialized(async () => {
    const library = await read()
    for (const paper of Object.values(library)) {
      if (paper.collections?.includes(name)) {
        paper.collections = paper.collections.filter((c) => c !== name)
      }
    }
    await write(library)
  })

export interface AddResult {
  added: number
  alreadySaved: number
}

// Used by import: papers already in the library are left alone, but joined to
// the target collection.
export const addPapers = (papers: RecommendedPaper[], collection?: string) =>
  serialized(async (): Promise<AddResult> => {
    const incoming = papers.map((p) =>
      fromRecommended(p, collection ? [collection] : [])
    )
    const { library, added } = mergeItems(await read(), incoming)
    await write(library)
    return { added, alreadySaved: papers.length - added }
  })

// Restores a parsed backup, merging into what is already there.
export const restoreItems = (items: SavedPaper[]) =>
  serialized(async () => {
    const { library, added, updated } = mergeItems(await read(), items)
    await write(library)
    return { added, updated, total: items.length }
  })
