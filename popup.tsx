import { useEffect, useMemo, useState, type FormEvent } from "react"

import "~style.css"

import { CopyCitationsButton } from "~components/CitationButtons"
import { groupLabel, Hint, I18nProvider, useT } from "~components/i18n"
import { KeySetup } from "~components/KeySetup"
import { PaperCard } from "~components/PaperCard"
import { SavedTab } from "~components/SavedTab"
import { Timeline } from "~components/Timeline"
import { pillClass } from "~components/ui"
import { UpdatesTab } from "~components/UpdatesTab"
import { useAnalysis } from "~components/useAnalysis"
import { useStorageValue } from "~components/useStorageValue"
import { CITATION_STYLES, type CitationStyle } from "~lib/citation"
import { extractPaperRef } from "~lib/extract-ref"
import { resolveLang, type TKey } from "~lib/i18n"
import type { Step } from "~lib/job"
import {
  getLibrary,
  LIBRARY_KEY,
  toggleSaved,
  type SavedPaper
} from "~lib/library"
import type { PickKind, ScoredPaper } from "~lib/pipeline"
import { getSettings, SETTINGS_KEY, type Settings } from "~lib/settings"
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

const PICK_LABEL: Record<PickKind, TKey> = {
  foundational: "pick.foundational",
  review: "pick.review",
  recent: "pick.recent"
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

type Tab = "related" | "saved" | "updates" | "settings"

function PopupBody({ settings }: { settings: Settings }) {
  const t = useT()
  const [ref, setRef] = useState<string | null | undefined>(undefined)
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa")
  const [tab, setTab] = useState<Tab>("related")
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
  // No analysis (and no request) before the first-run setup is answered.
  const { job, result, retry } = useAnalysis(
    settings.setupDone ? activeRef : null
  )
  const [newIds, setNewIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getActiveTabPaperRef().then(setRef)
  }, [])

  // Opening the updates tab counts as seeing them: remember which ones were new
  // (to tag them) and clear the toolbar badge.
  useEffect(() => {
    if (tab !== "updates" || !updates) return
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
    setTrail((trail) => [...trail, target])
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
    // The label is user text (their own query): it needs no translation.
    explore({ ref: `QUERY:${query.toLowerCase()}`, label: query })
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

  const stepText = (step: Step | undefined) =>
    step && typeof step === "object"
      ? t(`step.${step.code}` as TKey, "n" in step ? { n: step.n } : undefined)
      : t("step.default")

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
    <span className="flex items-center gap-1.5">
      <label className="flex items-center gap-1.5 text-xs text-slate-500">
        {t("citeAs")}
        <select
          value={citationStyle}
          onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
          {CITATION_STYLES.map((style) => (
            <option key={style} value={style}>
              {t(`style.${style}` as TKey)}
            </option>
          ))}
        </select>
      </label>
      <Hint text={t("citeAs.hint")} />
    </span>
  )

  const tabs: { id: Exclude<Tab, "settings">; label: string; hint: TKey }[] = [
    { id: "related", label: t("tab.related"), hint: "tab.related.hint" },
    {
      id: "saved",
      label: `★ ${t("tab.saved")} · ${library.length}`,
      hint: "tab.saved.hint"
    },
    { id: "updates", label: t("tab.updates"), hint: "tab.updates.hint" }
  ]

  return (
    <div className="flex w-[26rem] flex-col gap-3 p-4 font-sans">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">NextPaper</h1>
        <button
          onClick={() => setTab(tab === "settings" ? "related" : "settings")}
          title={t("tab.settings.hint")}
          aria-label={t("tab.settings")}
          aria-pressed={tab === "settings"}
          className={pillClass(tab === "settings")}>
          ⚙
        </button>
      </div>

      <div role="tablist" className="flex gap-1">
        {tabs.map(({ id, label, hint }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            title={t(hint)}
            className={`${pillClass(tab === id)} flex-1`}>
            {label}
            {id === "updates" && unviewedUpdates > 0 && (
              <span
                title={t("updates.unseen")}
                className="ml-1 rounded-full bg-violet-600 px-1.5 text-[10px] text-white">
                {unviewedUpdates}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <KeySetup
          settings={settings}
          firstRun={false}
          onClose={() => setTab("related")}
        />
      )}

      {tab === "saved" && (
        <SavedTab
          library={library}
          citationStyle={citationStyle}
          styleSelect={styleSelect}
          renderCard={renderCard}
        />
      )}

      {tab === "updates" && (
        <UpdatesTab
          updates={updates}
          hasSaved={library.length > 0}
          savedIds={savedIds}
          newIds={newIds}
          renderCard={renderCard}
        />
      )}

      {tab === "related" && (
        <>
          <form onSubmit={submitSearch} className="flex gap-1.5">
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              title={t("search.hint")}
              className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={queryInput.trim().length < 3}
              title={t("search.hint")}
              className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50">
              {t("search.button")}
            </button>
          </form>

          {current && (
            <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
              <span className="line-clamp-1 text-xs text-slate-600">
                {t("exploring")} <strong>{current.label}</strong>
              </span>
              <button
                onClick={() => setTrail((trail) => trail.slice(0, -1))}
                title={t("back.hint")}
                className="shrink-0 text-xs font-medium text-violet-700 hover:underline">
                {t("back")}
              </button>
            </div>
          )}

          {!current && ref === undefined && (
            <p className="text-sm text-slate-500">{t("detecting")}</p>
          )}

          {!current && ref === null && (
            <p className="text-sm text-slate-500">{t("noPaper")}</p>
          )}

          {!current && ref && (
            <p className="break-all text-xs text-slate-500">{ref}</p>
          )}

          {activeRef && job.phase === "loading" && (
            <div className="flex flex-col gap-1" role="status">
              <p className="text-sm text-slate-500">{stepText(job.step)}</p>
              <p className="text-xs text-slate-500">{t("runsInBackground")}</p>
            </div>
          )}

          {job.phase === "error" && (
            <div className="flex flex-col items-start gap-2" role="alert">
              <p className="text-sm text-red-600">
                {/* a job stored by an older version has no error code */}
                {t(`error.${job.error ?? "unknown"}` as TKey)}
              </p>
              {!settings.s2ApiKey && (
                <p className="text-xs text-slate-500">
                  {t("error.noKeyHint")}{" "}
                  <button
                    onClick={() => setTab("settings")}
                    className="font-medium text-violet-700 hover:underline">
                    {t("error.addKey")}
                  </button>
                  .
                </p>
              )}
              <button
                onClick={retry}
                className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                {t("retry")}
              </button>
            </div>
          )}

          {job.phase === "done" && !result && (
            <p className="text-sm text-slate-500">{t("loadingResults")}</p>
          )}

          {job.phase === "done" && result && totalPapers === 0 && (
            <p className="text-sm text-slate-500">{t("noResults")}</p>
          )}

          {totalPapers > 0 && (
            <>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    title={t(`filter.${f}.hint` as TKey)}
                    className={pillClass(filter === f)}>
                    {t(`filter.${f}` as TKey)}
                  </button>
                ))}
              </div>

              {designs.length >= 2 && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  {t("design.label")}
                  <Hint text={t("design.hint")} />
                  <select
                    value={activeDesign}
                    onChange={(e) => setDesign(e.target.value as DesignFilter)}
                    title={t("design.hint")}
                    className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
                    <option value="all">{t("design.all")}</option>
                    {designs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {t(`design.${d.id}` as TKey)} ({d.count})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="flex items-center justify-between gap-2">
                <label
                  className="flex items-center gap-1.5 text-xs text-slate-500"
                  title={t("sort.hint")}>
                  {t("sort.label")}
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
                    {SORTS.map((s) => (
                      <option key={s} value={s}>
                        {t(`sort.${s}` as TKey)}
                      </option>
                    ))}
                  </select>
                </label>
                {styleSelect}
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {t("count", { shown: visible.length, total: totalPapers })}
                  {timeline && (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => setShowTimeline((open) => !open)}
                        aria-expanded={showTimeline}
                        className="font-medium text-violet-700 hover:underline">
                        {showTimeline ? t("timeline.hide") : t("timeline.show")}
                      </button>
                      <Hint text={t("timeline.hint")} />
                    </span>
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
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
                      {t("picks.title")}
                      <Hint text={t("picks.hint")} />
                    </p>
                    {result!.picks.map((pick) => (
                      <div key={pick.kind} className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-violet-700">
                          {t(PICK_LABEL[pick.kind])}
                        </span>
                        {renderCard(pick.paper)}
                      </div>
                    ))}
                  </div>
                )}

                {visible.length === 0 && (
                  <p className="text-sm text-slate-500">{t("noneMatch")}</p>
                )}

                {groups.map((group) => (
                  <div key={group.label} className="flex flex-col gap-2">
                    <p
                      title={t("group.hint")}
                      className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {groupLabel(group.label, t)} · {group.papers.length}
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

// Reads the settings before drawing anything (a flash of the wrong language or
// of the setup screen would be worse than a blank frame), then puts the whole
// interface in the user's language. On first run the setup screen comes before
// everything else, and no analysis starts behind it.
function IndexPopup() {
  const settings = useStorageValue<Settings | null>(
    SETTINGS_KEY,
    getSettings,
    null
  )
  if (settings === null) return <div className="w-[26rem] p-4" />

  const lang = resolveLang(settings.language, navigator.language)
  return (
    <I18nProvider lang={lang}>
      {settings.setupDone ? (
        <PopupBody settings={settings} />
      ) : (
        <div className="flex w-[26rem] flex-col gap-3 p-4 font-sans">
          <h1 className="text-lg font-semibold text-slate-900">NextPaper</h1>
          <KeySetup settings={settings} firstRun />
        </div>
      )}
    </I18nProvider>
  )
}

export default IndexPopup
