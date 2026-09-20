import { describe, expect, it } from "vitest"

import { project2D } from "~lib/projection"
import { sharedTerms } from "~lib/terms"

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5)
}

const DIM = 64
function blobs(perBlob: number, blobCount: number, noise = 0.2) {
  const random = rng(11)
  const vectors: number[][] = []
  const label: number[] = []
  for (let b = 0; b < blobCount; b++) {
    for (let i = 0; i < perBlob; i++) {
      vectors.push(Array.from({ length: DIM }, (_, d) => (d % blobCount === b ? 1 : 0) + random() * noise))
      label.push(b)
    }
  }
  return { vectors, label }
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe("project2D", () => {
  it("keeps the map inside [-1, 1] with no NaN", () => {
    const points = project2D(blobs(5, 3).vectors)
    for (const [x, y] of points) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
      expect(Math.abs(x)).toBeLessThanOrEqual(1)
      expect(Math.abs(y)).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...points.flat().map(Math.abs))).toBe(1)
  })

  it("places papers of the same topic closer together than papers of different topics", () => {
    const { vectors, label } = blobs(6, 3)
    const points = project2D(vectors)

    let within = 0, withinN = 0, between = 0, betweenN = 0
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (label[i] === label[j]) { within += dist(points[i], points[j]); withinN++ }
        else { between += dist(points[i], points[j]); betweenN++ }
      }
    }
    expect(within / withinN).toBeLessThan(0.5 * (between / betweenN))
  })

  it("is deterministic", () => {
    const { vectors } = blobs(5, 3)
    expect(project2D(vectors)).toEqual(project2D(vectors))
  })

  it("handles tiny and degenerate inputs", () => {
    expect(project2D([])).toEqual([])
    expect(project2D([[1, 2, 3]])).toEqual([[0, 0]])
    expect(project2D([[1, 0], [0, 1]])).toHaveLength(2)
    const same = project2D([[1, 1, 1], [1, 1, 1], [1, 1, 1]])
    expect(same.flat().every(Number.isFinite)).toBe(true)
  })
})

describe("sharedTerms", () => {
  const reference =
    "Psychometric properties of the Spanish version of the Functionality Appreciation Scales"
  const docs = [
    ["A", "Italian translation of the Functionality Appreciation Scale"],
    ["B", "Body image scale validation among adolescents"],
    ["C", "Deep learning for protein folding"],
    ["D", "Functionality and body scale in athletes"],
    ["E", "Scale development for psychometric assessment"],
    ["F", "Another scale study on stress"],
    ["G", "Scale properties in health"],
    ["H", "Scale of sleep"]
  ].map(([id, text]) => ({ id, text }))

  const terms = sharedTerms(reference, docs)

  it("returns the distinctive terms a document shares with the reference, rarest first", () => {
    expect(terms.get("A")).toEqual(["appreciation", "functionality"])
    expect(terms.get("D")).toEqual(["functionality"])
    expect(terms.get("E")).toEqual(["psychometric"])
  })

  it("drops terms that almost every result has (generic for this topic)", () => {
    // "scale" is in 7 of 8 documents and in the reference
    for (const list of terms.values()) expect(list).not.toContain("scale")
  })

  it("matches plurals with singulars", () => {
    // reference says "Scales", documents say "Scale" — still matched before the generic filter
    const small = sharedTerms("Appreciation scales", [{ id: "x", text: "Appreciation scale" }, { id: "y", text: "Unrelated topic entirely" }])
    expect(small.get("x")).toContain("scale")
  })

  it("omits documents with nothing in common", () => {
    expect(terms.has("C")).toBe(false)
  })

  it("returns nothing for an empty or all-stopword reference", () => {
    expect(sharedTerms("", docs).size).toBe(0)
    expect(sharedTerms("the of and with", docs).size).toBe(0)
  })

  it("with a reference title, only words the reference emphasizes count", () => {
    const title = "Spanish validation study"
    const body = `${title}. We promote capable measures. Measures of anxiety matter, and anxiety again.`
    const doc = [{ id: "d", text: "Spanish promote capable anxiety measure" }]

    // title words + words repeated in the abstract are eligible...
    const focused = sharedTerms(body, doc, 5, title).get("d")!
    expect([...focused].sort()).toEqual(["anxiety", "measure", "spanish"])
    // ...words mentioned once in passing are not
    expect(focused).not.toContain("promote")
    expect(focused).not.toContain("capable")

    // without a title every reference word is eligible (previous behavior)
    expect(sharedTerms(body, doc, 9).get("d")).toContain("promote")
  })

  it("respects maxTerms", () => {
    const many = sharedTerms("alpha beta gamma delta epsilon", [
      { id: "x", text: "alpha beta gamma delta epsilon" },
      { id: "y", text: "unrelated words entirely here" }
    ], 2)
    expect(many.get("x")).toHaveLength(2)
  })
})
