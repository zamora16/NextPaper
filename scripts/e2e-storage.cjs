// End-to-end: storage hygiene (compression, pruning, migration, isolation).
//
//   node scripts/e2e-storage.cjs [S2 ref]
//
// Seeds a fresh profile with leftovers from older versions, expired and
// excess cache entries, plus a library and alerts, then runs one analysis and
// checks what was cleaned, what was preserved and how small the result is.
const { launch, waitDone, check, sleep, finish } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"
const FILL = 45 // valid entries seeded; the cap is 40

;(async () => {
  const { browser, extId } = await launch()
  const errors = []
  const page = await browser.newPage()
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)))

  // No ?ref => the popup detects no paper and starts no analysis yet.
  await page.goto(`chrome-extension://${extId}/popup.html`)

  await page.evaluate(
    async (ref, fill) => {
      const big = "x".repeat(56000)
      const items = {
        // leftovers of older versions
        nextpaper_cache_v5_OLD: { result: big, cachedAt: Date.now() },
        nextpaper_cache_v4_OLD: { result: big, cachedAt: Date.now() },
        nextpaper_cache_v6_OLD: { z: big, cachedAt: Date.now() },
        nextpaper_cache_v7_OLD: { z: big, cachedAt: Date.now() },
        nextpaper_emb_v1_PAPER: { v: [0.1, 0.2] },
        nextpaper_rec_v1_REF: { papers: [], cachedAt: Date.now() },
        // job saved by the old code: result embedded, no cache entry
        ["nextpaper_job_" + ref]: { phase: "done", result: { groups: [], picks: [] } },
        nextpaper_job_ORPHAN: { phase: "done" },
        // expired current-version entry
        nextpaper_cache_v8_EXPIRED: { z: "x", cachedAt: 0 },
        // user data that must survive untouched
        nextpaper_library: { P1: { paperId: "P1", title: "Kept paper", savedAt: 1, status: "read", note: "keep me" } },
        nextpaper_updates: { running: false, checkedAt: 5, seen: ["a"], items: [] }
      }
      // more valid entries than the cap allows, newest first
      for (let i = 0; i < fill; i++) {
        items["nextpaper_cache_v8_FILL" + i] = { z: "x", cachedAt: Date.now() - (i + 1) * 1000 }
        items["nextpaper_job_FILL" + i] = { phase: "done" }
      }
      await chrome.storage.local.set(items)
    },
    REF,
    FILL
  )

  // Now analyze for real.
  await page.goto(`chrome-extension://${extId}/popup.html?ref=${encodeURIComponent(REF)}`)
  const started = Date.now()
  await waitDone(page)
  check("popup recovered from an old-format 'done' job and showed results", true, `${((Date.now() - started) / 1000).toFixed(1)}s`)
  await sleep(1500) // pruning runs right after the job is marked done

  const keys = await page.evaluate(async () => Object.keys(await chrome.storage.local.get()))
  const has = (re) => keys.filter((k) => re.test(k))

  check("legacy keys removed", has(/^nextpaper_(cache_v[1-7]|emb_v1|rec_v1)_/).length === 0)
  check("expired cache entry removed", !keys.includes("nextpaper_cache_v8_EXPIRED"))
  const cacheKeys = has(/^nextpaper_cache_v8_/)
  check("cache capped at 40 entries", cacheKeys.length <= 40, `${cacheKeys.length} entries`)
  check("fresh analysis kept in cache", cacheKeys.some((k) => k.endsWith(REF)))
  check("oldest excess entries evicted", !keys.includes("nextpaper_cache_v8_FILL44"))
  check("orphan job removed", !keys.includes("nextpaper_job_ORPHAN"))
  check("job of evicted entry removed", !keys.includes("nextpaper_job_FILL44"))

  // User data untouched
  const data = await page.evaluate(async () => {
    const all = await chrome.storage.local.get(["nextpaper_library", "nextpaper_updates"])
    return all
  })
  check("library untouched", data.nextpaper_library?.P1?.note === "keep me")
  check("alerts state untouched", data.nextpaper_updates?.checkedAt === 5)

  // Size of one analysis
  const sizes = await page.evaluate(async (ref) => {
    const all = await chrome.storage.local.get([`nextpaper_cache_v8_${ref}`, `nextpaper_job_${ref}`])
    const size = (v) => new Blob([JSON.stringify(v)]).size
    return { cache: size(all[`nextpaper_cache_v8_${ref}`]), job: size(all[`nextpaper_job_${ref}`]) }
  }, REF)
  const total = sizes.cache + sizes.job
  check("one analysis is now small", total < 30000, `${total} bytes (was ~111,500)`)
  console.log(`      cache ${sizes.cache} B + job ${sizes.job} B; ~${Math.floor(10485760 / total)} analyses per 10 MB (vs ~93 before)`)

  // Results are read from the cache (decompressed) on a fresh popup load.
  const reload = Date.now()
  await page.goto(`chrome-extension://${extId}/popup.html?ref=${encodeURIComponent(REF)}`)
  await waitDone(page, 20000)
  check("reopening shows results from compressed cache quickly", Date.now() - reload < 8000, `${Date.now() - reload}ms`)

  await browser.close()
  finish(errors)
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
