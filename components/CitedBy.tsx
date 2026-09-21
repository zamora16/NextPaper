import { useEffect, useState } from "react"

import { Hint, useT } from "~components/i18n"
import { IconChevronDown, IconQuote } from "~components/icons"
import { buttonClass, pillClass } from "~components/ui"
import {
  getCitingSentences,
  type CitingResult,
  type CitingSentence
} from "~lib/citing"

const PAGE = 5

type Load =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; result: CitingResult }

function Sentence({ item }: { item: CitingSentence }) {
  const t = useT()
  const source = [item.year, item.venue].filter(Boolean).join(" · ")
  return (
    <blockquote className="border-l-2 border-accent/40 pl-3">
      <p className="text-[13px] leading-relaxed text-ink">{item.text}</p>
      <footer className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        {item.influential && (
          <span
            title={t("citedBy.influential.hint")}
            className="rounded bg-accent-soft px-1.5 py-px font-medium text-accent-ink">
            {t("citedBy.influential")}
          </span>
        )}
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            title={item.title}
            className="line-clamp-1 font-medium text-soft hover:text-accent-ink hover:underline">
            {item.title}
          </a>
        ) : (
          <span className="line-clamp-1 font-medium text-soft">
            {item.title}
          </span>
        )}
        {source && <span>{source}</span>}
      </footer>
    </blockquote>
  )
}

function SentenceList({ items }: { items: CitingSentence[] }) {
  const t = useT()
  const [shown, setShown] = useState(PAGE)
  return (
    <div className="flex flex-col gap-3">
      {items.slice(0, shown).map((item) => (
        <Sentence key={item.paperId + item.text} item={item} />
      ))}
      {items.length > shown && (
        <button
          onClick={() => setShown((n) => n + 10)}
          className={`${buttonClass} self-start`}>
          {t("citedBy.more", { n: Math.min(10, items.length - shown) })}
        </button>
      )}
    </div>
  )
}

// "How others cite it": what citing papers say where they cite this one. It
// loads only when opened (one request), so an analysis never pays for it.
export function CitedBy({ paperRef }: { paperRef: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ status: "idle" })
  const [onlyInfluential, setOnlyInfluential] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  const start = () => {
    setLoad({ status: "loading" })
    getCitingSentences(paperRef)
      .then((result) =>
        setLoad(result ? { status: "done", result } : { status: "error" })
      )
      .catch(() => setLoad({ status: "error" }))
  }

  useEffect(() => {
    if (open && load.status === "idle") start()
  }, [open])

  const result = load.status === "done" ? load.result : null
  const influential = result?.named.filter((s) => s.influential) ?? []
  const named = onlyInfluential ? influential : result?.named ?? []

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left text-[13px] font-medium text-ink">
          <span className="text-accent">
            <IconQuote size={15} />
          </span>
          {t("citedBy.title")}
          <span
            className={`ml-auto text-muted transition-transform ${open ? "rotate-180" : ""}`}>
            <IconChevronDown size={15} />
          </span>
        </button>
        <Hint text={t("citedBy.hint")} />
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          {load.status === "loading" && (
            <p role="status" className="text-xs text-muted">
              {t("citedBy.loading")}
            </p>
          )}

          {load.status === "error" && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-xs text-danger">{t("citedBy.error")}</p>
              <button onClick={start} className={buttonClass}>
                {t("retry")}
              </button>
            </div>
          )}

          {result &&
            result.named.length === 0 &&
            result.others.length === 0 && (
              <p className="text-xs text-muted">{t("citedBy.none")}</p>
            )}

          {result && (result.named.length > 0 || result.others.length > 0) && (
            <>
              <p className="text-[11px] text-muted">
                {t("citedBy.summary", {
                  n: result.withSentences,
                  total: result.scanned
                })}
              </p>

              {influential.length > 0 && (
                <div>
                  <button
                    onClick={() => setOnlyInfluential((value) => !value)}
                    aria-pressed={onlyInfluential}
                    className={pillClass(onlyInfluential)}>
                    {t("citedBy.onlyInfluential")} · {influential.length}
                  </button>
                </div>
              )}

              {result.named.length === 0 ? (
                <p className="text-xs text-muted">{t("citedBy.noNamed")}</p>
              ) : (
                <SentenceList key={String(onlyInfluential)} items={named} />
              )}

              {result.others.length > 0 && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setShowOthers((value) => !value)}
                    aria-expanded={showOthers}
                    className="self-start text-xs font-medium text-accent-ink hover:underline">
                    {showOthers
                      ? t("citedBy.others.hide")
                      : t("citedBy.others", { n: result.others.length })}
                  </button>
                  {showOthers && (
                    <>
                      <p className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-[11px] leading-snug text-warn">
                        {t("citedBy.others.note")}
                      </p>
                      <SentenceList items={result.others} />
                    </>
                  )}
                </div>
              )}

              <p className="text-[11px] leading-snug text-muted">
                {t("citedBy.source")}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
