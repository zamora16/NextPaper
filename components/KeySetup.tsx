import { useState, type ReactNode } from "react"

import { Hint, Rich, useLang, useT } from "~components/i18n"
import { IconCheck, IconExternal, Logo } from "~components/icons"
import { buttonClass, inputClass, primaryButtonClass } from "~components/ui"
import type { LangPreference } from "~lib/i18n"
import {
  checkApiKey,
  finishSetup,
  maskKey,
  normalizeApiKey,
  removeApiKey,
  saveApiKey,
  saveLanguage,
  type Settings
} from "~lib/settings"

export const KEY_FORM_URL =
  "https://www.semanticscholar.org/product/api#api-key-form"

type Message = { tone: "ok" | "warn" | "error"; text: string } | null

const toneClass = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  error: "bg-danger-soft text-danger"
}

const LANGUAGE_CHOICES: LangPreference[] = ["auto", "es", "en"]

// Automatic / Español / English. Names are written in their own language so
// they can be found whatever the current one is.
export function LanguageSwitch({ preference }: { preference: LangPreference }) {
  const t = useT()
  return (
    <div
      role="group"
      aria-label={t("lang.title")}
      className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-soft">
        {t("lang.title")}
        <Hint text={t("lang.hint")} />
      </span>
      <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
        {LANGUAGE_CHOICES.map((choice) => (
          <button
            key={choice}
            onClick={() => saveLanguage(choice)}
            aria-pressed={preference === choice}
            className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors ${
              preference === choice
                ? "bg-surface text-ink shadow-card"
                : "text-muted hover:text-ink"
            }`}>
            {choice === "auto"
              ? t("lang.auto")
              : choice === "es"
                ? t("lang.es")
                : t("lang.en")}
          </button>
        ))}
      </div>
    </div>
  )
}

// First-run setup and the settings screen. Each person uses their own free
// Semantic Scholar key (see lib/settings.ts for why), so this screen has to
// make getting one easy to follow.
export function KeySetup({
  settings,
  firstRun,
  onClose
}: {
  settings: Settings
  firstRun: boolean
  onClose?: () => void
}) {
  const t = useT()
  useLang() // re-render when the language changes
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message>(null)
  const hasKey = settings.s2ApiKey !== null
  // Someone who already has a key does not need the explanation again.
  const showGuide = firstRun || !hasKey

  const save = async () => {
    const key = normalizeApiKey(input)
    if (!key) {
      setMessage({ tone: "error", text: t("key.msg.notKey") })
      return
    }

    setBusy(true)
    setMessage(null)
    const result = await checkApiKey(key)
    if (result === "invalid") {
      setBusy(false)
      setMessage({ tone: "error", text: t("key.msg.refused") })
      return
    }

    await saveApiKey(key)
    setBusy(false)
    setInput("")
    setMessage(
      result === "valid"
        ? { tone: "ok", text: t("key.msg.saved") }
        : { tone: "warn", text: t("key.msg.savedUnchecked") }
    )
  }

  const remove = async () => {
    await removeApiKey()
    setMessage({ tone: "ok", text: t("key.msg.removed") })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {firstRun ? (
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h2 className="text-base font-semibold leading-tight text-ink">
              {t("setup.title")}
            </h2>
            <p className="text-xs text-muted">{t("setup.subtitle")}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {t("settings.title")}
          </h2>
          {onClose && (
            <button onClick={onClose} className={buttonClass}>
              {t("settings.close")}
            </button>
          )}
        </div>
      )}

      <LanguageSwitch preference={settings.language} />

      {firstRun && (
        <p className="text-[13px] leading-relaxed text-soft">
          <Rich text={t("setup.intro")} />
        </p>
      )}

      {!firstRun && (
        <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-[13px] text-soft">
          <Rich
            text={t("settings.keyStatus", {
              status: `**${
                hasKey
                  ? t("settings.key.saved", {
                      masked: maskKey(settings.s2ApiKey as string)
                    })
                  : t("settings.key.none")
              }**`
            })}
          />
        </p>
      )}

      {showGuide && (
        <div className="rounded-xl bg-accent-soft p-3 text-xs leading-relaxed text-soft">
          <p className="mb-1.5 font-semibold text-accent-ink">
            {t("why.title")}
          </p>
          <ul className="space-y-1">
            {(["why.fast", "why.private", "why.yours"] as const).map((key) => (
              <li key={key} className="flex gap-2">
                <span className="mt-0.5 text-accent">
                  <IconCheck size={13} />
                </span>
                <span>
                  <Rich text={t(key)} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="flex flex-col gap-4 text-[13px] leading-relaxed text-soft">
        {showGuide && (
          <Step n={1}>
            <span>
              <Rich text={t("step1")} />
            </span>
            <a
              href={KEY_FORM_URL}
              target="_blank"
              rel="noreferrer"
              className={`${buttonClass} self-start`}>
              {t("step1.button")}
              <IconExternal size={13} />
            </a>
          </Step>
        )}
        {showGuide && (
          <Step n={2}>
            <span>
              <Rich text={t("step2")} />
            </span>
          </Step>
        )}
        <Step n={showGuide ? 3 : undefined}>
          <span>
            <Rich text={t("step3")} />
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && save()}
            placeholder={t("key.placeholder")}
            autoComplete="off"
            spellCheck={false}
            aria-label={t("key.label")}
            className={`${inputClass} font-mono text-xs placeholder:font-sans`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={save}
              disabled={busy || input.trim() === ""}
              className={primaryButtonClass}>
              {busy
                ? t("key.checking")
                : firstRun
                  ? t("key.saveFirst")
                  : t("key.save")}
            </button>
            {hasKey && !firstRun && (
              <button onClick={remove} className={buttonClass}>
                {t("key.remove")}
              </button>
            )}
          </div>
        </Step>
      </ol>

      {message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-xs ${toneClass[message.tone]}`}>
          {message.text}
        </p>
      )}

      {firstRun && (
        <div className="flex flex-col items-start gap-2 border-t border-line pt-3">
          <p className="text-xs leading-relaxed text-muted">
            {t("setup.skipHint")}
          </p>
          <button onClick={() => finishSetup()} className={buttonClass}>
            {t("setup.skip")}
          </button>
        </div>
      )}

      {!firstRun && (
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          <p>
            {t("about.dataPrefix")}
            <a
              href="https://www.semanticscholar.org"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink">
              Semantic Scholar
            </a>
            {t("about.dataAnd")}
            <a
              href="https://www.crossref.org"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink">
              Crossref
            </a>
            .
          </p>
          <p>{t("about.local")}</p>
          <p>
            {t("about.license", {
              version: chrome.runtime.getManifest().version
            })}
          </p>
        </div>
      )}
    </div>
  )
}

function Step({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      {n !== undefined && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
          {n}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </li>
  )
}
