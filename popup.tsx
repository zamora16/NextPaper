import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react"

import "~style.css"

import { I18nProvider, useT } from "~components/i18n"
import {
  IconBell,
  IconBookmark,
  IconNetwork,
  IconSliders,
  Logo
} from "~components/icons"
import { KeySetup } from "~components/KeySetup"
import { PaperCard, type RenderCard } from "~components/PaperCard"
import {
  DEFAULT_VIEW,
  RelatedTab,
  type ViewState
} from "~components/RelatedTab"
import { SavedTab } from "~components/SavedTab"
import { iconButtonClass } from "~components/ui"
import { UpdatesTab } from "~components/UpdatesTab"
import { useAnalysis } from "~components/useAnalysis"
import { useStorageValue } from "~components/useStorageValue"
import type { CitationStyle } from "~lib/citation"
import { extractPaperRef } from "~lib/extract-ref"
import { resolveLang } from "~lib/i18n"
import {
  getLibrary,
  LIBRARY_KEY,
  toggleSaved,
  type SavedPaper
} from "~lib/library"
import { getSettings, SETTINGS_KEY, type Settings } from "~lib/settings"
import {
  getUpdates,
  markUpdatesViewed,
  UPDATES_KEY,
  type UpdatesState
} from "~lib/updates"

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
const TAB_ORDER: Tab[] = ["related", "saved", "updates"]

// The popup's fixed frame: Chrome caps a popup at 600 px tall, so the header
// stays put and only the content scrolls.
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[600px] w-[27rem] flex-col overflow-hidden bg-paper font-sans text-ink">
      {children}
    </div>
  )
}

function TabButton({
  selected,
  icon,
  label,
  badge,
  badgeTitle,
  hint,
  onClick
}: {
  selected: boolean
  icon: ReactNode
  label: string
  badge?: number
  badgeTitle?: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onClick}
      title={hint}
      className={`relative flex flex-1 items-center justify-center gap-1.5 px-2 pb-2.5 pt-2 text-[13px] font-medium transition-colors ${
        selected ? "text-ink" : "text-muted hover:text-ink"
      }`}>
      {icon}
      {label}
      {badge !== undefined && (
        <span
          title={badgeTitle}
          className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
            selected ? "bg-accent-soft text-accent-ink" : "bg-sunken text-soft"
          }`}>
          {badge}
        </span>
      )}
      <span
        className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors ${
          selected ? "bg-accent" : "bg-transparent"
        }`}
      />
    </button>
  )
}

function PopupBody({ settings }: { settings: Settings }) {
  const t = useT()
  const [ref, setRef] = useState<string | null | undefined>(undefined)
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("apa")
  const [tab, setTab] = useState<Tab>("related")
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const library = useStorageValue<SavedPaper[]>(LIBRARY_KEY, getLibrary, [])
  const updates = useStorageValue<UpdatesState | null>(
    UPDATES_KEY,
    getUpdates,
    null
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Exploring a result (or searching a topic) pushes onto this trail; the
  // page's own paper is the root and is never stored in it.
  const [trail, setTrail] = useState<{ ref: string; label: string }[]>([])
  const current = trail.length ? trail[trail.length - 1] : null
  const activeRef = current ? current.ref : ref
  // No analysis (and no request) before the first-run setup is answered.
  const { job, result, retry } = useAnalysis(
    settings.setupDone ? activeRef : null
  )
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const scroller = useRef<HTMLElement>(null)

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

  // A new paper starts with nothing highlighted and the default view.
  useEffect(() => {
    setSelectedId(null)
    setView(DEFAULT_VIEW)
  }, [activeRef])

  // Each tab starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [tab, activeRef])

  const explore = useCallback((target: { ref: string; label: string }) => {
    setTrail((trail) => [...trail, target])
    setTab("related")
  }, [])

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

  const renderCard: RenderCard = (paper, extra) => (
    <PaperCard
      key={paper.paperId}
      paper={paper}
      citationStyle={citationStyle}
      saved={savedIds.has(paper.paperId)}
      status={statusById.get(paper.paperId)}
      highlighted={paper.paperId === selectedId}
      onToggleSave={() => toggleSaved(paper)}
      onExplore={() => explore({ ref: paper.paperId, label: paper.title })}
      {...extra}
    />
  )

  const inSettings = tab === "settings"

  // Arrow keys move between the tabs, as a tab list is expected to.
  const onTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TAB_ORDER.indexOf(tab)
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (index < 0 || !step) return
    event.preventDefault()
    const next = (index + step + TAB_ORDER.length) % TAB_ORDER.length
    setTab(TAB_ORDER[next])
    ;(event.currentTarget.children[next] as HTMLElement).focus()
  }

  return (
    <Frame>
      <header className="flex items-center gap-2.5 px-4 pb-1 pt-3">
        <Logo size={26} />
        <h1 className="text-[15px] font-semibold tracking-tight">NextPaper</h1>
        <button
          onClick={() => setTab(inSettings ? "related" : "settings")}
          title={t("tab.settings.hint")}
          aria-label={t("tab.settings")}
          aria-pressed={inSettings}
          className={`${iconButtonClass} ml-auto ${
            inSettings ? "bg-accent-soft text-accent-ink" : ""
          }`}>
          <IconSliders size={17} />
        </button>
      </header>

      {!inSettings && (
        <div
          role="tablist"
          onKeyDown={onTabKeys}
          className="flex border-b border-line px-2">
          <TabButton
            selected={tab === "related"}
            icon={<IconNetwork size={15} />}
            label={t("tab.related")}
            hint={t("tab.related.hint")}
            onClick={() => setTab("related")}
          />
          <TabButton
            selected={tab === "saved"}
            icon={<IconBookmark size={15} />}
            label={t("tab.saved")}
            badge={library.length}
            hint={t("tab.saved.hint")}
            onClick={() => setTab("saved")}
          />
          <TabButton
            selected={tab === "updates"}
            icon={<IconBell size={15} />}
            label={t("tab.updates")}
            badge={unviewedUpdates > 0 ? unviewedUpdates : undefined}
            badgeTitle={t("updates.unseen")}
            hint={t("tab.updates.hint")}
            onClick={() => setTab("updates")}
          />
        </div>
      )}

      <main
        ref={scroller}
        role={inSettings ? undefined : "tabpanel"}
        className="min-h-0 flex-1 overflow-y-auto">
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
            onStyleChange={setCitationStyle}
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
          <RelatedTab
            pageRef={ref}
            current={current}
            job={job}
            result={result}
            hasKey={settings.s2ApiKey !== null}
            view={view}
            onView={(patch) => setView((prev) => ({ ...prev, ...patch }))}
            citationStyle={citationStyle}
            onStyleChange={setCitationStyle}
            selectedId={selectedId}
            onSelectPaper={selectPaper}
            onBack={() => setTrail((trail) => trail.slice(0, -1))}
            onSearch={(query) =>
              // The label is the user's own text: it needs no translation.
              explore({ ref: `QUERY:${query.toLowerCase()}`, label: query })
            }
            onRetry={retry}
            onOpenSettings={() => setTab("settings")}
            renderCard={renderCard}
          />
        )}
      </main>
    </Frame>
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
  if (settings === null) return <Frame>{null}</Frame>

  const lang = resolveLang(settings.language, navigator.language)
  return (
    <I18nProvider lang={lang}>
      {settings.setupDone ? (
        <PopupBody settings={settings} />
      ) : (
        <Frame>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <KeySetup settings={settings} firstRun />
          </main>
        </Frame>
      )}
    </I18nProvider>
  )
}

export default IndexPopup
