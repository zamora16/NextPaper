import { useState } from "react"

import { useT } from "~components/i18n"
import { buttonClass } from "~components/ui"
import { useCopyAction } from "~components/useCopyAction"
import type { Citable, CitationStyle } from "~lib/citation"
import { citeMany } from "~lib/cite"
import { downloadFile } from "~lib/export"

// "Copy N citations": every paper in the chosen style, joined by blank lines.
export function CopyCitationsButton({
  papers,
  style
}: {
  papers: Citable[]
  style: CitationStyle
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
      className={buttonClass}>
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
export function ExportButton({
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
      {progress && progress[1] > 1
        ? t("copy.progress", { done: progress[0], total: progress[1] })
        : `.${format === "bibtex" ? "bib" : "ris"}`}
    </button>
  )
}
