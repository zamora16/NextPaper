// Performance experiment: How much do search/recommendations change the final top-18 versus references+citations only?
// Runs against the real Semantic Scholar API using the key in .env.local.
// See docs/PERFORMANCE.md for the results these produced (2026-09-19).
const fs = require("fs")
for (const l of fs.readFileSync(require("path").resolve(__dirname, "../../.env.local"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] = m[2] }
const key = process.env.PLASMO_PUBLIC_S2_API_KEY
const B = "https://api.semanticscholar.org"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(url, body) {
  for (let i = 0; i < 12; i++) {
    const r = await fetch(url, { method: body ? "POST" : "GET", headers: { "x-api-key": key, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (r.status === 200) return r.json()
    if (r.status !== 429) return null
    await sleep(400 + i * 200)
  }
  return null
}
const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2 } return d / Math.sqrt(x * y) }
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()

function top(candidates, seed, n = 18) {
  const scored = candidates
    .filter((p) => p.embedding?.vector && norm(p.title) !== norm(seed.title))
    .map((p) => ({ p, s: cos(seed.embedding.vector, p.embedding.vector) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
  return scored.sort((a, b) => (b.s + 0.02 * Math.log10(1 + b.p.citationCount)) - (a.s + 0.02 * Math.log10(1 + a.p.citationCount))).slice(0, n).map((x) => x.p.paperId)
}

const SEEDS = [
  ["psychology (BMC)", "DOI:10.1186/s40337-024-01004-0"],
  ["CS (Transformers)", "ARXIV:1706.03762"],
  ["bio/CS (AlphaFold)", "DOI:10.1038/s41586-021-03819-2"],
  ["biology (CRISPR)", "DOI:10.1126/science.1225829"],
  ["biomed (PMID)", "PMID:28129826"]
]

;(async () => {
  for (const [name, ref] of SEEDS) {
    const t0 = Date.now()
    const seed = await call(`${B}/graph/v1/paper/${ref}?fields=title,abstract,year,fieldsOfStudy,embedding.specter_v2,references.paperId,citations.paperId,citations.citationCount,citations.year`)
    if (!seed?.embedding?.vector) { console.log(name.padEnd(22), "seed has no embedding — skipped"); continue }

    const sets = { reference: new Set(), citation: new Set(), search: new Set(), recommended: new Set() }
    seed.references?.forEach((r) => r.paperId && sets.reference.add(r.paperId))
    const citers = (seed.citations ?? []).filter((c) => c.paperId)
    ;[...citers].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0)).slice(0, 60).forEach((c) => sets.citation.add(c.paperId))
    ;[...citers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 40).forEach((c) => sets.citation.add(c.paperId))
    const search = await call(`${B}/graph/v1/paper/search?query=${encodeURIComponent(seed.title)}&limit=30&fields=paperId`)
    search?.data?.forEach((p) => sets.search.add(p.paperId))
    const isCS = seed.fieldsOfStudy?.includes("Computer Science")
    for (const pool of isCS ? ["recent", "all-cs"] : ["recent"]) {
      const r = await call(`${B}/recommendations/v1/papers/forpaper/${seed.paperId}?fields=paperId&from=${pool}&limit=50`)
      r?.recommendedPapers?.forEach((p) => sets.recommended.add(p.paperId))
    }

    const all = new Set(Object.values(sets).flatMap((s) => [...s]))
    all.delete(seed.paperId)
    const light = new Set([...sets.reference, ...sets.citation])
    light.delete(seed.paperId)
    const meta = []
    const ids = [...all]
    for (let i = 0; i < ids.length; i += 500) {
      const b = await call(`${B}/graph/v1/paper/batch?fields=title,citationCount,embedding.specter_v2`, { ids: ids.slice(i, i + 500) })
      meta.push(...(b ?? []).filter(Boolean))
    }
    const byId = new Map(meta.map((p) => [p.paperId, p]))
    const full = top(meta, seed)
    const partial = top(meta.filter((p) => light.has(p.paperId)), seed)
    const shared = full.filter((id) => partial.includes(id)).length
    const onlyFull = full.filter((id) => !partial.includes(id))
    const via = (id) => Object.entries(sets).filter(([, s]) => s.has(id)).map(([k]) => k[0]).join("")
    const top5same = full.slice(0, 5).filter((id) => partial.includes(id)).length
    console.log(
      `${name.padEnd(22)} candidates: refs+cits=${light.size} all=${all.size} | top-18 overlap ${shared}/18, top-5 overlap ${top5same}/5 | extra from search/recs: ${onlyFull.length}` +
        (onlyFull.length ? ` [${onlyFull.map((id) => via(id) + ":" + (byId.get(id)?.citationCount ?? 0) + "c").join(" ")}]` : "") +
        ` (${((Date.now() - t0) / 1000).toFixed(0)}s)`
    )
  }
})()
