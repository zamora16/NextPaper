import { useEffect, useRef, useState } from "react"

import { useT } from "~components/i18n"
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload
} from "~components/icons"
import { buttonClass, selectClass } from "~components/ui"
import { useCopyAction } from "~components/useCopyAction"
import {
  CITATION_STYLES,
  type Citable,
  type CitationStyle
} from "~lib/citation"
import { citeMany } from "~lib/cite"
import { downloadFile } from "~lib/export"
import type { TKey } from "~lib/i18n"

// "Copy N citations": every paper in the chosen style, joined by blank lines.
function CopyCitationsButton({
  papers,
  style,
  joined
}: {
  papers: Citable[]
  style: CitationStyle
  joined?: boolean
}) {
  const t = useT()
  const action = useCopyAction((onProgress) =>
    citeMany(papers, style, onProgress)
  )
  return (
    <button
      onClick={action.run}
      disabled={action.phase === "busy" || papers.length === 0}
      title={t("copyCitations.hint")}
      className={`${buttonClass} ${joined ? "rounded-r-none" : ""}`}>
      {action.phase === "copied" ? (
        <IconCheck size={14} />
      ) : (
        <IconCopy size={14} />
      )}
      {action.label(t("copyCitations", { n: papers.length }))}
    </button>
  )
}

const FILES = {
  bibtex: { name: "nextpaper-saved.bib", mime: "application/x-bibtex" },
  ris: {
    name: "nextpaper-saved.ris",
    mime: "application/x-research-info-systems"
  }
} as const

// Downloads a reference-manager file (.bib / .ris), notes included.
function ExportButton({
  papers,
  format
}: {
  papers: Citable[]
  format: keyof typeof FILES
}) {
  const t = useT()
  const [progress, setProgress] = useState<[number, number] | null>(null)

  const run = async () => {
    setProgress([0, papers.length])
    try {
      const content =
        (await citeMany(papers, format, (done, total) =>
          setProgress([done, total])
        )) + "\n"
      downloadFile(FILES[format].name, content, FILES[format].mime)
    } finally {
      setProgress(null)
    }
  }

  return (
    <button
      onClick={run}
      disabled={progress !== null || papers.length === 0}
      title={t(format === "bibtex" ? "export.bib.hint" : "export.ris.hint")}
      className={buttonClass}>
      <IconDownload size={14} />
      {progress && progress[1] > 1
        ? t("copy.progress", { done: progress[0], total: progress[1] })
        : `.${format === "bibtex" ? "bib" : "ris"}`}
    </button>
  )
}

// The citation style: it decides what every card's Cite and In text copy.
function StyleSelect({
  style,
  onChange,
  className = ""
}: {
  style: CitationStyle
  onChange: (style: CitationStyle) => void
  className?: string
}) {
  const t = useT()
  return (
    <select
      value={style}
      onChange={(e) => onChange(e.target.value as CitationStyle)}
      title={t("citeAs.hint")}
      aria-label={t("citeAs")}
      className={`${selectClass} ${className}`}>
      {CITATION_STYLES.map((option) => (
        <option key={option} value={option}>
          {t(`style.${option}` as TKey)}
        </option>
      ))}
    </select>
  )
}

// One small button that shows the current style and opens what is rarely
// needed: choosing another style and copying every paper shown. (Copying one
// paper is on its card.)
export function CitationMenu({
  papers,
  style,
  onStyleChange
}: {
  papers: Citable[]
  style: CitationStyle
  onStyleChange: (style: CitationStyle) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`${t("citeAs")}: ${t(`style.${style}` as TKey)}`}
        title={t("citeMenu.hint")}
        className={buttonClass}>
        {t(`style.${style}` as TKey)}
        <IconChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 flex w-64 flex-col gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-pop">
          <label className="flex flex-col gap-1 text-xs text-muted">
            {t("citeAs")}
            <StyleSelect
              style={style}
              onChange={onStyleChange}
              className="w-full"
            />
          </label>
          <CopyCitationsButton papers={papers} style={style} />
        </div>
      )}
    </div>
  )
}

// Everything about getting citations out of the library: the style, copying
// them, and downloading them for a reference manager.
export function CitationBar({
  papers,
  style,
  onStyleChange,
  exports
}: {
  papers: Citable[]
  style: CitationStyle
  onStyleChange: (style: CitationStyle) => void
  exports?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex">
        <CopyCitationsButton papers={papers} style={style} joined />
        <StyleSelect
          style={style}
          onChange={onStyleChange}
          className="-ml-px w-[5.5rem] rounded-l-none"
        />
      </div>
      {exports && (
        <div className="flex gap-1.5">
          <ExportButton papers={papers} format="bibtex" />
          <ExportButton papers={papers} format="ris" />
        </div>
      )}
    </div>
  )
}
