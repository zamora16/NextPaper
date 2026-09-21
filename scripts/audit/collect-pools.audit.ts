// Collects, for every evaluation seed, the candidates the extension would
// consider, with what is needed to judge a ranking offline: the cosine to the
// seed, where each candidate came from, whether it is one of the seed's
// references, and how many references it shares with the seed.
//
//   npx vitest run --config vitest.audit.config.ts collect-pools
//
// Writes one JSON per seed to AUDIT_POOLS (default: <tmp>/probe/pools) and
// skips seeds already there, so an interrupted run resumes. Needs the API and
// takes about 15 minutes for 60 seeds.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"

import { dedupe, normalizeTitle } from "~lib/pipeline"
import { s2Fetch } from "~lib/s2-fetch"
import {
  collectCandidates,
  getPapers,
  getRecommendedIds,
  getSeed,
  type CandidateSource
} from "~lib/semantic-scholar"
import { cosineSimilarity } from "~lib/vector-math"

import { installChrome } from "../../tests/helpers/chrome"
import { setSettingsForTests } from "./key"
import type { Pool, PoolItem } from "./types"

const TOP_CITED = 120
const TOP_RECENT = 80
const dir = process.env.AUDIT_POOLS || join(tmpdir(), "probe", "pools")

const toBase64 = (vector: number[]) =>
  Buffer.from(new Float32Array(vector).buffer).toString("base64")

// The reference lists of many papers, in parallel chunks like the extension's
// own batch lookups. Null for a paper whose list the API does not give.
async function referenceLists(ids: string[]) {
  const lists = new Map<string, Set<string> | null>()
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))

  await Promise.all(
    chunks.map(async (chunk) => {
      const response = await s2Fetch(
        "https://api.semanticscholar.org/graph/v1/paper/batch?fields=references.paperId",
        { method: "POST", body: { ids: chunk } }
      )
      if (!response.ok) {
        chunk.forEach((id) => lists.set(id, null))
        return
      }
      const rows = (await response.json()) as ({
        references?: { paperId?: string }[] | null
      } | null)[]
      chunk.forEach((id, i) => {
        const refs = rows[i]?.references
        lists.set(
          id,
          Array.isArray(refs)
            ? new Set(
                refs.map((r) => r?.paperId).filter((x): x is string => !!x)
              )
            : null
        )
      })
    })
  )
  return lists
}

async function collect(seedInfo: {
  ref: string
  field: string
  title: string
  year: number
}): Promise<Pool> {
  const seed = await getSeed(seedInfo.ref)
  const sources = await collectCandidates(seed)

  // Citing papers beyond what the extension keeps, ranked two ways, so the
  // effect of how many are used can be tested.
  const byCitations = [...seed.citers].sort(
    (a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0)
  )
  const byYear = [...seed.citers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const citedRank = new Map<string, number>()
  const recentRank = new Map<string, number>()
  byCitations
    .slice(0, TOP_CITED)
    .forEach((c, i) => citedRank.set(c.paperId, i + 1))
  byYear
    .slice(0, TOP_RECENT)
    .forEach((c, i) => recentRank.set(c.paperId, i + 1))
  for (const id of [...citedRank.keys(), ...recentRank.keys()]) {
    if (id === seed.paperId) continue
    if (!sources.has(id)) sources.set(id, new Set<CandidateSource>())
    sources.get(id)!.add("citation")
  }

  const recs = (await getRecommendedIds(seed.paperId, "recent")) ?? []
  const recRank = new Map(recs.map((id, i) => [id, i + 1]))

  const fetched = await getPapers([...sources.keys()])
  const seedTitle = normalizeTitle(seed.title)
  const refIds = new Set(seed.references)
  const refTitles = new Set(
    fetched
      .filter((p) => refIds.has(p.paperId))
      .map((p) => normalizeTitle(p.title))
  )
  const papers = dedupe(fetched, sources).filter(
    (p) => normalizeTitle(p.title) !== seedTitle
  )

  const lists = await referenceLists(papers.map((p) => p.paperId))

  const items: PoolItem[] = papers.map((p) => {
    const theirs = lists.get(p.paperId) ?? null
    return {
      id: p.paperId,
      title: p.title,
      year: p.year,
      citations: p.citationCount,
      cos: p.embedding ? cosineSimilarity(seed.embedding!, p.embedding) : null,
      sources: [...(sources.get(p.paperId) ?? [])],
      citedRank: citedRank.get(p.paperId),
      recentRank: recentRank.get(p.paperId),
      recRank: recRank.get(p.paperId),
      isRef: refTitles.has(normalizeTitle(p.title)),
      coupling: theirs
        ? [...theirs].filter((id) => refIds.has(id)).length
        : null
    }
  })

  const closest = papers
    .filter((p) => p.embedding)
    .map((p) => ({ p, cos: cosineSimilarity(seed.embedding!, p.embedding!) }))
    .sort((a, b) => b.cos - a.cos)
    .slice(0, 40)

  return {
    ref: seedInfo.ref,
    field: seedInfo.field,
    title: seed.title,
    year: seedInfo.year,
    seedReferences: seed.references.length,
    isComputerScience: seed.isComputerScience,
    items,
    top40: closest.map(({ p }) => ({
      id: p.paperId,
      vec: toBase64(p.embedding!)
    }))
  }
}

describe("collect pools", () => {
  it(
    "collects every seed",
    async () => {
      installChrome()
      await setSettingsForTests()
      mkdirSync(dir, { recursive: true })
      const seeds = JSON.parse(
        readFileSync(join(__dirname, "seeds.json"), "utf8")
      ) as { ref: string; field: string; title: string; year: number }[]

      let done = 0
      for (const [index, seed] of seeds.entries()) {
        const file = join(dir, `${String(index).padStart(3, "0")}.json`)
        if (existsSync(file)) {
          done++
          continue
        }
        try {
          const pool = await collect(seed)
          writeFileSync(file, JSON.stringify(pool))
          done++
          console.log(
            `ok ${index + 1}/${seeds.length}`,
            seed.field,
            pool.title.slice(0, 50),
            `(${pool.items.length} candidates)`
          )
        } catch (error) {
          console.log(
            "FAILED",
            index + 1,
            seed.title.slice(0, 50),
            String(error)
          )
        }
      }
      console.log("pools:", done, "of", seeds.length, "in", dir)
    },
    60 * 60 * 1000
  )
})
