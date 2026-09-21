// The evaluation's rankers, "truths" and per-seed scoring, apart from the
// script that runs them so they can be unit-tested (tests/ranking-eval.test.ts):
// in particular that `product` picks the same papers as the real pipeline.
import { aucRoc, ndcgAtK, precisionAtK, seededRandom } from "./metrics"
import type { PoolItem } from "./types"

export const COUPLED_MIN = 3
export const SHORTLIST = 40
export const KS = [10, 18, 30]

export const blended = (item: PoolItem, weight: number) =>
  (item.cos ?? -1) + weight * Math.log10(1 + item.citations)

export type Order = (items: PoolItem[]) => PoolItem[]

export const byScore =
  (score: (item: PoolItem) => number): Order =>
  (items) =>
    [...items].sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))

// What the extension shows: the 40 closest by cosine, reordered by the blend
// (lib/pipeline.ts: SHORTLIST, CITATION_WEIGHT).
export const product: Order = (items) => {
  const closest = byScore((i) => i.cos ?? -1)(items)
  const shortlist = closest.slice(0, SHORTLIST)
  const rest = closest.slice(SHORTLIST)
  return [...byScore((i) => blended(i, 0.02))(shortlist), ...rest]
}

export interface Ranker {
  name: string
  order: Order
  // present when the method gives every candidate a score (for the AUC)
  score?: (item: PoolItem) => number
}

export const PRODUCT = "product (top-40 by cosine, blend 0.02)"
export const RANDOM = "random (mean of 20 shuffles)"

export const RANKERS: Ranker[] = [
  { name: PRODUCT, order: product },
  {
    name: "cosine only",
    order: byScore((i) => i.cos ?? -1),
    score: (i) => i.cos ?? -1
  },
  {
    name: "cosine + 0.02 log10(citations), no shortlist",
    order: byScore((i: PoolItem) => blended(i, 0.02)),
    score: (i: PoolItem) => blended(i, 0.02)
  },
  ...[0.005, 0.01, 0.03, 0.05, 0.1, 0.2].map((w) => ({
    name: `cosine + ${w} log10(citations)`,
    order: byScore((i: PoolItem) => blended(i, w)),
    score: (i: PoolItem) => blended(i, w)
  })),
  {
    name: "citations only",
    order: byScore((i) => i.citations),
    score: (i) => i.citations
  },
  {
    name: "newest first",
    order: byScore((i) => i.year ?? 0),
    score: (i) => i.year ?? 0
  },
  {
    name: "Semantic Scholar recommendations, in their order",
    order: (items) =>
      items
        .filter((i) => i.recRank !== undefined)
        .sort((a, b) => a.recRank! - b.recRank!)
  }
]

export type Truth = "reference" | "coupled"

export const gain =
  (truth: Truth, coupledMin = COUPLED_MIN) =>
  (item: PoolItem) =>
    truth === "reference"
      ? item.isRef
        ? 1
        : 0
      : (item.coupling ?? 0) >= coupledMin
        ? Math.min(item.coupling ?? 0, 10)
        : 0

export const positive =
  (truth: Truth, coupledMin = COUPLED_MIN) =>
  (item: PoolItem) =>
    truth === "reference" ? item.isRef : (item.coupling ?? 0) >= coupledMin

// Without the papers that only the seed's own reference list brought in: can
// the other sources plus the ranking find what the authors cited?
export const withoutReferenceOnly = (items: PoolItem[]) =>
  items.filter((i) => !(i.sources.length === 1 && i.sources[0] === "reference"))

// Without the candidates that only one source brought in.
export const withoutSource =
  (source: "reference" | "citation" | "search" | "recommended") =>
  (items: PoolItem[]) =>
    items.filter((i) => !(i.sources.length === 1 && i.sources[0] === source))

// Without the citing papers beyond the `cited` most cited and the `recent`
// most recent ones (a citing paper found by another source stays).
export const limitCiters =
  (cited: number, recent: number) => (items: PoolItem[]) =>
    items.filter(
      (i) =>
        !(i.sources.length === 1 && i.sources[0] === "citation") ||
        (i.citedRank !== undefined && i.citedRank <= cited) ||
        (i.recentRank !== undefined && i.recentRank <= recent)
    )

// Scores one method on one seed's candidates. Null when the question cannot be
// asked: fewer than 3 related papers to find, or nothing to tell them from.
//
// nDCG divides by the best possible list, which depends on what could have been
// shown. When methods are compared on DIFFERENT pools (removing a source), pass
// the full pool as `idealFrom`: otherwise removing good candidates lowers the
// ideal and can raise the score without the ranking improving.
export function evaluateSeed(
  candidates: PoolItem[],
  truth: Truth,
  ranker: Ranker | typeof RANDOM,
  seed = 1,
  coupledMin = COUPLED_MIN,
  idealFrom?: PoolItem[]
): Record<string, number> | null {
  const items = candidates.filter((i) => i.cos !== null)
  const relevant = new Set(
    items.filter(positive(truth, coupledMin)).map((i) => i.id)
  )
  if (relevant.size < 3 || relevant.size === items.length) return null

  const g = gain(truth, coupledMin)
  const gainById = new Map(items.map((i) => [i.id, g(i)]))
  const ids = items.map((i) => i.id)
  const idealItems = (idealFrom ?? items).filter((i) => i.cos !== null)
  for (const i of idealItems) gainById.set(i.id, g(i))
  const idealIds = idealItems.map((i) => i.id)
  const metrics = (ranked: string[]) => {
    const row: Record<string, number> = {}
    for (const k of KS) {
      row[`P@${k}`] = precisionAtK(ranked, relevant, k)
      row[`nDCG@${k}`] = ndcgAtK(
        ranked,
        (id) => gainById.get(id) ?? 0,
        idealIds,
        k
      )
    }
    return row
  }

  if (ranker === RANDOM) {
    const random = seededRandom(seed)
    const runs: Record<string, number>[] = []
    for (let r = 0; r < 20; r++) {
      const shuffled = [...ids]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      runs.push(metrics(shuffled))
    }
    const row: Record<string, number> = {}
    for (const key of Object.keys(runs[0])) {
      row[key] = runs.reduce((s, x) => s + x[key], 0) / runs.length
    }
    row.AUC = 0.5
    return row
  }

  const row = metrics(ranker.order(items).map((i) => i.id))
  if (ranker.score) {
    const auc = aucRoc(
      items.map(ranker.score),
      items.map((i) => relevant.has(i.id))
    )
    if (auc !== null) row.AUC = auc
  }
  return row
}
