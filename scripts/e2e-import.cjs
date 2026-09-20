// End-to-end: import (BibTeX), collections, backup, restore, re-import and a
// hostile backup file. Starts from an EMPTY library, as a new user would.
//
//   node scripts/e2e-import.cjs
//
// Needs the Semantic Scholar API (resolving DOIs and one title); ~1 minute.
const fs = require("fs")
const os = require("os")
const path = require("path")
const { launch, check, sleep, clickButton, finish } = require("./e2e-lib.cjs")

const BIB = `
@article{bmc, title = {Psychometric properties of the Spanish version of the functionality appreciation scale}, doi = {10.1186/s40337-024-01004-0}}
@article{fold, title = {Highly accurate protein structure prediction with AlphaFold}, doi = "https://doi.org/10.1038/S41586-021-03819-2"}
@article{fake, title = {Not a real paper}, doi = {10.9999/this-does-not-exist-12345}}
@inproceedings{att, title = {Attention is all you need}, year = 2017}
`

const tmp = (name, content) => {
  const file = path.join(os.tmpdir(), name)
  fs.writeFileSync(file, content)
  return file
}

;(async () => {
  const { browser, extId } = await launch()
  const errors = []
  const page = await browser.newPage()
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)))
  await page.goto(`chrome-extension://${extId}/popup.html`)

  await page.evaluate(() => {
    window.__blobs = []
    const original = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => (window.__blobs.push(blob), original(blob))
  })

  const library = () =>
    page.evaluate(async () =>
      Object.values((await chrome.storage.local.get("nextpaper_library")).nextpaper_library ?? {})
    )
  const bodyText = () => page.evaluate(() => document.body.innerText)
  const waitFor = async (predicate, ms = 90000) => {
    const limit = Date.now() + ms
    while (Date.now() < limit) {
      if (await predicate()) return true
      await sleep(500)
    }
    return false
  }
  const upload = async (file) => {
    const input = await page.$("input[type=file]")
    await input.uploadFile(file)
  }

  // 1. New user: empty library still offers import
  await clickButton(page, "Guardados", false)
  await sleep(500)
  check("empty library shows the import tools", (await bodyText()).includes("Importar..."))

  // 2. Import BibTeX: 2 DOIs, 1 fake DOI, 1 title-only entry
  await upload(tmp("nextpaper-test.bib", BIB))
  check("import finished", await waitFor(async () => /Importados \d+ paper/.test(await bodyText())))
  const imported = await library()
  const titlesOf = imported.map((p) => p.title.toLowerCase())
  check("both real DOIs were imported", imported.filter((p) => /functionality appreciation|alphafold/i.test(p.title)).length === 2)
  check("title-only entry was found by search", titlesOf.some((t) => t.includes("attention is all you need")))
  check("imported into the 'Importados' collection", imported.length > 0 && imported.every((p) => p.collections.includes("Importados")))
  check("the fake DOI is reported as not found", /1 no se encontraron/.test(await bodyText()))
  const count = imported.length

  // 3. Re-import: nothing duplicated
  await upload(tmp("nextpaper-test.bib", BIB))
  await waitFor(async () => /ya estaban guardados/.test(await bodyText()))
  check("re-import does not duplicate", (await library()).length === count)

  // 4. Collections: add one, filter by it, delete it (papers stay)
  await page.type("input[placeholder='+ colección']", "Tesis")
  await page.keyboard.press("Enter")
  await sleep(600)
  check("collection chip filter appears", (await bodyText()).includes("Tesis · 1"))
  await clickButton(page, "Tesis · 1")
  await sleep(400)
  const cards = () => page.evaluate(() => document.querySelectorAll("a.line-clamp-2").length)
  check("filtering by the collection shows only its paper", (await cards()) === 1)
  await clickButton(page, "Eliminar colección")
  await sleep(600)
  check("deleting a collection keeps the papers", (await library()).length === count)
  check("deleted collection is gone from the filters", !(await bodyText()).includes("Tesis ·"))

  // 5. Backup: download, wipe, restore
  await clickButton(page, "Copia de seguridad")
  await sleep(500)
  const backupText = await page.evaluate(async () => window.__blobs[window.__blobs.length - 1].text())
  const backup = JSON.parse(backupText)
  check("backup file has the app marker and every paper", backup.app === "nextpaper" && backup.library.length === count)

  await page.evaluate(() => chrome.storage.local.remove("nextpaper_library"))
  await page.reload()
  await clickButton(page, "Guardados", false)
  await sleep(500)
  check("library is empty after the wipe", (await library()).length === 0)
  await upload(tmp("nextpaper-backup.json", backupText))
  check("restore finished", await waitFor(async () => /Copia restaurada/.test(await bodyText()), 20000))
  check("restore brought every paper back", (await library()).length === count)

  // 6. Hostile backup: a javascript: link must not survive
  const hostile = JSON.stringify({
    app: "nextpaper",
    library: [{ paperId: "evil", title: "Evil paper", url: "javascript:alert(1)", openAccessPdf: { url: "javascript:alert(2)" } }]
  })
  await upload(tmp("nextpaper-hostile.json", hostile))
  await waitFor(async () => (await library()).some((p) => p.paperId === "evil"), 20000)
  const evil = (await library()).find((p) => p.paperId === "evil")
  check("hostile item was imported but sanitized", !!evil && evil.url.startsWith("https://") && evil.openAccessPdf === null)
  const dangerous = await page.evaluate(() =>
    [...document.querySelectorAll("a")].filter((a) => /^javascript:/i.test(a.getAttribute("href") ?? "")).length
  )
  check("no javascript: link in the page", dangerous === 0)

  // 7. Garbage file is rejected politely
  await upload(tmp("nextpaper-garbage.txt", "x"))
  check("a file without references is reported", await waitFor(async () => /No se encontraron referencias/.test(await bodyText()), 20000))

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
