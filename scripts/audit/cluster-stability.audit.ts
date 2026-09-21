// How stable are the subtopic groups? Reclusters after a small change to the
// papers (drop about 10% of the ones the method clusters) and measures how much
// the grouping of the papers that are SHOWN survives (adjusted Rand index).
// Compares the extension's method with alternatives: allowing "no clear
// groups", hierarchical clustering, and clustering the larger shortlist (40)
// instead of only the papers shown. Needs the pools of collect-pools and the
// topics of collect-topics; no network.
//
//   npx vitest run --config vitest.audit.config.ts cluster-stability
import { readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"

import {
  clusterAuto,
  mergeSmallClusters,
  silhouetteScore
} from "~lib/clustering"
import { labelClusters } from "~lib/keywords"

import { kMeans } from "./kmeans-baseline"
import {
  adjustedRandIndex,
  bootstrapMean,
  quantile,
  seededRandom,
  type Interval
} from "./metrics"
import { blended } from "./ranking-eval"
import type { Pool } from "./types"

const probe = join(tmpdir(), "probe")
const poolsDir = process.env.AUDIT_POOLS || join(probe, "pools")
const topicsFile = process.env.AUDIT_TOPICS || join(probe, "topics.json")

const fromBase64 = (text: string): number[] =>
  Array.from(
    new Float32Array(new Uint8Array(Buffer.from(text, "base64")).buffer)
  )

// One thing to group: the papers the method clusters (a shortlist or only the
// shown ones), and which of them are shown.
interface Case {
  vectors: number[][]
  titles: string[]
  shown: number[]
  maxK: number
}

interface Grouping {
  assign: number[]
  score: number // silhouette (-1 for a single group)
}

function kmeansAuto(vectors: number[][], maxK: number): Grouping {
  const upper = Math.min(maxK, Math.floor(vectors.length / 2))
  let best: Grouping = { assign: vectors.map(() => 0), score: -Infinity }
  for (let k = 2; k <= upper; k++) {
    const assign = mergeSmallClusters(vectors, kMeans(vectors, k))
    const score = silhouetteScore(vectors, assign)
    if (score > best.score) best = { assign, score }
  }
  return best
}

// The grouping the extension ships.
function hierarchicalAuto(vectors: number[][], maxK: number): Grouping {
  const assign = clusterAuto(vectors, 2, maxK)
  return { assign, score: silhouetteScore(vectors, assign) }
}

// Show only the groups an honest name was found for; everything else goes
// together into one "other" group. No nameable group at all: a single list.
const namedOrOther =
  (method: (v: number[][], k: number, titles: string[]) => Grouping) =>
  (vectors: number[][], maxK: number, titles: string[]): Grouping => {
    const g = method(vectors, maxK, titles)
    const k = Math.max(...g.assign) + 1
    if (k < 2) return g
    const members: string[][] = Array.from({ length: k }, () => [])
    g.assign.forEach((c, i) => members[c].push(titles[i]))
    const labels = labelClusters(members)
    const named = labels.map((l, c) => (l ? c : -1)).filter((c) => c >= 0)
    if (named.length === 0) {
      return { assign: vectors.map(() => 0), score: -1 }
    }
    const other = named.length
    const assign = g.assign.map((c) => {
      const at = named.indexOf(c)
      return at >= 0 ? at : other
    })
    const anyOther = assign.some((x) => x === other)
    // a single named group with nothing else is just one list
    if (named.length === 1 && !anyOther) {
      return { assign: vectors.map(() => 0), score: -1 }
    }
    return { assign, score: g.score }
  }

interface Method {
  cluster: (v: number[][], maxK: number, titles: string[]) => Grouping
  // cluster all of the shortlist instead of only the shown papers
  onShortlist: boolean
}

const METHODS: Record<string, Method> = {
  "today: k-means on the shown, always 2+ groups": {
    cluster: kmeansAuto,
    onShortlist: false
  },
  "k-means, only named groups + Other": {
    cluster: namedOrOther(kmeansAuto),
    onShortlist: false
  },
  "hierarchical, always 2+ groups": {
    cluster: hierarchicalAuto,
    onShortlist: false
  },
  "hierarchical, only named groups + Other": {
    cluster: namedOrOther(hierarchicalAuto),
    onShortlist: false
  }
}

const fmt = (x: Interval, digits = 2) =>
  `${x.mean.toFixed(digits)} [${x.low.toFixed(digits)}, ${x.high.toFixed(digits)}]`
const pct = (x: number[]) =>
  `${((100 * x.reduce((s, v) => s + v, 0)) / x.length).toFixed(0)}%`

// What the method makes of one case: a grouping of the SHOWN papers.
function groupShown(
  method: Method,
  c: Case
): { assign: number[]; score: number } {
  if (!method.onShortlist) {
    const g = method.cluster(
      c.shown.map((i) => c.vectors[i]),
      c.maxK,
      c.shown.map((i) => c.titles[i])
    )
    return { assign: g.assign, score: g.score }
  }
  const g = method.cluster(c.vectors, c.maxK, c.titles)
  return { assign: c.shown.map((i) => g.assign[i]), score: g.score }
}

function evaluate(name: string, cases: Case[], random: () => number) {
  const method = METHODS[name]
  const stability: number[] = []
  const nontrivial: number[] = []
  const single: number[] = []
  const counts: number[] = []
  const named: number[] = []
  const largest: number[] = []

  for (const c of cases) {
    const original = groupShown(method, c)
    const k = Math.max(...original.assign) + 1
    single.push(k === 1 ? 1 : 0)
    counts.push(k)

    if (k > 1) {
      const sizes = Array.from(
        { length: k },
        (_, g) => original.assign.filter((x) => x === g).length
      )
      largest.push(Math.max(...sizes) / original.assign.length)
      const groups: string[][] = Array.from({ length: k }, () => [])
      c.shown.forEach((paper, i) =>
        groups[original.assign[i]].push(c.titles[paper])
      )
      const labels = labelClusters(groups)
      named.push(labels.filter(Boolean).length / labels.length)
    }

    // drop ~10% of what the method clusters, regroup, compare on the shown
    const clustered = method.onShortlist ? c.vectors.length : c.shown.length
    const drop = Math.max(1, Math.round(clustered * 0.1))
    const runs: number[] = []
    for (let r = 0; r < 30; r++) {
      const out = new Set<number>()
      while (out.size < drop) out.add(Math.floor(random() * clustered))
      // indices into c.vectors of what stays, and which of those are shown
      const pool = method.onShortlist ? c.vectors.map((_, i) => i) : c.shown
      const kept = pool.filter((_, i) => !out.has(i))
      const shownKept = c.shown.filter((p) => kept.includes(p))
      const g = method.cluster(
        kept.map((i) => c.vectors[i]),
        c.maxK,
        kept.map((i) => c.titles[i])
      )
      const again = shownKept.map((p) => g.assign[kept.indexOf(p)])
      const before = shownKept.map((p) => original.assign[c.shown.indexOf(p)])
      runs.push(adjustedRandIndex(before, again))
    }
    const mean = runs.reduce((s, x) => s + x, 0) / runs.length
    stability.push(mean)
    if (k > 1) nontrivial.push(mean)
  }

  return { stability, nontrivial, single, counts, named, largest }
}

const table = (title: string, cases: Case[]) => {
  console.log()
  console.log(`## ${title} (${cases.length} cases)`)
  console.log(
    "| method | stability | only where it found groups | one group | groups (mean) | largest group | groups with a name |"
  )
  console.log("|---|---|---|---|---|---|---|")
  const random = seededRandom(5)
  for (const name of Object.keys(METHODS)) {
    const r = evaluate(name, cases, random)
    console.log(
      `| ${name} | ${fmt(bootstrapMean(r.stability))} | ${
        r.nontrivial.length ? fmt(bootstrapMean(r.nontrivial)) : "-"
      } (n=${r.nontrivial.length}) | ${pct(r.single)} | ${(
        r.counts.reduce((s, x) => s + x, 0) / r.counts.length
      ).toFixed(
        1
      )} | ${r.largest.length ? ((100 * r.largest.reduce((s, x) => s + x, 0)) / r.largest.length).toFixed(0) + "%" : "-"} | ${r.named.length ? fmt(bootstrapMean(r.named)) : "-"} |`
    )
  }
}

describe("cluster stability", () => {
  it(
    "measures how stable the groups are",
    () => {
      const pools: Pool[] = readdirSync(poolsDir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(poolsDir, f), "utf8")))

      // paper mode: the shortlist is the 40 closest; the 18 shown are the best
      // of them once the citation bonus is added
      const paperCases: Case[] = pools.map((pool) => {
        const byId = new Map(pool.items.map((i) => [i.id, i]))
        const shortlist = pool.top40
          .map((t) => ({ item: byId.get(t.id)!, vec: fromBase64(t.vec) }))
          .filter((x) => x.item)
        const order = shortlist
          .map((x, i) => ({ i, score: blended(x.item, 0.02) }))
          .sort((a, b) => b.score - a.score)
        return {
          vectors: shortlist.map((x) => x.vec),
          titles: shortlist.map((x) => x.item.title),
          shown: order.slice(0, 18).map((x) => x.i),
          maxK: 4
        }
      })

      // topic mode: the shortlist is the first 40 of the search; 24 are shown
      const topics = JSON.parse(readFileSync(topicsFile, "utf8")) as {
        items: { title: string; citations: number; vec: string }[]
      }[]
      const topicCases: Case[] = topics.map((t) => {
        const n = t.items.length
        const order = t.items
          .map((x, i) => ({
            i,
            score:
              1 -
              (0.1 * i) / Math.max(1, n - 1) +
              0.02 * Math.log10(1 + x.citations)
          }))
          .sort((a, b) => b.score - a.score)
        return {
          vectors: t.items.map((x) => fromBase64(x.vec)),
          titles: t.items.map((x) => x.title),
          shown: order.slice(0, 24).map((x) => x.i),
          maxK: 5
        }
      })

      console.log("# Stability of the subtopic groups")
      console.log(
        "Each case: 30 times, drop about 10% of the papers the method groups, regroup, and compare (adjusted Rand index, 1 = identical) the grouping of the papers that are shown."
      )
      table("Paper mode: the 18 closest to the open paper", paperCases)
      table("Topic mode: 24 of the first 40 search results", topicCases)

      const scores = (cases: Case[], maxK: number) =>
        cases.map(
          (c) =>
            kmeansAuto(
              c.shown.map((i) => c.vectors[i]),
              maxK
            ).score
        )
      const p = scores(paperCases, 4)
      const t = scores(topicCases, 5)
      const q = (x: number[], v: number) => quantile(x, v).toFixed(3)
      console.log()
      console.log(
        `Silhouette of today's grouping, paper mode: p25 ${q(p, 0.25)}, median ${q(p, 0.5)}, p75 ${q(p, 0.75)}, max ${q(p, 1)}`
      )
      console.log(
        `Silhouette of today's grouping, topic mode: p25 ${q(t, 0.25)}, median ${q(t, 0.5)}, p75 ${q(t, 0.75)}, max ${q(t, 1)}`
      )
    },
    15 * 60 * 1000
  )
})
