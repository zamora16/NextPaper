import { getSettings } from "~lib/settings"

// The header for Semantic Scholar requests: the user's own key when they set
// one (see settings.ts), otherwise none (the slower anonymous pool).
export async function authHeaders(): Promise<HeadersInit | undefined> {
  const { s2ApiKey } = await getSettings()
  return s2ApiKey ? { "x-api-key": s2ApiKey } : undefined
}
