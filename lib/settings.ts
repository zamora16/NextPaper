import { isLangPreference, type LangPreference } from "~lib/i18n"
import { createQueue } from "~lib/queue"

// Each person uses their own free Semantic Scholar API key. It is never
// bundled with the extension: a key shipped to every user would be readable by
// anyone, would break the API's terms (a key may not be shared) and would put
// all users behind one shared 1 request/second limit.
//
// The key lives only in this browser (chrome.storage.local) and is only ever
// sent to api.semanticscholar.org.

export const SETTINGS_KEY = "nextpaper_settings"

export interface Settings {
  // The first-run screen was answered (with or without a key).
  setupDone: boolean
  s2ApiKey: string | null
  // "auto" follows the browser language.
  language: LangPreference
}

const DEFAULTS: Settings = {
  setupDone: false,
  s2ApiKey: null,
  language: "auto"
}

// Keys are ~40 letters/digits. Anything else (spaces, a pasted sentence, the
// "x-api-key:" header name) is a mistake worth catching before saving.
const KEY_FORMAT = /^[A-Za-z0-9_-]{20,128}$/

// Returns the key cleaned up (surrounding whitespace and quotes removed), or
// null when it does not look like a key.
export function normalizeApiKey(input: unknown): string | null {
  if (typeof input !== "string") return null
  const key = input.trim().replace(/^["']|["']$/g, "")
  return KEY_FORMAT.test(key) ? key : null
}

// "••••••••abcd": enough to recognize it, not enough to leak it on screen.
export const maskKey = (key: string) => "••••••••" + key.slice(-4)

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get([SETTINGS_KEY]))[SETTINGS_KEY]
  return {
    setupDone: stored?.setupDone === true,
    // Stored values are re-validated: a hand-edited or corrupt entry must not
    // become a header.
    s2ApiKey: normalizeApiKey(stored?.s2ApiKey),
    language: isLangPreference(stored?.language) ? stored.language : "auto"
  }
}

const queue = createQueue()
const change = (fn: (current: Settings) => Partial<Settings>) =>
  queue(async () => {
    const current = await getSettings()
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { ...DEFAULTS, ...current, ...fn(current) }
    })
  })

export const saveApiKey = (key: string) =>
  change(() => ({ s2ApiKey: key, setupDone: true }))

export const removeApiKey = () => change(() => ({ s2ApiKey: null }))

export const saveLanguage = (language: LangPreference) =>
  change(() => ({ language }))

// "Continue without a key": the first-run screen will not be shown again.
export const finishSetup = () => change(() => ({ setupDone: true }))

export type KeyCheck = "valid" | "invalid" | "unknown"

const CHECK_URL =
  "https://api.semanticscholar.org/graph/v1/paper/DOI:10.1186/s40337-024-01004-0?fields=title"

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Asks Semantic Scholar whether the key is accepted. A wrong key answers 403;
// a 429 or a network error says nothing about the key ("unknown"), so it is
// tried a few times before giving up.
export async function checkApiKey(
  key: string,
  attempts = 3
): Promise<KeyCheck> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(CHECK_URL, {
        headers: { "x-api-key": key }
      })
      if (response.ok) return "valid"
      if (response.status === 401 || response.status === 403) return "invalid"
    } catch {
      // network error: try again
    }
    if (attempt < attempts - 1) await wait(1200)
  }
  return "unknown"
}
