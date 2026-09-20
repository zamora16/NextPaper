import { useState } from "react"

import { buttonClass } from "~components/ui"
import { useCopyAction } from "~components/useCopyAction"
import type { Citable, CitationStyle } from "~lib/citation"
import { citeMany } from "~lib/cite"
import { downloadFile } from "~lib/export"

// "Copiar N citas": every paper in the chosen style, joined by blank lines.
export function CopyCitationsButton({
  papers,
  style
}: {
  papers: Citable[]
  style: CitationStyle
}) {
  const action = useCopyAction((onProgress) =>
    citeMany(papers, style, onProgress)
  )
  return (
    <button
      onClick={action.run}
      disabled={action.phase === "busy" || papers.length === 0}
      className={buttonClass}>
      {action.label(`Copiar ${papers.length} citas`)}
    </button>
  )
}

const FILES = {
  bibtex: { name: "nextpaper-guardados.bib", mime: "application/x-bibtex" },
  ris: {
    name: "nextpaper-guardados.ris",
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
      className={buttonClass}>
      {progress && progress[1] > 1
        ? `Preparando ${progress[0]}/${progress[1]}`
        : `.${format === "bibtex" ? "bib" : "ris"}`}
    </button>
  )
}
