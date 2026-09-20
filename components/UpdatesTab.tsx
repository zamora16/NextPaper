import { Hint, useT, type Translate } from "~components/i18n"
import { IconBell, IconRefresh, IconTrash, IconX } from "~components/icons"
import type { RenderCard } from "~components/PaperCard"
import { buttonClass, iconButtonClass } from "~components/ui"
import type { TKey } from "~lib/i18n"
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
  renderCard: RenderCard
}) {
  const t = useT()
  const running = updates?.running ?? false
  const items = (updates?.items ?? []).filter(
    (i) => !savedIds.has(i.paper.paperId)
  )

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {t("updates.title")}
          <span className="rounded-full bg-sunken px-1.5 text-[11px] font-medium tabular-nums text-soft">
            {items.length}
          </span>
          <Hint text={t("tab.updates.hint")} />
        </h2>
        <div className="flex gap-1.5">
          {items.length > 0 && (
            <button
              onClick={clearUpdates}
              title={t("updates.clear.hint")}
              className={buttonClass}>
              <IconTrash size={14} />
              {t("updates.clear")}
            </button>
          )}
          <button
            disabled={running || !hasSaved}
            onClick={() =>
              chrome.runtime.sendMessage({ type: "check-updates" })
            }
            title={t("updates.check.hint")}
            className={buttonClass}>
            <span className={running ? "animate-spin" : ""}>
              <IconRefresh size={14} />
            </span>
            {running ? t("updates.checking") : t("updates.check")}
          </button>
        </div>
      </div>

      {!hasSaved ? (
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <IconBell size={22} />
          </span>
          <p className="max-w-[18rem] text-sm leading-relaxed text-soft">
            {t("updates.noSaved")}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted">
            {t("updates.description")}
            {updates?.checkedAt
              ? t("updates.lastChecked", { ago: ago(updates.checkedAt, t) })
              : ""}
            .
          </p>

          {updates?.lastError && !running && (
            <p
              role="alert"
              className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {t("updates.error", {
                error: t(`error.${updates.lastError}` as TKey)
              })}
            </p>
          )}

          {items.length === 0 && !running && (
            <p className="py-4 text-center text-sm text-muted">
              {updates?.checkedAt
                ? t("updates.nothing")
                : t("updates.notChecked")}
            </p>
          )}

          {items.map((item) => (
            <div key={item.paper.paperId} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-[11px] text-accent-ink">
                  {newIds.has(item.paper.paperId) && (
                    <strong className="mr-1.5 rounded bg-accent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">
                      {t("updates.new")}
                    </strong>
                  )}
                  {t("updates.because", { title: item.because })}
                </span>
                <button
                  onClick={() => dismissUpdate(item.paper.paperId)}
                  title={t("updates.dismiss")}
                  aria-label={t("updates.dismiss")}
                  className={iconButtonClass}>
                  <IconX size={14} />
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
