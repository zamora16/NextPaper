import { getLibrary } from "~lib/library"
import type { ScoredPaper } from "~lib/pipeline"
import { getPapers, getRecentRelated } from "~lib/semantic-scholar"

export const UPDATES_KEY = "nextpaper_updates"

const MAX_TARGETS = 8 // most recently saved papers checked per run
const PER_PAPER = 5 // new papers surfaced per saved paper per run
const MAX_ITEMS = 40
const MAX_SEEN = 600

export interface UpdateItem {
  paper: ScoredPaper
  because: string
  foundAt: number
  viewed: boolean
}

export interface UpdatesState {
  running: boolean
  checkedAt: number | null
  // Every paper already surfaced (or skipped), so nothing is alerted twice.
  seen: string[]
  items: UpdateItem[]
}

const EMPTY: UpdatesState = {
  running: false,
  checkedAt: null,
  seen: [],
  items: []
}

export async function getUpdates(): Promise<UpdatesState> {
  const stored = await chrome.storage.local.get([UPDATES_KEY])
  return { ...EMPTY, ...(stored[UPDATES_KEY] ?? {}) }
}

const save = (state: UpdatesState) =>
  chrome.storage.local.set({ [UPDATES_KEY]: state })

export async function refreshBadge(): Promise<void> {
  const { items } = await getUpdates()
  const unseen = items.filter((i) => !i.viewed).length
  await chrome.action.setBadgeText({ text: unseen ? String(unseen) : "" })
  await chrome.action.setBadgeBackgroundColor({ color: "#7c3aed" })
}

export async function markUpdatesViewed(): Promise<void> {
  const state = await getUpdates()
  if (!state.items.some((i) => !i.viewed)) return
  await save({
    ...state,
    items: state.items.map((i) => ({ ...i, viewed: true }))
  })
  await refreshBadge()
}

export async function dismissUpdate(paperId: string): Promise<void> {
  const state = await getUpdates()
  await save({
    ...state,
    items: state.items.filter((i) => i.paper.paperId !== paperId)
  })
  await refreshBadge()
}

// For each recently saved paper, looks for fresh related papers the user has
// not been shown yet. Runs in the background worker (daily alarm or on demand).
export async function checkForUpdates(): Promise<void> {
  const state = await getUpdates()
  await save({ ...state, running: true })

  try {
    const library = await getLibrary()
    const saved = new Set(library.map((p) => p.paperId))
    const seen = new Set(state.seen)
    const found: { id: string; because: string }[] = []
    const evaluated = new Set<string>()

    // One lookup per saved paper, all at once (the request limiter keeps at
    // most a few in flight).
    const targets = library.slice(0, MAX_TARGETS)
    const lookups = await Promise.all(
      targets.map((target) => getRecentRelated(target.paperId))
    )

    for (const [index, target] of targets.entries()) {
      const related = lookups[index]
      if (!related) continue // failed request: try again next run

      let taken = 0
      for (const id of related) {
        if (saved.has(id) || seen.has(id) || evaluated.has(id)) continue
        evaluated.add(id)
        if (taken >= PER_PAPER) continue
        taken++
        found.push({ id, because: target.title })
      }
    }

    // Metadata for everything found, in one batched request. Papers are only
    // marked as seen once it succeeds, so a failure never swallows news.
    const papers = found.length
      ? await getPapers(found.map((f) => f.id), false)
      : []
    if (found.length > 0 && papers.length === 0) {
      throw new Error("No se pudieron obtener los datos de las novedades.")
    }

    const byId = new Map(papers.map((p) => [p.paperId, p]))
    const fresh: UpdateItem[] = []
    for (const { id, because } of found) {
      const paper = byId.get(id)
      if (!paper) continue
      const { embedding: _embedding, ...rest } = paper
      fresh.push({
        paper: { ...rest, similarity: null, approximate: false, relation: null },
        because,
        foundAt: Date.now(),
        viewed: false
      })
    }
    evaluated.forEach((id) => seen.add(id))

    await save({
      running: false,
      checkedAt: Date.now(),
      seen: [...seen].slice(-MAX_SEEN),
      items: [...fresh, ...state.items].slice(0, MAX_ITEMS)
    })
  } catch (err) {
    await save({ ...(await getUpdates()), running: false })
    throw err
  } finally {
    await refreshBadge()
  }
}
