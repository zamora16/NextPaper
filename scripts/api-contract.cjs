// Nightly check of the APIs NextPaper depends on.
//
//   S2_API_KEY=... node scripts/api-contract.cjs      (the key is optional)
//
// It makes a handful of real requests, spelled like the extension's own, and
// checks that the answers still have the shape lib/ reads (shapes.cjs). If
// Semantic Scholar, Crossref or Unpaywall rename or retype a field, this fails
// before users notice. CI runs it every night (.github/workflows/api-contract.yml).
//
// Three outcomes per check: PASS, FAIL (the API changed: exit code 1) and WARN
// (the service kept answering 429/5xx or timed out, which says nothing about the
// contract). It also exits 1 if nothing at all could be verified.
const shapes = require("./api-contract/shapes.cjs")
const { S2, CROSSREF, UNPAYWALL, SEED_FIELDS, PAPER_FIELDS, EMBEDDING } = require("./api-contract/requests.cjs")

const KEY = (process.env.S2_API_KEY || "").trim()
// A paper the extension itself uses to check keys: stable, open access, with
// references and citations.
const SEED_DOI = "10.1186/s40337-024-01004-0"
const CONTACT = "angelzamora1616@gmail.com"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class Inconclusive extends Error {}

// One request, retried when the service says "not now" (429, 5xx, network).
async function call(url, init = {}, attempts = 6) {
  let last = "no answer"
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
      if (response.status !== 429 && response.status < 500) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error.name === "TimeoutError" ? "timeout" : error.message
    }
    await sleep(1000 * 2 ** attempt)
  }
  throw new Inconclusive(last)
}

const s2Headers = (extra = {}) => ({ ...(KEY ? { "x-api-key": KEY } : {}), ...extra })
const json = async (response) => {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

const results = []
async function run(name, fn) {
  try {
    const problems = await fn()
    const list = Array.isArray(problems) ? problems : []
    results.push({ name, status: list.length ? "FAIL" : "PASS", detail: list.slice(0, 4).join("; ") })
  } catch (error) {
    results.push(
      error instanceof Inconclusive
        ? { name, status: "WARN", detail: `${error.message} after retries` }
        : { name, status: "FAIL", detail: error.message }
    )
  }
  const r = results[results.length - 1]
  console.log(`${r.status}  ${name}${r.detail ? "  (" + r.detail + ")" : ""}`)
}

const expectStatus = (response, allowed, what) =>
  allowed.includes(response.status) ? [] : [`${what}: expected HTTP ${allowed.join(" or ")}, got ${response.status}`]

;(async () => {
  console.log(`API contract check, ${KEY ? "with" : "without"} a Semantic Scholar key\n`)
  let seedData = null

  await run("Semantic Scholar: the seed request (paper, embedding, references, citations)", async () => {
    const response = await call(`${S2}/graph/v1/paper/DOI:${SEED_DOI}?fields=${SEED_FIELDS}`, { headers: s2Headers() })
    const bad = expectStatus(response, [200], "seed")
    if (bad.length) return bad
    seedData = await response.json()
    const problems = shapes.seed(seedData, { requireEmbedding: true })
    if (!(seedData.references ?? []).length) problems.push("seed.references: expected some references, got none")
    return problems
  })

  await run("Semantic Scholar: an unknown paper answers 404", async () => {
    const response = await call(`${S2}/graph/v1/paper/DOI:10.9999/nextpaper-does-not-exist?fields=title`, { headers: s2Headers() })
    return expectStatus(response, [404], "unknown paper")
  })

  await run("Semantic Scholar: a wrong API key is refused (401 or 403)", async () => {
    const response = await call(`${S2}/graph/v1/paper/DOI:${SEED_DOI}?fields=title`, {
      headers: { "x-api-key": "nextpaper-contract-check-not-a-key" }
    })
    return expectStatus(response, [401, 403], "wrong key")
  })

  await run("Semantic Scholar: batch metadata + embeddings, aligned, null for unknown ids", async () => {
    const ids = ((seedData && seedData.references) || []).map((r) => r.paperId).filter(Boolean).slice(0, 30)
    if (!ids.length) throw new Inconclusive("no reference ids to ask about (the seed request did not verify)")
    const asked = [...ids, `DOI:10.9999/nextpaper-does-not-exist`]
    const response = await call(`${S2}/graph/v1/paper/batch?fields=${PAPER_FIELDS},${EMBEDDING}`, {
      method: "POST",
      headers: s2Headers({ "content-type": "application/json" }),
      body: JSON.stringify({ ids: asked })
    })
    const bad = expectStatus(response, [200], "batch")
    if (bad.length) return bad
    const data = await response.json()
    const problems = shapes.batch(data)
    if (Array.isArray(data)) {
      if (data.length !== asked.length) problems.push(`batch: expected ${asked.length} entries (one per id), got ${data.length}`)
      if (data[asked.length - 1] !== null) problems.push("batch: an unknown id should give null in its place")
      if (!data.some((p) => p && p.embedding && p.embedding.vector)) problems.push("batch: no entry has an embedding")
    }
    return problems
  })

  await run("Semantic Scholar: recommendations (ids only)", async () => {
    const id = (seedData && seedData.paperId) || `DOI:${SEED_DOI}`
    const response = await call(`${S2}/recommendations/v1/papers/forpaper/${id}?fields=paperId&from=recent&limit=50`, { headers: s2Headers() })
    const bad = expectStatus(response, [200], "recommendations")
    return bad.length ? bad : shapes.recommendations(await response.json())
  })

  await run("Semantic Scholar: title search (ids only)", async () => {
    const title = (seedData && seedData.title) || "functionality appreciation scale"
    const response = await call(`${S2}/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=30&fields=paperId`, { headers: s2Headers() })
    const bad = expectStatus(response, [200], "search")
    return bad.length ? bad : shapes.search(await response.json())
  })

  await run("Crossref: a DOI gives the fields citations are built from", async () => {
    const response = await call(`${CROSSREF}/works/${encodeURIComponent(SEED_DOI)}`)
    const bad = expectStatus(response, [200], "crossref")
    return bad.length ? bad : shapes.crossref(await response.json())
  })

  await run("Crossref: an arXiv (DataCite) DOI answers 404, which the formatter relies on", async () => {
    const response = await call(`${CROSSREF}/works/${encodeURIComponent("10.48550/arXiv.1706.03762")}`)
    return expectStatus(response, [404], "arXiv DOI")
  })

  await run("Unpaywall: an open-access DOI gives a free location", async () => {
    const response = await call(`${UNPAYWALL}/v2/${encodeURIComponent(SEED_DOI)}?email=${encodeURIComponent(CONTACT)}`)
    const bad = expectStatus(response, [200], "unpaywall")
    if (bad.length) return bad
    const data = await json(response)
    const problems = shapes.unpaywall(data)
    if (data && data.is_oa !== true) problems.push("unpaywall.is_oa: this open-access article should be open access")
    const locations = data ? [data.best_oa_location, ...(data.oa_locations || [])] : []
    if (data && !locations.some((l) => l && typeof l.url_for_pdf === "string")) problems.push("unpaywall: this open-access article should have a location with url_for_pdf (the Find PDF button reads it)")
    return problems
  })

  await run("Unpaywall: a DOI it does not know answers 404 (or 422)", async () => {
    const response = await call(`${UNPAYWALL}/v2/${encodeURIComponent("10.9999/nextpaper-does-not-exist")}?email=${encodeURIComponent(CONTACT)}`)
    return expectStatus(response, [404, 422], "unknown DOI")
  })

  const count = (status) => results.filter((r) => r.status === status).length
  console.log(`\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("WARN")} inconclusive`)
  if (count("FAIL")) {
    console.log("\nAn API no longer answers the way lib/ expects. Fix lib/ (or the shape in scripts/api-contract/shapes.cjs if the change is harmless) before users hit it.")
    process.exit(1)
  }
  if (count("PASS") === 0) {
    console.log("\nNothing could be verified: the services were unreachable or rate limiting every request.")
    process.exit(1)
  }
  if (count("WARN")) console.log("Inconclusive checks are usually rate limiting; they are not treated as a failure.")
})()
