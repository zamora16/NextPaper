// Shared helpers for the real-browser end-to-end scripts.
//
// Why a real browser: Node has no CORS, so network code that "works" there
// can fail inside the extension. These scripts load the BUILT extension
// (build/chrome-mv3-prod) in Edge and drive the real popup.
//
// Setup (once):   npm i --no-save puppeteer-core
// Build first:    npx plasmo build
// Env overrides:  BROWSER_PATH (default: Edge on Windows)
//
// e2e-offline.cjs reuses launch() with a copy of the build that talks to a local
// test server (extDir), a fixed key (apiKey) and extra browser flags (args).
//
// Branded Chrome 137+ ignores --load-extension, which is why Edge is used.
const fs = require("fs")
const path = require("path")

let puppeteer
try {
  puppeteer = require("puppeteer-core")
} catch {
  console.error("puppeteer-core not found. Run: npm i --no-save puppeteer-core")
  process.exit(1)
}

const EXT = path.resolve(__dirname, "../build/chrome-mv3-prod")
const BROWSER =
  process.env.BROWSER_PATH ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let failures = 0
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`)
  if (!ok) failures++
}

// The extension ships WITHOUT any API key: each user sets their own on first
// run. For the tests, a key is read from S2_API_KEY (or the old
// PLASMO_PUBLIC_S2_API_KEY) in the environment or in .env.local, and stored in
// the extension the way the setup screen would.
function testApiKey() {
  const fromEnv = process.env.S2_API_KEY || process.env.PLASMO_PUBLIC_S2_API_KEY
  if (fromEnv) return fromEnv.trim()
  try {
    const text = fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8")
    const match = text.match(/^(?:S2_API_KEY|PLASMO_PUBLIC_S2_API_KEY)\s*=\s*(.+)$/m)
    return match ? match[1].trim().replace(/^["']|["']$/g, "") : null
  } catch {
    return null
  }
}

// `lang` sets the browser UI language, which the "automatic" setting follows.
async function launch({ seedSettings = true, lang = "es", extDir = EXT, apiKey, args = [] } = {}) {
  if (!fs.existsSync(path.join(extDir, "manifest.json"))) {
    console.error("Build not found. Run: npx plasmo build")
    process.exit(1)
  }

  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: "new",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      `--lang=${lang}`,
      "--no-sandbox",
      ...args
    ],
    defaultViewport: { width: 440, height: 1000 }
  })

  const worker = await browser.waitForTarget((t) => t.type() === "service_worker", {
    timeout: 20000
  })
  const extId = new URL(worker.url()).host

  if (seedSettings) {
    const key = apiKey !== undefined ? apiKey : testApiKey()
    const page = await browser.newPage()
    await page.goto(`chrome-extension://${extId}/popup.html`)
    await page.evaluate(
      (settings) => chrome.storage.local.set({ nextpaper_settings: settings }),
      { setupDone: true, s2ApiKey: key, language: lang }
    )
    await page.close()
  }
  return { browser, extId }
}

// Opens the popup on a specific paper (popup.html?ref=...), since no toolbar
// click exists in automation to grant activeTab.
async function openPopup(browser, extId, ref) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160))
  })
  await page.goto(`chrome-extension://${extId}/popup.html?ref=${encodeURIComponent(ref)}`)
  return { page, errors }
}

// Analysis finished: results counter visible and the "running" hint gone.
const waitDone = (page, timeout = 200000) =>
  page.waitForFunction(
    () =>
      !/Corre en segundo plano|Runs in the background/.test(
        document.body.innerText
      ) && /\d+ (de \d+ |of \d+ )?papers/.test(document.body.innerText),
    { timeout }
  )

// Icon-only buttons have no text: they are found by their accessible name
// (any of the given names, so a script works in both languages).
const clickLabel = (page, ...labels) =>
  page.evaluate((names) => {
    const button = [...document.querySelectorAll("button")].find((b) =>
      names.includes(b.getAttribute("aria-label"))
    )
    button?.click()
    return !!button
  }, labels)

const titles = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-paper-title]")].map((a) => a.textContent)
  )

const clickButton = (page, text, exact = true) =>
  page.evaluate(
    (t, ex) => {
      const button = [...document.querySelectorAll("button")].find((b) =>
        ex ? b.textContent.trim() === t : b.textContent.includes(t)
      )
      button?.click()
      return !!button
    },
    text,
    exact
  )

function finish(errors) {
  // 429s are expected noise from the API's erratic rate limiting.
  const real = errors.filter((e) => !/429/.test(e))
  check("no console/page errors", real.length === 0, real.slice(0, 2).join(" | "))
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed")
  process.exit(failures ? 1 : 0)
}

module.exports = { launch, testApiKey, openPopup, waitDone, titles, clickButton, clickLabel, check, sleep, finish }
