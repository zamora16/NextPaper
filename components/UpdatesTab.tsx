import type { ReactNode } from "react"

import { Hint, useT, type Translate } from "~components/i18n"
import type { TKey } from "~lib/i18n"
import type { ScoredPaper } from "~lib/pipeline"
import { clearUpdates, dismissUpdate, type UpdatesState } from "~lib/updates"

function ago(timestamp: number, t: Translate): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000)
  if (minutes < 1) return t("ago.now")
  if (minutes < 60) return t("ago.minutes", { n: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t("ago.hours", { n: hours })
  return t("ago.days", { n: Math.round(hours / 24) })
}

// "Updates": new papers related to what the user saved, checked once a day.
// It has its own tab so the saved papers are not pushed down by it.
export function UpdatesTab({
  updates,
  hasSaved,
  savedIds,
  newIds,
  renderCard
}: {
  updates: UpdatesState | null
  hasSaved: boolean
  savedIds: Set<string>
  newIds: Set<string>
  renderCard: (paper: ScoredPaper) => ReactNode
}) {
  const t = useT()
  const running = updates?.running ?? false
  const items = (updates?.items ?? []).filter(
    (i) => !savedIds.has(i.paper.paperId)
  )

  return (
    <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {t("updates.title")} · {items.length}
          <Hint text={t("tab.updates.hint")} />
        </p>
        <span className="flex gap-1.5">
          {items.length > 0 && (
            <button
              onClick={clearUpdates}
              title={t("updates.clear.hint")}
              className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
              {t("updates.clear")}
            </button>
          )}
          <button
            disabled={running || !hasSaved}
            onClick={() =>
              chrome.runtime.sendMessage({ type: "check-updates" })
            }
            title={t("updates.check.hint")}
            className="rounded border border-violet-200 bg-white px-2 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60">
            {running ? t("updates.checking") : t("updates.check")}
          </button>
        </span>
      </div>

      {!hasSaved ? (
        <p className="text-sm text-slate-500">{t("updates.noSaved")}</p>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">
            {t("updates.description")}
            {updates?.checkedAt
              ? t("updates.lastChecked", { ago: ago(updates.checkedAt, t) })
              : ""}
            .
          </p>

          {updates?.lastError && !running && (
            <p role="alert" className="text-[11px] text-red-600">
              {t("updates.error", {
                error: t(`error.${updates.lastError}` as TKey)
              })}
            </p>
          )}

          {items.length === 0 && !running && (
            <p className="text-xs text-slate-500">
              {updates?.checkedAt
                ? t("updates.nothing")
                : t("updates.notChecked")}
            </p>
          )}

          {items.map((item) => (
            <div key={item.paper.paperId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-[11px] text-violet-700">
                  {newIds.has(item.paper.paperId) && (
                    <strong className="mr-1 rounded bg-violet-600 px-1 text-white">
                      {t("updates.new")}
                    </strong>
                  )}
                  {t("updates.because", { title: item.because })}
                </span>
                <button
                  onClick={() => dismissUpdate(item.paper.paperId)}
                  title={t("updates.dismiss")}
                  aria-label={t("updates.dismiss")}
                  className="shrink-0 text-xs text-slate-500 hover:text-slate-700">
                  ✕
                </button>
              </div>
              {renderCard(item.paper)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
