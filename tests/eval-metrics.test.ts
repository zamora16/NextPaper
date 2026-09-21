import { describe, expect, it } from "vitest"

import {
  adjustedRandIndex,
  aucRoc,
  bootstrapDifference,
  bootstrapMean,
  mean,
  ndcgAtK,
  precisionAtK,
  quantile,
  seededRandom
} from "../scripts/audit/metrics"

describe("precisionAtK", () => {
  const relevant = new Set(["a", "c"])

  it("counts the relevant results among the first k", () => {
    expect(precisionAtK(["a", "b", "c", "d"], relevant, 2)).toBe(0.5)
    expect(precisionAtK(["a", "b", "c", "d"], relevant, 4)).toBe(0.5)
    expect(precisionAtK(["a", "c"], relevant, 2)).toBe(1)
  })

  it("does not reward a list shorter than k", () => {
    expect(precisionAtK(["a", "c"], relevant, 4)).toBe(0.5)
    expect(precisionAtK([], relevant, 4)).toBe(0)
  })

  it("is 0 for a non-positive k", () => {
    expect(precisionAtK(["a"], relevant, 0)).toBe(0)
  })
})

describe("ndcgAtK", () => {
  const gains: Record<string, number> = { a: 3, b: 2, c: 1, d: 0 }
  const gain = (id: string) => gains[id] ?? 0
  const pool = ["a", "b", "c", "d"]

  it("is 1 for the ideal order and lower for a worse one", () => {
    expect(ndcgAtK(["a", "b", "c", "d"], gain, pool, 4)).toBeCloseTo(1)
    const worse = ndcgAtK(["c", "b", "a", "d"], gain, pool, 4)
    expect(worse).toBeLessThan(1)
    expect(worse).toBeGreaterThan(0)
  })

  it("matches a value worked out by hand", () => {
    // ranked [b, a]: dcg = 2/log2(2) + 3/log2(3); ideal [a, b]: 3/log2(2) + 2/log2(3)
    const dcg = 2 + 3 / Math.log2(3)
    const ideal = 3 + 2 / Math.log2(3)
    expect(ndcgAtK(["b", "a"], gain, pool, 2)).toBeCloseTo(dcg / ideal, 10)
  })

  it("takes the ideal from everything that could have been shown", () => {
    // only "c" was shown, but "a" and "b" were available
    const value = ndcgAtK(["c"], gain, pool, 1)
    expect(value).toBeCloseTo(1 / 3, 10)
  })

  it("is 0 when nothing in the pool is relevant", () => {
    expect(ndcgAtK(["d"], () => 0, pool, 3)).toBe(0)
  })

  it("only looks at the first k", () => {
    expect(ndcgAtK(["d", "a", "b"], gain, pool, 1)).toBe(0)
  })
})

describe("aucRoc", () => {
  it("is 1 when every relevant item outscores every other, 0 when reversed", () => {
    expect(aucRoc([0.9, 0.8, 0.2, 0.1], [true, true, false, false])).toBe(1)
    expect(aucRoc([0.1, 0.2, 0.8, 0.9], [true, true, false, false])).toBe(0)
  })

  it("is 0.5 for uninformative scores, counting ties as half", () => {
    expect(aucRoc([1, 1, 1, 1], [true, false, true, false])).toBe(0.5)
  })

  it("matches a value worked out by hand", () => {
    // positives 0.8 and 0.3, negatives 0.5 and 0.1:
    // pairs above: (0.8>0.5) (0.8>0.1) (0.3>0.1) = 3 of 4
    expect(aucRoc([0.8, 0.5, 0.3, 0.1], [true, false, true, false])).toBe(0.75)
  })

  it("is null without both classes", () => {
    expect(aucRoc([0.1, 0.2], [true, true])).toBeNull()
    expect(aucRoc([0.1, 0.2], [false, false])).toBeNull()
    expect(aucRoc([], [])).toBeNull()
  })

  it("does not depend on the order of the input", () => {
    const scores = [0.9, 0.1, 0.5, 0.7, 0.3]
    const labels = [true, false, true, false, false]
    const shuffled = [3, 0, 4, 2, 1]
    expect(
      aucRoc(
        shuffled.map((i) => scores[i]),
        shuffled.map((i) => labels[i])
      )
    ).toBe(aucRoc(scores, labels))
  })
})

describe("quantile and mean", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([1, 2, 3, 4], 0)).toBe(1)
    expect(quantile([1, 2, 3, 4], 1)).toBe(4)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5)
    expect(quantile([7], 0.9)).toBe(7)
  })

  it("is NaN for nothing", () => {
    expect(quantile([], 0.5)).toBeNaN()
  })

  it("averages", () => {
    expect(mean([1, 2, 3, 6])).toBe(3)
  })
})

describe("the bootstrap", () => {
  it("is reproducible for a seed", () => {
    const values = [0.2, 0.4, 0.6, 0.8, 0.5, 0.3]
    expect(bootstrapMean(values, 500, 7)).toEqual(bootstrapMean(values, 500, 7))
    expect(seededRandom(3)()).toBe(seededRandom(3)())
  })

  it("brackets the mean and narrows with more agreeing data", () => {
    const wide = bootstrapMean([0, 1, 0, 1, 0, 1], 1000, 1)
    expect(wide.low).toBeLessThanOrEqual(wide.mean)
    expect(wide.high).toBeGreaterThanOrEqual(wide.mean)
    const narrow = bootstrapMean([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 1000, 1)
    expect(narrow.low).toBe(0.5)
    expect(narrow.high).toBe(0.5)
    expect(narrow.high - narrow.low).toBeLessThan(wide.high - wide.low)
  })

  it("says a consistent gain is not chance, and a noisy one may be", () => {
    const base = [0.4, 0.5, 0.45, 0.55, 0.5, 0.42, 0.48, 0.52]
    const better = base.map((v) => v + 0.05)
    const clear = bootstrapDifference(better, base, 1000, 1)
    expect(clear.low).toBeGreaterThan(0)

    const noisy = bootstrapDifference(
      [0.6, 0.4, 0.7, 0.3, 0.55, 0.45],
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      1000,
      1
    )
    expect(noisy.low).toBeLessThan(0)
    expect(noisy.high).toBeGreaterThan(0)
  })

  it("refuses lists that are not paired", () => {
    expect(() => bootstrapDifference([1, 2], [1], 10)).toThrow()
  })
})

describe("adjustedRandIndex", () => {
  it("is 1 for the same partition, whatever the group names", () => {
    expect(adjustedRandIndex([0, 0, 1, 1, 2], [5, 5, 3, 3, 9])).toBe(1)
    expect(adjustedRandIndex([0, 1, 2, 3], [3, 2, 1, 0])).toBe(1)
  })

  it("matches a value worked out by hand", () => {
    // a = {0,1}{2,3}, b = {0}{1,2,3}: one pair is together in both; the pairs
    // together in a (2) and in b (3) make 1 pair expected by chance out of 6,
    // so the index is (1 - 1) / (2.5 - 1) = 0
    expect(adjustedRandIndex([0, 0, 1, 1], [0, 1, 1, 1])).toBeCloseTo(0, 10)
  })

  it("is negative when the groupings disagree more than chance", () => {
    expect(adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1])).toBeLessThan(0)
  })

  it("is high for a small change and lower for a large one", () => {
    const a = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2]
    const oneMoved = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2]
    const scrambled = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]
    const small = adjustedRandIndex(a, oneMoved)
    expect(small).toBeGreaterThan(0.6)
    expect(small).toBeLessThan(1)
    expect(adjustedRandIndex(a, scrambled)).toBeLessThan(small)
  })

  it("treats two trivial groupings as agreeing, and a trivial and a real one as not", () => {
    expect(adjustedRandIndex([0, 0, 0, 0], [7, 7, 7, 7])).toBe(1)
    expect(adjustedRandIndex([0, 1, 2, 3], [0, 1, 2, 3])).toBe(1)
    expect(adjustedRandIndex([0, 0, 0, 0], [0, 0, 1, 1])).toBe(0)
    expect(adjustedRandIndex([0, 1, 2, 3], [0, 0, 1, 1])).toBe(0)
  })

  it("refuses groupings of different items", () => {
    expect(() => adjustedRandIndex([0, 1], [0])).toThrow()
  })
})
