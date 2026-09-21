// Ranking metrics and the statistics around them, for the offline evaluation
// (see docs/EVALUATION.md). Pure functions; tests/eval-metrics.test.ts pins
// them, because a wrong nDCG would quietly mislead every conclusion.

// Fraction of the first k results that are relevant (k counts empty slots as
// misses, so a short list cannot look better than a full one).
export function precisionAtK(
  ranked: string[],
  relevant: Set<string>,
  k: number
): number {
  if (k <= 0) return 0
  const hits = ranked.slice(0, k).filter((id) => relevant.has(id)).length
  return hits / k
}

const discount = (position: number) => 1 / Math.log2(position + 2)

// Normalized discounted cumulative gain at k. `gain` is 0 for irrelevant
// results; the ideal ordering is taken over `pool`, everything that could have
// been shown. 1 is a perfect list, 0 has nothing relevant.
export function ndcgAtK(
  ranked: string[],
  gain: (id: string) => number,
  pool: string[],
  k: number
): number {
  const dcg = ranked
    .slice(0, k)
    .reduce((sum, id, i) => sum + gain(id) * discount(i), 0)
  const ideal = pool
    .map(gain)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((sum, g, i) => sum + g * discount(i), 0)
  return ideal === 0 ? 0 : dcg / ideal
}

// Probability that a random relevant item scores above a random irrelevant
// one (ties count half): the area under the ROC curve, from ranks. Null when
// one of the classes is empty.
export function aucRoc(scores: number[], relevant: boolean[]): number | null {
  const positives = relevant.filter(Boolean).length
  const negatives = relevant.length - positives
  if (positives === 0 || negatives === 0) return null

  const order = scores
    .map((score, i) => ({ score, positive: relevant[i] }))
    .sort((a, b) => a.score - b.score)

  let rankSum = 0
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j < order.length && order[j].score === order[i].score) j++
    const averageRank = (i + 1 + j) / 2 // 1-based, ties share their mean rank
    for (let t = i; t < j; t++) if (order[t].positive) rankSum += averageRank
    i = j
  }
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives)
}

// Linear-interpolated quantile of an unsorted list.
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const below = Math.floor(position)
  const above = Math.ceil(position)
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below)
}

export const mean = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length

// A small seeded generator, so a report can be reproduced exactly.
export function seededRandom(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Interval {
  mean: number
  low: number
  high: number
  n: number
}

// Mean and 95% bootstrap interval over the seeds (each seed is one unit: its
// candidates are not independent of each other, its papers are).
export function bootstrapMean(
  values: number[],
  iterations = 2000,
  seed = 1
): Interval {
  const random = seededRandom(seed)
  const means: number[] = []
  for (let b = 0; b < iterations; b++) {
    let sum = 0
    for (let i = 0; i < values.length; i++) {
      sum += values[Math.floor(random() * values.length)]
    }
    means.push(sum / values.length)
  }
  return {
    mean: mean(values),
    low: quantile(means, 0.025),
    high: quantile(means, 0.975),
    n: values.length
  }
}

// The same, for the paired difference of two methods over the same seeds. An
// interval that excludes 0 is a difference not explained by which seeds
// happened to be drawn.
export function bootstrapDifference(
  a: number[],
  b: number[],
  iterations = 2000,
  seed = 1
): Interval {
  if (a.length !== b.length) throw new Error("paired lists differ in length")
  return bootstrapMean(
    a.map((value, i) => value - b[i]),
    iterations,
    seed
  )
}
