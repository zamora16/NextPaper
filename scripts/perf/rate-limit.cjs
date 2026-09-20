// Performance experiment: How often does the API answer 429 at different request paces and concurrency?
// Runs against the real Semantic Scholar API using the key in .env.local.
// See docs/PERFORMANCE.md for the results these produced (2026-09-19).
const fs = require("fs")
for (const l of fs.readFileSync(require("path").resolve(__dirname, "../../.env.local"), "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) process.env[m[1]] = m[2] }
const h = { "x-api-key": process.env.PLASMO_PUBLIC_S2_API_KEY }
const URL = "https://api.semanticscholar.org/graph/v1/paper/ARXIV:1706.03762?fields=title"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const hit = async () => (await fetch(URL, { headers: h })).status

async function sequential(spacing, n) {
  const codes = []
  for (let i = 0; i < n; i++) {
    codes.push(await hit())
    await sleep(spacing)
  }
  return codes
}
async function parallel(size, groups, gap) {
  const codes = []
  for (let g = 0; g < groups; g++) {
    codes.push(...(await Promise.all(Array.from({ length: size }, hit))))
    await sleep(gap)
  }
  return codes
}
const show = (label, codes) =>
  console.log(label.padEnd(34), `${codes.filter((c) => c === 200).length}/${codes.length} ok`, codes.map((c) => (c === 200 ? "." : "X")).join(""))

;(async () => {
  console.log("legend: . = 200, X = 429 (cooldown 40s between conditions)\n")
  show("sequential, 1.5 s apart", await sequential(1500, 20)); await sleep(40000)
  show("sequential, 1.0 s apart", await sequential(1000, 20)); await sleep(40000)
  show("sequential, 0.6 s apart", await sequential(600, 20)); await sleep(40000)
  show("parallel 3 every 2 s", await parallel(3, 7, 2000)); await sleep(40000)
  show("burst of 12 at once", await parallel(12, 1, 0)); await sleep(40000)
  show("sequential, 2.5 s apart", await sequential(2500, 14))
})()
