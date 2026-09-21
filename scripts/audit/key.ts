import { readFileSync } from "node:fs"
import { join } from "node:path"

// The audit talks to the real API with the key of .env.local (S2_API_KEY),
// stored the way the setup screen would: in the extension's settings.
export async function setSettingsForTests() {
  let key = process.env.S2_API_KEY ?? null
  if (!key) {
    try {
      const text = readFileSync(join(__dirname, "../../.env.local"), "utf8")
      key =
        text
          .match(/^(?:S2_API_KEY|PLASMO_PUBLIC_S2_API_KEY)\s*=\s*(.+)$/m)?.[1]
          .trim() ?? null
    } catch {
      key = null
    }
  }
  await (globalThis as any).chrome.storage.local.set({
    nextpaper_settings: { setupDone: true, s2ApiKey: key, language: "en" }
  })
}
