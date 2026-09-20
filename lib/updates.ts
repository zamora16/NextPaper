import { getLibrary } from "~lib/library"
import { plainPaper } from "~lib/paper-utils"
import type { ScoredPaper } from "~lib/pipeline"
import { createQueue } from "~lib/queue"
import { getPapers, getRecommendedIds } from "~lib/semantic-scholar"

export const UPDATES_KEY = "nextpaper_updates"

const MAX_TARGETS = 8 // most recently saved papers checked per run
const PER_PAPER = 5 // new papers surfaced per saved paper per run
const RECENT_LIMIT = 15 // recommendations asked for per saved paper
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
  // Why the last check failed, or null when it worked. Shown in the panel: a
  // check that fails silently looks exactly like "nothing new".
  lastError: string | null
  // Every paper already surfaced (or skipped), so nothing is alerted twice.
  seen: string[]
  items: UpdateItem[]
}

const EMPTY: UpdatesState = {
  running: false,
  checkedAt: null,
  lastError: null,
  seen: [],
  items: []
}

export async function getUpdates(): Promise<UpdatesState> {
  const stored = await chrome.storage.local.get([UPDATES_KEY])
  return { ...EMPTY, ...(stored[UPDATES_KEY] ?? {}) }
}

const save = (state: UpdatesState) =>
  chrome.storage.local.set({ [UPDATES_KEY]: state })

// Every change re-reads the state right before writing. A check takes seconds,
// and the popup (another JS context) may dismiss an item or mark them viewed
// meanwhile: writing back the state read at the start would undo that.
const queue = createQueue()
const change = (fn: (current: UpdatesState) => Partial<UpdatesState>) =>
  queue(async () => {
    const current = await getUpdates()
    await save({ ...current, ...fn(current) })
  })

export async function refreshBadge(): Promise<void> {
  const { items } = await getUpdates()
  const unseen = items.filter((i) => !i.viewed).length
  await chrome.action.setBadgeText({ text: unseen ? String(unseen) : "" })
  await chrome.action.setBadgeBackgroundColor({ color: "#7c3aed" })
}

export async function markUpdatesViewed(): Promise<void> {
  await change((state) =>
    state.items.some((i) => !i.viewed)
      ? { items: state.items.map((i) => ({ ...i, viewed: true })) }
      : {}
  )
  await refreshBadge()
}

export async function dismissUpdate(paperId: string): Promise<void> {
  await change((state) => ({
    items: state.items.filter((i) => i.paper.paperId !== paperId)
  }))
  await refreshBadge()
}

// For each recently saved paper, looks for fresh related papers the user has
// not been shown yet. Runs in the background worker (daily alarm or on demand).
export async function checkForUpdates(): Promise<void> {
  await change(() => ({ running: true }))

  try {
    const library = await getLibrary()
    const saved = new Set(library.map((p) => p.paperId))
    const seen = new Set((await getUpdates()).seen)
    const found: { id: string; because: string }[] = []
    const evaluated = new Set<string>()

    // One lookup per saved paper, all at once (the request limiter keeps at
    // most a few in flight).
    const targets = library.slice(0, MAX_TARGETS)
    const lookups = await Promise.all(
      targets.map((target) =>
        getRecommendedIds(target.paperId, "recent", RECENT_LIMIT)
      )
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
      ? await getPapers(
          found.map((f) => f.id),
          false
        )
      : []
    if (found.length > 0 && papers.length === 0) {
      throw new Error("No se pudieron obtener los datos de las novedades.")
    }

    const byId = new Map(papers.map((p) => [p.paperId, p]))
    const fresh: UpdateItem[] = []
    for (const { id, because } of found) {
      const paper = byId.get(id)
      if (!paper) continue
      fresh.push({
        paper: plainPaper(paper),
        because,
        foundAt: Date.now(),
        viewed: false
      })
    }

    await change((current) => {
      const freshIds = new Set(fresh.map((i) => i.paper.paperId))
      return {
        running: false,
        checkedAt: Date.now(),
        lastError: null,
        seen: [...new Set([...current.seen, ...evaluated])].slice(-MAX_SEEN),
        items: [
          ...fresh,
          ...current.items.filter((i) => !freshIds.has(i.paper.paperId))
        ].slice(0, MAX_ITEMS)
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido."
    await change(() => ({ running: false, lastError: message }))
    throw err
  } finally {
    await refreshBadge()
  }
}
