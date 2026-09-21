import { useState, type ReactNode } from "react"

import { useT } from "~components/i18n"
import {
  IconBookmark,
  IconChevronDown,
  IconCompass,
  IconFile,
  IconQuote
} from "~components/icons"
import { accentButtonClass, buttonClass, iconButtonClass } from "~components/ui"
import { useCopyAction } from "~components/useCopyAction"
import { supportsInText, type CitationStyle } from "~lib/citation"
import { citeOne, inTextOne } from "~lib/cite"
import type { TKey } from "~lib/i18n"
import type { ReadStatus } from "~lib/library"
import { isReview } from "~lib/paper-utils"
import type { ScoredPaper } from "~lib/pipeline"
import { studyOf } from "~lib/study"
import { httpUrl } from "~lib/url"

// What a tab adds to a card: the library's controls, a label, or the short form.
export interface CardExtra {
  footer?: ReactNode
  badge?: ReactNode
  compact?: boolean
}
export type RenderCard = (paper: ScoredPaper, extra?: CardExtra) => ReactNode

function Chip({
  children,
  title,
  tone = "neutral"
}: {
  children: ReactNode
  title?: string
  tone?: "neutral" | "teal" | "warn" | "ok" | "info"
}) {
  const tones = {
    neutral: "border-line text-soft",
    teal: "border-transparent bg-teal-soft text-teal",
    warn: "border-transparent bg-warn-soft text-warn",
    ok: "border-transparent bg-ok-soft text-ok",
    info: "border-transparent bg-info-soft text-info"
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function PaperCard({
  paper,
  citationStyle,
  saved,
  status,
  highlighted,
  compact,
  badge,
  footer,
  onToggleSave,
  onExplore
}: {
  paper: ScoredPaper
  citationStyle: CitationStyle
  saved: boolean
  status?: ReadStatus
  highlighted?: boolean
  // The short form used for "Start here": no summary, tags or citation buttons.
  compact?: boolean
  badge?: ReactNode
  // Extra content attached to the bottom of the card (the library's controls).
  footer?: ReactNode
  onToggleSave: () => void
  onExplore?: () => void
}) {
  const t = useT()
  const [showAbstract, setShowAbstract] = useState(false)

  const authors = paper.authors.slice(0, 3).map((a) => a.name)
  const extraCount = paper.authors.length - authors.length
  const influential = paper.influentialCitationCount ?? 0
  const study = studyOf(paper)
  const pdfUrl = httpUrl(paper.openAccessPdf?.url)

  const cite = useCopyAction(() => citeOne(paper, citationStyle))
  const inText = useCopyAction(
    async () => (await inTextOne(paper, citationStyle)) ?? ""
  )

  const showDesign =
    study.design && !(study.design === "review" && isReview(paper))

  return (
    <article
      data-paper-id={paper.paperId}
      className={`overflow-hidden rounded-xl bg-surface shadow-card transition-shadow hover:shadow-pop ${
        highlighted ? "ring-2 ring-accent" : ""
      }`}>
      <div className="flex flex-col gap-2 p-3.5">
        {badge}

        <div className="flex items-start justify-between gap-2">
          <a
            data-paper-title
            href={httpUrl(paper.url)}
            target="_blank"
            rel="noreferrer"
            title={paper.title}
            className="line-clamp-3 font-serif text-[15px] font-semibold leading-snug text-ink hover:text-accent-ink hover:underline">
            {paper.title}
          </a>
          <button
            data-save
            onClick={onToggleSave}
            title={saved ? t("card.unsave") : t("card.save")}
            aria-label={saved ? t("card.unsave") : t("card.save")}
            aria-pressed={saved}
            className={`${iconButtonClass} -mr-1.5 -mt-1 ${
              saved ? "text-accent hover:text-accent-hi" : ""
            }`}>
            <IconBookmark size={17} filled={saved} />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted">
          <span className="text-soft">
            {authors.join(", ")}
            {extraCount > 0 ? ` +${extraCount}` : ""}
          </span>
          {" · "}
          <span className="font-medium text-soft">
            {paper.year ?? t("card.noYear")}
          </span>
          {paper.venue ? (
            <>
              {" · "}
              <span className="italic">{paper.venue}</span>
            </>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            title={
              influential > 0
                ? `${t("card.citations.hint")} · ${t("card.influential", { n: influential.toLocaleString() })}`
                : t("card.citations.hint")
            }
            className="text-[11px] font-medium tabular-nums text-soft">
            {t("card.citations", { n: paper.citationCount })}
          </span>
          {paper.relation && (
            <Chip
              title={
                paper.relation === "reference"
                  ? t("card.relation.reference.hint")
                  : t("card.relation.citation.hint")
              }>
              {paper.relation === "reference"
                ? t("card.relation.reference")
                : t("card.relation.citation")}
            </Chip>
          )}
          {!compact && isReview(paper) && (
            <Chip tone="warn" title={t("card.review.hint")}>
              {t("card.review")}
            </Chip>
          )}
          {!compact && showDesign && (
            <Chip tone="teal" title={t("card.design.hint")}>
              {t(`design.${study.design}` as TKey)}
            </Chip>
          )}
          {!compact && study.sample && (
            <Chip tone="teal" title={t("card.sample.hint")}>
              {study.sample.unit === "studies"
                ? t("card.sample.studies", { n: study.sample.n })
                : `n = ${study.sample.n.toLocaleString()}`}
            </Chip>
          )}
          {status === "read" && <Chip tone="ok">{t("status.read")}</Chip>}
          {status === "reading" && (
            <Chip tone="info">{t("status.reading")}</Chip>
          )}
          {status === "unread" && <Chip>{t("status.unread")}</Chip>}
        </div>

        {!compact && paper.tldr?.text && (
          <p className="border-l-2 border-accent/40 pl-2.5 text-[12.5px] leading-relaxed text-soft">
            <span
              title={t("card.tldr.hint")}
              className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              TL;DR
            </span>
            {paper.tldr.text}
          </p>
        )}

        {!compact && paper.abstract && (
          <div>
            <button
              onClick={() => setShowAbstract((prev) => !prev)}
              aria-expanded={showAbstract}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
              <span
                className={`transition-transform ${showAbstract ? "rotate-180" : ""}`}>
                <IconChevronDown size={14} />
              </span>
              {showAbstract ? t("card.abstract.hide") : t("card.abstract.show")}
            </button>
            {showAbstract && (
              <p className="mt-1.5 text-xs leading-relaxed text-soft">
                {paper.abstract}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-1.5 pt-0.5">
          {onExplore && (
            <button
              onClick={onExplore}
              title={t("card.explore.hint")}
              className={accentButtonClass}>
              <IconCompass size={14} />
              {t("card.explore")}
            </button>
          )}
          {!compact && pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              title={t("card.pdf.hint")}
              className={`${buttonClass} border-ok/30 text-ok hover:border-ok/60 hover:text-ok`}>
              <IconFile size={14} />
              {t("card.pdf")}
            </a>
          )}
          {!compact && supportsInText(citationStyle) && (
            <button
              onClick={inText.run}
              disabled={inText.phase === "busy"}
              title={t("card.inText.hint")}
              className={buttonClass}>
              {inText.label(t("card.inText"))}
            </button>
          )}
          {!compact && (
            <button
              onClick={cite.run}
              disabled={cite.phase === "busy"}
              title={t("card.cite.hint")}
              className={buttonClass}>
              <IconQuote size={14} />
              {cite.label(t("card.cite"))}
            </button>
          )}
        </div>
      </div>

      {footer}
    </article>
  )
}
