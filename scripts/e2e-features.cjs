// End-to-end: "How others cite it", the year / citation filters and the
// subtopic labels, in the real popup with the real API.
//
//   node scripts/e2e-features.cjs [S2 ref]
//
// Defaults to a well-cited psychology paper (it has citing sentences).
const { launch, openPopup, waitDone, clickButton, clickLabel, check, sleep, finish } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1016/j.bodyim.2014.09.006"
const YEAR_NOW = new Date().getFullYear()

;(async () => {
  const { browser, extId } = await launch({ lang: "en" })
  const { page, errors } = await openPopup(browser, extId, REF)
  const body = () => page.evaluate(() => document.body.innerText)

  await waitDone(page)

  // 1. Subtopic labels: real terms from the group's titles, or "Group N".
  const labels = await page.evaluate(() => [...document.querySelectorAll("section h3")].map((h) => h.innerText.replace(/\s*\d+\s*$/, "").trim()))
  check("every group has a label", labels.length >= 1 && labels.every(Boolean), labels.join(" | "))
  check("labels are terms or numbered groups, never the old 'A / B' words", labels.every((l) => !/ \/ /.test(l)), labels.join(" | "))
  check("no group is called just 'Grupo' or empty", labels.every((l) => l !== "Grupo" && l !== "@group"))

  // 2. Year and citation filters.
  const count = async () => {
    const text = await body()
    const m = text.match(/(\d+) of (\d+) papers/) || text.match(/(\d+) papers/)
    return m ? { shown: Number(m[1]), total: Number(m[2] ?? m[1]) } : null
  }
  const before = await count()
  check("the results counter is there", !!before, JSON.stringify(before))

  check("the filters panel opens from its button", await clickLabel(page, "More filters"))
  await sleep(300)
  await page.click("input[aria-label='From']")
  await page.type("input[aria-label='From']", "2020")
  await sleep(500)
  const afterYear = await count()
  check("a year narrows the list", !!afterYear && afterYear.shown < before.total, JSON.stringify(afterYear))
  const years = await page.evaluate(() =>
    [...document.querySelectorAll("[data-paper-id]")].map((card) => {
      const m = card.innerText.match(/·\s*((?:19|20)\d\d)\s*(?:·|\n)/)
      return m ? Number(m[1]) : null
    })
  )
  check("every card shown is from that year or later", years.length > 0 && years.every((y) => y === null || y >= 2020), years.join(","))
  check("'Start here' steps aside while a filter is on", !/START HERE|Start here/i.test(await body()))
  check("the button shows one active filter", await page.evaluate(() => document.querySelector("button[aria-label='More filters']").innerText.trim() === "1"))

  await clickButton(page, "Last 5 years")
  await sleep(400)
  const from = await page.evaluate(() => document.querySelector("input[aria-label='From']").value)
  check("the 'last 5 years' preset fills the year", from === String(YEAR_NOW - 4), from)

  await page.select("select:not([aria-label])", "50").catch(() => {})
  await clickButton(page, "Clear filters")
  await sleep(500)
  const cleared = await count()
  check("clearing the filters restores the whole list", !!cleared && cleared.shown === before.total, JSON.stringify(cleared))

  // 3. How others cite it.
  await clickLabel(page, "More filters") // close the panel
  check("'How others cite it' is offered for the paper", await clickButton(page, "How others cite it", false))
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll("blockquote").length > 0 ||
        /has no citing sentences|No sentence names|could not be loaded/.test(document.body.innerText),
      { timeout: 90000 }
    )
    .catch(() => {})
  const text = await body()
  check("the sentences loaded (no error)", !/could not be loaded/.test(text))
  const quotes = await page.evaluate(() => [...document.querySelectorAll("blockquote p")].map((p) => p.innerText))
  check("citing sentences are shown", quotes.length >= 1, quotes.length + " shown")
  check(
    "every sentence shown names the paper",
    quotes.every((q) => /Tylka|Wood-Barcalow|Body Appreciation Scale/.test(q)),
    quotes.filter((q) => !/Tylka|Wood-Barcalow|Body Appreciation Scale/.test(q)).slice(0, 1).join(" ")
  )
  check("the summary says how many citing papers have sentences", /Sentences found in \d+ of \d+ citing papers/.test(text))
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("blockquote a")].map((a) => a.getAttribute("href")))
  check("citing papers link only to http(s)", hrefs.every((h) => /^https?:\/\//.test(h)), hrefs.slice(0, 2).join(" "))

  const hasOthers = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /that do not name the paper/.test(b.innerText)))
  if (hasOthers) {
    const hiddenBefore = await page.evaluate(() => document.querySelectorAll("blockquote").length)
    await clickButton(page, "that do not name the paper", false)
    await sleep(400)
    const t2 = await body()
    check("the unverified sentences appear only when asked, with a warning", /may be about a neighboring reference/.test(t2))
    check("...and they add to the list", (await page.evaluate(() => document.querySelectorAll("blockquote").length)) > hiddenBefore)
  }

  // 4. It is remembered: a second open costs no new request.
  const cached = await page.evaluate(async () => Object.keys(await chrome.storage.local.get()).filter((k) => k.startsWith("nextpaper_citing_v1_")).length)
  check("the answer is stored (bounded cache)", cached === 1, cached + " entries")

  // 5. Not offered for a topic search.
  await page.type("input[type=search]", "body image and eating disorders")
  await clickLabel(page, "Search")
  await sleep(600)
  check("'How others cite it' is not offered for a topic", !(await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => /How others cite it/.test(b.innerText)))))

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
