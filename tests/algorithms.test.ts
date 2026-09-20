import { describe, expect, it } from "vitest"

import {
  clusterAuto,
  kMeans,
  mergeSmallClusters,
  silhouetteScore
} from "~lib/kmeans"
import { labelClusters } from "~lib/keywords"
import { isReview } from "~lib/paper-utils"
import type { PaperGroup, ScoredPaper } from "~lib/pipeline"
import {
  cosineSimilarity,
  euclideanDistance,
  meanVector,
  norm,
  normalize
} from "~lib/vector-math"
import { applyView } from "~lib/view"

// Deterministic pseudo-random noise (LCG) so failures are reproducible.
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5)
}

const DIM = 64

// n points around each of `centers` distinct axis-aligned centers.
function blobs(perBlob: number[], noise = 0.25, seed = 7) {
  const random = rng(seed)
  const vectors: number[][] = []
  const truth: number[] = []
  perBlob.forEach((count, blob) => {
    for (let i = 0; i < count; i++) {
      vectors.push(
        Array.from({ length: DIM }, (_, d) => (d % perBlob.length === blob ? 1 : 0) + random() * noise)
      )
      truth.push(blob)
    }
  })
  return { vectors, truth }
}

// Two labelings are the same partition, whatever the label names are.
function samePartition(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      if ((a[i] === a[j]) !== (b[i] === b[j])) return false
    }
  }
  return true
}

describe("vector-math", () => {
  it("cosine similarity", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it("normalize gives unit length and leaves the zero vector alone", () => {
    expect(norm(normalize([3, 4]))).toBeCloseTo(1)
    expect(normalize([0, 0])).toEqual([0, 0])
  })

  it("mean and euclidean distance", () => {
    expect(meanVector([[0, 2], [2, 4]])).toEqual([1, 3])
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5)
  })
})

describe("k-means", () => {
  it("recovers well-separated clusters", () => {
    const { vectors, truth } = blobs([5, 5, 5])
    expect(samePartition(kMeans(vectors, 3), truth)).toBe(true)
  })

  it("is deterministic", () => {
    const { vectors } = blobs([6, 6, 6], 0.6)
    expect(kMeans(vectors, 3)).toEqual(kMeans(vectors, 3))
  })

  it("never asks for more clusters than points", () => {
    const { vectors } = blobs([2])
    expect(new Set(kMeans(vectors, 5)).size).toBeLessThanOrEqual(2)
  })
})

describe("silhouette score", () => {
  it("is high for the true clustering and lower for a scrambled one", () => {
    const { vectors, truth } = blobs([6, 6, 6])
    const good = silhouetteScore(vectors, truth)
    const scrambled = silhouetteScore(vectors, truth.map((_, i) => i % 3))
    expect(good).toBeGreaterThan(0.5)
    expect(good).toBeGreaterThan(scrambled)
  })

  it("is -1 when there is a single cluster", () => {
    const { vectors } = blobs([4])
    expect(silhouetteScore(vectors, [0, 0, 0, 0])).toBe(-1)
  })
})

describe("mergeSmallClusters", () => {
  it("moves a lone outlier into the nearest kept cluster", () => {
    const { vectors } = blobs([4, 4])
    const labels = [0, 0, 0, 0, 1, 1, 1, 2]
    const merged = mergeSmallClusters(vectors, labels)
    expect(merged.slice(0, 7)).toEqual([0, 0, 0, 0, 1, 1, 1])
    expect(merged[7]).toBe(1)
  })

  it("leaves a clustering with no small clusters untouched", () => {
    const { vectors } = blobs([3, 3])
    const labels = [0, 0, 0, 1, 1, 1]
    expect(mergeSmallClusters(vectors, labels)).toEqual(labels)
  })
})

describe("clusterAuto picks k by silhouette", () => {
  it.each([2, 3, 4])("finds %i true clusters", (k) => {
    const { vectors, truth } = blobs(Array(k).fill(5))
    const found = clusterAuto(vectors)
    expect(new Set(found).size).toBe(k)
    expect(samePartition(found, truth)).toBe(true)
  })

  it("returns one cluster for fewer than 4 points", () => {
    const { vectors } = blobs([3])
    expect(clusterAuto(vectors)).toEqual([0, 0, 0])
  })
})

describe("labelClusters", () => {
  it("labels each cluster with words that distinguish it, not shared ones", () => {
    const labels = labelClusters([
      [
        "Neural machine translation with attention",
        "Attention models for neural machine translation",
        "Multilingual neural machine translation"
      ],
      [
        "Protein structure prediction with neural networks",
        "Deep protein folding prediction",
        "Protein structure prediction at scale"
      ]
    ])
    expect(labels[0]).toMatch(/Translation/)
    expect(labels[1]).toMatch(/Protein/)
    // "neural" appears in both clusters, so it must not win either label
    expect(labels[0].toLowerCase()).not.toContain("neural")
  })

  it("falls back to a generic label when nothing usable remains", () => {
    expect(labelClusters([["a b c"]])).toEqual(["Grupo"])
  })
})

describe("isReview", () => {
  const paper = (title: string, publicationTypes?: string[]) =>
    ({ title, publicationTypes }) as ScoredPaper

  it("trusts Semantic Scholar's publication types", () => {
    expect(isReview(paper("Anything", ["Review"]))).toBe(true)
    expect(isReview(paper("Anything", ["MetaAnalysis"]))).toBe(true)
    expect(isReview(paper("Anything", ["JournalArticle"]))).toBe(false)
  })

  it("falls back to title patterns", () => {
    expect(isReview(paper("A systematic review of X"))).toBe(true)
    expect(isReview(paper("Meta-analysis of Y"))).toBe(true)
    expect(isReview(paper("Revisión sistemática de Z"))).toBe(true)
    expect(isReview(paper("A new method for X"))).toBe(false)
  })
})

describe("applyView", () => {
  const make = (id: string, over: Partial<ScoredPaper>): ScoredPaper =>
    ({
      paperId: id,
      title: id,
      authors: [],
      year: 2020,
      citationCount: 0,
      venue: "",
      url: "",
      similarity: 0.9,
      approximate: false,
      relation: null,
      ...over
    }) as ScoredPaper

  const groups: PaperGroup[] = [
    {
      label: "A",
      papers: [
        make("a1", { relation: "reference", citationCount: 5, year: 2010 }),
        make("a2", { relation: "citation", citationCount: 50, year: 2024, openAccessPdf: { url: "https://x/y.pdf" } })
      ]
    },
    {
      label: "B",
      papers: [make("b1", { title: "A systematic review", citationCount: 500, year: 2018 })]
    }
  ]
  const ids = (g: PaperGroup[]) => g.flatMap((x) => x.papers.map((p) => p.paperId))

  it("filters and drops groups that end up empty", () => {
    expect(ids(applyView(groups, "reference", "relevance"))).toEqual(["a1"])
    expect(ids(applyView(groups, "citation", "relevance"))).toEqual(["a2"])
    expect(ids(applyView(groups, "review", "relevance"))).toEqual(["b1"])
    expect(ids(applyView(groups, "open", "relevance"))).toEqual(["a2"])
    expect(applyView(groups, "review", "relevance").map((g) => g.label)).toEqual(["B"])
  })

  it("relevance keeps the groups; other sorts flatten into one list", () => {
    expect(applyView(groups, "all", "relevance").map((g) => g.label)).toEqual(["A", "B"])
    const byCitations = applyView(groups, "all", "citations")
    expect(byCitations).toHaveLength(1)
    expect(byCitations[0].label).toBe("Todos")
    expect(ids(byCitations)).toEqual(["b1", "a2", "a1"])
    expect(ids(applyView(groups, "all", "year"))).toEqual(["a2", "b1", "a1"])
  })

  it("returns no groups when nothing matches", () => {
    expect(applyView(groups, "open", "citations")).toHaveLength(1)
    expect(applyView([{ label: "X", papers: [make("x", {})] }], "review", "citations")).toEqual([])
  })
})
