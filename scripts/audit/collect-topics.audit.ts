// Collects what the extension works with in TOPIC mode (a search box query):
// the closest results of Semantic Scholar's search with their vectors, for the
// stability audit of the subtopic groups. Uses the topics of pick-seeds.
//
//   npx vitest run --config vitest.audit.config.ts collect-topics
//
// Writes <tmp>/probe/topics.json. Needs the API; takes a few minutes.
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"

import { dedupe } from "~lib/pipeline"
import {
  getPapers,
  searchPapers,
  type CandidateSource
} from "~lib/semantic-scholar"

import { installChrome } from "../../tests/helpers/chrome"
import { setSettingsForTests } from "./key"
import { TOPICS } from "./topics"

const out = process.env.AUDIT_TOPICS || join(tmpdir(), "probe", "topics.json")

const toBase64 = (vector: number[]) =>
  Buffer.from(new Float32Array(vector).buffer).toString("base64")

describe("collect topics", () => {
  it(
    "collects every topic",
    async () => {
      installChrome()
      await setSettingsForTests()
      const topics: unknown[] = []

      for (const [field, query] of TOPICS) {
        const ids = (await searchPapers(query)) ?? []
        if (!ids.length) continue
        const fetched = await getPapers(ids)
        const sources = new Map<string, Set<CandidateSource>>(
          ids.map((id) => [id, new Set<CandidateSource>(["search"])])
        )
        const rank = new Map(ids.map((id, i) => [id, i]))
        // as analyzeQuery: deduplicated, in the search's own order, first 40
        const embedded = dedupe(fetched, sources)
          .filter((p) => p.embedding)
          .sort(
            (a, b) => (rank.get(a.paperId) ?? 0) - (rank.get(b.paperId) ?? 0)
          )
          .slice(0, 40)
        topics.push({
          field,
          query,
          items: embedded.map((p) => ({
            id: p.paperId,
            title: p.title,
            citations: p.citationCount,
            vec: toBase64(p.embedding!)
          }))
        })
        console.log("ok", query, embedded.length)
      }

      mkdirSync(join(out, ".."), { recursive: true })
      writeFileSync(out, JSON.stringify(topics))
      console.log("topics:", topics.length, "->", out)
    },
    30 * 60 * 1000
  )
})
