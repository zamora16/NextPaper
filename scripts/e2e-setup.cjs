// End-to-end: the first-run setup and the personal Semantic Scholar key.
//
//   node scripts/e2e-setup.cjs [S2 ref]
//
// Starts from a fresh profile with NO settings (a new user). Needs a real key
// in S2_API_KEY or .env.local to walk the happy path; without one that part is
// skipped. Also checks that the built extension contains no key at all.
const fs = require("fs")
const path = require("path")
const { launch, testApiKey, openPopup, waitDone, clickButton, check, sleep, finish } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"
const KEY_INPUT = "input[aria-label='Clave de API de Semantic Scholar']"
const BUILD = path.resolve(__dirname, "../build/chrome-mv3-prod")

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

;(async () => {
  const realKey = testApiKey()

  // 0. Nothing secret ships with the extension.
  if (realKey) {
    const leaked = filesUnder(BUILD).filter(
      (file) => /\.(js|html|json|css)$/.test(file) && fs.readFileSync(file, "utf8").includes(realKey)
    )
    check("the built extension contains no API key", leaked.length === 0, leaked.join(", "))
  }
  const manifest = fs.readFileSync(path.join(BUILD, "manifest.json"), "utf8")
  const emails = manifest.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []
  check("the manifest lists only the maintainer's address", emails.every((e) => e === "angelzamora1616@gmail.com"), emails.join(", "))

  const { browser, extId } = await launch({ seedSettings: false })
  const { page, errors } = await openPopup(browser, extId, REF)
  const body = () => page.evaluate(() => document.body.innerText)
  const settings = () =>
    page.evaluate(async () => (await chrome.storage.local.get("nextpaper_settings")).nextpaper_settings)
  const keys = () => page.evaluate(async () => Object.keys(await chrome.storage.local.get()))
  const typeKey = async (text) => {
    await page.click(KEY_INPUT)
    await page.keyboard.down("Control")
    await page.keyboard.press("KeyA")
    await page.keyboard.up("Control")
    await page.keyboard.press("Backspace")
    await page.type(KEY_INPUT, text)
  }

  // 1. First run: the setup explains everything and nothing is analyzed yet.
  await page.waitForFunction(() => document.body.innerText.includes("Bienvenido a NextPaper"), { timeout: 15000 })
  let text = await body()
  check("first run shows the welcome/setup screen", text.includes("Bienvenido a NextPaper"))
  check("it explains why and how (3 steps)", text.includes("¿Por qué una clave propia?") && text.includes("Pide tu clave gratis") && text.includes("Copia la clave") && text.includes("Pégala aquí"))
  const formLink = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => /formulario/i.test(a.textContent))?.href)
  check("the form link points to Semantic Scholar's key request", formLink === "https://www.semanticscholar.org/product/api#api-key-form", formLink)
  check("there is a way to continue without a key", text.includes("Continuar sin clave"))
  await sleep(2500)
  check("no analysis or request starts behind the setup screen", !(await keys()).some((k) => k.startsWith("nextpaper_job_") || k.startsWith("nextpaper_cache_")))

  // 2. Mistakes are caught with a clear message, and nothing is saved.
  await typeKey("hola")
  await clickButton(page, "Guardar y empezar")
  await sleep(500)
  check("text that is not a key is explained", /no parece una clave/.test(await body()))
  await typeKey("a".repeat(40))
  await clickButton(page, "Guardar y empezar")
  await page.waitForFunction(() => /no acepta esa clave|no he podido comprobarla|Clave guardada/.test(document.body.innerText), { timeout: 30000 })
  text = await body()
  check("a well-formed but wrong key is refused by Semantic Scholar", /no acepta esa clave/.test(text), text.match(/(no acepta[^.]*|no he podido[^.]*)/)?.[0])
  check("nothing was saved by a refused key", !(await settings())?.s2ApiKey && !(await settings())?.setupDone)

  // 3. The happy path with a real key.
  if (realKey) {
    await typeKey(realKey)
    await clickButton(page, "Guardar y empezar")
    await page.waitForFunction(() => document.body.innerText.includes("★ Guardados"), { timeout: 60000 })
    const saved = await settings()
    check("the real key was accepted and saved", saved?.s2ApiKey === realKey && saved?.setupDone === true)
    await waitDone(page)
    check("the analysis runs with the user's key", /\d+ de \d+ papers/.test(await body()))

    // 4. Settings: the key is masked, and can be removed.
    await clickButton(page, "⚙")
    await sleep(500)
    text = await body()
    check("settings show the key masked, never in full", text.includes("guardada (••••••••" + realKey.slice(-4) + ")") && !text.includes(realKey))
    check("settings credit the data sources and the license", /Semantic Scholar/.test(text) && /Crossref/.test(text) && /MIT/.test(text))
    await clickButton(page, "Quitar clave")
    await sleep(600)
    const removed = await settings()
    check("removing the key keeps the setup done", removed?.s2ApiKey === null && removed?.setupDone === true)
    check("settings then say there is no key", /sin clave \(modo lento\)/.test(await body()))
  }

  // 5. A new user can also continue without a key, and is not asked again.
  const second = await browser.newPage()
  await second.goto(`chrome-extension://${extId}/popup.html?ref=${encodeURIComponent(REF)}`)
  await second.evaluate(() => chrome.storage.local.clear())
  await second.reload()
  await second.waitForFunction(() => document.body.innerText.includes("Bienvenido a NextPaper"), { timeout: 15000 })
  await second.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Continuar sin clave"))?.click())
  await second.waitForFunction(() => document.body.innerText.includes("★ Guardados"), { timeout: 15000 })
  const skipped = await second.evaluate(async () => (await chrome.storage.local.get("nextpaper_settings")).nextpaper_settings)
  check("continuing without a key stores no key", skipped?.setupDone === true && skipped?.s2ApiKey === null)
  await second.reload()
  await second.waitForFunction(() => document.body.innerText.includes("★ Guardados"), { timeout: 15000 })
  check("the setup is not shown again", !(await second.evaluate(() => document.body.innerText)).includes("Bienvenido a NextPaper"))

  await browser.close()
  // the wrong key tried on purpose makes the browser log a 403
  finish(errors.filter((e) => !/403/.test(e)))
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
