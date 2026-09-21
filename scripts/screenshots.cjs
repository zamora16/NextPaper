// Captures the main screens of the popup (also useful for the store listing).
//
//   OUT=dir [LANG_UI=en|es] [DARK=1] [SCALE=2] node scripts/screenshots.cjs [S2 ref]
//
// Needs the Semantic Scholar API. Uses a fresh browser profile.
const fs = require("fs")
const path = require("path")
const { launch, openPopup, waitDone, clickButton, clickLabel, sleep } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"
const OUT = process.env.OUT || path.join(__dirname, "..", "shots")
const LANG = process.env.LANG_UI || "en"
const DARK = process.env.DARK === "1"
const WIDTH = Number(process.env.WIDTH || 432)
const SCALE = Number(process.env.SCALE || 1)

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const { browser, extId } = await launch({ lang: LANG })
  const { page } = await openPopup(browser, extId, REF)
  await page.setViewport({ width: WIDTH, height: 600, deviceScaleFactor: SCALE })
  if (DARK) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }])
  const shot = async (name, fullPage = false) => {
    await sleep(400)
    await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage })
    console.log("shot", name)
  }

  await sleep(1200)
  await shot("0-loading")
  await waitDone(page)
  await shot("1-results")
  await clickButton(page, LANG === "es" ? "Cronología" : "Timeline", false)
  await shot("2-timeline")
  await clickButton(page, LANG === "es" ? "Cronología" : "Timeline", false)

  // save three papers so the other tabs have something to show
  await page.evaluate(() => {
    const seen = new Set()
    for (const link of document.querySelectorAll("[data-paper-title]")) {
      if (seen.has(link.textContent) || seen.size >= 5) continue
      seen.add(link.textContent)
      link.closest("[data-paper-id]").querySelector("[data-save]").click()
    }
  })
  await sleep(800)
  await page.evaluate(async () => {
    const lib = Object.values((await chrome.storage.local.get("nextpaper_library")).nextpaper_library ?? {})
    const items = lib.slice(0, 2).map((p) => ({
      paper: { ...p, relation: null },
      because: lib[2]?.title ?? p.title,
      foundAt: Date.now(),
      viewed: false
    }))
    // the first two become updates (papers found, not saved by the user)
    await chrome.storage.local.set({
      nextpaper_library: Object.fromEntries(lib.slice(2).map((p) => [p.paperId, p])),
      nextpaper_updates: { running: false, checkedAt: Date.now() - 3600e3, lastError: null, seen: [], items }
    })
  })
  await page.evaluate(() => {
    document.querySelector('[role="tablist"] [role="tab"]:nth-child(2)')?.click()
  })
  await shot("3-saved")
  await page.evaluate(() => {
    document.querySelector('[role="tablist"] [role="tab"]:nth-child(3)')?.click()
  })
  await shot("4-updates")
  await clickLabel(page, "Ajustes", "Settings")
  await shot("5-settings")

  const second = await browser.newPage()
  await second.setViewport({ width: WIDTH, height: 600, deviceScaleFactor: SCALE })
  if (DARK) await second.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }])
  await second.goto(`chrome-extension://${extId}/popup.html`)
  await second.evaluate(() => chrome.storage.local.clear())
  await second.reload()
  await sleep(1500)
  await second.screenshot({ path: path.join(OUT, "6-setup.png"), fullPage: true })
  console.log("shot 6-setup")
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
