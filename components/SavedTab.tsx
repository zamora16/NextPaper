import { useMemo, useState, type ReactNode } from "react"

import { CopyCitationsButton, ExportButton } from "~components/CitationButtons"
import { LibraryItem } from "~components/LibraryItem"
import { LibraryTools } from "~components/LibraryTools"
import { pillClass } from "~components/ui"
import { UpdatesPanel } from "~components/UpdatesPanel"
import type { CitationStyle } from "~lib/citation"
import {
  collectionCounts,
  deleteCollection,
  STATUSES,
  type ReadStatus,
  type SavedPaper
} from "~lib/library"
import type { ScoredPaper } from "~lib/pipeline"
import type { UpdatesState } from "~lib/updates"

// "Guardados": the library with its status and collection filters, alerts,
// backup/import and bulk citation export.
export function SavedTab({
  library,
  updates,
  newIds,
  citationStyle,
  styleSelect,
  savedIds,
  renderCard
}: {
  library: SavedPaper[]
  updates: UpdatesState | null
  newIds: Set<string>
  citationStyle: CitationStyle
  styleSelect: ReactNode
  savedIds: Set<string>
  renderCard: (paper: ScoredPaper) => ReactNode
}) {
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

  const statusFilters: { id: ReadStatus | "all"; label: string }[] = [
    { id: "all", label: "Todos" },
    ...STATUSES
  ]

  return (
    <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto">
      {library.length === 0 && (
        <p className="text-sm text-slate-500">
          Aún no has guardado nada. Pulsa la ☆ de cualquier paper para guardarlo
          aquí, o importa tus referencias desde otra herramienta.
        </p>
      )}

      <LibraryTools library={library} />

      {library.length > 0 && (
        <>
          {updates && (
            <UpdatesPanel
              updates={updates}
              savedIds={savedIds}
              newIds={newIds}
              renderCard={renderCard}
            />
          )}

          <div className="flex flex-wrap gap-1">
            {statusFilters.map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={pillClass(statusFilter === s.id)}>
                {s.label} ·{" "}
                {s.id === "all"
                  ? library.length
                  : library.filter((p) => p.status === s.id).length}
              </button>
            ))}
          </div>

          {collections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setCollectionFilter("all")}
                className={pillClass(activeCollection === "all")}>
                Todas las colecciones
              </button>
              {collections.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCollectionFilter(c.name)}
                  className={pillClass(activeCollection === c.name)}>
                  {c.name} · {c.count}
                </button>
              ))}
              {activeCollection !== "all" && (
                <button
                  onClick={() => deleteCollection(activeCollection)}
                  title="Quita la colección de todos los papers; los papers se conservan"
                  className="text-[11px] font-medium text-red-500 hover:underline">
                  Eliminar colección
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
            <p className="text-sm text-slate-500">
              Ningún paper guardado con este filtro.
            </p>
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
