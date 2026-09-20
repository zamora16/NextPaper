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

async function launch() {
  if (!fs.existsSync(path.join(EXT, "manifest.json"))) {
    console.error("Build not found. Run: npx plasmo build")
    process.exit(1)
  }

  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: "new",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--no-sandbox"
    ],
    defaultViewport: { width: 440, height: 1000 }
  })

  const worker = await browser.waitForTarget((t) => t.type() === "service_worker", {
    timeout: 20000
  })
  const extId = new URL(worker.url()).host
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
      !document.body.innerText.includes("Corre en segundo plano") &&
      /\d+ de \d+ papers/.test(document.body.innerText),
    { timeout }
  )

const titles = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("a.line-clamp-2")].map((a) => a.textContent)
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

module.exports = { launch, openPopup, waitDone, titles, clickButton, check, sleep, finish }
