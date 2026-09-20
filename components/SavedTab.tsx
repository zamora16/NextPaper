import { useMemo, useState, type ReactNode } from "react"

import { CopyCitationsButton, ExportButton } from "~components/CitationButtons"
import { useT } from "~components/i18n"
import { LibraryItem } from "~components/LibraryItem"
import { LibraryTools } from "~components/LibraryTools"
import { pillClass } from "~components/ui"
import type { CitationStyle } from "~lib/citation"
import type { TKey } from "~lib/i18n"
import {
  collectionCounts,
  deleteCollection,
  STATUSES,
  type ReadStatus,
  type SavedPaper
} from "~lib/library"
import type { ScoredPaper } from "~lib/pipeline"

const STATUS_LABEL: Record<ReadStatus, TKey> = {
  unread: "status.unread",
  reading: "status.reading",
  read: "status.read.plain"
}

// "Saved": the library with its status and collection filters, backup/import
// and bulk citation export. (New papers found for the user have their own tab.)
export function SavedTab({
  library,
  citationStyle,
  styleSelect,
  renderCard
}: {
  library: SavedPaper[]
  citationStyle: CitationStyle
  styleSelect: ReactNode
  renderCard: (paper: ScoredPaper) => ReactNode
}) {
  const t = useT()
  const [statusFilter, setStatusFilter] = useState<ReadStatus | "all">("all")
  const [collectionFilter, setCollectionFilter] = useState<string | "all">(
    "all"
  )

  const collections = useMemo(() => collectionCounts(library), [library])
  // A collection that no longer exists (deleted, or its last paper removed)
  // must not leave the list stuck on an empty filter.
  const activeCollection = collections.some((c) => c.name === collectionFilter)
    ? collectionFilter
    : "all"
  const visible = useMemo(
    () =>
      library.filter(
        (p) =>
          (statusFilter === "all" || p.status === statusFilter) &&
          (activeCollection === "all" ||
            p.collections.includes(activeCollection))
      ),
    [library, statusFilter, activeCollection]
  )

  const statusFilters: (ReadStatus | "all")[] = ["all", ...STATUSES]

  return (
    <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto">
      {library.length === 0 && (
        <p className="text-sm text-slate-500">{t("saved.empty")}</p>
      )}

      <LibraryTools library={library} />

      {library.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1">
            {statusFilters.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
                className={pillClass(statusFilter === status)}>
                {status === "all"
                  ? t("saved.status.all")
                  : t(STATUS_LABEL[status])}{" "}
                ·{" "}
                {status === "all"
                  ? library.length
                  : library.filter((p) => p.status === status).length}
              </button>
            ))}
          </div>

          {collections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setCollectionFilter("all")}
                aria-pressed={activeCollection === "all"}
                className={pillClass(activeCollection === "all")}>
                {t("saved.collections.all")}
              </button>
              {collections.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCollectionFilter(c.name)}
                  aria-pressed={activeCollection === c.name}
                  className={pillClass(activeCollection === c.name)}>
                  {c.name} · {c.count}
                </button>
              ))}
              {activeCollection !== "all" && (
                <button
                  onClick={() => deleteCollection(activeCollection)}
                  title={t("saved.collection.delete.hint")}
                  className="text-[11px] font-medium text-red-600 hover:underline">
                  {t("saved.collection.delete")}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {styleSelect}
            <div className="flex gap-1">
              <CopyCitationsButton papers={visible} style={citationStyle} />
              <ExportButton papers={visible} format="bibtex" />
              <ExportButton papers={visible} format="ris" />
            </div>
          </div>

          {visible.length === 0 && (
            <p className="text-sm text-slate-500">{t("saved.none")}</p>
          )}

          {visible.map((paper) => (
            <LibraryItem
              key={paper.paperId}
              paper={paper}
              card={renderCard(paper)}
              knownCollections={collections.map((c) => c.name)}
            />
          ))}
        </>
      )}
    </div>
  )
}
