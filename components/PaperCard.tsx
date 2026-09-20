import { useState } from "react"

import { useCopyAction } from "~components/useCopyAction"
import { supportsInText, type CitationStyle } from "~lib/citation"
import { citeOne, inTextOne } from "~lib/cite"
import type { ReadStatus } from "~lib/library"
import { isReview } from "~lib/paper-utils"
import type { ScoredPaper } from "~lib/pipeline"
import { designLabel, formatSample, studyOf } from "~lib/study"

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
  const [showAbstract, setShowAbstract] = useState(false)

  const visibleAuthors = paper.authors.slice(0, 3).map((a) => a.name)
  const extraCount = paper.authors.length - visibleAuthors.length
  const influential = paper.influentialCitationCount ?? 0
  const study = studyOf(paper)

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
          href={paper.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 text-sm font-medium text-slate-900 hover:underline">
          {paper.title}
        </a>
        <button
          onClick={onToggleSave}
          title={saved ? "Quitar de guardados" : "Guardar para leer después"}
          className={`shrink-0 text-base leading-none ${
            saved ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
          }`}>
          {saved ? "★" : "☆"}
        </button>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {visibleAuthors.join(", ")}
        {extraCount > 0 ? ` +${extraCount}` : ""} · {paper.year ?? "s.f."}
        {paper.venue ? ` · ${paper.venue}` : ""}
      </p>

      {paper.tldr?.text && (
        <p className="mt-1.5 text-xs italic text-slate-600">
          {paper.tldr.text}
        </p>
      )}

      {paper.sharedTerms && paper.sharedTerms.length > 0 && (
        <p
          className="mt-1 text-[11px] text-slate-500"
          title="Palabras distintivas que este paper comparte con el que lees">
          Coincide en:{" "}
          <span className="font-medium text-slate-600">
            {paper.sharedTerms.join(" · ")}
          </span>
        </p>
      )}

      {paper.abstract && (
        <>
          <button
            onClick={() => setShowAbstract((prev) => !prev)}
            className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline">
            {showAbstract ? "Ocultar abstract" : "Ver abstract"}
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
              ? `${influential.toLocaleString()} citas influyentes`
              : undefined
          }>
          {paper.citationCount.toLocaleString()} citas
        </Tag>
        {paper.similarity !== null && (
          <Tag
            className="bg-violet-50 text-violet-700"
            title={
              paper.approximate
                ? "Aproximada: el paper que lees no tiene embedding, se compara con sus vecinos más probables"
                : "Similitud coseno entre embeddings SPECTER2"
            }>
            {paper.approximate ? "~" : ""}
            {Math.round(paper.similarity * 100)}% similar
          </Tag>
        )}
        {paper.relation && (
          <Tag
            title={
              paper.relation === "reference"
                ? "El paper que lees cita a este"
                : "Este paper cita al que lees"
            }>
            {paper.relation === "reference" ? "Referencia" : "Lo cita"}
          </Tag>
        )}
        {isReview(paper) && (
          <Tag className="bg-amber-50 text-amber-700">Revisión</Tag>
        )}
        {study.design && !(study.design === "review" && isReview(paper)) && (
          <Tag
            className="bg-teal-50 text-teal-700"
            title="Diseño detectado en el título y el abstract con reglas; puede fallar">
            {designLabel(study.design)}
          </Tag>
        )}
        {study.sample && (
          <Tag
            className="bg-teal-50 text-teal-700"
            title="Tamaño de muestra leído del abstract con reglas; puede fallar">
            {formatSample(study.sample)}
          </Tag>
        )}
        {status === "read" && (
          <Tag className="bg-emerald-50 text-emerald-700">✓ Leído</Tag>
        )}
        {status === "reading" && (
          <Tag className="bg-sky-50 text-sky-700">Leyendo</Tag>
        )}
        {status === "unread" && <Tag>Por leer</Tag>}
      </div>

      <div className="mt-2 flex justify-end gap-1.5">
        {onExplore && (
          <button
            onClick={onExplore}
            title="Analizar este paper: ver sus referencias, citas y papers similares"
            className="rounded border border-violet-200 px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-50">
            Explorar
          </button>
        )}
        {paper.openAccessPdf?.url && (
          <a
            href={paper.openAccessPdf.url}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
            PDF gratis
          </a>
        )}
        {supportsInText(citationStyle) && (
          <button
            onClick={inText.run}
            disabled={inText.phase === "busy"}
            title="Copiar la cita en el texto, p. ej. (Autor, 2020)"
            className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60">
            {inText.label("En texto")}
          </button>
        )}
        <button
          onClick={cite.run}
          disabled={cite.phase === "busy"}
          className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          {cite.label("Citar")}
        </button>
      </div>
    </div>
  )
}
