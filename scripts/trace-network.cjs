// Timeline of every request the background worker makes during one cold
// analysis: when it starts, how long it takes, its status, and its size.
//
//   node scripts/trace-network.cjs [S2 ref]
//
// Use it before and after any performance change. It also prints the summary
// that matters: total time, number of requests, 429 count and time spent
// waiting (throttle + backoff) versus time spent in requests.
const { launch, openPopup, waitDone } = require("./e2e-lib.cjs")

const REF = process.argv[2] || "DOI:10.1186/s40337-024-01004-0"

;(async () => {
  const { browser, extId } = await launch()

  const worker = await browser.waitForTarget((t) => t.type() === "service_worker")
  const cdp = await worker.createCDPSession()
  await cdp.send("Network.enable")

  const t0 = Date.now()
  const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
  const requests = new Map()
  const rows = []

  cdp.on("Network.requestWillBeSent", (e) => {
    requests.set(e.requestId, { start: Date.now(), url: e.request.url, method: e.request.method })
  })
  cdp.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId)
    if (r) r.status = e.response.status
  })
  cdp.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId)
    if (!r) return
    r.end = Date.now()
    r.bytes = e.encodedDataLength
    rows.push(r)
  })

  const { page } = await openPopup(browser, extId, REF)
  await waitDone(page)
  const total = Date.now() - t0
  await new Promise((r) => setTimeout(r, 500))

  const short = (u) =>
    u
      .replace("https://api.semanticscholar.org", "")
      .replace(/\?.*/, "")
      .replace(/[0-9a-f]{40}/, "{id}")
      .slice(0, 52)

  console.log("start  took   status  KB      request")
  let inRequests = 0
  for (const r of rows.sort((a, b) => a.start - b.start)) {
    const took = r.end - r.start
    inRequests += took
    console.log(
      `${((r.start - t0) / 1000).toFixed(1).padStart(5)}s ${String(took).padStart(5)}ms ${String(r.status).padStart(6)} ${(r.bytes / 1024).toFixed(0).padStart(6)}  ${r.method} ${short(r.url)}`
    )
  }

  const blocked = rows.filter((r) => r.status === 429).length
  console.log(
    `\nTOTAL ${(total / 1000).toFixed(1)}s | ${rows.length} requests (${blocked} were 429) | ` +
      `${(inRequests / 1000).toFixed(1)}s inside requests, ` +
      `${((total - inRequests) / 1000).toFixed(1)}s waiting (throttle + backoff + popup start)`
  )
  // A speed change must not cost relevance: show what the user would see.
  const top = await page.evaluate(() =>
    [...document.querySelectorAll("a.line-clamp-2")].slice(0, 6).map((a) => a.textContent)
  )
  console.log("first cards:")
  top.forEach((title) => console.log("  - " + title.slice(0, 90)))
  await browser.close()
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message)
  process.exit(1)
})
