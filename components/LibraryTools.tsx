import { useRef, useState, type ReactNode } from "react"

import { useT, type Translate } from "~components/i18n"
import { IconDownload, IconUpload } from "~components/icons"
import { buttonClass, iconButtonClass } from "~components/ui"
import { buildBackup, parseBackup } from "~lib/backup"
import { errorCode } from "~lib/errors"
import { downloadFile } from "~lib/export"
import {
  parseReferences,
  resolveReferences,
  type ImportStep
} from "~lib/import"
import { addPapers, restoreItems, type SavedPaper } from "~lib/library"

const stepText = (t: Translate, step: ImportStep) =>
  step.code === "dois"
    ? t("tools.step.dois", { n: step.n })
    : t("tools.step.titles", { n: step.n })

// Backup / restore of the whole library, and import from other tools.
// One file picker handles both: a NextPaper backup is restored, anything else
// is read as BibTeX, RIS or a list of DOIs / titles. Returns the buttons and
// the result message separately so the caller can lay them out.
export function useLibraryTools(
  library: SavedPaper[],
  // Icons only (next to the search box); the empty library shows the labels.
  compact?: boolean
): { controls: ReactNode; status: ReactNode } {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const backup = () => {
    const date = new Date().toISOString().slice(0, 10)
    downloadFile(
      `nextpaper-backup-${date}.json`,
      JSON.stringify(buildBackup(library), null, 2),
      "application/json"
    )
    setMessage(
      t("tools.backupDone", {
        papers: t("papers", { n: library.length })
      })
    )
  }

  const importFile = async (file: File) => {
    setMessage(null)
    setBusy(t("tools.reading"))
    try {
      const text = await file.text()

      const restored = parseBackup(text)
      if (restored) {
        const { added, updated } = await restoreItems(restored)
        setMessage(
          t("tools.restored", { added: t("newPapers", { n: added }) }) +
            (updated ? `, ${t("updatedPapers", { n: updated })}` : "") +
            "."
        )
        return
      }

      const parsed = parseReferences(text)
      if (parsed.dois.length + parsed.titles.length === 0) {
        setMessage(t("tools.noRefs"))
        return
      }

      const { papers, notFound, skipped } = await resolveReferences(
        parsed,
        (step) => setBusy(stepText(t, step))
      )
      const collection = t("tools.collectionName")
      const { added, alreadySaved } = await addPapers(papers, collection)

      setMessage(
        t("tools.imported", { papers: t("papers", { n: added }), collection }) +
          (alreadySaved
            ? `; ${t("tools.alreadySaved", { n: alreadySaved })}`
            : "") +
          (notFound.length
            ? `; ${t("tools.notFound", { n: notFound.length })}`
            : "") +
          (skipped ? `; ${t("tools.skipped", { n: skipped })}` : "") +
          "."
      )
    } catch (error) {
      // a known cause (Semantic Scholar busy, key rejected...) is said as such
      const code = errorCode(error)
      setMessage(code === "unknown" ? t("tools.failed") : t(`error.${code}`))
    } finally {
      setBusy(null)
      if (input.current) input.current.value = ""
    }
  }

  const backupLabel = t("tools.backup")
  const importLabel = busy ?? t("tools.import")

  const controls = (
    <div className="flex items-center gap-1.5">
      <button
        onClick={backup}
        disabled={library.length === 0}
        title={t("tools.backup.hint")}
        aria-label={backupLabel}
        className={compact ? iconButtonClass : buttonClass}>
        <IconDownload size={15} />
        {!compact && backupLabel}
      </button>
      <button
        onClick={() => input.current?.click()}
        disabled={busy !== null}
        title={t("tools.import.hint")}
        aria-label={importLabel}
        className={compact && !busy ? iconButtonClass : buttonClass}>
        <IconUpload size={15} />
        {(!compact || busy) && importLabel}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.bib,.ris,.txt,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
      />
    </div>
  )

  const status = message ? (
    <p role="status" className="text-[11px] leading-snug text-muted">
      {message}
    </p>
  ) : null

  return { controls, status }
}
