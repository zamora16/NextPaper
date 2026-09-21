// End-to-end in a real browser with NO network and NO API key: the built
// extension talks to a local imitation of Semantic Scholar, Crossref and
// Unpaywall (scripts/e2e-offline/world.cjs). It covers the main flows and runs
// in CI on every push. The other e2e scripts hit the real APIs and stay a
// manual pre-release check.
//
//   npx plasmo build && node scripts/e2e-offline.cjs
//
// Needs puppeteer-core (npm i --no-save puppeteer-core) and a Chromium-family
// browser (BROWSER_PATH; Edge on Windows by default).
const { createServer, API_KEY } = require("./e2e-offline/world.cjs")
const { prepareBuild } = require("./e2e-offline/prepare-build.cjs")
const { launch, openPopup, waitDone, titles, clickButton, clickLabel, check, sleep, finish } = require("./e2e-lib.cjs")
const path = require("node:path")

const REF = "DOI:10.1000/nextpaper.seed"
const NO_INTERNET = [
  "--host-resolver-rules=MAP api.semanticscholar.org ~NOTFOUND, MAP api.crossref.org ~NOTFOUND, MAP api.unpaywall.org ~NOTFOUND"
]

const text = (page) => page.evaluate(() => document.body.innerText)
const count = (page, selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector)
const headings = (page) => page.evaluate(() => [...document.querySelectorAll("section h3")].map((h) => h.textContent))

;(async () => {
  // Every third request answers 429, as the real API randomly does: the retry
  // logic must get through it.
  const world = await createServer({ flakyEvery: 3 })
  const { dir, counts } = prepareBuild(path.resolve(__dirname, "../build/chrome-mv3-prod"), world.port)
  console.log(`test server on :${world.port}; API origins rewritten:`, JSON.stringify(Object.values(counts)))
  const stats = world.stats

  const { browser, extId } = await launch({ extDir: dir, apiKey: API_KEY, args: NO_INTERNET })
  const { page, errors } = await openPopup(browser, extId, REF)

  // 1. The open paper --------------------------------------------------------
  const started = Date.now()
  await waitDone(page, 60000)
  const list = await titles(page)
  check("analysis finished, offline and through injected 429s", list.length > 0, `${((Date.now() - started) / 1000).toFixed(1)}s`)
  // "Start here" repeats three of them
  check("18 related papers shown", new Set(list).size === 18, `${new Set(list).size} distinct`)
  check("the open paper is not in its own results", !list.some((t) => /Body image and social media use in adolescents/.test(t)))
  check("unrelated papers are left out", !list.some((t) => /Volcanic|Soil carbon|lithium|Arctic terns|Turbulence|Sediment/.test(t)))
  check("some requests were throttled and retried", stats.throttled > 0, `${stats.throttled} throttled`)

  const groups = await headings(page)
  check("groups appear only with real names", groups.length >= 1 && groups.every((h) => !/^Grupo \d/.test(h)), groups.join(" | "))
  check("a group is named after its topic", groups.some((h) => /social media/i.test(h)), groups.join(" | "))
  const body = await text(page)
  check("cards show a similarity", /\d+% similar/.test(body))
  check("the Start here section is shown", /Empieza por aquí/i.test(body))
  check("a study design is detected on some cards", (await count(page, "span[title^='Diseño detectado']")) >= 1)

  // 2. Free PDFs: Semantic Scholar's, and Unpaywall's on demand --------------
  const own = await page.evaluate(() => [...document.querySelectorAll("a[href^='https://repo.example.org/pdf/']")].length)
  check("papers with a PDF known to Semantic Scholar link it", own >= 1, String(own))
  check("nothing was sent to Unpaywall before a click", stats.unpaywallRequests === 0)
  const asks = await count(page, "button[title^='Busca una copia legal']")
  check("papers without a PDF offer to look for one", asks >= 1, String(asks))
  for (let i = 0; i < asks; i++) {
    await clickButton(page, "Buscar PDF", false)
    await sleep(350)
  }
  await sleep(600)
  const found = await page.evaluate(() => [...document.querySelectorAll("a[href^='https://repo.example.org/free/']")].length)
  const pages = await page.evaluate(() => [...document.querySelectorAll("a[href^='https://repo.example.org/page/']")].map((a) => a.textContent))
  const none = (await text(page)).split("Sin PDF libre").length - 1
  check("Unpaywall's free PDFs appear as links", found >= 1, String(found))
  check("a free page that is not a PDF is offered as free text, never as a PDF", pages.length >= 1 && pages.every((label) => /Texto libre/.test(label) && !/PDF/.test(label)), pages.join(" | "))
  check("papers with no free copy say so", none >= 1, String(none))
  check("one Unpaywall request per click, no more", stats.unpaywallRequests >= asks && stats.unpaywallRequests <= asks + stats.throttled, `${stats.unpaywallRequests} for ${asks}`)

  // 3. Sorting and the timeline ------------------------------------------------
  await page.evaluate(() => {
    const select = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "citations"))
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "citations")
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await sleep(400)
  check("sorting by citations gives one list without headings", (await headings(page)).length === 0)
  await page.evaluate(() => {
    const select = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "relevance"))
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "relevance")
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await clickButton(page, "Cronología", false)
  await sleep(500)
  check("the timeline shows a dot per dated paper", (await count(page, "[data-timeline-point]")) >= 10)
  await clickButton(page, "Cronología", false)

  // 4. The cache: opening the same paper again asks the API for nothing -----
  const before = stats.byPrefix.s2
  const again = await openPopup(browser, extId, REF)
  await waitDone(again.page, 20000)
  check("a second open of the same paper is served from the cache", stats.byPrefix.s2 === before, `${stats.byPrefix.s2 - before} extra requests`)
  await again.page.close()

  // 5. Saving, and the library -------------------------------------------------
  await page.evaluate(() => document.querySelector("[data-save]").click())
  await sleep(500)
  const saved = await page.evaluate(async () => Object.values((await chrome.storage.local.get("nextpaper_library")).nextpaper_library ?? {}))
  check("a saved paper is stored", saved.length === 1)
  await clickButton(page, "Guardados", false)
  await sleep(600)
  const library = await text(page)
  check("Guardados shows it, with no similarity next to a paper no longer open", (await count(page, "[data-paper-title]")) === 1 && !/\d+% similar/.test(library))

  // 6. Citations use Crossref -------------------------------------------------
  await page.evaluate(() => {
    window.__clip = []
    navigator.clipboard.writeText = async (t) => void window.__clip.push(t)
  })
  await clickButton(page, "Citar")
  const limit = Date.now() + 15000
  while (Date.now() < limit && !(await page.evaluate(() => window.__clip.length))) await sleep(300)
  const [citation] = await page.evaluate(() => window.__clip)
  check("a citation is built from Crossref's data", /Reyes/.test(citation ?? "") && /Example Press|Body Image|Journal|Eating|Psychological/.test(citation ?? ""), (citation ?? "").slice(0, 90))
  check("Crossref was asked", stats.byPrefix.crossref >= 1)

  // 7. Explore a result, then go back (served from the cache) -----------------
  await clickButton(page, "Relacionados", false)
  await sleep(500)
  const firstTitle = (await titles(page))[0]
  await page.evaluate(() => document.querySelector("button[title^='Analizar este paper']").click())
  await sleep(500)
  check("a breadcrumb shows what is being explored", /Explorando/i.test(await text(page)))
  await waitDone(page, 60000)
  const explored = await titles(page)
  check("the explored paper produced its own results", explored.length > 5 && explored[0] !== firstTitle)
  const t0 = Date.now()
  await clickLabel(page, "← Volver", "← Back")
  await waitDone(page, 20000)
  check("Volver restores the previous results", (await titles(page))[0] === firstTitle)
  check("Volver is quick (cache)", Date.now() - t0 < 4000, `${Date.now() - t0}ms`)

  // 8. Topic search ------------------------------------------------------------
  await page.type("input", "social media body image")
  await clickLabel(page, "Buscar", "Search")
  await sleep(500)
  await waitDone(page, 60000)
  check("a topic search returns papers", (await titles(page)).length >= 8, String((await titles(page)).length))
  check("a topic search shows no similarity to any paper", !/\d+% similar/.test(await text(page)))

  // 9. Nothing left the machine -------------------------------------------------
  check("every API request went to the test server", stats.total > 0 && stats.byPrefix.s2 > 0)

  await page.close()

  // 10. A rejected key is explained, not swallowed -----------------------------
  const wrong = await launch({ extDir: dir, apiKey: "wrong-key-nextpaper-e2e-00000", args: NO_INTERNET })
  const bad = await openPopup(wrong.browser, wrong.extId, REF)
  const rejected = await bad.page
    .waitForFunction(() => /ha rechazado tu clave/.test(document.body.innerText), { timeout: 30000 })
    .then(() => true, () => false)
  check("a wrong API key gets a clear message", rejected)
  await wrong.browser.close()

  await browser.close()
  await world.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
