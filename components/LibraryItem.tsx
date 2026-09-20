import { useState } from "react"

import { Hint, useT } from "~components/i18n"
import { IconPencil, IconX } from "~components/icons"
import { inputClass } from "~components/ui"
import type { TKey } from "~lib/i18n"
import { STATUSES, updateSaved, type SavedPaper } from "~lib/library"

const STATUS_LABEL: Record<(typeof STATUSES)[number], TKey> = {
  unread: "status.unread",
  reading: "status.reading",
  read: "status.read.plain"
}

// What the reader does with a saved paper: where they are with it, which
// collections it belongs to, and a private note. Sits at the bottom of the
// paper's card.
export function LibraryItem({
  paper,
  knownCollections
}: {
  paper: SavedPaper
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
    <div className="flex flex-col gap-2.5 border-t border-line bg-sunken/70 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => updateSaved(paper.paperId, { status })}
              aria-pressed={paper.status === status}
              className={`rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                paper.status === status
                  ? "bg-accent-soft text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}>
              {t(STATUS_LABEL[status])}
            </button>
          ))}
        </div>
        <button
          onClick={() => setNoteOpen((open) => !open)}
          aria-expanded={noteOpen}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-ink">
          <IconPencil size={13} />
          {noteOpen
            ? t("item.note.hide")
            : note
              ? t("item.note.view")
              : t("item.note.add")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {paper.collections.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-md bg-info-soft py-px pl-1.5 pr-0.5 text-[11px] font-medium text-info">
            {name}
            <button
              title={t("item.collection.remove", { name })}
              aria-label={t("item.collection.remove", { name })}
              onClick={() =>
                updateSaved(paper.paperId, {
                  collections: paper.collections.filter((c) => c !== name)
                })
              }
              className="rounded p-0.5 opacity-70 hover:opacity-100">
              <IconX size={11} />
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
          className="w-28 rounded-md border border-dashed border-line-strong bg-transparent px-1.5 py-px text-[11px] text-soft placeholder:text-muted focus:border-accent focus:outline-none"
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
          rows={3}
          className={`${inputClass} resize-y text-xs leading-relaxed`}
        />
      )}
    </div>
  )
}
