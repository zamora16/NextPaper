import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"

import "~style.css"

import { LibraryItem } from "~components/LibraryItem"
import { LibraryTools } from "~components/LibraryTools"
import { Timeline } from "~components/Timeline"
import { PaperCard } from "~components/PaperCard"
import { UpdatesPanel } from "~components/UpdatesPanel"
import { CopyCitationsButton, ExportButton } from "~components/CitationButtons"
import { CITATION_STYLES, type CitationStyle } from "~lib/citation"
import { extractPaperRef } from "~lib/extract-ref"
import { getCachedResult } from "~lib/cache"
import { jobKey, type JobState } from "~lib/job"
import {
  collectionCounts,
  deleteCollection,
  getLibrary,
  LIBRARY_KEY,
  STATUSES,
  toggleSaved,
  type ReadStatus,
  type SavedPaper
} from "~lib/library"
import type { AnalysisResult, PickKind, ScoredPaper } from "~lib/pipeline"
import {
  getUpdates,
  markUpdatesViewed,
  UPDATES_KEY,
  type UpdatesState
} from "~lib/updates"
import { buildTimeline } from "~lib/timeline"
import { applyView, FILTERS, SORTS, type Filter, type Sort } from "~lib/view"

const PICK_LABELS: Record<PickKind, string> = {
  foundational: "Clásico para empezar",
  review: "Revisión relevante",
  recent: "Lo más reciente"
}

async function getActiveTabPaperRef(): Promise<string | null> {
  // Lets the popup be opened on a specific paper (popup.html?ref=DOI:...),
  // e.g. for automated UI tests where no toolbar click grants activeTab.
  const override = new URLSearchParams(location.search).get("ref")
  if (override) return override

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return null
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPaperRef
    })
    return injection?.result ?? null
  } catch {
    // Restricted pages (chrome://, web store, PDF viewers) can't be scripted.
    return null
  }
}

function IndexPopup() {
  const [ref, setRef] = useState<string | null | undefined>(undefined)
  const [job, setJob] = useState<JobState>({ phase: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const staleRetries = useRef(new Set<string>())
  const phaseRef = useRef(job.phase)
  phaseRef.current = job.phase
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa")
  const [tab, setTab] = useState<"related" | "saved">("related")
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("relevance")
  const [library, setLibrary] = useState<SavedPaper[]>([])
  const [statusFilter, setStatusFilter] = useState<ReadStatus | "all">("all")
  const [collectionFilter, setCollectionFilter] = useState<string | "all">("all")
  const [showTimeline, setShowTimeline] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Exploring a result (or searching a topic) pushes onto this trail; the
  // page's own paper is the root and is never stored in it.
  const [trail, setTrail] = useState<{ ref: string; label: string }[]>([])
  const [queryInput, setQueryInput] = useState("")
  const current = trail.length ? trail[trail.length - 1] : null
  const activeRef = current ? current.ref : ref
  const [updates, setUpdates] = useState<UpdatesState | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getActiveTabPaperRef().then(setRef)
  }, [])

  useEffect(() => {
    getUpdates().then(setUpdates)
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[UPDATES_KEY]) getUpdates().then(setUpdates)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  // Opening the saved tab counts as seeing the alerts: remember which ones
  // were new (to tag them) and clear the toolbar badge.
  useEffect(() => {
    if (tab !== "saved" || !updates) return
    const fresh = updates.items.filter((i) => !i.viewed)
    if (fresh.length === 0) return
    setNewIds((prev) => new Set([...prev, ...fresh.map((i) => i.paper.paperId)]))
    markUpdatesViewed()
  }, [tab, updates])

  useEffect(() => {
    getLibrary().then(setLibrary)
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[LIBRARY_KEY]) getLibrary().then(setLibrary)
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  useEffect(() => {
    if (!activeRef) return

    const key = jobKey(activeRef)
    let active = true

    // Never show the previous paper's state while the new one loads.
    setJob({ phase: "loading" })
    setSelectedId(null)
    chrome.storage.local.get([key]).then((stored) => {
      if (active && stored[key]) setJob(stored[key])
    })

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area === "local" && changes[key]?.newValue) {
        setJob(changes[key].newValue)
      }
    }
    chrome.storage.onChanged.addListener(onChanged)

    // The background worker does the heavy lifting and keeps going even if
    // this popup is closed; reopening just resumes observing its state.
    chrome.runtime.sendMessage({ type: "analyze", ref: activeRef })

    // If the worker was suspended mid-analysis the job would stay "loading"
    // forever; asking again is idempotent and restarts it when it died.
    const watchdog = setInterval(() => {
      if (phaseRef.current === "loading") {
        chrome.runtime.sendMessage({ type: "analyze", ref: activeRef })
      }
    }, 25_000)

    return () => {
      active = false
      clearInterval(watchdog)
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [activeRef, attempt])

  const explore = (target: { ref: string; label: string }) => {
    setTrail((t) => [...t, target])
    setTab("related")
    setFilter("all")
    setSort("relevance")
  }

  // Clicking a point on the map highlights its card and scrolls to it. Picks
  // repeat some papers, so the last match (the group list) is the target.
  const selectPaper = (paperId: string) => {
    setSelectedId(paperId)
    const cards = document.querySelectorAll(`[data-paper-id="${paperId}"]`)
    cards[cards.length - 1]?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const query = queryInput.trim().replace(/\s+/g, " ")
    if (query.length < 3) return
    explore({ ref: `QUERY:${query.toLowerCase()}`, label: `Tema: ${query}` })
    setQueryInput("")
  }

  // Finished results live (compressed) in the cache, not in the job state.
  useEffect(() => {
    if (job.phase !== "done" || !activeRef) {
      setResult(null)
      return
    }

    let live = true
    getCachedResult(activeRef).then((cached) => {
      if (!live) return
      if (cached) {
        setResult(cached)
        return
      }
      // A "done" job without a cached result is a leftover (expired, pruned
      // or written by an older version): analyze again, once per paper.
      setResult(null)
      if (!staleRetries.current.has(activeRef)) {
        staleRetries.current.add(activeRef)
        setJob({ phase: "loading" })
        setAttempt((n) => n + 1)
      }
    })
    return () => {
      live = false
    }
  }, [job.phase, activeRef])

  const groups = useMemo(
    () => (result ? applyView(result.groups, filter, sort) : []),
    [result, filter, sort]
  )
  const visible = useMemo(() => {
    const seen = new Map<string, ScoredPaper>()
    groups.forEach((g) => g.papers.forEach((p) => seen.set(p.paperId, p)))
    return [...seen.values()]
  }, [groups])
  const totalPapers =
    result?.groups.reduce((sum, g) => sum + g.papers.length, 0) ?? 0
  const savedIds = useMemo(
    () => new Set(library.map((p) => p.paperId)),
    [library]
  )
  const statusById = useMemo(
    () => new Map(library.map((p) => [p.paperId, p.status])),
    [library]
  )
  const collections = useMemo(() => collectionCounts(library), [library])
  // A collection that no longer exists (deleted, or its last paper removed)
  // must not leave the list stuck on an empty filter.
  const activeCollection = collections.some((c) => c.name === collectionFilter)
    ? collectionFilter
    : "all"
  const savedVisible = useMemo(
    () =>
      library.filter(
        (p) =>
          (statusFilter === "all" || p.status === statusFilter) &&
          (activeCollection === "all" || p.collections.includes(activeCollection))
      ),
    [library, statusFilter, activeCollection]
  )
  const unviewedUpdates =
    updates?.items.filter((i) => !i.viewed && !savedIds.has(i.paper.paperId))
      .length ?? 0
  const timeline = useMemo(
    () => (result ? buildTimeline(result.groups, result.seedYear) : null),
    [result]
  )
  const visibleIds = useMemo(
    () => new Set(visible.map((paper) => paper.paperId)),
    [visible]
  )
  const showPicks =
    !!result?.picks.length && filter === "all" && sort === "relevance"

  const renderCard = (paper: ScoredPaper) => (
    <PaperCard
      key={paper.paperId}
      paper={paper}
      citationStyle={citationStyle}
      saved={savedIds.has(paper.paperId)}
      status={statusById.get(paper.paperId)}
      highlighted={paper.paperId === selectedId}
      onToggleSave={() => toggleSaved(paper)}
      onExplore={() => explore({ ref: paper.paperId, label: paper.title })}
    />
  )

  const pill = (active: boolean) =>
    `rounded-full border px-2 py-0.5 text-xs font-medium ${
      active
        ? "border-violet-300 bg-violet-50 text-violet-700"
        : "border-slate-200 text-slate-500 hover:bg-slate-50"
    }`

  const styleSelect = (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      Citar como
      <select
        value={citationStyle}
        onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
        {CITATION_STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            {style.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="flex w-[26rem] flex-col gap-3 p-4 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">NextPaper</h1>
        <div className="flex gap-1">
          <button
            onClick={() => setTab("related")}
            className={pill(tab === "related")}>
            Relacionados
          </button>
          <button
            onClick={() => setTab("saved")}
            className={pill(tab === "saved")}>
            ★ Guardados · {library.length}
            {unviewedUpdates > 0 && (
              <span
                title="Novedades sin ver"
                className="ml-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">
                {unviewedUpdates}
              </span>
            )}
          </button>
        </div>
      </div>

      {tab === "saved" && (
        <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto">
          {library.length === 0 && (
            <p className="text-sm text-slate-500">
              Aún no has guardado nada. Pulsa la ☆ de cualquier paper para
              guardarlo aquí, o importa tus referencias desde otra herramienta.
            </p>
          )}

          <LibraryTools library={library} />

          {library.length > 0 && (
            <>
              {updates && (
                <UpdatesPanel
                  updates={updates}
                  savedIds={savedIds}
                  newIds={newIds}
                  renderCard={renderCard}
                />
              )}

              <div className="flex flex-wrap gap-1">
                {(
                  [{ id: "all", label: "Todos" }, ...STATUSES] as {
                    id: ReadStatus | "all"
                    label: string
                  }[]
                ).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStatusFilter(s.id)}
                    className={pill(statusFilter === s.id)}>
                    {s.label} ·{" "}
                    {s.id === "all"
                      ? library.length
                      : library.filter((p) => p.status === s.id).length}
                  </button>
                ))}
              </div>

              {collections.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => setCollectionFilter("all")}
                    className={pill(activeCollection === "all")}>
                    Todas las colecciones
                  </button>
                  {collections.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setCollectionFilter(c.name)}
                      className={pill(activeCollection === c.name)}>
                      {c.name} · {c.count}
                    </button>
                  ))}
                  {activeCollection !== "all" && (
                    <button
                      onClick={() => deleteCollection(activeCollection)}
                      title="Quita la colección de todos los papers; los papers se conservan"
                      className="text-[11px] font-medium text-red-500 hover:underline">
                      Eliminar colección
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                {styleSelect}
                <div className="flex gap-1">
                  <CopyCitationsButton papers={savedVisible} style={citationStyle} />
                  <ExportButton papers={savedVisible} format="bibtex" />
                  <ExportButton papers={savedVisible} format="ris" />
                </div>
              </div>

              {savedVisible.length === 0 && (
                <p className="text-sm text-slate-500">
                  Ningún paper guardado con este filtro.
                </p>
              )}

              {savedVisible.map((paper) => (
                <LibraryItem
                  key={paper.paperId}
                  paper={paper}
                  card={renderCard(paper)}
                  knownCollections={collections.map((c) => c.name)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {tab === "related" && (
        <>
          <form onSubmit={submitSearch} className="flex gap-1.5">
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Buscar por tema: p. ej. body image and eating disorders"
              className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={queryInput.trim().length < 3}
              className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
              Buscar
            </button>
          </form>

          {current && (
            <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <span className="line-clamp-1 text-xs text-slate-600">
                Explorando: <strong>{current.label}</strong>
              </span>
              <button
                onClick={() => setTrail((t) => t.slice(0, -1))}
                className="shrink-0 text-xs font-medium text-violet-700 hover:underline">
                ← Volver
              </button>
            </div>
          )}

          {!current && ref === undefined && (
            <p className="text-sm text-slate-500">Detectando paper...</p>
          )}

          {!current && ref === null && (
            <p className="text-sm text-slate-500">
              No se detectó ningún paper en esta página. Abre un artículo en
              PubMed, arXiv, bioRxiv, PMC o la web de cualquier editorial que
              publique el DOI en sus metadatos, o busca un tema arriba.
            </p>
          )}

          {!current && ref && (
            <p className="break-all text-xs text-slate-400">{ref}</p>
          )}

          {activeRef && job.phase === "loading" && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-slate-500">
                {job.step ?? "Buscando papers relacionados..."}
              </p>
              <p className="text-xs text-slate-400">
                Corre en segundo plano: puedes cerrar el popup y volver.
              </p>
            </div>
          )}

          {job.phase === "error" && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-red-600">{job.message}</p>
              <button
                onClick={() => {
                  setJob({ phase: "loading" })
                  setAttempt((n) => n + 1)
                }}
                className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                Reintentar
              </button>
            </div>
          )}

          {job.phase === "done" && !result && (
            <p className="text-sm text-slate-500">Cargando resultados...</p>
          )}

          {job.phase === "done" && result && totalPapers === 0 && (
            <p className="text-sm text-slate-500">
              No se encontraron papers relacionados.
            </p>
          )}

          {totalPapers > 0 && (
            <>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={pill(filter === f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Ordenar
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                {styleSelect}
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {visible.length} de {totalPapers} papers
                  {timeline && (
                    <button
                      onClick={() => setShowTimeline((open) => !open)}
                      className="font-medium text-violet-600 hover:underline">
                      {showTimeline ? "Ocultar cronología" : "Ver cronología"}
                    </button>
                  )}
                </span>
                {visible.length > 0 && (
                  <CopyCitationsButton papers={visible} style={citationStyle} />
                )}
              </div>

              <div className="flex max-h-[28rem] flex-col gap-4 overflow-y-auto">
                {showTimeline && timeline && (
                  <Timeline
                    data={timeline}
                    seedYear={result?.seedYear}
                    visibleIds={visibleIds}
                    selectedId={selectedId}
                    onSelect={selectPaper}
                  />
                )}

                {showPicks && (
                  <div className="flex flex-col gap-2 rounded-lg bg-violet-50/60 p-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
                      Empieza por aquí
                    </p>
                    {result!.picks.map((pick) => (
                      <div key={pick.kind} className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-violet-600">
                          {PICK_LABELS[pick.kind]}
                        </span>
                        {renderCard(pick.paper)}
                      </div>
                    ))}
                  </div>
                )}

                {visible.length === 0 && (
                  <p className="text-sm text-slate-500">
                    Ningún paper cumple este filtro.
                  </p>
                )}

                {groups.map((group) => (
                  <div key={group.label} className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {group.label} · {group.papers.length}
                    </p>
                    {group.papers.map(renderCard)}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default IndexPopup
