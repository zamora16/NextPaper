import { useState, type ReactNode } from "react"

import { Hint, useT } from "~components/i18n"
import type { TKey } from "~lib/i18n"
import { STATUSES, updateSaved, type SavedPaper } from "~lib/library"

const STATUS_LABEL: Record<(typeof STATUSES)[number], TKey> = {
  unread: "status.unread",
  reading: "status.reading",
  read: "status.read.plain"
}

export function LibraryItem({
  paper,
  card,
  knownCollections
}: {
  paper: SavedPaper
  card: ReactNode
  knownCollections: string[]
}) {
  const t = useT()
  const [note, setNote] = useState(paper.note)
  const [noteOpen, setNoteOpen] = useState(paper.note.length > 0)
  const [draft, setDraft] = useState("")
  const listId = `collections-${paper.paperId}`

  const addCollection = () => {
    const name = draft.trim()
    setDraft("")
    if (!name || paper.collections.includes(name)) return
    updateSaved(paper.paperId, { collections: [...paper.collections, name] })
  }

  return (
    <div className="flex flex-col gap-1.5">
      {card}

      <div className="flex flex-wrap items-center gap-1 px-1">
        {STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => updateSaved(paper.paperId, { status })}
            aria-pressed={paper.status === status}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
              paper.status === status
                ? "border-violet-300 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}>
            {t(STATUS_LABEL[status])}
          </button>
        ))}
        <button
          onClick={() => setNoteOpen((open) => !open)}
          aria-expanded={noteOpen}
          className="ml-auto text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:underline">
          {noteOpen
            ? t("item.note.hide")
            : note
              ? t("item.note.view")
              : t("item.note.add")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-1">
        {paper.collections.map((name) => (
          <span
            key={name}
            className="flex items-center gap-1 rounded bg-sky-50 px-1.5 py-px text-[11px] font-medium text-sky-700">
            {name}
            <button
              title={t("item.collection.remove", { name })}
              aria-label={t("item.collection.remove", { name })}
              onClick={() =>
                updateSaved(paper.paperId, {
                  collections: paper.collections.filter((c) => c !== name)
                })
              }
              className="text-sky-500 hover:text-sky-700">
              ×
            </button>
          </span>
        ))}
        <input
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCollection()}
          onBlur={addCollection}
          placeholder={t("item.collection.add")}
          aria-label={t("item.collection.add")}
          className="w-24 rounded border border-transparent px-1 py-px text-[11px] text-slate-600 placeholder:text-slate-500 hover:border-slate-200 focus:border-slate-300"
        />
        <Hint text={t("item.collection.hint")} />
        <datalist id={listId}>
          {knownCollections
            .filter((name) => !paper.collections.includes(name))
            .map((name) => (
              <option key={name} value={name} />
            ))}
        </datalist>
      </div>

      {noteOpen && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => updateSaved(paper.paperId, { note })}
          placeholder={t("item.note.placeholder")}
          aria-label={t("item.note.add")}
          rows={2}
          className="mx-1 rounded border border-slate-200 p-1.5 text-xs text-slate-700 placeholder:text-slate-500"
        />
      )}
    </div>
  )
}
