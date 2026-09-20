import type { ReactNode } from "react"

import type { ScoredPaper } from "~lib/pipeline"
import { dismissUpdate, type UpdatesState } from "~lib/updates"

function ago(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000)
  if (minutes < 1) return "hace un momento"
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}

export function UpdatesPanel({
  updates,
  savedIds,
  newIds,
  renderCard
}: {
  updates: UpdatesState
  savedIds: Set<string>
  newIds: Set<string>
  renderCard: (paper: ScoredPaper) => ReactNode
}) {
  const items = updates.items.filter((i) => !savedIds.has(i.paper.paperId))

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-violet-50/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
          Novedades para ti · {items.length}
        </p>
        <button
          disabled={updates.running}
          onClick={() => chrome.runtime.sendMessage({ type: "check-updates" })}
          className="rounded border border-violet-200 bg-white px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60">
          {updates.running ? "Buscando..." : "Buscar ahora"}
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        Papers nuevos relacionados con lo que guardaste. Se revisa solo cada
        24 h
        {updates.checkedAt ? ` (última vez ${ago(updates.checkedAt)})` : ""}.
      </p>

      {items.length === 0 && !updates.running && (
        <p className="text-xs text-slate-500">
          {updates.checkedAt
            ? "Nada nuevo por ahora."
            : "Aún no se ha comprobado. Pulsa «Buscar ahora»."}
        </p>
      )}

      {items.map((item) => (
        <div key={item.paper.paperId} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="line-clamp-1 text-[11px] text-violet-600">
              {newIds.has(item.paper.paperId) && (
                <strong className="mr-1 rounded bg-violet-600 px-1 text-white">
                  Nuevo
                </strong>
              )}
              Porque guardaste: {item.because}
            </span>
            <button
              onClick={() => dismissUpdate(item.paper.paperId)}
              title="Descartar"
              className="shrink-0 text-xs text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
          {renderCard(item.paper)}
        </div>
      ))}
    </div>
  )
}
