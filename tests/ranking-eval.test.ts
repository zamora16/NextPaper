import { describe, expect, it } from "vitest"

import { assemble, makeStrip } from "~lib/pipeline"
import type { CandidateSource, PaperWithEmbedding } from "~lib/semantic-scholar"
import { cosineSimilarity } from "~lib/vector-math"

import { seededRandom } from "../scripts/audit/metrics"
import {
  evaluateSeed,
  gain,
  limitCiters,
  positive,
  PRODUCT,
  product,
  RANDOM,
  RANKERS,
  withoutReferenceOnly
} from "../scripts/audit/ranking-eval"
import type { PoolItem } from "../scripts/audit/types"

const item = (id: string, over: Partial<PoolItem> = {}): PoolItem => ({
  id,
  title: `Paper ${id}`,
  year: 2018,
  citations: 10,
  cos: 0.5,
  sources: ["search"],
  isRef: false,
  coupling: 0,
  ...over
})

describe("the evaluation models the real product", () => {
  // The same candidates, once as the evaluation sees them and once as the
  // pipeline's assemble() does: the 18 shown must be the same papers.
  it("shows the same 18 papers as the pipeline", () => {
    const random = seededRandom(11)
    const DIM = 24
    const seed = Array.from({ length: DIM }, () => random() - 0.5)
    const papers = Array.from({ length: 120 }, (_, i) => {
      const embedding = seed.map((x) => x * random() + (random() - 0.5) * 0.9)
      return {
        paperId: `p${i}`,
        title: `Paper ${i}`,
        authors: [],
        year: 2000 + (i % 24),
        citationCount: Math.floor(random() * random() * 5000),
        venue: "",
        url: "",
        embedding
      } as PaperWithEmbedding & { embedding: number[] }
    })

    const sources = new Map<string, Set<CandidateSource>>(
      papers.map((p) => [p.paperId, new Set<CandidateSource>(["search"])])
    )
    const ranked = papers
      .map((paper) => ({
        paper,
        sources: sources.get(paper.paperId)!,
        score: cosineSimilarity(seed, paper.embedding)
      }))
      .sort((a, b) => b.score - a.score)
    const real = assemble(ranked, makeStrip(sources, false), {
      topN: 18,
      maxClusters: 4,
      showScore: true
    })
    const realIds = real.groups.flatMap((g) => g.papers.map((p) => p.paperId))

    const items = papers.map((p) =>
      item(p.paperId, {
        cos: cosineSimilarity(seed, p.embedding),
        citations: p.citationCount,
        year: p.year
      })
    )
    const evaluated = product(items)
      .slice(0, 18)
      .map((i) => i.id)

    expect(new Set(evaluated)).toEqual(new Set(realIds))
    expect(evaluated).toHaveLength(18)
  })
})

describe("product", () => {
  it("takes the closest 40 by cosine and reorders only those by the blend", () => {
    // 41 papers; the 41st is the least similar but by far the most cited
    const items = Array.from({ length: 41 }, (_, i) =>
      item(`p${i}`, { cos: 0.9 - i * 0.001, citations: i === 40 ? 1e9 : 1 })
    )
    const ordered = product(items)
    expect(ordered).toHaveLength(41)
    // outside the shortlist, however cited, it stays last
    expect(ordered[40].id).toBe("p40")
    // inside, a small citation edge can reorder near-equals
    const near = [
      item("a", { cos: 0.9, citations: 1 }),
      item("b", { cos: 0.895, citations: 100000 })
    ]
    expect(product(near).map((i) => i.id)).toEqual(["b", "a"])
  })

  it("considers exactly the 40 closest for the blend (as the pipeline does)", () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      item(`p${i}`, {
        cos: 0.9 - i * 0.001,
        // the 30th closest is enormously cited; the 45th too
        citations: i === 29 || i === 44 ? 1e15 : 1
      })
    )
    const top = product(items)
      .slice(0, 3)
      .map((i) => i.id)
    expect(top).toContain("p29") // inside the shortlist: lifted by its citations
    expect(top).not.toContain("p44") // outside it: never considered
  })

  it("never fails on papers without a vector", () => {
    const ordered = product([item("x", { cos: null }), item("y", { cos: 0.4 })])
    expect(ordered.map((i) => i.id)).toEqual(["y", "x"])
  })
})

describe("what counts as related", () => {
  it("a reference, or a paper sharing at least 3 references", () => {
    expect(positive("reference")(item("a", { isRef: true }))).toBe(true)
    expect(positive("reference")(item("a", { coupling: 9 }))).toBe(false)
    expect(positive("coupled")(item("a", { coupling: 3 }))).toBe(true)
    expect(positive("coupled")(item("a", { coupling: 2 }))).toBe(false)
    expect(positive("coupled")(item("a", { coupling: null }))).toBe(false)
  })

  it("grades coupling and caps it, and treats a reference as one", () => {
    expect(gain("reference")(item("a", { isRef: true }))).toBe(1)
    expect(gain("reference")(item("a"))).toBe(0)
    expect(gain("coupled")(item("a", { coupling: 4 }))).toBe(4)
    expect(gain("coupled")(item("a", { coupling: 50 }))).toBe(10)
    expect(gain("coupled")(item("a", { coupling: null }))).toBe(0)
  })
})

describe("the pools", () => {
  it("'without reference-only' drops what only the bibliography brought", () => {
    const items = [
      item("a", { sources: ["reference"] }),
      item("b", { sources: ["reference", "search"] }),
      item("c", { sources: ["citation"] })
    ]
    expect(withoutReferenceOnly(items).map((i) => i.id)).toEqual(["b", "c"])
  })

  it("limits the citing papers to the most cited and most recent", () => {
    const items = [
      item("top", { sources: ["citation"], citedRank: 5 }),
      item("new", { sources: ["citation"], recentRank: 3 }),
      item("far", { sources: ["citation"], citedRank: 90, recentRank: 70 }),
      item("also-found", { sources: ["citation", "search"], citedRank: 100 }),
      item("search", { sources: ["search"] })
    ]
    expect(limitCiters(10, 5)(items).map((i) => i.id)).toEqual([
      "top",
      "new",
      "also-found",
      "search"
    ])
    expect(limitCiters(0, 0)(items).map((i) => i.id)).toEqual([
      "also-found",
      "search"
    ])
  })
})

describe("evaluateSeed", () => {
  // 30 papers; the 6 with the highest cosine are the related ones
  const pool = Array.from({ length: 30 }, (_, i) =>
    item(`p${i}`, {
      cos: 0.99 - i * 0.01,
      isRef: i < 6,
      coupling: i < 6 ? 5 : 0
    })
  )
  const cosineOnly = RANKERS.find((r) => r.name === "cosine only")!

  it("scores a ranker that finds them all as perfect", () => {
    const row = evaluateSeed(pool, "reference", cosineOnly)!
    expect(row["P@10"]).toBe(0.6)
    expect(row["nDCG@10"]).toBeCloseTo(1)
    expect(row.AUC).toBe(1)
  })

  it("scores one that puts them last as poor, and random near the base rate", () => {
    const reversed = pool.map((p, i) => ({ ...p, cos: 0.1 + i * 0.01 }))
    const worst = evaluateSeed(reversed, "reference", cosineOnly)!
    expect(worst["nDCG@10"]).toBe(0)
    expect(worst.AUC).toBe(0)

    const random = evaluateSeed(pool, "reference", RANDOM, 3)!
    expect(random.AUC).toBe(0.5)
    expect(Math.abs(random["P@10"] - 6 / 30)).toBeLessThan(0.1)
  })

  it("cannot be asked without enough to find, or nothing to miss", () => {
    const few = pool.map((p, i) => ({ ...p, isRef: i < 2 }))
    expect(evaluateSeed(few, "reference", cosineOnly)).toBeNull()
    const all = pool.map((p) => ({ ...p, isRef: true }))
    expect(evaluateSeed(all, "reference", cosineOnly)).toBeNull()
  })

  it("takes the ideal from the full pool when asked, so ablations compare", () => {
    // remove the two best papers: the ranking of the rest is as good as it can
    // be, but against the full pool it has lost what it could have found
    const without = pool.slice(2)
    const alone = evaluateSeed(without, "coupled", cosineOnly)!
    const against = evaluateSeed(without, "coupled", cosineOnly, 1, 3, pool)!
    expect(alone["nDCG@10"]).toBeCloseTo(1)
    expect(against["nDCG@10"]).toBeLessThan(alone["nDCG@10"])
    // precision does not depend on the ideal
    expect(against["P@10"]).toBe(alone["P@10"])
  })

  it("leaves out papers with no vector, as the extension does", () => {
    const withGaps = [...pool, item("nov", { cos: null, isRef: true })]
    const row = evaluateSeed(withGaps, "reference", cosineOnly)!
    expect(row["P@10"]).toBe(0.6)
  })

  it("scores the product like any other method", () => {
    const ranker = RANKERS.find((r) => r.name === PRODUCT)!
    expect(evaluateSeed(pool, "coupled", ranker)!["nDCG@18"]).toBeGreaterThan(
      0.9
    )
  })

  it("reads Semantic Scholar's own list as it is given, and shorter", () => {
    const recs = RANKERS.find((r) => r.name.startsWith("Semantic Scholar"))!
    const withRecs = pool.map((p, i) => ({
      ...p,
      recRank: i < 3 ? i + 1 : undefined
    }))
    const row = evaluateSeed(withRecs, "reference", recs)!
    expect(row["P@18"]).toBeCloseTo(3 / 18)
    expect("AUC" in row).toBe(false)
  })
})
