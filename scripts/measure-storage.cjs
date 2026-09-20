// Prints how much chrome.storage.local space one analysis uses, per key kind.
//
//   node scripts/measure-storage.cjs [S2 ref]
//
// Handy to see the cost of an analysis (≈15 KB after compression; it was ≈112 KB
// before). For the pruning/migration behavior use scripts/e2e-storage.cjs.
const { launch, openPopup, waitDone } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"

;(async () => {
  const { browser, extId } = await launch()
  const { page } = await openPopup(browser, extId, REF)
  await waitDone(page)

  const usage = await page.evaluate(async () => {
    const all = await chrome.storage.local.get(null)
    const bytes = (value) => new Blob([JSON.stringify(value)]).size
    const rows = Object.entries(all).map(([key, value]) => ({
      kind: key.replace(/_[^_]*$/, "_*").replace(/(nextpaper_[a-z]+(_v\d+)?_).*/, "$1*"),
      bytes: bytes(value)
    }))
    const byKind = {}
    for (const row of rows) byKind[row.kind] = (byKind[row.kind] ?? 0) + row.bytes
    return { byKind, total: await chrome.storage.local.getBytesInUse(null), quota: chrome.storage.local.QUOTA_BYTES }
  })

  console.log("bytes per key kind:", usage.byKind)
  console.log(`total in use: ${usage.total} bytes of quota ${usage.quota}`)
  console.log(`=> roughly ${Math.floor(usage.quota / usage.total)} analyses fit before the quota is hit`)
  await browser.close()
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
