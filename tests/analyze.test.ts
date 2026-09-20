import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCachedResult } from "~lib/cache"
import type { Step } from "~lib/job"
import { analyze, RELATED_GROUP } from "~lib/pipeline"
import { RateLimitedError } from "~lib/s2-fetch"
import {
  collectCandidates,
  getPapers,
  getRecommendedIds,
  getSeed,
  searchPapers
} from "~lib/semantic-scholar"

import { installChrome, type FakeChrome } from "./helpers/chrome"

vi.mock("~lib/semantic-scholar", () => ({
  getSeed: vi.fn(),
  collectCandidates: vi.fn(),
  getPapers: vi.fn(),
  getRecommendedIds: vi.fn(),
  searchPapers: vi.fn()
}))

const seedRequest = vi.mocked(getSeed)
const candidates = vi.mocked(collectCandidates)
const batch = vi.mocked(getPapers)
const recommendations = vi.mocked(getRecommendedIds)
const search = vi.mocked(searchPapers)

const YEAR = new Date().getFullYear()
let chrome: FakeChrome

const seed = (over: Record<string, unknown> = {}) => ({
  paperId: "SEED",
  title: "Body image in virtual reality",
  abstract: "We study body image using virtual reality avatars.",
  year: YEAR - 1,
  embedding: [1, 0] as number[] | null,
  isComputerScience: false,
  references: [] as string[],
  citers: [],
  ...over
})

// Two well-separated topics so clustering has something real to find.
const A = (i: number) => [1, 0.02 * i]
const B = (i: number) => [0.02 * i, 1]

const paper = (id: string, over: Record<string, unknown> = {}) => ({
  paperId: id,
  title: `Paper ${id}`,
  authors: [{ authorId: "1", name: "Ada Lovelace" }],
  year: 2015,
  citationCount: 10,
  venue: "J Test",
  url: "https://example.org/" + id,
  abstract: `Abstract of ${id}`,
  embedding: A(1) as number[] | null,
  ...over
})

const sourcesOf = (spec: Record<string, string[]>) =>
  new Map(Object.entries(spec).map(([id, s]) => [id, new Set(s)])) as Awaited<
    ReturnType<typeof collectCandidates>
  >

// A realistic candidate set: 4 papers near topic A, 4 near topic B.
function realisticSet() {
  const list = [
    paper("a1", { embedding: A(1), title: "Avatars and body ownership" }),
    paper("a2", { embedding: A(2), title: "Avatars and body perception" }),
    paper("a3", { embedding: A(3), title: "Avatar embodiment illusions" }),
    paper("a4", { embedding: A(4), title: "Avatar body size estimation" }),
    paper("b1", { embedding: B(1), title: "Clinical trial of therapy" }),
    paper("b2", { embedding: B(2), title: "Therapy outcomes for anorexia" }),
    paper("b3", { embedding: B(3), title: "Therapy adherence in anorexia" }),
    paper("b4", { embedding: B(4), title: "Anorexia therapy dropout" })
  ]
  batch.mockResolvedValue(list as any)
  candidates.mockResolvedValue(
    sourcesOf(Object.fromEntries(list.map((p) => [p.paperId, ["search"]])))
  )
  return list
}

beforeEach(() => {
  chrome = installChrome()
  for (const mock of [
    seedRequest,
    candidates,
    batch,
    recommendations,
    search
  ]) {
    mock.mockReset()
  }
  recommendations.mockResolvedValue([])
  seedRequest.mockResolvedValue(seed() as any)
})

describe("analyzing a paper", () => {
  it("ranks candidates by similarity to the paper, groups them by subtopic and caches the result", async () => {
    realisticSet()
    const result = await analyze("DOI:10.1/x")

    const papers = result.groups.flatMap((g) => g.papers)
    expect(papers).toHaveLength(8)
    expect(result.groups.length).toBeGreaterThanOrEqual(2)
    // topic A is the one the open paper is about
    const aGroup = result.groups.find((g) =>
      g.papers.some((p) => p.paperId === "a1")
    )!
    expect(aGroup.papers.every((p) => p.paperId.startsWith("a"))).toBe(true)
    expect(result.groups[0]).toBe(aGroup) // best-matching group first
    expect(papers.find((p) => p.paperId === "a1")!.similarity!).toBeGreaterThan(
      0.99
    )
    expect(papers.find((p) => p.paperId === "b1")!.similarity!).toBeLessThan(
      0.1
    )
    expect(result.seedYear).toBe(YEAR - 1)
    expect(result.seedTitle).toBe("Body image in virtual reality")

    expect(await getCachedResult("DOI:10.1/x")).toEqual(result)
  })

  it("says which paper it is about: first three authors and how many more", async () => {
    realisticSet()
    const names = ["Ada", "Alan", "Grace", "Edsger", "Barbara"]
    seedRequest.mockResolvedValue(seed({ authors: names }) as any)
    const result = await analyze("DOI:10.1/x")
    expect(result.seedByline).toBe("Ada, Alan, Grace +2")
  })

  it("leaves the byline out when the paper has no author data", async () => {
    realisticSet()
    const result = await analyze("DOI:10.1/y")
    expect(result.seedByline).toBeUndefined()
  })

  it("never stores embeddings (rule 6)", async () => {
    realisticSet()
    const result = await analyze("DOI:10.1/x")
    expect(JSON.stringify(result)).not.toContain("embedding")
    const cached = chrome.data.get("nextpaper_cache_v11_DOI:10.1/x") as {
      z: string
    }
    expect(cached.z.length).toBeLessThan(3000)
  })

  it("serves a repeat from the cache without touching the network", async () => {
    realisticSet()
    await analyze("DOI:10.1/x")
    seedRequest.mockClear()
    batch.mockClear()
    const again = await analyze("DOI:10.1/x")
    expect(again.groups.length).toBeGreaterThan(0)
    expect(seedRequest).not.toHaveBeenCalled()
    expect(batch).not.toHaveBeenCalled()
  })

  it("marks how each paper relates to the open one, citing taking precedence", async () => {
    const list = realisticSet()
    candidates.mockResolvedValue(
      sourcesOf({
        a1: ["reference"],
        a2: ["citation"],
        a3: ["reference", "citation"],
        a4: ["search"],
        b1: ["recommended"],
        b2: ["search"],
        b3: ["search"],
        b4: ["search"]
      })
    )
    batch.mockResolvedValue(list as any)
    const papers = (await analyze("R")).groups.flatMap((g) => g.papers)
    const rel = Object.fromEntries(papers.map((p) => [p.paperId, p.relation]))
    expect(rel).toMatchObject({
      a1: "reference",
      a2: "citation",
      a3: "citation",
      a4: null,
      b1: null
    })
  })

  it("drops another version of the paper itself, and duplicate titles keep the most cited", async () => {
    const list = realisticSet()
    list.push(
      paper("preprint", {
        title: "Body Image in Virtual Reality!",
        embedding: A(1)
      }),
      paper("dupA", {
        title: "Avatars and body ownership",
        citationCount: 999,
        embedding: A(1)
      })
    )
    batch.mockResolvedValue(list as any)
    candidates.mockResolvedValue(
      sourcesOf(Object.fromEntries(list.map((p) => [p.paperId, ["search"]])))
    )
    const ids = (await analyze("R")).groups.flatMap((g) =>
      g.papers.map((p) => p.paperId)
    )
    expect(ids).not.toContain("preprint")
    expect(ids).toContain("dupA") // 999 citations beats a1's 10
    expect(ids).not.toContain("a1")
  })

  it("keeps the picks meaningful: a classic, a real review, the latest work — all different", async () => {
    const list = realisticSet()
    list.push(
      paper("classic", {
        embedding: A(1),
        year: YEAR - 20,
        citationCount: 5000
      }),
      paper("review", {
        embedding: A(2),
        title: "Body ownership: a systematic review",
        year: YEAR - 5
      }),
      paper("newest", { embedding: A(3), year: YEAR })
    )
    batch.mockResolvedValue(list as any)
    candidates.mockResolvedValue(
      sourcesOf({
        ...Object.fromEntries(list.map((p) => [p.paperId, ["search"]])),
        classic: ["reference"]
      })
    )
    const { picks } = await analyze("R")
    expect(
      Object.fromEntries(picks.map((p) => [p.kind, p.paper.paperId]))
    ).toEqual({
      foundational: "classic",
      review: "review",
      recent: "newest"
    })
  })

  // Semantic Scholar tags many primary studies as "Review" (see paper-utils).
  it("does not offer a randomized trial as 'the relevant review'", async () => {
    const list = realisticSet()
    list[0] = paper("a1", {
      embedding: A(1),
      title: "Avatar training: a randomized controlled trial",
      abstract: "In this randomized controlled trial, 80 adults took part.",
      publicationTypes: ["JournalArticle", "Review"]
    })
    // another paper is the classic, so the trial stays free to be the review
    list.push(paper("classic", { embedding: A(2), citationCount: 5000 }))
    batch.mockResolvedValue(list as any)
    candidates.mockResolvedValue(
      sourcesOf(Object.fromEntries(list.map((p) => [p.paperId, ["search"]])))
    )
    const { picks } = await analyze("R")
    expect(picks.map((p) => p.kind)).toContain("foundational")
    expect(picks.find((p) => p.kind === "review")).toBeUndefined()
  })

  describe("when the open paper has no embedding (no abstract indexed)", () => {
    it("compares against its likely neighbors and says the similarity is approximate", async () => {
      realisticSet()
      candidates.mockResolvedValue(
        sourcesOf({
          a1: ["reference", "search"],
          a2: ["citation", "recommended"],
          a3: ["reference", "citation"],
          a4: ["search", "recommended"],
          b1: ["search"],
          b2: ["search"],
          b3: ["search"],
          b4: ["search"]
        })
      )
      seedRequest.mockResolvedValue(seed({ embedding: null }) as any)
      const papers = (await analyze("R")).groups.flatMap((g) => g.papers)
      expect(papers.every((p) => p.approximate)).toBe(true)
      const sim = (id: string) =>
        papers.find((p) => p.paperId === id)!.similarity!
      // the multi-source papers define the reference, so topic A ranks above B
      expect(sim("a1")).toBeGreaterThan(sim("b1"))
    })
  })

  describe("degraded data", () => {
    it("with fewer than 2 embedded papers, falls back to one list ordered by citations", async () => {
      const list = [
        paper("x1", { embedding: null, citationCount: 5 }),
        paper("x2", { embedding: null, citationCount: 50 }),
        paper("x3", { embedding: [1, 0], citationCount: 500 })
      ]
      batch.mockResolvedValue(list as any)
      candidates.mockResolvedValue(
        sourcesOf({ x1: ["search"], x2: ["search"], x3: ["search"] })
      )
      const result = await analyze("R")
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].label).toBe(RELATED_GROUP)
      expect(result.groups[0].papers.map((p) => p.paperId)).toEqual([
        "x3",
        "x2",
        "x1"
      ])
      expect(result.groups[0].papers.every((p) => p.similarity === null)).toBe(
        true
      )
      expect(result.picks).toEqual([])
    })

    it("with a handful of papers, does not force clusters", async () => {
      const list = realisticSet().slice(0, 3)
      batch.mockResolvedValue(list as any)
      const result = await analyze("R")
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].papers).toHaveLength(3)
    })

    it("reports a rate limit when no candidate could be gathered, and caches nothing", async () => {
      candidates.mockResolvedValue(new Map())
      await expect(analyze("R")).rejects.toBeInstanceOf(RateLimitedError)
      expect(await getCachedResult("R")).toBeNull()
    })

    it("reports a rate limit when the metadata lookup returned nothing, and caches nothing", async () => {
      candidates.mockResolvedValue(sourcesOf({ a1: ["search"] }))
      batch.mockResolvedValue([])
      await expect(analyze("R")).rejects.toBeInstanceOf(RateLimitedError)
      expect(await getCachedResult("R")).toBeNull()
    })

    it("lets a 'paper not found' error through untouched", async () => {
      seedRequest.mockRejectedValue(new Error("Este paper no esta indexado"))
      await expect(analyze("R")).rejects.toThrow("no esta indexado")
    })
  })

  describe("request sequencing (docs/PERFORMANCE.md)", () => {
    it("starts the 'recent' recommendations together with the seed request, not after it", async () => {
      realisticSet()
      let release!: () => void
      seedRequest.mockReturnValue(
        new Promise((resolve) => (release = () => resolve(seed() as any)))
      )

      const running = analyze("DOI:10.1/x")
      await vi.waitFor(() =>
        expect(recommendations).toHaveBeenCalledWith("DOI:10.1/x", "recent")
      )
      expect(candidates).not.toHaveBeenCalled() // the seed has not answered yet

      release()
      await running
      // the early request is handed to the candidate step, not repeated
      expect(candidates.mock.calls[0][1]).toBeInstanceOf(Promise)
    })

    it("a failed early recommendation request does not break the analysis", async () => {
      realisticSet()
      recommendations.mockRejectedValue(new Error("network"))
      await expect(analyze("R")).resolves.toBeDefined()
    })

    it("reports progress as language-neutral step codes", async () => {
      realisticSet()
      const steps: Step[] = []
      await analyze("R", (s) => steps.push(s))
      expect(steps).toHaveLength(3)
      expect(steps[0]).toEqual({ code: "reading" })
      expect(steps[2]).toEqual({ code: "scoring", n: 8 })
    })
  })
})

describe("analyzing a topic", () => {
  const ids = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"]

  it("groups the search results into subtopics, without similarity scores", async () => {
    search.mockResolvedValue(ids)
    const list = realisticSet()
    batch.mockResolvedValue(list as any)

    const result = await analyze("QUERY:body image avatars")
    expect(result.groups.length).toBeGreaterThanOrEqual(2)
    const papers = result.groups.flatMap((g) => g.papers)
    expect(papers).toHaveLength(8)
    // every result contains the query words: no "% similar"
    expect(papers.every((p) => p.similarity === null)).toBe(true)
    expect(papers.every((p) => p.relation === null)).toBe(true)
    expect(result.seedYear).toBeUndefined()
  })

  it("sends the topic text to the search and asks only for those ids", async () => {
    search.mockResolvedValue(ids)
    batch.mockResolvedValue(realisticSet() as any)
    await analyze("QUERY:body image avatars")
    expect(search).toHaveBeenCalledWith("body image avatars")
    expect(batch.mock.calls[0][0]).toEqual(ids)
    expect(seedRequest).not.toHaveBeenCalled()
  })

  it("keeps Semantic Scholar's relevance order as a tie-breaker inside the score", async () => {
    search.mockResolvedValue(["b1", "a1"])
    batch.mockResolvedValue([
      paper("a1", { embedding: A(1), citationCount: 0 }),
      paper("b1", { embedding: B(1), citationCount: 0 })
    ] as any)
    const flat = (await analyze("QUERY:x")).groups.flatMap((g) => g.papers)
    expect(flat.map((p) => p.paperId)).toEqual(["b1", "a1"])
  })

  it("caches an empty search too, so the popup can read it and nothing is asked twice", async () => {
    search.mockResolvedValue([])
    const first = await analyze("QUERY:nothing at all")
    expect(first).toEqual({ groups: [], picks: [] })
    await analyze("QUERY:nothing at all")
    expect(search).toHaveBeenCalledTimes(1)
    expect(batch).not.toHaveBeenCalled()
  })

  it("reports a rate limit when the search itself failed (as opposed to finding nothing)", async () => {
    search.mockResolvedValue(null)
    await expect(analyze("QUERY:x")).rejects.toBeInstanceOf(RateLimitedError)
    expect(await getCachedResult("QUERY:x")).toBeNull()
  })

  it("reports a rate limit when no metadata came back", async () => {
    search.mockResolvedValue(ids)
    batch.mockResolvedValue([])
    await expect(analyze("QUERY:x")).rejects.toBeInstanceOf(RateLimitedError)
  })

  it("merges duplicate versions of the same paper", async () => {
    search.mockResolvedValue(["a1", "a1dup", "a2", "a3", "b1"])
    batch.mockResolvedValue([
      paper("a1", { embedding: A(1), title: "Same title", citationCount: 1 }),
      paper("a1dup", {
        embedding: A(1),
        title: "Same title.",
        citationCount: 40
      }),
      paper("a2", { embedding: A(2) }),
      paper("a3", { embedding: A(3) }),
      paper("b1", { embedding: B(1) })
    ] as any)
    const ids = (await analyze("QUERY:x")).groups.flatMap((g) =>
      g.papers.map((p) => p.paperId)
    )
    expect(ids).toContain("a1dup")
    expect(ids).not.toContain("a1")
  })

  it("falls back to one list when almost nothing has an embedding", async () => {
    search.mockResolvedValue(["x1", "x2"])
    batch.mockResolvedValue([
      paper("x1", { embedding: null, citationCount: 1 }),
      paper("x2", { embedding: null, citationCount: 9 })
    ] as any)
    const result = await analyze("QUERY:x")
    expect(result.groups[0].papers.map((p) => p.paperId)).toEqual(["x2", "x1"])
  })
})
