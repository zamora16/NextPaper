// A small, deterministic imitation of the three APIs NextPaper talks to
// (Semantic Scholar, Crossref, Unpaywall), so the real-browser tests can run
// with no network and no API key, in CI.
//
// It is not a recording: it is a tiny synthetic literature (three subtopics
// about body image, plus unrelated noise) whose answers have exactly the shape
// of the real ones. tests/api-contract.test.ts checks every answer against the
// same definitions the nightly job uses on the real APIs (scripts/api-contract),
// so the imitation cannot drift from reality unnoticed.
//
// `handle` is a pure function of the request; `createServer` only wraps it in
// HTTP. Requests arrive under /s2, /crossref and /unpaywall (the offline build
// rewrites the API origins to this server, see prepare-build.cjs).
const http = require("node:http")

const DIM = 768
// Shaped like a real key (the extension refuses anything else, settings.ts).
const API_KEY = "fixture-key-nextpaper-e2e-0001"

// ---- the literature -------------------------------------------------------

// Deterministic pseudo-random numbers (mulberry32).
function rng(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Every vector shares a large common part (as SPECTER2 vectors do: all cosines
// are high) plus a direction per topic and a little noise.
function vector(direction, random, jitter = 0.18) {
  const v = new Array(DIM).fill(0)
  v[20] = 5
  for (const [dim, weight] of direction) v[dim] += weight
  for (let d = 0; d < 16; d++) v[100 + d] += (random() - 0.5) * jitter * 2
  return v.map((x) => Math.round(x * 1e4) / 1e4)
}

const TOPICS = [
  {
    name: "social media",
    direction: [[0, 1.6], [1, 1.2]],
    titles: [
      "Social media use and body dissatisfaction in adolescent girls",
      "Instagram exposure and appearance comparison among young women",
      "Social media appearance pressure and disordered eating symptoms",
      "Selfie posting on social media and body image concerns",
      "Social media influencers and body appreciation in teenagers",
      "A longitudinal study of social media and body image in adolescence",
      "Photo editing on social media and self-objectification",
      "Social media literacy program to protect body image: a randomized trial"
    ]
  },
  {
    name: "eating disorders",
    direction: [[4, 1.5], [5, 1.1]],
    titles: [
      "Cognitive behavioural therapy for eating disorders: a meta-analysis",
      "Family-based treatment of eating disorders in adolescents",
      "Prevalence of eating disorders in university students: a systematic review",
      "Risk factors for eating disorders in early adolescence",
      "Eating disorders and quality of life: a cohort study",
      "Early intervention for eating disorders in primary care",
      "Relapse prevention in eating disorders after inpatient treatment",
      "Online interventions for eating disorders: a randomised controlled trial"
    ]
  },
  {
    name: "scale validation",
    direction: [[8, 1.5], [9, 1.1]],
    titles: [
      "Psychometric properties of the Body Appreciation Scale in Spanish adults",
      "Validation of a short body image scale for adolescents",
      "Factor structure and reliability of a body satisfaction questionnaire",
      "Measurement invariance of the body image scale across gender",
      "Development and validation of the appearance comparison scale",
      "Cross-cultural validation of the body appreciation scale",
      "Psychometric evaluation of a functionality appreciation scale",
      "Item response analysis of a body image questionnaire"
    ]
  },
  {
    name: "noise",
    direction: [[12, 2.4], [13, 1.6]],
    titles: [
      "Volcanic ash dispersion modelling in the lower stratosphere",
      "Soil carbon sequestration under conservation tillage",
      "A polymer electrolyte for solid-state lithium batteries",
      "Migration routes of Arctic terns tracked with geolocators",
      "Turbulence closure models for offshore wind farms",
      "Sediment transport in braided gravel rivers"
    ]
  }
]

// What an abstract says decides the study-design chips, so a few carry a
// design the extension recognises and the rest say nothing checkable.
const ABSTRACTS = [
  "In this cross-sectional survey of 245 participants aged 13 to 18 we examined the association between daily use and body dissatisfaction.",
  "We conducted a randomized controlled trial and found a small reduction in symptoms after eight weeks.",
  "This systematic review and meta-analysis pooled evidence from 24 studies and found a moderate effect.",
  "The work discusses how these constructs relate to each other and outlines directions for future research.",
  null
]

const FIELD_OF_STUDY = ["Psychology", "Medicine"]

function buildWorld() {
  const random = rng(20260921)
  const papers = []
  const byId = new Map()
  let n = 0

  TOPICS.forEach((topic, t) => {
    topic.titles.forEach((title, i) => {
      n++
      const paper = {
        paperId: `p${String(n).padStart(3, "0")}${"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8".slice(0, 34)}`,
        topic: t,
        title,
        year: 2012 + ((n * 7) % 13),
        citationCount: 20 + ((n * 137) % 900),
        influential: (n * 3) % 40,
        authors: [
          { authorId: `${1000 + n}`, name: `Alex Reyes${n}` },
          { authorId: `${2000 + n}`, name: `Sam Okafor${n}` },
          { authorId: `${3000 + n}`, name: `Robin Lindqvist${n}` },
          { authorId: `${4000 + n}`, name: `Jo Marchetti${n}` }
        ],
        venue: ["Body Image", "Journal of Adolescence", "Eating Behaviors", "Psychological Assessment"][n % 4],
        doi: `10.1000/nextpaper.${n}`,
        abstract: ABSTRACTS[n % ABSTRACTS.length],
        tldr: n % 3 === 0 ? null : `Finds that ${title.charAt(0).toLowerCase() + title.slice(1)}.`,
        // a third have a PDF Semantic Scholar knows; the others can ask Unpaywall
        openAccessPdf: n % 3 === 1 ? { url: `https://repo.example.org/pdf/${n}.pdf` } : null,
        embedding: vector(topic.direction, random),
        publicationTypes: t === 1 && i === 0 ? ["Review", "JournalArticle"] : ["JournalArticle"],
        journal: { name: "Body Image", volume: String(10 + (n % 10)), pages: `${n}-${n + 9}` }
      }
      papers.push(paper)
      byId.set(paper.paperId, paper)
    })
  })

  // The open paper: mostly social media, with a measurement flavour.
  const seed = {
    paperId: "5eed000000000000000000000000000000000001",
    topic: 0,
    title: "Body image and social media use in adolescents: a cross-sectional survey",
    year: 2023,
    citationCount: 4,
    influential: 0,
    authors: [
      { authorId: "9001", name: "Ana Torres" },
      { authorId: "9002", name: "Luis Prieto" },
      { authorId: "9003", name: "Marta Vidal" },
      { authorId: "9004", name: "Iker Sola" },
      { authorId: "9005", name: "Nora Beltran" }
    ],
    venue: "Body Image",
    doi: "10.1000/nextpaper.seed",
    abstract: "We surveyed 312 adolescents about social media use and body image.",
    tldr: null,
    openAccessPdf: null,
    embedding: vector([[0, 1.6], [1, 1.2], [4, 0.3], [8, 0.3]], random, 0.05),
    publicationTypes: ["JournalArticle"],
    journal: { name: "Body Image", volume: "50", pages: "1-10" }
  }
  papers.push(seed)
  byId.set(seed.paperId, seed)

  const inTopic = (t) => papers.filter((p) => p.topic === t && p !== seed)

  // What each paper cites and what cites it: the same subtopic mostly, with a
  // few from the neighbouring ones.
  const links = (paper) => {
    const same = inTopic(paper.topic).filter((p) => p !== paper)
    if (paper === seed) {
      return {
        references: [...inTopic(2), ...inTopic(1).slice(0, 3)],
        citations: [...inTopic(0), ...inTopic(1).slice(3, 6)],
        recommended: [...inTopic(0).slice(2, 7), ...inTopic(3)]
      }
    }
    const next = inTopic((paper.topic + 1) % 3).slice(0, 2)
    return {
      references: [...same.slice(0, 5), ...next],
      citations: same.slice(3, 8),
      recommended: same.slice(0, 4)
    }
  }

  const byDoi = new Map(papers.map((p) => [p.doi.toLowerCase(), p]))
  return { papers, byId, byDoi, seed, links }
}

// ---- answers with the shape of the real APIs -----------------------------

const wordsOf = (text) => new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? []))

function resolve(world, id) {
  const decoded = decodeURIComponent(id)
  if (/^DOI:/i.test(decoded)) return world.byDoi.get(decoded.slice(4).toLowerCase())
  return world.byId.get(decoded)
}

function seedAnswer(paper, fields, world) {
  const wanted = new Set(fields.split(","))
  const out = { paperId: paper.paperId }
  if (wanted.has("title")) out.title = paper.title
  if (wanted.has("abstract")) out.abstract = paper.abstract
  if (wanted.has("year")) out.year = paper.year
  if (wanted.has("authors.name")) out.authors = paper.authors.map((a) => ({ authorId: a.authorId, name: a.name }))
  if (wanted.has("fieldsOfStudy")) out.fieldsOfStudy = FIELD_OF_STUDY
  if (wanted.has("embedding.specter_v2")) out.embedding = { model: "specter_v2", vector: paper.embedding }
  const { references, citations } = world.links(paper)
  if (wanted.has("references.paperId")) out.references = references.map((p) => ({ paperId: p.paperId }))
  if (wanted.has("citations.paperId")) {
    out.citations = citations.map((p) => ({
      paperId: p.paperId,
      ...(wanted.has("citations.citationCount") ? { citationCount: p.citationCount } : {}),
      ...(wanted.has("citations.year") ? { year: p.year } : {})
    }))
  }
  return out
}

function metadata(paper, fields) {
  const wanted = new Set(fields.split(","))
  const out = {
    paperId: paper.paperId,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    citationCount: paper.citationCount,
    venue: paper.venue,
    url: `https://www.semanticscholar.org/paper/${paper.paperId}`,
    externalIds: { DOI: paper.doi },
    openAccessPdf: paper.openAccessPdf,
    abstract: paper.abstract,
    journal: paper.journal,
    tldr: paper.tldr ? { model: "tldr@v2.0.0", text: paper.tldr } : null,
    publicationTypes: paper.publicationTypes,
    influentialCitationCount: paper.influential
  }
  if (wanted.has("embedding.specter_v2")) out.embedding = { model: "specter_v2", vector: paper.embedding }
  return out
}

// Crossref: enough of a work for the citation formatters.
function crossrefMessage(paper) {
  return {
    message: {
      DOI: paper.doi,
      title: [paper.title],
      author: paper.authors.map((a) => {
        const [given, family] = a.name.split(" ")
        return { given, family, sequence: "first" }
      }),
      "container-title": [paper.venue],
      "short-container-title": [paper.venue.slice(0, 6)],
      volume: paper.journal.volume,
      issue: "2",
      page: paper.journal.pages,
      issued: { "date-parts": [[paper.year, 3]] },
      type: "journal-article",
      publisher: "Example Press"
    }
  }
}

// Unpaywall: some papers have a free PDF only there, some only an open page
// (a repository record, no PDF), some nothing.
function unpaywallAnswer(paper) {
  const n = Number(paper.doi.split(".").pop()) || 0
  if (n % 6 === 0) {
    return {
      doi: paper.doi,
      is_oa: true,
      best_oa_location: { url: `https://repo.example.org/page/${n}`, url_for_pdf: null, host_type: "repository" },
      oa_locations: [{ url: `https://repo.example.org/page/${n}`, url_for_pdf: null }]
    }
  }
  if (n % 3 === 2) {
    return {
      doi: paper.doi,
      is_oa: true,
      best_oa_location: {
        url: `https://repo.example.org/landing/${n}`,
        url_for_pdf: `https://repo.example.org/free/${n}.pdf`,
        host_type: "repository"
      },
      oa_locations: [{ url: `https://repo.example.org/landing/${n}`, url_for_pdf: `https://repo.example.org/free/${n}.pdf` }]
    }
  }
  return { doi: paper.doi, is_oa: false, best_oa_location: null, oa_locations: [] }
}

// ---- the request handler ------------------------------------------------------

function createHandler({ flakyEvery = 0, requireKey = API_KEY } = {}) {
  const world = buildWorld()
  const stats = { total: 0, byPrefix: { s2: 0, crossref: 0, unpaywall: 0 }, throttled: 0, seedRequests: 0, unpaywallRequests: 0 }
  let counter = 0

  const reply = (status, body, headers = {}) => ({ status, body, headers })

  function handle({ method, url, headers }, bodyText = "") {
    const parsed = new URL(url, "http://world.local")
    const path = parsed.pathname
    const q = parsed.searchParams

    if (path === "/__stats") return reply(200, stats)
    if (path === "/__reset") {
      counter = 0
      stats.total = stats.throttled = stats.seedRequests = stats.unpaywallRequests = 0
      for (const key of Object.keys(stats.byPrefix)) stats.byPrefix[key] = 0
      return reply(200, { ok: true })
    }

    const prefix = path.split("/")[1]
    stats.total++
    if (prefix in stats.byPrefix) stats.byPrefix[prefix]++

    // The API's 429s are random (docs/PERFORMANCE.md): imitate them so the
    // retry logic is exercised on every run.
    counter++
    if (flakyEvery > 0 && counter % flakyEvery === 0) {
      stats.throttled++
      return reply(429, { message: "Too Many Requests" }, { "retry-after": "0" })
    }

    if (prefix === "s2") {
      const key = headers["x-api-key"]
      if (key && key !== requireKey) return reply(403, { message: "Forbidden" })
      const rest = path.slice("/s2".length)

      if (rest === "/graph/v1/paper/batch" && method === "POST") {
        const ids = JSON.parse(bodyText || "{}").ids ?? []
        const fields = q.get("fields") ?? ""
        return reply(200, ids.map((id) => {
          const paper = resolve(world, id)
          return paper ? metadata(paper, fields) : null
        }))
      }
      if (rest === "/graph/v1/paper/search") {
        const query = wordsOf(q.get("query") ?? "")
        const limit = Number(q.get("limit") ?? 10)
        const scored = world.papers
          .map((p) => ({ p, score: [...wordsOf(p.title)].filter((w) => query.has(w)).length }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || b.p.citationCount - a.p.citationCount)
        return reply(200, { total: scored.length, offset: 0, data: scored.slice(0, limit).map((x) => ({ paperId: x.p.paperId })) })
      }
      const recommendations = rest.match(/^\/recommendations\/v1\/papers\/forpaper\/(.+)$/)
      if (recommendations) {
        const fields = q.get("fields") ?? ""
        // The real endpoint rejects these (CONTRIBUTING rule 4).
        if (/tldr|embedding/.test(fields)) return reply(400, { error: "Unrecognized or unsupported fields" })
        const paper = resolve(world, recommendations[1])
        if (!paper) return reply(404, { error: "Paper not found" })
        return reply(200, { recommendedPapers: world.links(paper).recommended.map((p) => ({ paperId: p.paperId })) })
      }
      const one = rest.match(/^\/graph\/v1\/paper\/(.+)$/)
      if (one && method === "GET") {
        const paper = resolve(world, one[1])
        if (!paper) return reply(404, { error: "Paper not found" })
        stats.seedRequests++
        return reply(200, seedAnswer(paper, q.get("fields") ?? "title", world))
      }
    }

    if (prefix === "crossref") {
      const doi = decodeURIComponent(path.slice("/crossref/works/".length)).toLowerCase()
      const paper = world.byDoi.get(doi)
      return paper ? reply(200, crossrefMessage(paper)) : reply(404, "Resource not found.")
    }

    if (prefix === "unpaywall") {
      stats.unpaywallRequests++
      const email = q.get("email")
      if (!email || !email.includes("@")) return reply(422, { error: true, message: "Please use your own email address in API calls." })
      const doi = decodeURIComponent(path.slice("/unpaywall/v2/".length)).toLowerCase()
      const paper = world.byDoi.get(doi)
      return paper ? reply(200, unpaywallAnswer(paper)) : reply(404, { error: true, message: `'${doi}' isn't in Unpaywall.` })
    }

    return reply(404, { error: "no such endpoint" })
  }

  return { handle, world, stats }
}

function createServer(options = {}) {
  const { handle, world, stats } = createHandler(options)
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => {
      const { status, body, headers } = handle(
        { method: req.method, url: req.url, headers: req.headers },
        Buffer.concat(chunks).toString("utf8")
      )
      const isJson = typeof body !== "string"
      res.writeHead(status, {
        "content-type": isJson ? "application/json" : "text/plain",
        // The extension reaches this server through host_permissions, as it
        // reaches the real APIs; this header only helps a plain page test.
        "access-control-allow-origin": "*",
        ...headers
      })
      res.end(isJson ? JSON.stringify(body) : body)
    })
  })
  return new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", () =>
      resolveListen({ server, port: server.address().port, world, stats, close: () => new Promise((r) => server.close(r)) })
    )
  )
}

module.exports = { buildWorld, createHandler, createServer, API_KEY, DIM }
