import { useState } from "react"

import { Hint, Rich, useLang, useT } from "~components/i18n"
import { buttonClass, pillClass, primaryButtonClass } from "~components/ui"
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
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-red-600"
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
      className="flex items-center gap-1">
      <span className="text-xs text-slate-500">{t("lang.title")}</span>
      <Hint text={t("lang.hint")} />
      {LANGUAGE_CHOICES.map((choice) => (
        <button
          key={choice}
          onClick={() => saveLanguage(choice)}
          aria-pressed={preference === choice}
          className={pillClass(preference === choice)}>
          {choice === "auto"
            ? t("lang.auto")
            : choice === "es"
              ? t("lang.es")
              : t("lang.en")}
        </button>
      ))}
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
    <div className="flex flex-col gap-3">
      {firstRun ? (
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t("setup.title")}
            </h2>
            <p className="text-xs text-slate-500">{t("setup.subtitle")}</p>
          </div>
          <LanguageSwitch preference={settings.language} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {t("settings.title")}
          </h2>
          {onClose && (
            <button onClick={onClose} className={buttonClass}>
              {t("settings.close")}
            </button>
          )}
        </div>
      )}

      {!firstRun && <LanguageSwitch preference={settings.language} />}

      {firstRun && (
        <p className="text-sm text-slate-700">
          <Rich text={t("setup.intro")} />
        </p>
      )}

      {!firstRun && (
        <p className="text-sm text-slate-700">
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

      <div className="rounded-lg bg-violet-50/60 p-2 text-xs text-slate-600">
        <p className="mb-1 font-semibold text-violet-700">{t("why.title")}</p>
        <ul className="ml-4 list-disc space-y-0.5">
          <li>
            <Rich text={t("why.fast")} />
          </li>
          <li>
            <Rich text={t("why.private")} />
          </li>
          <li>
            <Rich text={t("why.yours")} />
          </li>
        </ul>
      </div>

      <ol className="flex flex-col gap-2.5 text-sm text-slate-700">
        <li className="flex gap-2">
          <span className="font-semibold text-violet-600">1.</span>
          <div className="flex flex-col items-start gap-1">
            <span>
              <Rich text={t("step1")} />
            </span>
            <a
              href={KEY_FORM_URL}
              target="_blank"
              rel="noreferrer"
              className={buttonClass}>
              {t("step1.button")}
            </a>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-violet-600">2.</span>
          <span>
            <Rich text={t("step2")} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-violet-600">3.</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
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
              className="min-w-0 rounded border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 placeholder:font-sans placeholder:text-slate-500"
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
          </div>
        </li>
      </ol>

      {message && (
        <p role="status" className={`text-xs ${toneClass[message.tone]}`}>
          {message.text}
        </p>
      )}

      {firstRun && (
        <div className="flex flex-col items-start gap-1 border-t border-slate-100 pt-2">
          <p className="text-xs text-slate-500">{t("setup.skipHint")}</p>
          <button onClick={() => finishSetup()} className={buttonClass}>
            {t("setup.skip")}
          </button>
        </div>
      )}

      {!firstRun && (
        <div className="flex flex-col gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          <p>
            {t("about.dataPrefix")}
            <a
              href="https://www.semanticscholar.org"
              target="_blank"
              rel="noreferrer"
              className="underline">
              Semantic Scholar
            </a>
            {t("about.dataAnd")}
            <a
              href="https://www.crossref.org"
              target="_blank"
              rel="noreferrer"
              className="underline">
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
