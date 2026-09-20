import { useMemo, useState } from "react"

import { CitationBar } from "~components/CitationButtons"
import { useT } from "~components/i18n"
import { IconBookmark, IconTrash } from "~components/icons"
import { LibraryItem } from "~components/LibraryItem"
import { useLibraryTools } from "~components/LibraryTools"
import type { RenderCard } from "~components/PaperCard"
import { SearchField } from "~components/SearchField"
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
import { searchLibrary } from "~lib/view"

const STATUS_LABEL: Record<ReadStatus, TKey> = {
  unread: "status.unread",
  reading: "status.reading",
  read: "status.read.plain"
}

// "Saved": the library with its search, status and collection filters, backup/
// import and bulk citation export. (New papers found for the user have their
// own tab.)
export function SavedTab({
  library,
  citationStyle,
  onStyleChange,
  renderCard
}: {
  library: SavedPaper[]
  citationStyle: CitationStyle
  onStyleChange: (style: CitationStyle) => void
  renderCard: RenderCard
}) {
  const t = useT()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ReadStatus | "all">("all")
  const [collectionFilter, setCollectionFilter] = useState<string | "all">(
    "all"
  )
  const tools = useLibraryTools(library, library.length > 0)

  const collections = useMemo(() => collectionCounts(library), [library])
  // A collection that no longer exists (deleted, or its last paper removed)
  // must not leave the list stuck on an empty filter.
  const activeCollection = collections.some((c) => c.name === collectionFilter)
    ? collectionFilter
    : "all"
  const visible = useMemo(
    () =>
      searchLibrary(
        library.filter(
          (p) =>
            (statusFilter === "all" || p.status === statusFilter) &&
            (activeCollection === "all" ||
              p.collections.includes(activeCollection))
        ),
        query
      ),
    [library, statusFilter, activeCollection, query]
  )

  const statusFilters: (ReadStatus | "all")[] = ["all", ...STATUSES]

  if (library.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <IconBookmark size={22} />
        </span>
        <p className="max-w-[18rem] text-sm leading-relaxed text-soft">
          {t("saved.empty")}
        </p>
        {tools.controls}
        {tools.status}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-1.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("saved.search")}
        />
        {tools.controls}
      </div>
      {tools.status}

      <div
        role="group"
        className="grid grid-cols-4 gap-0.5 rounded-lg border border-line bg-sunken p-0.5">
        {statusFilters.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            aria-pressed={statusFilter === status}
            className={`rounded-md px-1.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === status
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}>
            {status === "all" ? t("saved.status.all") : t(STATUS_LABEL[status])}{" "}
            <span className="tabular-nums opacity-70">
              {status === "all"
                ? library.length
                : library.filter((p) => p.status === status).length}
            </span>
          </button>
        ))}
      </div>

      {collections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
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
              className="inline-flex items-center gap-1 text-[11px] font-medium text-danger hover:underline">
              <IconTrash size={12} />
              {t("saved.collection.delete")}
            </button>
          )}
        </div>
      )}

      <CitationBar
        papers={visible}
        style={citationStyle}
        onStyleChange={onStyleChange}
        exports
      />

      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">{t("saved.none")}</p>
      )}

      {visible.map((paper) =>
        renderCard(paper, {
          footer: (
            <LibraryItem
              paper={paper}
              knownCollections={collections.map((c) => c.name)}
            />
          )
        })
      )}
    </div>
  )
}
