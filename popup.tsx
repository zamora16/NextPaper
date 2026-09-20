import { useEffect, useMemo, useState, type FormEvent } from "react"

import "~style.css"

import { CopyCitationsButton } from "~components/CitationButtons"
import { PaperCard } from "~components/PaperCard"
import { SavedTab } from "~components/SavedTab"
import { Timeline } from "~components/Timeline"
import { pillClass } from "~components/ui"
import { useAnalysis } from "~components/useAnalysis"
import { useStorageValue } from "~components/useStorageValue"
import { CITATION_STYLES, type CitationStyle } from "~lib/citation"
import { extractPaperRef } from "~lib/extract-ref"
import {
  getLibrary,
  LIBRARY_KEY,
  toggleSaved,
  type SavedPaper
} from "~lib/library"
import type { PickKind, ScoredPaper } from "~lib/pipeline"
import { buildTimeline } from "~lib/timeline"
import {
  getUpdates,
  markUpdatesViewed,
  UPDATES_KEY,
  type UpdatesState
} from "~lib/updates"
import {
  applyView,
  designOptions,
  FILTERS,
  SORTS,
  type DesignFilter,
  type Filter,
  type Sort
} from "~lib/view"

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
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa")
  const [tab, setTab] = useState<"related" | "saved">("related")
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("relevance")
  const [design, setDesign] = useState<DesignFilter>("all")
  const library = useStorageValue<SavedPaper[]>(LIBRARY_KEY, getLibrary, [])
  const updates = useStorageValue<UpdatesState | null>(
    UPDATES_KEY,
    getUpdates,
    null
  )
  const [showTimeline, setShowTimeline] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Exploring a result (or searching a topic) pushes onto this trail; the
  // page's own paper is the root and is never stored in it.
  const [trail, setTrail] = useState<{ ref: string; label: string }[]>([])
  const [queryInput, setQueryInput] = useState("")
  const current = trail.length ? trail[trail.length - 1] : null
  const activeRef = current ? current.ref : ref
  const { job, result, retry } = useAnalysis(activeRef)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getActiveTabPaperRef().then(setRef)
  }, [])

  // Opening the saved tab counts as seeing the alerts: remember which ones
  // were new (to tag them) and clear the toolbar badge.
  useEffect(() => {
    if (tab !== "saved" || !updates) return
    const fresh = updates.items.filter((i) => !i.viewed)
    if (fresh.length === 0) return
    setNewIds(
      (prev) => new Set([...prev, ...fresh.map((i) => i.paper.paperId)])
    )
    markUpdatesViewed()
  }, [tab, updates])

  // A new paper starts with nothing highlighted.
  useEffect(() => {
    setSelectedId(null)
  }, [activeRef])

  const explore = (target: { ref: string; label: string }) => {
    setTrail((t) => [...t, target])
    setTab("related")
    setFilter("all")
    setSort("relevance")
    setDesign("all")
  }

  // Clicking a point on the map highlights its card and scrolls to it. Picks
  // repeat some papers, so the last match (the group list) is the target.
  const selectPaper = (paperId: string) => {
    setSelectedId(paperId)
    const cards = document.querySelectorAll(`[data-paper-id="${paperId}"]`)
    cards[cards.length - 1]?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    })
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const query = queryInput.trim().replace(/\s+/g, " ")
    if (query.length < 3) return
    explore({ ref: `QUERY:${query.toLowerCase()}`, label: `Tema: ${query}` })
    setQueryInput("")
  }

  const designs = useMemo(
    () => (result ? designOptions(result.groups) : []),
    [result]
  )
  // Same guard as the collection filter: a design the new results don't have
  // must not leave the list stuck on an empty filter.
  const activeDesign = designs.some((d) => d.id === design) ? design : "all"
  const groups = useMemo(
    () => (result ? applyView(result.groups, filter, sort, activeDesign) : []),
    [result, filter, sort, activeDesign]
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
    !!result?.picks.length &&
    filter === "all" &&
    sort === "relevance" &&
    activeDesign === "all"

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
            className={pillClass(tab === "related")}>
            Relacionados
          </button>
          <button
            onClick={() => setTab("saved")}
            className={pillClass(tab === "saved")}>
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
        <SavedTab
          library={library}
          updates={updates}
          newIds={newIds}
          citationStyle={citationStyle}
          styleSelect={styleSelect}
          savedIds={savedIds}
          renderCard={renderCard}
        />
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
                onClick={retry}
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
                    className={pillClass(filter === f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>

              {designs.length >= 2 && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Diseño
                  <select
                    value={activeDesign}
                    onChange={(e) => setDesign(e.target.value as DesignFilter)}
                    title="Diseño detectado con reglas en el título y el abstract"
                    className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
                    <option value="all">Todos</option>
                    {designs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label} ({d.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}

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
