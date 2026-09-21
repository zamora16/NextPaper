// What NextPaper reads from each API, as checks. Every function returns the
// list of problems found (empty = the answer is what the extension expects).
//
// Two users of the same definitions, so the offline test server can never drift
// away from reality without a test failing:
//   - scripts/api-contract.cjs (nightly) checks the REAL APIs against them;
//   - tests/api-contract.test.ts checks the fixture server's answers against them.
//
// Only what lib/ actually uses is checked. Extra fields are fine; a missing or
// retyped one is the kind of silent change that would break users first.

const isString = (v) => typeof v === "string"
const isNumber = (v) => typeof v === "number" && Number.isFinite(v)
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v)
const orNull = (test) => (v) => v === null || v === undefined || test(v)

function check(problems, path, ok, expected, actual) {
  if (!ok) {
    const shown = JSON.stringify(actual)
    problems.push(`${path}: expected ${expected}, got ${shown === undefined ? "undefined" : shown.slice(0, 60)}`)
  }
  return ok
}

// A vector of numbers, as SPECTER2 returns it (768 of them).
function checkVector(problems, path, embedding, { required }) {
  if (embedding === null || embedding === undefined) {
    if (required) problems.push(`${path}: expected an embedding, got ${embedding}`)
    return
  }
  const vector = embedding.vector
  if (!check(problems, `${path}.vector`, Array.isArray(vector) && vector.length > 0, "a non-empty array", vector)) return
  check(problems, `${path}.vector[0]`, isNumber(vector[0]), "a number", vector[0])
  check(problems, `${path}.vector.length`, vector.length === 768, "768 dimensions", vector.length)
}

// GET /graph/v1/paper/{id}?fields=title,abstract,year,authors.name,fieldsOfStudy,
// embedding.specter_v2,references.paperId,citations.paperId,citations.citationCount,citations.year
function seed(data, { requireEmbedding = false } = {}) {
  const problems = []
  if (!check(problems, "seed", isObject(data), "an object", data)) return problems
  check(problems, "seed.paperId", isString(data.paperId) && data.paperId.length > 0, "a string", data.paperId)
  check(problems, "seed.title", isString(data.title), "a string", data.title)
  check(problems, "seed.abstract", orNull(isString)(data.abstract), "a string or null", data.abstract)
  check(problems, "seed.year", orNull(isNumber)(data.year), "a number or null", data.year)
  check(
    problems,
    "seed.authors",
    Array.isArray(data.authors) && data.authors.every((a) => isObject(a) && orNull(isString)(a.name)),
    "an array of {name}",
    data.authors
  )
  check(
    problems,
    "seed.fieldsOfStudy",
    orNull((v) => Array.isArray(v) && v.every(isString))(data.fieldsOfStudy),
    "an array of strings or null",
    data.fieldsOfStudy
  )
  checkVector(problems, "seed.embedding", data.embedding, { required: requireEmbedding })
  // "data": null shows up for publisher-restricted lists (CONTRIBUTING rule 3):
  // the client guards it, so both an array and null are acceptable.
  for (const list of ["references", "citations"]) {
    const items = data[list]
    if (!check(problems, `seed.${list}`, items === null || items === undefined || Array.isArray(items), "an array or null", items)) continue
    ;(items ?? []).slice(0, 50).forEach((item, i) => {
      check(problems, `seed.${list}[${i}]`, isObject(item), "an object", item)
      if (isObject(item)) check(problems, `seed.${list}[${i}].paperId`, orNull(isString)(item.paperId), "a string or null", item.paperId)
      if (list === "citations" && isObject(item)) {
        check(problems, `seed.citations[${i}].citationCount`, orNull(isNumber)(item.citationCount), "a number or null", item.citationCount)
        check(problems, `seed.citations[${i}].year`, orNull(isNumber)(item.year), "a number or null", item.year)
      }
    })
  }
  return problems
}

// One entry of POST /graph/v1/paper/batch?fields=title,authors,year,citationCount,url,venue,
// externalIds,openAccessPdf,abstract,journal,tldr,publicationTypes,influentialCitationCount[,embedding.specter_v2]
function paper(entry, path = "paper", { requireEmbedding = false } = {}) {
  const problems = []
  if (!check(problems, path, isObject(entry), "an object", entry)) return problems
  check(problems, `${path}.paperId`, isString(entry.paperId) && entry.paperId.length > 0, "a string", entry.paperId)
  check(problems, `${path}.title`, isString(entry.title), "a string", entry.title)
  check(
    problems,
    `${path}.authors`,
    Array.isArray(entry.authors) && entry.authors.every((a) => isObject(a) && isString(a.name)),
    "an array of {name}",
    entry.authors
  )
  check(problems, `${path}.year`, orNull(isNumber)(entry.year), "a number or null", entry.year)
  check(problems, `${path}.citationCount`, isNumber(entry.citationCount), "a number", entry.citationCount)
  check(problems, `${path}.venue`, orNull(isString)(entry.venue), "a string", entry.venue)
  check(problems, `${path}.url`, isString(entry.url), "a string", entry.url)
  check(
    problems,
    `${path}.externalIds`,
    orNull((v) => isObject(v) && orNull(isString)(v.DOI))(entry.externalIds),
    "an object with an optional DOI",
    entry.externalIds
  )
  check(
    problems,
    `${path}.openAccessPdf`,
    orNull((v) => isObject(v) && isString(v.url))(entry.openAccessPdf),
    "null or {url}",
    entry.openAccessPdf
  )
  check(problems, `${path}.abstract`, orNull(isString)(entry.abstract), "a string or null", entry.abstract)
  check(
    problems,
    `${path}.journal`,
    orNull((v) => isObject(v) && orNull(isString)(v.name) && orNull(isString)(v.volume) && orNull(isString)(v.pages))(entry.journal),
    "null or {name, volume, pages}",
    entry.journal
  )
  check(
    problems,
    `${path}.tldr`,
    orNull((v) => isObject(v) && orNull(isString)(v.text))(entry.tldr),
    "null or {text}",
    entry.tldr
  )
  check(
    problems,
    `${path}.publicationTypes`,
    orNull((v) => Array.isArray(v) && v.every(isString))(entry.publicationTypes),
    "an array of strings or null",
    entry.publicationTypes
  )
  check(
    problems,
    `${path}.influentialCitationCount`,
    orNull(isNumber)(entry.influentialCitationCount),
    "a number or null",
    entry.influentialCitationCount
  )
  checkVector(problems, `${path}.embedding`, entry.embedding, { required: requireEmbedding })
  return problems
}

// POST /graph/v1/paper/batch: one entry per id, null for unknown ones.
function batch(data, { requireEmbedding = false } = {}) {
  const problems = []
  if (!check(problems, "batch", Array.isArray(data), "an array", data)) return problems
  data.slice(0, 20).forEach((entry, i) => {
    if (entry !== null) problems.push(...paper(entry, `batch[${i}]`, { requireEmbedding }))
  })
  return problems
}

// GET /recommendations/v1/papers/forpaper/{id}?fields=paperId&from=recent&limit=50
function recommendations(data) {
  const problems = []
  if (!check(problems, "recommendations", isObject(data), "an object", data)) return problems
  const list = data.recommendedPapers
  if (!check(problems, "recommendations.recommendedPapers", Array.isArray(list), "an array", list)) return problems
  list.slice(0, 20).forEach((p, i) => check(problems, `recommendations[${i}].paperId`, isObject(p) && isString(p.paperId), "a string", p && p.paperId))
  return problems
}

// GET /graph/v1/paper/search?query=...&limit=...&fields=paperId
function search(data) {
  const problems = []
  if (!check(problems, "search", isObject(data), "an object", data)) return problems
  const list = data.data
  if (!check(problems, "search.data", Array.isArray(list), "an array", list)) return problems
  list.slice(0, 20).forEach((p, i) => check(problems, `search.data[${i}].paperId`, isObject(p) && isString(p.paperId), "a string", p && p.paperId))
  return problems
}

// GET https://api.crossref.org/works/{doi}
function crossref(data) {
  const problems = []
  if (!check(problems, "crossref", isObject(data) && isObject(data.message), "an object with a message", data)) return problems
  const m = data.message
  check(problems, "crossref.message.title", orNull((v) => Array.isArray(v) && v.every(isString))(m.title), "an array of strings", m.title)
  check(
    problems,
    "crossref.message.author",
    orNull((v) => Array.isArray(v) && v.every((a) => isObject(a) && orNull(isString)(a.given) && orNull(isString)(a.family) && orNull(isString)(a.name)))(m.author),
    "an array of {given, family, name}",
    m.author
  )
  check(problems, "crossref.message.container-title", orNull((v) => Array.isArray(v) && v.every(isString))(m["container-title"]), "an array of strings", m["container-title"])
  check(
    problems,
    "crossref.message.issued",
    orNull((v) => isObject(v) && Array.isArray(v["date-parts"]) && Array.isArray(v["date-parts"][0]))(m.issued),
    "{date-parts: [[y, m, d]]}",
    m.issued
  )
  for (const field of ["volume", "issue", "page", "article-number", "type", "publisher"]) {
    check(problems, `crossref.message.${field}`, orNull(isString)(m[field]), "a string", m[field])
  }
  return problems
}

// GET https://api.unpaywall.org/v2/{doi}?email=...
function unpaywall(data) {
  const problems = []
  if (!check(problems, "unpaywall", isObject(data), "an object", data)) return problems
  check(problems, "unpaywall.is_oa", typeof data.is_oa === "boolean", "a boolean", data.is_oa)
  const locations = [data.best_oa_location, ...(data.oa_locations ?? [])]
  check(problems, "unpaywall.oa_locations", orNull(Array.isArray)(data.oa_locations), "an array or null", data.oa_locations)
  locations.forEach((location, i) => {
    if (location === null || location === undefined) return
    check(problems, `unpaywall.location[${i}]`, isObject(location), "an object", location)
    if (isObject(location)) {
      check(problems, `unpaywall.location[${i}].url_for_pdf`, orNull(isString)(location.url_for_pdf), "a string or null", location.url_for_pdf)
      check(problems, `unpaywall.location[${i}].url`, orNull(isString)(location.url), "a string or null", location.url)
    }
  })
  return problems
}

module.exports = { seed, paper, batch, recommendations, search, crossref, unpaywall }
