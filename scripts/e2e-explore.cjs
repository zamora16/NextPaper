// End-to-end: analyze a paper, explore a result, go back (cache), topic search.
//
//   node scripts/e2e-explore.cjs [S2 ref] [seed title regex]
//
// Defaults to a psychology paper; any ref works (DOI:..., ARXIV:..., PMID:...).
// Takes 1-3 minutes because Semantic Scholar rate-limits erratically.
const { launch, openPopup, waitDone, titles, clickButton, check, sleep, finish } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"
const SEED_TITLE = new RegExp(
  process.argv[3] || "spanish version of the functionality appreciation",
  "i"
)

;(async () => {
  const { browser, extId } = await launch()
  const { page, errors } = await openPopup(browser, extId, REF)

  // 1. Seed paper analysis
  let start = Date.now()
  await waitDone(page)
  let list = await titles(page)
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll("p.uppercase")].map((p) => p.textContent)
  )
  check("analysis finished", list.length > 0, `${((Date.now() - start) / 1000).toFixed(1)}s, ${list.length} cards`)
  check("results are grouped", headings.filter((h) => !/Empieza/i.test(h)).length >= 1, headings.join(" | "))
  check("seed paper itself not in results", !list.some((t) => SEED_TITLE.test(t)))
  const firstTitle = list[0]

  // "Coincide en": each card says what it shares with the open paper
  const sharedLines = await page.evaluate(() =>
    [...document.querySelectorAll("p")].filter((p) => p.textContent.startsWith("Coincide en:")).length
  )
  check("cards explain what they share with the paper", sharedLines >= 3, sharedLines + " cards")

  // Timeline by subtopic
  await clickButton(page, "Ver cronología")
  await sleep(500)
  const dots = await page.evaluate(() => document.querySelectorAll("[data-timeline-point]").length)
  check("timeline shows a dot per dated paper", dots >= 10, dots + " dots")
  const lanes = await page.evaluate(
    () => [...document.querySelectorAll("svg text")].filter((el) => el.getAttribute("font-weight") === "600" && !/tu paper/.test(el.textContent)).length
  )
  check("timeline has one lane per subtopic group", lanes >= 2, lanes + " lanes")
  check(
    "timeline marks the year of the paper being read",
    await page.evaluate(() => [...document.querySelectorAll("svg text")].some((el) => /tu paper \(\d{4}\)/.test(el.textContent)))
  )
  await page.evaluate(() =>
    document.querySelector("[data-timeline-point]").dispatchEvent(new MouseEvent("click", { bubbles: true }))
  )
  await sleep(500)
  check(
    "clicking a dot highlights its card",
    (await page.evaluate(() => document.querySelectorAll("[data-paper-id].ring-2").length)) >= 1
  )

  // 2. Explore the first result (snowballing)
  await page.evaluate(() =>
    document.querySelector("button[title^='Analizar este paper']").click()
  )
  await sleep(500)
  check(
    "breadcrumb shown after Explorar",
    await page.evaluate(() => document.body.innerText.includes("Explorando:"))
  )
  start = Date.now()
  await waitDone(page)
  list = await titles(page)
  check("explored paper produced results", list.length > 0, `${((Date.now() - start) / 1000).toFixed(1)}s`)

  // 3. Back: served from cache, same list as before
  start = Date.now()
  await clickButton(page, "← Volver")
  await waitDone(page)
  list = await titles(page)
  check("Volver restores previous results", list[0] === firstTitle)
  check("Volver is fast (cache)", Date.now() - start < 8000, `${Date.now() - start}ms`)

  // 4. Topic search
  await page.type("input", "body image and eating disorders in virtual reality")
  await clickButton(page, "Buscar")
  await sleep(500)
  start = Date.now()
  await waitDone(page)
  list = await titles(page)
  check(
    "topic search also has a timeline",
    await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /cronología/.test(b.textContent)))
  )
  check("topic search returned papers", list.length >= 5, `${((Date.now() - start) / 1000).toFixed(1)}s, ${list.length} cards`)

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
