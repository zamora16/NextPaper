// Performance experiment: One large batch request versus parallel smaller chunks: latency and variance.
// Runs against the real Semantic Scholar API using the key in .env.local.
// See docs/PERFORMANCE.md for the results these produced (2026-09-19).
const fs = require("fs")
for (const l of fs.readFileSync(require("path").resolve(__dirname, "../../.env.local"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] = m[2] }
const key = process.env.PLASMO_PUBLIC_S2_API_KEY
const B = "https://api.semanticscholar.org"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(url, body) {
  for (let i = 0; i < 15; i++) {
    const r = await fetch(url, { method: body ? "POST" : "GET", headers: { "x-api-key": key, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (r.status === 200) return r.json()
    if (r.status !== 429) return null
    await sleep(300 + i * 150)
  }
  return null
}

;(async () => {
  const seed = await call(`${B}/graph/v1/paper/ARXIV:1706.03762?fields=title,references.paperId,citations.paperId,citations.citationCount,citations.year`)
  const ids = [...new Set([...seed.references, ...seed.citations].map((x) => x.paperId).filter(Boolean))].slice(0, 300)
  console.log("ids:", ids.length)
  const FIELDS = "title,authors,year,citationCount,url,venue,externalIds,openAccessPdf,abstract,journal,tldr,publicationTypes,influentialCitationCount,embedding.specter_v2"
  const run = async (label, parts) => {
    const size = Math.ceil(ids.length / parts)
    const chunks = Array.from({ length: parts }, (_, i) => ids.slice(i * size, (i + 1) * size))
    const t = Date.now()
    const res = await Promise.all(chunks.map((c) => call(`${B}/graph/v1/paper/batch?fields=${FIELDS}`, { ids: c })))
    const got = res.reduce((n, r) => n + (r?.filter(Boolean).length ?? 0), 0)
    console.log(label.padEnd(24), `${((Date.now() - t) / 1000).toFixed(1)}s`, `${got} papers`)
  }
  for (let round = 1; round <= 3; round++) {
    console.log("round", round)
    await run("1 x 300 ids", 1); await sleep(3000)
    await run("2 x 150 ids (parallel)", 2); await sleep(3000)
    await run("3 x 100 ids (parallel)", 3); await sleep(3000)
  }
})()
