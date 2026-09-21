// Evaluates how well the ranking finds related papers, offline, on the pools
// collected by collect-pools. Prints a report and writes it to AUDIT_REPORT
// (default: <tmp>/probe/report.md / report.json).
//
//   npx vitest run --config vitest.audit.config.ts evaluate
//
// Two proxies for "related", both from the citation graph (there are no human
// labels): a paper is a REFERENCE of the seed, or it shares at least
// COUPLED_MIN references with the seed (bibliographic coupling), which also
// works for papers newer than the seed. Both favour a model trained on
// citations (SPECTER2), so they compare settings against each other better
// than they judge the model itself. See docs/EVALUATION.md.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"

import {
  bootstrapDifference,
  bootstrapMean,
  quantile,
  type Interval
} from "./metrics"
import {
  COUPLED_MIN,
  evaluateSeed,
  limitCiters,
  PRODUCT,
  product,
  RANDOM,
  RANKERS,
  withoutReferenceOnly,
  withoutSource,
  type Truth
} from "./ranking-eval"
import type { Pool, PoolItem } from "./types"

const dir = process.env.AUDIT_POOLS || join(tmpdir(), "probe", "pools")
const out = process.env.AUDIT_REPORT || join(tmpdir(), "probe", "report")

const POOLS: Record<string, (items: PoolItem[]) => PoolItem[]> = {
  full: (items) => items,
  discovery: withoutReferenceOnly
}

const fmt = (x: Interval, digits = 3) =>
  `${x.mean.toFixed(digits)} [${x.low.toFixed(digits)}, ${x.high.toFixed(digits)}]`

describe("evaluate", () => {
  it(
    "reports how well the ranking finds related papers",
    () => {
      const pools: Pool[] = readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
      const lines: string[] = []
      const say = (line = "") => {
        lines.push(line)
        console.log(line)
      }
      const json: Record<string, unknown> = { seeds: pools.length }

      say(`# Ranking evaluation over ${pools.length} seeds`)
      say(
        `Fields: ${new Set(pools.map((p) => p.field)).size}. Candidates per seed: median ${quantile(
          pools.map((p) => p.items.length),
          0.5
        )}.`
      )

      // ---- methods x pools x truths
      for (const poolName of Object.keys(POOLS)) {
        for (const truth of ["reference", "coupled"] as Truth[]) {
          const names = [...RANKERS.map((r) => r.name), RANDOM]
          const rows = new Map<string, (Record<string, number> | null)[]>()
          for (const name of names) {
            const ranker =
              name === RANDOM ? RANDOM : RANKERS.find((r) => r.name === name)!
            rows.set(
              name,
              pools.map((p, i) =>
                evaluateSeed(POOLS[poolName](p.items), truth, ranker, i + 1)
              )
            )
          }
          // seeds where the question can be asked at all (the same for every method)
          const valid = pools
            .map((_, i) => i)
            .filter((i) => rows.get(PRODUCT)![i] !== null)

          say()
          say(
            `## Pool "${poolName}", related = ${truth === "reference" ? "a reference of the seed" : `shares >= ${COUPLED_MIN} references with the seed`} (${valid.length} seeds)`
          )
          say(
            "| method | P@18 | nDCG@18 | nDCG@10 | AUC | nDCG@18 vs product |"
          )
          say("|---|---|---|---|---|---|")
          const baseline = valid.map((i) => rows.get(PRODUCT)![i]!["nDCG@18"])
          const table: Record<string, unknown> = {}
          for (const name of names) {
            const got = valid.map((i) => rows.get(name)![i]!)
            const col = (key: string) => got.map((r) => r[key])
            const hasAuc = got.every((r) => "AUC" in r)
            const nd = col("nDCG@18")
            const diff = bootstrapDifference(nd, baseline)
            say(
              `| ${name} | ${fmt(bootstrapMean(col("P@18")), 2)} | ${fmt(bootstrapMean(nd), 2)} | ${fmt(bootstrapMean(col("nDCG@10")), 2)} | ${hasAuc ? fmt(bootstrapMean(col("AUC")), 2) : "-"} | ${name === PRODUCT ? "-" : fmt(diff, 3)} |`
            )
            table[name] = {
              "P@18": bootstrapMean(col("P@18")),
              "nDCG@18": bootstrapMean(nd),
              AUC: hasAuc ? bootstrapMean(col("AUC")) : null,
              diff
            }
          }
          json[`${poolName}/${truth}`] = table
        }
      }

      // ---- what each source brings
      say()
      say("## Sources (everything the extension collects)")
      say(
        "| source | share of candidates | shares references with the seed | is a reference |"
      )
      say("|---|---|---|---|")
      for (const source of ["reference", "citation", "search", "recommended"]) {
        const shares: number[] = []
        const coupled: number[] = []
        const refs: number[] = []
        for (const pool of pools) {
          const items = pool.items.filter((i) => i.cos !== null)
          const from = items.filter((i) => i.sources.includes(source as never))
          if (!from.length) continue
          shares.push(from.length / items.length)
          const known = from.filter((i) => i.coupling !== null)
          if (known.length) {
            coupled.push(
              known.filter((i) => (i.coupling ?? 0) >= COUPLED_MIN).length /
                known.length
            )
          }
          refs.push(from.filter((i) => i.isRef).length / from.length)
        }
        say(
          `| ${source} | ${fmt(bootstrapMean(shares), 2)} | ${fmt(bootstrapMean(coupled), 2)} | ${fmt(bootstrapMean(refs), 2)} |`
        )
      }

      // ---- how many citing papers to keep
      say()
      say(
        "## How many citing papers to keep (the product's ranking, related = coupled)"
      )
      say("| most cited + most recent | P@18 | nDCG@18 | nDCG@18 vs 60 + 40 |")
      say("|---|---|---|---|")
      // the ideal always comes from the full pool, so the numbers compare
      const run = (limit: (items: PoolItem[]) => PoolItem[]) =>
        pools.map((p, i) =>
          evaluateSeed(
            limit(p.items),
            "coupled",
            RANKERS[0],
            i + 1,
            COUPLED_MIN,
            p.items
          )
        )
      const current = run(limitCiters(60, 40))
      for (const [cited, recent] of [
        [0, 0],
        [30, 20],
        [60, 40],
        [120, 80]
      ]) {
        const now = run(limitCiters(cited, recent))
        const both = pools.map((_, i) => i).filter((i) => now[i] && current[i])
        const nd = both.map((i) => now[i]!["nDCG@18"])
        const pr = both.map((i) => now[i]!["P@18"])
        const diff = bootstrapDifference(
          nd,
          both.map((i) => current[i]!["nDCG@18"])
        )
        say(
          `| ${cited} + ${recent} | ${fmt(bootstrapMean(pr), 2)} | ${fmt(bootstrapMean(nd), 2)} | ${cited === 60 ? "-" : fmt(diff, 3)} |`
        )
      }

      // ---- what each source adds: the same ranking without its exclusive papers
      say()
      say(
        "## What each source adds (the product's ranking, related = coupled; without the papers only that source found)"
      )
      say("| without | nDCG@18 | change vs everything |")
      say("|---|---|---|")
      const everything = run((items) => items)
      for (const source of [
        "reference",
        "citation",
        "search",
        "recommended"
      ] as const) {
        const without = run(withoutSource(source))
        const both = pools
          .map((_, i) => i)
          .filter((i) => without[i] && everything[i])
        const nd = both.map((i) => without[i]!["nDCG@18"])
        const diff = bootstrapDifference(
          nd,
          both.map((i) => everything[i]!["nDCG@18"])
        )
        say(`| ${source} | ${fmt(bootstrapMean(nd), 3)} | ${fmt(diff, 3)} |`)
      }

      // ---- what the 18 shown are made of
      say()
      say("## What the 18 shown are made of")
      say(
        "| brought in by | share of the 18 | of those, share with >= 3 shared references | median year |"
      )
      say("|---|---|---|---|")
      for (const source of ["reference", "citation", "search", "recommended"]) {
        const share: number[] = []
        const related: number[] = []
        const years: number[] = []
        for (const pool of pools) {
          const top = product(pool.items.filter((i) => i.cos !== null)).slice(
            0,
            18
          )
          const from = top.filter((i) => i.sources.includes(source as never))
          share.push(from.length / top.length)
          const known = from.filter((i) => i.coupling !== null)
          if (known.length) {
            related.push(
              known.filter((i) => (i.coupling ?? 0) >= COUPLED_MIN).length /
                known.length
            )
          }
          years.push(
            ...from.map((i) => i.year).filter((y): y is number => y !== null)
          )
        }
        say(
          `| ${source} | ${fmt(bootstrapMean(share), 2)} | ${related.length ? fmt(bootstrapMean(related), 2) : "-"} | ${years.length ? quantile(years, 0.5) : "-"} |`
        )
      }

      // ---- does the threshold for "related" change the conclusions?
      say()
      say(
        "## Sensitivity to what counts as related (shares at least N references; nDCG@18, full pool)"
      )
      say("| method | N = 2 | N = 3 | N = 5 |")
      say("|---|---|---|---|")
      for (const name of [
        PRODUCT,
        "cosine only",
        "cosine + 0.05 log10(citations)",
        "citations only"
      ]) {
        const ranker = RANKERS.find((r) => r.name === name)!
        const cells = [2, 3, 5].map((n) => {
          const got = pools
            .map((p, i) => evaluateSeed(p.items, "coupled", ranker, i + 1, n))
            .filter((r): r is Record<string, number> => r !== null)
          return `${fmt(bootstrapMean(got.map((r) => r["nDCG@18"])), 2)} (n=${got.length})`
        })
        say(`| ${name} | ${cells.join(" | ")} |`)
      }

      // ---- the scale of the cosine
      say()
      say('## The scale of the cosine (what the "% similar" shows)')
      const cosines = (items: PoolItem[]) =>
        items.map((i) => i.cos).filter((c): c is number => c !== null)
      const q = (x: number[], p: number) => quantile(x, p).toFixed(3)
      const summary = (x: number[]) =>
        `min ${q(x, 0)}, p10 ${q(x, 0.1)}, median ${q(x, 0.5)}, p90 ${q(x, 0.9)}, max ${q(x, 1)}`
      const all = pools.flatMap((p) => cosines(p.items))
      say(`All candidates (${all.length}): ${summary(all)}`)
      const tops = pools.map((p) =>
        cosines(product(p.items.filter((i) => i.cos !== null)).slice(0, 18))
      )
      const shown = tops.flat()
      say(`The 18 shown (${shown.length}): ${summary(shown)}`)
      const spread = tops.map((t) => Math.max(...t) - Math.min(...t))
      say(
        `Best minus 18th shown, per seed: median ${q(spread, 0.5)}, p90 ${q(spread, 0.9)}, max ${q(spread, 1)}`
      )
      const refCos = pools.flatMap((p) =>
        cosines(p.items.filter((i) => i.isRef))
      )
      const otherCos = pools.flatMap((p) =>
        cosines(p.items.filter((i) => !i.isRef))
      )
      say(
        `References: median ${q(refCos, 0.5)}; the others: median ${q(otherCos, 0.5)}`
      )
      json.cosine = {
        all: [0, 0.1, 0.5, 0.9, 1].map((p) => quantile(all, p)),
        shown: [0, 0.1, 0.5, 0.9, 1].map((p) => quantile(shown, p)),
        spread: [0.5, 0.9, 1].map((p) => quantile(spread, p))
      }

      mkdirSync(join(out, ".."), { recursive: true })
      writeFileSync(out + ".md", lines.join("\n") + "\n")
      writeFileSync(out + ".json", JSON.stringify(json, null, 1))
      console.log("report written to", out + ".md")
    },
    10 * 60 * 1000
  )
})
