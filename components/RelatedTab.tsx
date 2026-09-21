import { useMemo, useState, type ReactNode } from "react"

import { CitationBar } from "~components/CitationButtons"
import { groupLabel, Hint, useT } from "~components/i18n"
import {
  IconAlert,
  IconArrowLeft,
  IconChart,
  IconFile,
  IconFlag,
  IconNetwork
} from "~components/icons"
import type { RenderCard } from "~components/PaperCard"
import { SearchField } from "~components/SearchField"
import { Timeline } from "~components/Timeline"
import {
  buttonClass,
  groupColor,
  pillClass,
  sectionLabelClass,
  selectClass
} from "~components/ui"
import type { CitationStyle } from "~lib/citation"
import type { TKey } from "~lib/i18n"
import type { JobState, Step } from "~lib/job"
import {
  ALL_GROUP,
  OTHER_GROUP,
  RELATED_GROUP,
  type AnalysisResult,
  type PickKind
} from "~lib/model"
import { buildTimeline } from "~lib/timeline"
import { applyView, FILTERS, SORTS, type Filter, type Sort } from "~lib/view"

export interface ViewState {
  filter: Filter
  sort: Sort
  timeline: boolean
}

export const DEFAULT_VIEW: ViewState = {
  filter: "all",
  sort: "relevance",
  timeline: false
}

const PICK_LABEL: Record<PickKind, TKey> = {
  foundational: "pick.foundational",
  review: "pick.review",
  recent: "pick.recent"
}

function stepText(t: ReturnType<typeof useT>, step: Step | undefined) {
  return step && typeof step === "object"
    ? t(`step.${step.code}` as TKey, "n" in step ? { n: step.n } : undefined)
    : t("step.default")
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col gap-2.5 rounded-xl bg-surface p-3.5 shadow-card motion-reduce:animate-none">
          <div className="h-3.5 w-11/12 rounded bg-sunken" />
          <div className="h-3.5 w-7/12 rounded bg-sunken" />
          <div className="h-2.5 w-5/12 rounded bg-sunken" />
          <div className="h-2.5 w-full rounded bg-sunken" />
          <div className="h-2.5 w-10/12 rounded bg-sunken" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  icon,
  children
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
        {icon}
      </span>
      <div className="max-w-[19rem] text-sm leading-relaxed text-soft">
        {children}
      </div>
    </div>
  )
}

// Which paper (or topic) the list is about. Without it the reader has to trust
// that the popup is looking at the paper they meant.
function ContextCard({
  kind,
  title,
  byline,
  raw,
  onBack
}: {
  kind: string
  title: string
  byline?: string
  // The title is only the reference (DOI...), not yet a real title.
  raw?: boolean
  onBack?: () => void
}) {
  const t = useT()
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-sunken px-3 py-2.5">
      {onBack ? (
        <button
          onClick={onBack}
          title={t("back.hint")}
          aria-label={t("back")}
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-soft hover:border-line-strong hover:text-ink">
          <IconArrowLeft size={14} />
        </button>
      ) : (
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-ink">
          <IconFile size={14} />
        </span>
      )}
      <div className="min-w-0">
        <p className={sectionLabelClass}>{kind}</p>
        <p
          title={title}
          className={`line-clamp-2 text-ink ${
            raw
              ? "break-all font-mono text-xs"
              : "font-serif text-[13.5px] font-semibold leading-snug"
          }`}>
          {title}
        </p>
        {byline && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{byline}</p>
        )}
      </div>
    </div>
  )
}

export function RelatedTab({
  pageRef,
  current,
  job,
  result,
  hasKey,
  view,
  onView,
  citationStyle,
  onStyleChange,
  selectedId,
  onSelectPaper,
  onBack,
  onSearch,
  onRetry,
  onOpenSettings,
  renderCard
}: {
  // The paper of the page ("undefined" while it is being detected).
  pageRef: string | null | undefined
  current: { ref: string; label: string } | null
  job: JobState
  result: AnalysisResult | null
  hasKey: boolean
  view: ViewState
  onView: (patch: Partial<ViewState>) => void
  citationStyle: CitationStyle
  onStyleChange: (style: CitationStyle) => void
  selectedId: string | null
  onSelectPaper: (paperId: string) => void
  onBack: () => void
  onSearch: (query: string) => void
  onRetry: () => void
  onOpenSettings: () => void
  renderCard: RenderCard
}) {
  const t = useT()
  const [queryInput, setQueryInput] = useState("")
  const activeRef = current ? current.ref : pageRef

  const groups = useMemo(
    () => (result ? applyView(result.groups, view.filter, view.sort) : []),
    [result, view.filter, view.sort]
  )
  const visible = useMemo(() => {
    const seen = new Map<string, (typeof groups)[number]["papers"][number]>()
    groups.forEach((g) => g.papers.forEach((p) => seen.set(p.paperId, p)))
    return [...seen.values()]
  }, [groups])
  const totalPapers =
    result?.groups.reduce((sum, g) => sum + g.papers.length, 0) ?? 0
  const timeline = useMemo(
    () => (result ? buildTimeline(result.groups, result.seedYear) : null),
    [result]
  )
  const visibleIds = useMemo(
    () => new Set(visible.map((paper) => paper.paperId)),
    [visible]
  )
  const showPicks =
    !!result?.picks.length && view.filter === "all" && view.sort === "relevance"

  // Subtopic colors follow the group order, so a heading and its timeline lane
  // match; the flattened list of a re-sorted view has no subtopic.
  const colorOf = (label: string) => {
    const index = result?.groups.findIndex((g) => g.label === label) ?? -1
    return index < 0 || label === OTHER_GROUP
      ? "rgb(var(--muted))"
      : groupColor(index)
  }

  // A single list has no heading to show: the count above already says it.
  const standAlone =
    groups.length === 1 &&
    (groups[0].label === RELATED_GROUP || groups[0].label === ALL_GROUP)

  const submit = () => {
    const query = queryInput.trim().replace(/\s+/g, " ")
    if (query.length < 3) return
    onSearch(query)
    setQueryInput("")
  }

  // What the popup is looking at: an explored paper or topic, the page's own
  // paper once the analysis says which it is, or the raw reference until then.
  const context = current ? (
    <ContextCard
      kind={t(
        current.ref.startsWith("QUERY:") ? "context.topic" : "context.exploring"
      )}
      title={current.label}
      onBack={onBack}
    />
  ) : pageRef && result?.seedTitle ? (
    <ContextCard
      kind={t("context.open")}
      title={result.seedTitle}
      byline={[result.seedByline, result.seedYear].filter(Boolean).join(" · ")}
    />
  ) : pageRef ? (
    <ContextCard kind={t("context.open")} title={pageRef} raw />
  ) : null

  return (
    <div className="flex flex-col gap-3 p-4">
      <SearchField
        value={queryInput}
        onChange={setQueryInput}
        placeholder={t("search.placeholder")}
        hint={t("search.hint")}
        onSubmit={submit}
        canSubmit={queryInput.trim().length >= 3}
      />

      {context}

      {!current && pageRef === undefined && (
        <p className="text-sm text-muted">{t("detecting")}</p>
      )}

      {!current && pageRef === null && (
        <EmptyState icon={<IconNetwork size={22} />}>{t("noPaper")}</EmptyState>
      )}

      {activeRef && job.phase === "loading" && (
        <>
          <div role="status" className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-ink">
              {stepText(t, job.step)}
            </p>
            <p className="text-xs text-muted">{t("runsInBackground")}</p>
          </div>
          <Skeleton />
        </>
      )}

      {job.phase === "error" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2.5 rounded-xl bg-danger-soft p-3.5">
          <p className="flex items-start gap-2 text-sm text-danger">
            <span className="mt-0.5">
              <IconAlert size={16} />
            </span>
            {/* a job stored by an older version has no error code */}
            <span>{t(`error.${job.error ?? "unknown"}` as TKey)}</span>
          </p>
          {!hasKey && (
            <p className="text-xs text-soft">
              {t("error.noKeyHint")}{" "}
              <button
                onClick={onOpenSettings}
                className="font-medium text-accent-ink hover:underline">
                {t("error.addKey")}
              </button>
              .
            </p>
          )}
          <button onClick={onRetry} className={buttonClass}>
            {t("retry")}
          </button>
        </div>
      )}

      {job.phase === "done" && !result && (
        <p className="text-sm text-muted">{t("loadingResults")}</p>
      )}

      {job.phase === "done" && result && totalPapers === 0 && (
        <p className="text-sm text-muted">{t("noResults")}</p>
      )}

      {totalPapers > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => onView({ filter: f })}
                aria-pressed={view.filter === f}
                title={t(`filter.${f}.hint` as TKey)}
                className={pillClass(view.filter === f)}>
                {t(`filter.${f}` as TKey)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label
              className="flex items-center gap-1.5 text-xs text-muted"
              title={t("sort.hint")}>
              {t("sort.label")}
              <select
                value={view.sort}
                onChange={(e) => onView({ sort: e.target.value as Sort })}
                className={selectClass}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sort.${s}` as TKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted">
                {visible.length === totalPapers
                  ? t("papers", { n: totalPapers })
                  : t("count", { shown: visible.length, total: totalPapers })}
              </span>
              {timeline && (
                <button
                  onClick={() => onView({ timeline: !view.timeline })}
                  aria-pressed={view.timeline}
                  title={t("timeline.hint")}
                  className={pillClass(view.timeline)}>
                  <IconChart size={14} />
                  {t("timeline.label")}
                </button>
              )}
              {timeline && <Hint text={t("timeline.hint")} />}
            </span>
            {visible.length > 0 && (
              <CitationBar
                papers={visible}
                style={citationStyle}
                onStyleChange={onStyleChange}
              />
            )}
          </div>

          {view.timeline && timeline && (
            <Timeline
              data={timeline}
              seedYear={result?.seedYear}
              visibleIds={visibleIds}
              selectedId={selectedId}
              colorOf={colorOf}
              onSelect={onSelectPaper}
            />
          )}

          {showPicks && (
            <section className="flex flex-col gap-2.5 rounded-2xl bg-accent-soft/70 p-3">
              <p
                className={`${sectionLabelClass} flex items-center gap-1.5 !text-accent-ink`}>
                <IconFlag size={13} />
                {t("picks.title")}
                <Hint text={t("picks.hint")} />
              </p>
              {result!.picks.map((pick) => (
                <div key={pick.kind}>
                  {renderCard(pick.paper, {
                    compact: true,
                    badge: (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-ink">
                        {t(PICK_LABEL[pick.kind])}
                      </span>
                    )
                  })}
                </div>
              ))}
            </section>
          )}

          {visible.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">
              {t("noneMatch")}
            </p>
          )}

          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2.5">
              {!standAlone && (
                <h3
                  title={t("group.hint")}
                  className="flex items-center gap-2 pt-1 text-xs font-semibold text-soft">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background:
                        group.label === ALL_GROUP
                          ? "rgb(var(--muted))"
                          : colorOf(group.label)
                    }}
                  />
                  <span className="line-clamp-1 uppercase tracking-wide">
                    {groupLabel(group.label, t)}
                  </span>
                  <span className="font-normal tabular-nums text-muted">
                    {group.papers.length}
                  </span>
                </h3>
              )}
              {group.papers.map((paper) => renderCard(paper))}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
