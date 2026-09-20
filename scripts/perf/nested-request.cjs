// Performance experiment: Does ONE request return the paper + references + citations? How fast, how big?
// Runs against the real Semantic Scholar API using the key in .env.local.
// See docs/PERFORMANCE.md for the results these produced (2026-09-19).
const fs = require("fs")
for (const l of fs.readFileSync(require("path").resolve(__dirname, "../../.env.local"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] = m[2] }
const h = { "x-api-key": process.env.PLASMO_PUBLIC_S2_API_KEY }
const B = "https://api.semanticscholar.org"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(label, url) {
  for (let i = 0; i < 8; i++) {
    const t = Date.now()
    const r = await fetch(url, { headers: h })
    const ms = Date.now() - t
    if (r.status === 429) { await sleep(2000); continue }
    const text = await r.text()
    let info = ""
    try {
      const j = JSON.parse(text)
      info = `refs=${j.references?.length ?? "-"} cits=${j.citations?.length ?? "-"} emb=${!!j.embedding?.vector}`
      if (j.error) info = JSON.stringify(j).slice(0, 120)
    } catch { info = text.slice(0, 100) }
    console.log(label.padEnd(30), r.status, `${ms}ms`.padEnd(8), `${(text.length / 1024).toFixed(0)}KB`.padEnd(7), info)
    return
  }
  console.log(label, "gave up (429)")
}

;(async () => {
  const f = "title,abstract,year,fieldsOfStudy,embedding.specter_v2"
  for (const [name, id] of [["user paper (BMC)", "DOI:10.1186/s40337-024-01004-0"], ["Transformers (150k cits)", "ARXIV:1706.03762"]]) {
    console.log("\n==", name)
    await get("seed only (current)", `${B}/graph/v1/paper/${id}?fields=${f}`)
    await sleep(1600)
    await get("seed+refs+cits nested", `${B}/graph/v1/paper/${id}?fields=${f},references.paperId,citations.paperId,citations.citationCount,citations.year`)
    await sleep(1600)
    await get("cits standalone (current)", `${B}/graph/v1/paper/${id}/citations?fields=citingPaper.paperId,citingPaper.citationCount,citingPaper.year&limit=500`)
    await sleep(1600)
  }
})()
