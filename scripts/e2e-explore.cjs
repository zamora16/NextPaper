// End-to-end: analyze a paper, explore a result, go back (cache), topic search.
//
//   node scripts/e2e-explore.cjs [S2 ref] [seed title regex]
//
// Defaults to a psychology paper; any ref works (DOI:..., ARXIV:..., PMID:...).
// Takes 1-3 minutes because Semantic Scholar rate-limits erratically.
const { launch, openPopup, waitDone, titles, clickButton, clickLabel, check, sleep, finish } = require("./e2e-lib.cjs")

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
    [...document.querySelectorAll("section h3")].map((h) => h.textContent)
  )
  check("analysis finished", list.length > 0, `${((Date.now() - start) / 1000).toFixed(1)}s, ${list.length} cards`)
  // Groups appear only where they can be named; otherwise it is one plain list
  console.log("  groups shown:", headings.length ? headings.join(" | ") : "(none: a plain list)")
  check("seed paper itself not in results", !list.some((t) => SEED_TITLE.test(t)))
  const firstTitle = list[0]

  // Every heading is a real name (terms from the titles) or "Otros relacionados"
  check(
    "every group heading is a real name",
    headings.every((h) => !/ \/ |^Grupo \d/.test(h) && h.trim().length > 0),
    headings.join(" | ")
  )

  // Study-card chips (shown only when detected)
  const chips = await page.evaluate(
    () => [...document.querySelectorAll("span[title^='Diseño detectado']")].length
  )
  check("cards show a detected study design", chips >= 3, chips + " chips")

  // Sorting flattens the subtopic groups into one list
  const groupsBefore = headings.length
  await page.evaluate(() => {
    const select = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "citations"))
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set
    setter.call(select, "citations")
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await sleep(400)
  const flat = await page.evaluate(() => [...document.querySelectorAll("section h3")].length)
  check("sorting by citations gives one list without headings", flat === 0, groupsBefore + " groups -> " + flat)
  await page.evaluate(() => {
    const select = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "citations"))
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set
    setter.call(select, "relevance")
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await sleep(400)
  check("relevance restores the groups", (await page.evaluate(() => document.querySelectorAll("section h3").length)) === groupsBefore)

  // Timeline by subtopic
  await clickButton(page, "Cronología", false)
  await sleep(500)
  const dots = await page.evaluate(() => document.querySelectorAll("[data-timeline-point]").length)
  check("timeline shows a dot per dated paper", dots >= 10, dots + " dots")
  const lanes = await page.evaluate(
    () => [...document.querySelectorAll("svg text")].filter((el) => el.getAttribute("font-weight") === "600" && !/tu paper/.test(el.textContent)).length
  )
  check("timeline has one lane per group (one when there are none)", lanes === Math.max(1, groupsBefore), lanes + " lanes, " + groupsBefore + " groups")
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
    await page.evaluate(() => /Explorando/i.test(document.body.innerText))
  )
  start = Date.now()
  await waitDone(page)
  list = await titles(page)
  check("explored paper produced results", list.length > 0, `${((Date.now() - start) / 1000).toFixed(1)}s`)

  // 3. Back: served from cache, same list as before
  start = Date.now()
  await clickLabel(page, "← Volver", "← Back")
  await waitDone(page)
  list = await titles(page)
  check("Volver restores previous results", list[0] === firstTitle)
  check("Volver is fast (cache)", Date.now() - start < 8000, `${Date.now() - start}ms`)

  // 4. Topic search
  await page.type("input", "body image and eating disorders in virtual reality")
  await clickLabel(page, "Buscar", "Search")
  await sleep(500)
  start = Date.now()
  await waitDone(page)
  list = await titles(page)
  check(
    "topic search also has a timeline",
    await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /cronología/i.test(b.textContent)))
  )
  check("topic search returned papers", list.length >= 5, `${((Date.now() - start) / 1000).toFixed(1)}s, ${list.length} cards`)

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
