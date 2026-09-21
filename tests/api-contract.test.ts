import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

// The shape definitions and the offline world are plain Node scripts (they run
// outside the bundle), so they are loaded the way Node loads them.
const load = createRequire(import.meta.url)
const shapes = load("../scripts/api-contract/shapes.cjs")
const requests = load("../scripts/api-contract/requests.cjs")
const { createHandler } = load("../scripts/e2e-offline/world.cjs")

const source = (file: string) => readFileSync(file, "utf8")

describe("the requests the nightly check makes", () => {
  it("are spelled exactly like the ones in lib/, so it never checks an old version", () => {
    const client = source("lib/semantic-scholar.ts")
    // the source builds the seed URL around the ${EMBEDDING} constant
    expect(client).toContain(
      requests.SEED_FIELDS.replace(requests.EMBEDDING, "${EMBEDDING}")
    )
    expect(client).toContain(requests.PAPER_FIELDS)
    expect(client).toContain(`"${requests.EMBEDDING}"`)
    expect(client).toContain(`"${requests.S2}"`)
    for (const endpoint of [
      "/graph/v1/paper/batch",
      "/graph/v1/paper/search",
      "/recommendations/v1/papers/forpaper/"
    ]) {
      expect(client).toContain(endpoint)
    }
    expect(source("lib/crossref.ts")).toContain(`${requests.CROSSREF}/works/`)
    expect(source("lib/unpaywall.ts")).toContain(`${requests.UNPAYWALL}/v2/`)
  })
})

describe("the shapes catch what would break the extension", () => {
  const good = () => ({
    paperId: "abc",
    title: "T",
    abstract: null,
    year: 2020,
    authors: [{ name: "A" }],
    fieldsOfStudy: null,
    embedding: { vector: new Array(768).fill(0.1) },
    references: [{ paperId: "r1" }],
    citations: [{ paperId: "c1", citationCount: 3, year: 2021 }]
  })

  it("accept a good answer, including the nulls the API really sends", () => {
    expect(shapes.seed(good(), { requireEmbedding: true })).toEqual([])
    expect(
      shapes.seed({ ...good(), references: null, embedding: null, year: null })
    ).toEqual([])
  })

  it("reject a renamed or retyped field", () => {
    expect(shapes.seed({ ...good(), title: 5 })[0]).toMatch(/seed.title/)
    expect(shapes.seed({ ...good(), citations: "many" })[0]).toMatch(
      /seed.citations/
    )
    const noPaperId: any = good()
    delete noPaperId.paperId
    expect(shapes.seed(noPaperId)[0]).toMatch(/seed.paperId/)
  })

  it("reject an embedding of the wrong size or a missing one when it is required", () => {
    const short = { ...good(), embedding: { vector: [1, 2, 3] } }
    expect(shapes.seed(short).join()).toMatch(/768/)
    expect(
      shapes.seed({ ...good(), embedding: null }, { requireEmbedding: true })
        .length
    ).toBe(1)
  })

  it("reject a batch that is not aligned data, and papers missing what the cards show", () => {
    expect(shapes.batch({})[0]).toMatch(/batch/)
    expect(shapes.batch([{ paperId: "x", title: "t" }]).length).toBeGreaterThan(
      0
    )
    expect(shapes.batch([null, null])).toEqual([])
  })

  it("reject Unpaywall and Crossref answers that changed type", () => {
    expect(shapes.unpaywall({ is_oa: "yes" })[0]).toMatch(/is_oa/)
    expect(
      shapes.unpaywall({ is_oa: true, best_oa_location: { url_for_pdf: 5 } })[0]
    ).toMatch(/url_for_pdf/)
    expect(shapes.crossref({ message: { title: "not a list" } })[0]).toMatch(
      /title/
    )
    expect(shapes.recommendations({ recommendedPapers: {} })[0]).toMatch(
      /recommendedPapers/
    )
    expect(shapes.search({ data: null })[0]).toMatch(/search.data/)
  })
})

describe("the offline test server answers like the real APIs", () => {
  const { handle, world } = createHandler()
  const get = (url: string, headers = {}) =>
    handle({ method: "GET", url, headers })
  const post = (url: string, body: unknown) =>
    handle({ method: "POST", url, headers: {} }, JSON.stringify(body))
  const doi = world.seed.doi
  const someIds = world.papers.slice(0, 6).map((p: any) => p.paperId)

  it("the seed request", () => {
    const answer = get(
      `/s2/graph/v1/paper/DOI:${doi}?fields=${requests.SEED_FIELDS}`
    )
    expect(answer.status).toBe(200)
    expect(shapes.seed(answer.body, { requireEmbedding: true })).toEqual([])
    expect(answer.body.references.length).toBeGreaterThan(0)
  })

  it("batch, aligned, with null for an unknown id, with and without embeddings", () => {
    const ids = [...someIds, "DOI:10.9999/nope"]
    const withVectors = post(
      `/s2/graph/v1/paper/batch?fields=${requests.PAPER_FIELDS},${requests.EMBEDDING}`,
      { ids }
    )
    expect(shapes.batch(withVectors.body, { requireEmbedding: true })).toEqual(
      []
    )
    expect(withVectors.body).toHaveLength(ids.length)
    expect(withVectors.body[ids.length - 1]).toBeNull()

    const without = post(
      `/s2/graph/v1/paper/batch?fields=${requests.PAPER_FIELDS}`,
      { ids: someIds }
    )
    expect(shapes.batch(without.body)).toEqual([])
    expect(without.body[0].embedding).toBeUndefined()
  })

  it("recommendations (and the 400 for the fields the real endpoint rejects), search, 404 and a wrong key", () => {
    const recs = get(
      `/s2/recommendations/v1/papers/forpaper/${world.seed.paperId}?fields=paperId&from=recent&limit=50`
    )
    expect(shapes.recommendations(recs.body)).toEqual([])
    expect(
      get(
        `/s2/recommendations/v1/papers/forpaper/${world.seed.paperId}?fields=paperId,embedding`
      ).status
    ).toBe(400)

    const found = get(
      "/s2/graph/v1/paper/search?query=social%20media&limit=30&fields=paperId"
    )
    expect(shapes.search(found.body)).toEqual([])
    expect(found.body.data.length).toBeGreaterThan(5)
    expect(
      get("/s2/graph/v1/paper/search?query=zzzz&limit=5").body.data
    ).toEqual([])

    expect(get("/s2/graph/v1/paper/DOI:10.9999/nope?fields=title").status).toBe(
      404
    )
    expect(
      get(`/s2/graph/v1/paper/DOI:${doi}?fields=title`, { "x-api-key": "bad" })
        .status
    ).toBe(403)
  })

  it("Crossref and Unpaywall", () => {
    const work = get(`/crossref/works/${encodeURIComponent(doi)}`)
    expect(shapes.crossref(work.body)).toEqual([])
    expect(get("/crossref/works/10.48550%2FarXiv.1").status).toBe(404)

    // one paper has a free copy only in Unpaywall, another has none
    const answers = world.papers.map((p: any) =>
      get(`/unpaywall/v2/${encodeURIComponent(p.doi)}?email=a%40b.org`)
    )
    for (const answer of answers) {
      expect(shapes.unpaywall(answer.body)).toEqual([])
    }
    expect(answers.some((a: any) => a.body.is_oa)).toBe(true)
    expect(answers.some((a: any) => !a.body.is_oa)).toBe(true)
    expect(get(`/unpaywall/v2/${encodeURIComponent(doi)}`).status).toBe(422)
    expect(get("/unpaywall/v2/10.9999%2Fnope?email=a%40b.org").status).toBe(404)
  })

  it("throttles every Nth request with a 429, like the real API does", () => {
    const flaky = createHandler({ flakyEvery: 3 })
    const statuses = [1, 2, 3, 4, 5, 6].map(
      () =>
        flaky.handle({
          method: "GET",
          url: `/s2/graph/v1/paper/DOI:${doi}?fields=title`,
          headers: {}
        }).status
    )
    expect(statuses).toEqual([200, 200, 429, 200, 200, 429])
  })
})
