import { useState } from "react"

import { useT } from "~components/i18n"
import { IconCheck, IconCopy, IconDownload } from "~components/icons"
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

// Everything about getting citations out: the style, copying them, and (for
// the library) downloading them for a reference manager.
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
  const t = useT()
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex">
        <CopyCitationsButton papers={papers} style={style} joined />
        <select
          value={style}
          onChange={(e) => onStyleChange(e.target.value as CitationStyle)}
          title={t("citeAs.hint")}
          aria-label={t("citeAs")}
          className={`${selectClass} -ml-px w-[5.5rem] rounded-l-none`}>
          {CITATION_STYLES.map((option) => (
            <option key={option} value={option}>
              {t(`style.${option}` as TKey)}
            </option>
          ))}
        </select>
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
