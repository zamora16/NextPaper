import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode
} from "react"

import {
  richParts,
  translate,
  type Lang,
  type Params,
  type TKey
} from "~lib/i18n"
import { ALL_GROUP, OTHER_GROUP, RELATED_GROUP } from "~lib/pipeline"

export type Translate = (key: TKey, params?: Params) => string

const I18nContext = createContext<{ lang: Lang; t: Translate }>({
  lang: "en",
  t: (key, params) => translate("en", key, params)
})

// Gives every component below it the interface language, and tells the browser
// (and screen readers) which language the page is in.
export function I18nProvider({
  lang,
  children
}: {
  lang: Lang
  children: ReactNode
}) {
  const value = useMemo(
    () => ({
      lang,
      t: ((key, params) => translate(lang, key, params)) as Translate
    }),
    [lang]
  )
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useT = () => useContext(I18nContext).t
export const useLang = () => useContext(I18nContext).lang

// Text with **bold** parts.
export function Rich({ text }: { text: string }) {
  return (
    <>
      {richParts(text).map((part, i) =>
        part.bold ? <strong key={i}>{part.text}</strong> : part.text
      )}
    </>
  )
}

// A small "i" that explains a control in one sentence. It shows the text on
// hover (the browser's own tooltip, which is never clipped by a scrolling
// list) and is a focusable, labelled element, so keyboard and screen-reader
// users get the same explanation.
export function Hint({ text }: { text: string }) {
  return (
    <span
      role="img"
      tabIndex={0}
      title={text}
      aria-label={text}
      className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-line-strong text-[9px] font-semibold leading-none text-muted hover:border-accent hover:text-accent">
      i
    </span>
  )
}

// Group headings are the words of a subtopic, except two stand-ins that must
// be shown in the user's language.
export function groupLabel(label: string, t: Translate): string {
  if (label === RELATED_GROUP) return t("group.related")
  if (label === ALL_GROUP) return t("group.all")
  if (label === OTHER_GROUP) return t("group.other")
  return label
}
