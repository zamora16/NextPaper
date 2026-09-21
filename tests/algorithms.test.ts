import { describe, expect, it } from "vitest"

import {
  clusterAuto,
  mergeSmallClusters,
  silhouetteScore
} from "~lib/clustering"
import { labelClusters } from "~lib/keywords"
import { ALL_GROUP, type PaperGroup, type ScoredPaper } from "~lib/pipeline"
import {
  cosineSimilarity,
  euclideanDistance,
  meanVector,
  norm,
  normalize
} from "~lib/vector-math"
import { applyView, searchLibrary } from "~lib/view"

import { kMeans } from "../scripts/audit/kmeans-baseline"

describe("searchLibrary", () => {
  const item = (
    title: string,
    over: Partial<{
      authors: string[]
      venue: string
      year: number
      note: string
      collections: string[]
    }> = {}
  ) => ({
    title,
    authors: (over.authors ?? []).map((name) => ({ name })),
    venue: over.venue ?? "",
    year: over.year ?? null,
    note: over.note ?? "",
    collections: over.collections ?? []
  })
  const library = [
    item("Body image in virtual reality", {
      authors: ["Tracy Tylka"],
      year: 2015,
      venue: "Body Image"
    }),
    item("Evaluación psicométrica de la escala", {
      authors: ["José Pérez"],
      note: "usar en el capítulo 3",
      collections: ["Tesis"]
    })
  ]

  it("returns everything for an empty query", () => {
    expect(searchLibrary(library, "")).toEqual(library)
    expect(searchLibrary(library, "   ")).toEqual(library)
  })

  it("needs every word, wherever it appears", () => {
    expect(searchLibrary(library, "tylka 2015")).toEqual([library[0]])
    expect(searchLibrary(library, "tylka 2020")).toEqual([])
  })

  it("looks in the venue, the note and the collections", () => {
    expect(searchLibrary(library, "capitulo")).toEqual([library[1]])
    expect(searchLibrary(library, "tesis")).toEqual([library[1]])
    expect(searchLibrary(library, "body image")).toEqual([library[0]])
  })

  it("ignores case and accents in both directions", () => {
    expect(searchLibrary(library, "EVALUACION PSICOMETRICA")).toEqual([
      library[1]
    ])
    expect(searchLibrary(library, "perez")).toEqual([library[1]])
    expect(searchLibrary(library, "José")).toEqual([library[1]])
  })
})

// Deterministic pseudo-random noise (LCG) so failures are reproducible.
function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5
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
        Array.from(
          { length: DIM },
          (_, d) => (d % perBlob.length === blob ? 1 : 0) + random() * noise
        )
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
    expect(
      meanVector([
        [0, 2],
        [2, 4]
      ])
    ).toEqual([1, 3])
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5)
  })
})

describe("k-means (the retired grouping, kept as the audit baseline)", () => {
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
    const scrambled = silhouetteScore(
      vectors,
      truth.map((_, i) => i % 3)
    )
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

describe("clusterAuto (hierarchical, k by silhouette)", () => {
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

  it("is deterministic: no random start, the same input gives the same groups", () => {
    const { vectors } = blobs([6, 6, 6], 0.6)
    expect(clusterAuto(vectors)).toEqual(clusterAuto(vectors))
  })

  it("never returns more groups than maxK", () => {
    const { vectors } = blobs([5, 5, 5, 5])
    expect(new Set(clusterAuto(vectors, 2, 2)).size).toBeLessThanOrEqual(2)
    expect(new Set(clusterAuto(vectors, 2, 3)).size).toBeLessThanOrEqual(3)
  })

  it("keeps the same groups when a paper is dropped", () => {
    const { vectors, truth } = blobs([6, 6, 6], 0.4)
    const without = vectors.filter((_, i) => i !== 4)
    expect(
      samePartition(
        clusterAuto(without),
        truth.filter((_, i) => i !== 4)
      )
    ).toBe(true)
  })
})

describe("labelClusters", () => {
  const translation = [
    "Neural machine translation with attention",
    "Attention models for neural machine translation",
    "Multilingual neural machine translation"
  ]
  const protein = [
    "Protein structure prediction with neural networks",
    "Deep protein folding prediction",
    "Protein structure prediction at scale"
  ]

  it("names each group with the words that set it apart, not the shared ones", () => {
    const [a, b] = labelClusters([translation, protein])
    expect(a).toMatch(/machine translation/i)
    expect(b).toMatch(/protein/i)
    // "neural" is in both groups, so it is not what names either one
    expect(a).not.toBe("Neural")
    expect(b).not.toBe("Neural")
  })

  it("prefers a phrase to the words it is made of, up to three words", () => {
    const labels = labelClusters([
      [
        "Graph neural networks for molecules",
        "Explainable graph neural networks",
        "Scalable graph neural networks in chemistry"
      ],
      ["Random forests for tabular data", "Boosting for tabular data"]
    ])
    expect(labels[0]).toBe("Graph neural networks")
  })

  it("keeps acronyms and names as written, and lowers everything else", () => {
    const labels = labelClusters([
      [
        "CRISPR screens in human cells",
        "CRISPR base editing of the genome",
        "Delivery of CRISPR components"
      ],
      [
        "Predicting folds with AlphaFold models",
        "AlphaFold in structural biology",
        "Using AlphaFold for design"
      ],
      ["RANDOMIZED TRIAL OF EXERCISE", "Randomized trial of diet", "Trials"]
    ])
    expect(labels[0]).toBe("CRISPR")
    expect(labels[1]).toBe("AlphaFold")
    expect(labels[2]).toMatch(/^Randomized/)
    expect(labels[2]).not.toMatch(/RANDOMIZED/)
  })

  it("folds plurals into one term and shows a word the papers use", () => {
    const labels = labelClusters([
      [
        "A scale for body appreciation",
        "Scales of body appreciation in men",
        "Validation of the scale"
      ],
      ["Deep learning for images", "Learning to rank", "Image learning"]
    ])
    expect(labels[0]).toMatch(/scale/i)
  })

  it("says nothing when no word is in at least half of the group's titles", () => {
    const labels = labelClusters([
      [
        "Alpha waves in sleep",
        "Beta blockers and outcomes",
        "Gamma rays in space"
      ],
      ["Delta smelting", "Epsilon proofs", "Zeta functions"]
    ])
    expect(labels).toEqual([null, null])
  })

  it("does not name a group by a word only one of its papers has", () => {
    const labels = labelClusters([
      ["Volcano eruptions", "Coral reef ecology", "Desert botany"],
      ["Neural coding", "Neural plasticity", "Neural networks in the brain"]
    ])
    expect(labels[0]).toBeNull()
    expect(labels[1]).toMatch(/neural/i)
  })

  it("does not name a group by a word the other groups use just as much", () => {
    const labels = labelClusters([
      [
        "Deep learning for vision",
        "Deep learning for speech",
        "Deep learning in law"
      ],
      [
        "Deep learning for text",
        "Deep learning for music",
        "Deep learning for art"
      ]
    ])
    expect(labels).toEqual([null, null])
  })

  it("never uses the filler words of abstracts and papers", () => {
    const labels = labelClusters([
      [
        "Results of a study of methods",
        "Analysis of results and methods",
        "A review of studies and results"
      ],
      [
        "Something entirely different here",
        "Another unrelated topic",
        "Third one"
      ]
    ])
    expect(labels[0]).toBeNull()
  })

  it("understands Spanish filler words too", () => {
    const labels = labelClusters([
      [
        "Estudio de la depresión en adolescentes",
        "Depresión y sueño en adolescentes",
        "Tratamiento de la depresión"
      ],
      ["Física de materiales blandos", "Materiales para baterías", "Reología"]
    ])
    expect(labels[0]).toMatch(/depresi/i)
    expect(labels[0]!.toLowerCase()).not.toContain("estudio")
  })

  it("never gives two groups the same name", () => {
    const same = [
      "Body image and eating",
      "Body image in adolescents",
      "Body image measures"
    ]
    const named = labelClusters([same, [...same]]).filter(Boolean)
    expect(new Set(named).size).toBe(named.length)
  })

  it("only pairs two terms when the second is nearly as characteristic", () => {
    const labels = labelClusters([
      [
        "Sleep and memory consolidation",
        "Sleep spindles and memory",
        "Memory during sleep",
        "Sleep in the elderly"
      ],
      ["Trading algorithms", "Portfolio algorithms", "Markets"]
    ])
    expect(labels[0]).toMatch(/sleep/i)
    expect(labels[0]!.split(" · ").length).toBeLessThanOrEqual(2)
  })

  it("needs the term in at least half of the group, however distinctive it is", () => {
    // "volcano" is in one third of the group and nowhere else: distinctive, but
    // most of the group's papers do not use it, so it must not name the group
    const labels = labelClusters([
      [
        "Volcano hazards",
        "Volcano monitoring",
        "Coral reefs",
        "Desert botany",
        "River deltas",
        "Glacier melt"
      ],
      ["Neural coding", "Neural plasticity", "Neural circuits"]
    ])
    expect(labels[0]).toBeNull()
  })

  it("does not name a group of a single paper", () => {
    expect(
      labelClusters([
        ["Volcano hazards"],
        ["Neural coding", "Neural circuits"]
      ])[0]
    ).toBeNull()
  })

  it("leaves out a second term that fewer of the papers use", () => {
    const labels = labelClusters([
      [
        "Sleep and memory",
        "Sleep and memory in adults",
        "Sleep in children",
        "Sleep hygiene"
      ],
      ["Trading algorithms", "Portfolio algorithms", "Markets"]
    ])
    // "sleep" is in all four titles, "memory" in half of them
    expect(labels[0]).toBe("Sleep")
  })

  it("does not repeat a word across the terms of one label", () => {
    const labels = labelClusters([
      [
        "Mindfulness training benefits",
        "Mindfulness training outcomes",
        "Training benefits of mindfulness"
      ],
      ["Trading algorithms", "Portfolio algorithms", "Markets"]
    ])
    const words = labels[0]!.toLowerCase().split(/ · | /)
    expect(new Set(words).size).toBe(words.length)
  })

  it("gives a shared word to one group only", () => {
    const labels = labelClusters([
      ["Sleep and memory", "Sleep and attention", "Sleep and mood"],
      ["Sleep and appetite", "Sleep and weight", "Sleep and hormones"],
      ["Trading algorithms", "Portfolio algorithms", "Markets"]
    ])
    expect(labels.filter((label) => /sleep/i.test(label ?? ""))).toHaveLength(1)
  })

  it("is deterministic", () => {
    const groups = [translation, protein]
    expect(labelClusters(groups)).toEqual(labelClusters(groups))
  })

  it("copes with empty input and odd characters", () => {
    expect(labelClusters([])).toEqual([])
    expect(labelClusters([[]])).toEqual([null])
    expect(labelClusters([["--- ...", "12345", "¿¡?!"], ["ok"]])).toEqual([
      null,
      null
    ])
  })

  it("every word of a label is in at least half of the group's titles", () => {
    const groups = [translation, protein]
    const labels = labelClusters(groups)
    labels.forEach((label, i) => {
      for (const word of label!.toLowerCase().split(/ · | /)) {
        const stem = word.replace(/s$/, "")
        const inside = groups[i].filter((title) =>
          title.toLowerCase().includes(stem)
        ).length
        expect(inside / groups[i].length).toBeGreaterThanOrEqual(0.5)
      }
    })
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
        make("a2", {
          relation: "citation",
          citationCount: 50,
          year: 2024,
          openAccessPdf: { url: "https://x/y.pdf" }
        })
      ]
    },
    {
      label: "B",
      papers: [
        make("b1", {
          title: "A systematic review",
          citationCount: 500,
          year: 2018
        })
      ]
    }
  ]
  const ids = (g: PaperGroup[]) =>
    g.flatMap((x) => x.papers.map((p) => p.paperId))

  it("filters and drops groups that end up empty", () => {
    expect(ids(applyView(groups, "reference", "relevance"))).toEqual(["a1"])
    expect(ids(applyView(groups, "citation", "relevance"))).toEqual(["a2"])
    expect(ids(applyView(groups, "review", "relevance"))).toEqual(["b1"])
    expect(ids(applyView(groups, "open", "relevance"))).toEqual(["a2"])
    expect(
      applyView(groups, "review", "relevance").map((g) => g.label)
    ).toEqual(["B"])
  })

  it("relevance keeps the groups; other sorts flatten into one list", () => {
    expect(applyView(groups, "all", "relevance").map((g) => g.label)).toEqual([
      "A",
      "B"
    ])
    const byCitations = applyView(groups, "all", "citations")
    expect(byCitations).toHaveLength(1)
    expect(byCitations[0].label).toBe(ALL_GROUP)
    expect(ids(byCitations)).toEqual(["b1", "a2", "a1"])
    expect(ids(applyView(groups, "all", "year"))).toEqual(["a2", "b1", "a1"])
  })

  it("returns no groups when nothing matches", () => {
    expect(applyView(groups, "open", "citations")).toHaveLength(1)
    expect(
      applyView(
        [{ label: "X", papers: [make("x", {})] }],
        "review",
        "citations"
      )
    ).toEqual([])
  })
})
