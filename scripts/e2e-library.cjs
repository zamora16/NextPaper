// End-to-end: save papers, reading status, notes, .bib/.ris export, alerts.
//
//   node scripts/e2e-library.cjs [S2 ref]
//
// Also triggers the "novedades" check, so it needs the Semantic Scholar API
// (1-3 minutes). Uses a fresh browser profile, so nothing leaks between runs.
const { launch, openPopup, waitDone, clickButton, check, sleep, finish } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"

;(async () => {
  const { browser, extId } = await launch()
  const { page, errors } = await openPopup(browser, extId, REF)

  // Capture files produced through Blob + <a download>.
  await page.evaluate(() => {
    window.__blobs = []
    const original = URL.createObjectURL.bind(URL)
    URL.createObjectURL = (blob) => (window.__blobs.push(blob), original(blob))
  })

  await waitDone(page)

  // Save two DIFFERENT papers at (almost) the same instant: exercises the
  // serialized library writes (a race here once lost one of them).
  await page.evaluate(() => {
    const seen = new Set()
    for (const link of document.querySelectorAll("a.line-clamp-2")) {
      if (seen.has(link.textContent) || seen.size >= 2) continue
      seen.add(link.textContent)
      link.parentElement.querySelector("button").click()
    }
  })
  await sleep(800)
  const stored = () =>
    page.evaluate(async () =>
      Object.values((await chrome.storage.local.get("nextpaper_library")).nextpaper_library ?? {})
    )
  check("both saves persisted", (await stored()).length === 2)

  // Alerts: run the check while still on the related tab, so the toolbar
  // badge is observable before the user "sees" them.
  await page.evaluate(() => chrome.runtime.sendMessage({ type: "check-updates" }))
  let updates
  const started = Date.now()
  while (Date.now() - started < 150000) {
    await sleep(1500)
    updates = await page.evaluate(
      async () => (await chrome.storage.local.get("nextpaper_updates")).nextpaper_updates
    )
    if (updates?.checkedAt && !updates.running) break
  }
  check("update check completed", !!updates?.checkedAt && !updates.running)
  const unviewed = (updates?.items ?? []).filter((i) => !i.viewed).length
  const badge = await page.evaluate(() => chrome.action.getBadgeText({}))
  check("toolbar badge equals unseen alerts", badge === (unviewed ? String(unviewed) : ""), `badge "${badge}", unseen ${unviewed}`)

  // Saved tab: opening it marks alerts as seen and clears the badge.
  await clickButton(page, "Guardados", false)
  await sleep(1000)
  const cleared = await page.evaluate(() => chrome.action.getBadgeText({}))
  check("badge cleared after opening Guardados", cleared === "")

  // Status + note
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .filter((b) => b.textContent.trim() === "Leído")[0]
      ?.click()
  })
  await sleep(400)
  await clickButton(page, "Añadir nota")
  await sleep(300)
  await page.type("textarea", "Cite in methods; check translation.")
  await page.evaluate(() => document.activeElement.blur())
  await sleep(700)
  const library = await stored()
  check("status saved", library.some((p) => p.status === "read"))
  check("note saved", library.some((p) => p.note.includes("Cite in methods")))

  // Citations: copy in MLA (needs Crossref via host_permissions) and in-text.
  await page.evaluate(() => {
    window.__clip = []
    navigator.clipboard.writeText = async (text) => {
      window.__clip.push(text)
    }
    const select = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.value === "mla")
    )
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, "mla")
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await sleep(300)
  await clickButton(page, "Citar")
  const waitClip = async (n) => {
    const limit = Date.now() + 30000
    while (Date.now() < limit) {
      if ((await page.evaluate(() => window.__clip.length)) >= n) return true
      await sleep(500)
    }
    return false
  }
  check("MLA citation copied", await waitClip(1))
  const [mla] = await page.evaluate(() => window.__clip)
  check("MLA citation looks right", /^.+\. ".+\." .+, https:\/\/doi\.org\/.+\.$/.test(mla ?? ""), (mla ?? "").slice(0, 110))
  await clickButton(page, "En texto")
  check("in-text citation copied", await waitClip(2))
  const inText = (await page.evaluate(() => window.__clip))[1]
  check("in-text citation is (Author)", /^\([^()]+\)$/.test(inText ?? ""), inText)
  const crossrefKeys = await page.evaluate(async () =>
    Object.keys(await chrome.storage.local.get()).filter((k) => k.startsWith("nextpaper_crossref_v1_"))
  )
  check("Crossref lookups were cached", crossrefKeys.length >= 1, crossrefKeys.length + " entries")

  // Exports
  // Exporting looks up Crossref first, so the files appear asynchronously.
  const waitFiles = async (n) => {
    const limit = Date.now() + 60000
    while (Date.now() < limit) {
      if ((await page.evaluate(() => window.__blobs.length)) >= n) return
      await sleep(500)
    }
  }
  await clickButton(page, ".bib")
  await waitFiles(1)
  await clickButton(page, ".ris")
  await waitFiles(2)
  const files = await page.evaluate(async () =>
    Promise.all(window.__blobs.map((blob) => blob.text()))
  )
  const [bib, ris] = files
  check("two files exported", files.length === 2)
  check(".bib has both entries + note", (bib.match(/^@article/gm) || []).length === 2 && bib.includes("note={Cite in methods"))
  check(".ris has both entries + N1 note", (ris.match(/^TY  - /gm) || []).length === 2 && ris.includes("N1  - Cite in methods"))
  check("no whitespace garbage in pages", !/pages=\{\s*\n/.test(bib))

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
