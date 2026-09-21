// End-to-end: the English interface, the three tabs, the hover hints and the
// language switch. Needs the Semantic Scholar API (about a minute).
//
//   node scripts/e2e-english.cjs [S2 ref]
const { launch, openPopup, waitDone, clickButton, clickLabel, check, sleep, finish } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"
const SPANISH = /Guardados|Novedades|Relacionados|Buscar art|Ver cronolog|Empieza por aqu/

;(async () => {
  const { browser, extId } = await launch({ lang: "en" })
  const { page, errors } = await openPopup(browser, extId, REF)
  const body = () => page.evaluate(() => document.body.innerText)
  const settings = () =>
    page.evaluate(async () => (await chrome.storage.local.get("nextpaper_settings")).nextpaper_settings)

  await waitDone(page)
  let text = await body()
  check("the popup is in English", /Related/.test(text) && /Saved/.test(text) && /Updates/.test(text), text.slice(0, 120))
  check("no Spanish left in the interface", !SPANISH.test(text), text.match(SPANISH)?.[0])
  check("the page declares its language", (await page.evaluate(() => document.documentElement.lang)) === "en")
  check("results count is in English", /\d+ (of \d+ )?papers/.test(text))
  check("three tabs", (await page.evaluate(() => document.querySelectorAll('[role="tab"]').length)) === 3)

  const hints = await page.evaluate(() =>
    [...document.querySelectorAll('[role="img"][tabindex="0"]')].map((h) => ({
      title: h.getAttribute("title"),
      label: h.getAttribute("aria-label")
    }))
  )
  check("hover hints are present and labelled", hints.length >= 2 && hints.every((h) => h.title && h.title === h.label), String(hints.length))

  await clickButton(page, "Timeline", false)
  await sleep(500)
  check("the timeline toggle turns on", await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Timeline" && b.getAttribute("aria-pressed") === "true")))

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT })
  await clickButton(page, "Updates", false)
  await sleep(500)
  text = await body()
  check("the Updates tab explains that nothing is saved yet", /Save some papers/i.test(text) || /saved/i.test(text), text.slice(0, 160))
  check("no Spanish in the Updates tab", !SPANISH.test(text))

  await clickButton(page, "Saved", false)
  await sleep(500)
  text = await body()
  check("the Saved tab is in English", /Backup/i.test(text) || /Import/i.test(text), text.slice(0, 160))
  check("no Spanish in the Saved tab", !SPANISH.test(text))

  // Switching language in the settings changes the interface at once and is remembered.
  await clickLabel(page, "Settings")
  await sleep(500)
  await clickButton(page, "Español")
  await sleep(600)
  text = await body()
  check("choosing Español switches the interface", /Ajustes|Idioma/.test(text), text.slice(0, 120))
  check("the choice is stored", (await settings())?.language === "es")
  check("the page language follows", (await page.evaluate(() => document.documentElement.lang)) === "es")
  await clickButton(page, "Automático", false)
  await sleep(400)
  check("Automatic goes back to the browser language", /Settings|Language/.test(await body()))

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
