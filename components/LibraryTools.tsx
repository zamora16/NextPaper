import { useRef, useState } from "react"

import { buildBackup, parseBackup } from "~lib/backup"
import { downloadFile } from "~lib/export"
import { parseReferences, resolveReferences } from "~lib/import"
import { addPapers, restoreItems, type SavedPaper } from "~lib/library"

const buttonClass =
  "rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

// Backup / restore of the whole library, and import from other tools.
// One file picker handles both: a NextPaper backup is restored, anything else
// is read as BibTeX, RIS or a list of DOIs / titles.
export function LibraryTools({ library }: { library: SavedPaper[] }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const backup = () => {
    const date = new Date().toISOString().slice(0, 10)
    downloadFile(
      `nextpaper-copia-${date}.json`,
      JSON.stringify(buildBackup(library), null, 2),
      "application/json"
    )
    setMessage(`Copia de seguridad guardada (${plural(library.length, "paper", "papers")}).`)
  }

  const importFile = async (file: File) => {
    setMessage(null)
    setBusy("Leyendo archivo...")
    try {
      const text = await file.text()

      const restored = parseBackup(text)
      if (restored) {
        const { added, updated } = await restoreItems(restored)
        setMessage(
          `Copia restaurada: ${plural(added, "paper nuevo", "papers nuevos")}` +
            (updated ? `, ${plural(updated, "actualizado", "actualizados")}` : "") +
            "."
        )
        return
      }

      const parsed = parseReferences(text)
      if (parsed.dois.length + parsed.titles.length === 0) {
        setMessage("No se encontraron referencias (DOI o títulos) en el archivo.")
        return
      }

      const { papers, notFound, skipped } = await resolveReferences(parsed, setBusy)
      const { added, alreadySaved } = await addPapers(papers, "Importados")

      setMessage(
        `Importados ${plural(added, "paper", "papers")} en la colección «Importados»` +
          (alreadySaved ? `; ${alreadySaved} ya estaban guardados` : "") +
          (notFound.length ? `; ${notFound.length} no se encontraron` : "") +
          (skipped ? `; ${skipped} títulos sin buscar (máximo 25 por archivo)` : "") +
          "."
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo importar el archivo."
      )
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={backup} disabled={library.length === 0} className={buttonClass}>
          Copia de seguridad
        </button>
        <button
          onClick={() => input.current?.click()}
          disabled={busy !== null}
          title="Restaurar una copia de NextPaper, o importar un .bib, .ris o una lista de DOI"
          className={buttonClass}>
          {busy ?? "Importar..."}
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,.bib,.ris,.txt,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
      </div>
      {message && <p className="text-[11px] text-slate-500">{message}</p>}
    </div>
  )
}
