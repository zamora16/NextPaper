import { useState } from "react"

import { useT } from "~components/i18n"
import { useCopyAction } from "~components/useCopyAction"
import { supportsInText, type CitationStyle } from "~lib/citation"
import { citeOne, inTextOne } from "~lib/cite"
import type { TKey } from "~lib/i18n"
import type { ReadStatus } from "~lib/library"
import { isReview } from "~lib/paper-utils"
import type { ScoredPaper } from "~lib/pipeline"
import { studyOf } from "~lib/study"
import { httpUrl } from "~lib/url"

function Tag({
  children,
  title,
  className = "bg-slate-100 text-slate-500"
}: {
  children: React.ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={`rounded px-1.5 py-px text-[11px] font-medium ${className}`}>
      {children}
    </span>
  )
}

const actionClass =
  "rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"

export function PaperCard({
  paper,
  citationStyle,
  saved,
  status,
  highlighted,
  onToggleSave,
  onExplore
}: {
  paper: ScoredPaper
  citationStyle: CitationStyle
  saved: boolean
  status?: ReadStatus
  highlighted?: boolean
  onToggleSave: () => void
  onExplore?: () => void
}) {
  const t = useT()
  const [showAbstract, setShowAbstract] = useState(false)

  const visibleAuthors = paper.authors.slice(0, 3).map((a) => a.name)
  const extraCount = paper.authors.length - visibleAuthors.length
  const influential = paper.influentialCitationCount ?? 0
  const study = studyOf(paper)
  const pdfUrl = httpUrl(paper.openAccessPdf?.url)

  const cite = useCopyAction(() => citeOne(paper, citationStyle))
  const inText = useCopyAction(
    async () => (await inTextOne(paper, citationStyle)) ?? ""
  )

  return (
    <div
      data-paper-id={paper.paperId}
      className={`rounded-lg border p-3 transition hover:bg-slate-50 ${
        highlighted
          ? "border-violet-400 ring-2 ring-violet-300"
          : "border-slate-200 hover:border-slate-300"
      }`}>
      <div className="flex items-start justify-between gap-2">
        <a
          href={httpUrl(paper.url)}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-sm font-medium text-slate-900 hover:underline">
          {paper.title}
        </a>
        <button
          onClick={onToggleSave}
          title={saved ? t("card.unsave") : t("card.save")}
          aria-label={saved ? t("card.unsave") : t("card.save")}
          aria-pressed={saved}
          className={`shrink-0 text-base leading-none ${
            saved ? "text-amber-500" : "text-slate-500 hover:text-amber-500"
          }`}>
          {saved ? "★" : "☆"}
        </button>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {visibleAuthors.join(", ")}
        {extraCount > 0 ? ` +${extraCount}` : ""} ·{" "}
        {paper.year ?? t("card.noYear")}
        {paper.venue ? ` · ${paper.venue}` : ""}
      </p>

      {paper.tldr?.text && (
        <p className="mt-1.5 text-xs italic text-slate-600">
          {paper.tldr.text}
        </p>
      )}

      {paper.abstract && (
        <>
          <button
            onClick={() => setShowAbstract((prev) => !prev)}
            aria-expanded={showAbstract}
            className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline">
            {showAbstract ? t("card.abstract.hide") : t("card.abstract.show")}
          </button>
          {showAbstract && (
            <p className="mt-1 text-xs text-slate-600">{paper.abstract}</p>
          )}
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Tag
          className="bg-blue-50 text-blue-700"
          title={
            influential > 0
              ? `${t("card.citations.hint")} · ${t("card.influential", { n: influential.toLocaleString() })}`
              : t("card.citations.hint")
          }>
          {t("card.citations", { n: paper.citationCount })}
        </Tag>
        {paper.similarity !== null && (
          <Tag
            className="bg-violet-50 text-violet-700"
            title={
              paper.approximate
                ? t("card.similar.approx.hint")
                : t("card.similar.hint")
            }>
            {paper.approximate ? "~" : ""}
            {t("card.similar", { n: Math.round(paper.similarity * 100) })}
          </Tag>
        )}
        {paper.relation && (
          <Tag
            title={
              paper.relation === "reference"
                ? t("card.relation.reference.hint")
                : t("card.relation.citation.hint")
            }>
            {paper.relation === "reference"
              ? t("card.relation.reference")
              : t("card.relation.citation")}
          </Tag>
        )}
        {isReview(paper) && (
          <Tag
            className="bg-amber-50 text-amber-700"
            title={t("card.review.hint")}>
            {t("card.review")}
          </Tag>
        )}
        {study.design && !(study.design === "review" && isReview(paper)) && (
          <Tag
            className="bg-teal-50 text-teal-700"
            title={t("card.design.hint")}>
            {t(`design.${study.design}` as TKey)}
          </Tag>
        )}
        {study.sample && (
          <Tag
            className="bg-teal-50 text-teal-700"
            title={t("card.sample.hint")}>
            {study.sample.unit === "studies"
              ? t("card.sample.studies", { n: study.sample.n })
              : `n = ${study.sample.n.toLocaleString()}`}
          </Tag>
        )}
        {status === "read" && (
          <Tag className="bg-emerald-50 text-emerald-700">
            {t("status.read")}
          </Tag>
        )}
        {status === "reading" && (
          <Tag className="bg-sky-50 text-sky-700">{t("status.reading")}</Tag>
        )}
        {status === "unread" && <Tag>{t("status.unread")}</Tag>}
      </div>

      <div className="mt-2 flex justify-end gap-1.5">
        {onExplore && (
          <button
            onClick={onExplore}
            title={t("card.explore.hint")}
            className="rounded border border-violet-200 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-50">
            {t("card.explore")}
          </button>
        )}
        {pdfUrl && (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            title={t("card.pdf.hint")}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
            {t("card.pdf")}
          </a>
        )}
        {supportsInText(citationStyle) && (
          <button
            onClick={inText.run}
            disabled={inText.phase === "busy"}
            title={t("card.inText.hint")}
            className={actionClass}>
            {inText.label(t("card.inText"))}
          </button>
        )}
        <button
          onClick={cite.run}
          disabled={cite.phase === "busy"}
          title={t("card.cite.hint")}
          className={actionClass}>
          {cite.label(t("card.cite"))}
        </button>
      </div>
    </div>
  )
}
