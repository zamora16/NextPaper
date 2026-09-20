import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  collectCandidates,
  getPapers,
  getSeed,
  type Seed
} from "~lib/semantic-scholar"

// These tests pin the PERFORMANCE-relevant behavior of the API client: how
// many requests an analysis makes, what runs in parallel, and how batch
// lookups are chunked. See docs/PERFORMANCE.md for the measurements behind it.

type Call = { url: string; method: string; body?: any }
let calls: Call[]

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

function mockFetch(route: (call: Call) => Response) {
  calls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const call: Call = {
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : undefined
      }
      calls.push(call)
      return route(call)
    })
  )
}

beforeEach(() => vi.stubGlobal("chrome", {}))
afterEach(() => vi.unstubAllGlobals())

const baseSeed: Seed = {
  paperId: "SEED",
  title: "A seed paper",
  abstract: "abstract",
  year: 2024,
  embedding: [1, 0],
  isComputerScience: false,
  references: [],
  citers: []
}

describe("getSeed", () => {
  it("uses ONE request for the paper, its embedding, references and citations", async () => {
    mockFetch(() =>
      json({
        paperId: "SEED",
        title: "T",
        abstract: "A",
        year: 2024,
        fieldsOfStudy: ["Psychology"],
        embedding: { vector: [0.1, 0.2] },
        references: [{ paperId: "r1" }, { paperId: null }, { paperId: "r2" }],
        citations: [
          { paperId: "c1", citationCount: 5, year: 2023 },
          { paperId: null },
          { paperId: "c2", citationCount: 9, year: 2025 }
        ]
      })
    )

    const seed = await getSeed("DOI:10.1/x")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("references.paperId")
    expect(calls[0].url).toContain("citations.citationCount")
    expect(seed.references).toEqual(["r1", "r2"])
    expect(seed.citers.map((c) => c.paperId)).toEqual(["c1", "c2"])
    expect(seed.embedding).toEqual([0.1, 0.2])
    expect(seed.isComputerScience).toBe(false)
  })

  it("copes with null references/citations (publisher-restricted papers)", async () => {
    mockFetch(() => json({ paperId: "S", title: "T", references: null, citations: null }))
    const seed = await getSeed("DOI:10.1/x")
    expect(seed.references).toEqual([])
    expect(seed.citers).toEqual([])
    expect(seed.embedding).toBeNull()
  })

  it("retries a 429 quickly and still succeeds", async () => {
    let attempts = 0
    mockFetch(() => (++attempts === 1 ? json({}, 429) : json({ paperId: "S", title: "T" })))
    const started = Date.now()
    const seed = await getSeed("DOI:10.1/x")
    expect(seed.paperId).toBe("S")
    expect(calls).toHaveLength(2)
    // the old schedule waited 1.5 s+ here; the new one well under a second
    expect(Date.now() - started).toBeLessThan(1500)
  })
})

describe("collectCandidates", () => {
  const citers = Array.from({ length: 130 }, (_, i) => ({
    paperId: `c${i}`,
    citationCount: i, // c129 most cited
    year: 1990 + (i % 35) // spread of years
  }))

  const route = (call: Call) => {
    if (call.url.includes("/paper/search")) return json({ data: [{ paperId: "s1" }, { paperId: "shared" }] })
    if (call.url.includes("from=recent")) return json({ recommendedPapers: [{ paperId: "rec1" }, { paperId: "shared" }] })
    if (call.url.includes("from=all-cs")) return json({ recommendedPapers: [{ paperId: "cs1" }] })
    return json({}, 404)
  }

  it("takes references and citations from the seed with no extra requests", async () => {
    mockFetch(route)
    const seed = { ...baseSeed, references: ["r1", "shared"], citers }

    const found = await collectCandidates(seed)

    // only the independent sources hit the network: search + recent recommendations
    expect(calls.map((c) => c.url.includes("/paper/search") ? "search" : "recs").sort()).toEqual(["recs", "search"])
    expect(found.get("r1")).toEqual(new Set(["reference"]))
    // most cited citers are kept
    expect(found.has("c129")).toBe(true)
    expect(found.get("c129")).toEqual(new Set(["citation"]))
  })

  it("keeps the 60 most cited and the 40 most recent citers, not all of them", async () => {
    mockFetch(route)
    const found = await collectCandidates({ ...baseSeed, citers })
    const citing = [...found.entries()].filter(([, s]) => s.has("citation")).length
    expect(citing).toBeGreaterThanOrEqual(60)
    expect(citing).toBeLessThanOrEqual(100)
    expect(found.has("c0")).toBe(false) // least cited and old
  })

  it("merges every source that found the same paper", async () => {
    mockFetch(route)
    const found = await collectCandidates({ ...baseSeed, references: ["shared"] })
    expect(found.get("shared")).toEqual(new Set(["reference", "search", "recommended"]))
  })

  it("asks for the computer-science pool only for CS seeds, in the same parallel step", async () => {
    mockFetch(route)
    await collectCandidates({ ...baseSeed, isComputerScience: false })
    expect(calls.some((c) => c.url.includes("all-cs"))).toBe(false)

    mockFetch(route)
    const found = await collectCandidates({ ...baseSeed, isComputerScience: true })
    expect(calls.filter((c) => c.url.includes("all-cs"))).toHaveLength(1)
    expect(found.has("cs1")).toBe(true)
  })

  it("does not repeat the recent recommendations when they were started early", async () => {
    mockFetch(route)
    const early = Promise.resolve(["early1"])
    const found = await collectCandidates(baseSeed, early)
    expect(calls.some((c) => c.url.includes("from=recent"))).toBe(false)
    expect(found.has("early1")).toBe(true)
  })

  it("retries the recent recommendations with the canonical id when the early attempt failed", async () => {
    mockFetch(route)
    const found = await collectCandidates(baseSeed, Promise.resolve(null))
    expect(calls.filter((c) => c.url.includes("from=recent"))).toHaveLength(1)
    expect(calls.find((c) => c.url.includes("from=recent"))!.url).toContain("forpaper/SEED")
    expect(found.has("rec1")).toBe(true)
  })

  it("never lists the seed itself as a candidate", async () => {
    mockFetch(() => json({ data: [{ paperId: "SEED" }], recommendedPapers: [{ paperId: "SEED" }] }))
    const found = await collectCandidates({ ...baseSeed, references: ["SEED"] })
    expect(found.has("SEED")).toBe(false)
  })
})

describe("getPapers", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `p${i}`)

  const batchRoute = (call: Call) =>
    json(
      call.body.ids.map((id: string) =>
        id === "p7" ? null : { paperId: id, title: id, embedding: { vector: [1, 2] } }
      )
    )

  it("splits the lookup into parallel chunks of at most 100 ids", async () => {
    mockFetch(batchRoute)
    await getPapers(ids)
    expect(calls).toHaveLength(3)
    expect(calls.every((c) => c.method === "POST" && c.body.ids.length <= 100)).toBe(true)
    expect(calls.flatMap((c) => c.body.ids)).toEqual(ids)
  })

  it("returns papers in input order, skipping unknown ids and moving the vector out", async () => {
    mockFetch(batchRoute)
    const papers = await getPapers(ids)
    expect(papers).toHaveLength(249)
    expect(papers.map((p) => p.paperId).slice(5, 9)).toEqual(["p5", "p6", "p8", "p9"])
    expect(papers[0].embedding).toEqual([1, 2])
    expect("embedding" in papers[0]).toBe(true)
  })

  it("keeps the good chunks when one chunk fails", async () => {
    let n = 0
    mockFetch((call) => (++n === 2 ? json({ error: "bad" }, 400) : batchRoute(call)))
    const papers = await getPapers(ids)
    expect(papers.length).toBeGreaterThan(100)
    expect(papers.length).toBeLessThan(250)
  })

  it("skips embeddings when they are not needed", async () => {
    mockFetch(batchRoute)
    await getPapers(["a"], false)
    expect(calls[0].url).not.toContain("embedding")
  })

  it("makes no request for an empty list", async () => {
    mockFetch(batchRoute)
    expect(await getPapers([])).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
