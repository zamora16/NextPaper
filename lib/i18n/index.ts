import { en, type Key } from "~lib/i18n/en"
import { es } from "~lib/i18n/es"

export type Lang = "es" | "en"
// What the user chose: a language, or "auto" (follow the browser).
export type LangPreference = "auto" | Lang

export const LANGS: Lang[] = ["es", "en"]

const dictionaries: Record<Lang, Record<Key, string>> = { en, es }

// "papers" stands for the pair "papers_one" / "papers_other".
type PluralBase = {
  [K in Key]: K extends `${infer Base}_one` ? Base : never
}[Key]
export type TKey =
  | Exclude<Key, `${string}_one` | `${string}_other`>
  | PluralBase
export type Params = Record<string, string | number>

export function isLang(value: unknown): value is Lang {
  return value === "es" || value === "en"
}

export const isLangPreference = (value: unknown): value is LangPreference =>
  value === "auto" || isLang(value)

// Any Spanish variant ("es", "es-MX"...) gets Spanish; everything else English,
// the language most researchers read.
export function resolveLang(
  preference: LangPreference,
  browserLanguage: string | undefined
): Lang {
  if (preference !== "auto") return preference
  return browserLanguage?.toLowerCase().startsWith("es") ? "es" : "en"
}

export function translate(lang: Lang, key: TKey, params?: Params): string {
  const dictionary = dictionaries[lang]
  let text: string | undefined

  // With a count, the singular or plural form is chosen ("1 paper", "2 papers").
  if (typeof params?.n === "number") {
    const form = params.n === 1 ? "_one" : "_other"
    text = dictionary[`${key}${form}` as Key]
  }
  text ??= dictionary[key as Key] ?? en[key as Key] ?? key

  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  )
}

// "a **b** c" -> [{a, false}, {b, true}, {c, false}], for the few texts with
// bold words.
export function richParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split("**")
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((part) => part.text !== "")
}
