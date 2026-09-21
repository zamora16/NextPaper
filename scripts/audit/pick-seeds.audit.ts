// Picks the papers the ranking evaluation runs on, across many fields, and
// writes them to scripts/audit/seeds.json (committed, so a run can be
// reproduced). Needs the API and takes a few minutes.
//
//   npx vitest run --config vitest.audit.config.ts pick-seeds
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"

import { getPapers, getSeed, searchPapers } from "~lib/semantic-scholar"

import { installChrome } from "../../tests/helpers/chrome"
import { setSettingsForTests } from "./key"
import { TOPICS } from "./topics"

const PER_TOPIC = 2

// A stable pseudo-random order, so the pick is not simply "the most cited".
const hash = (text: string) =>
  [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)

describe("pick seeds", () => {
  it(
    "chooses the evaluation papers",
    async () => {
      installChrome()
      await setSettingsForTests()
      const chosen: {
        field: string
        query: string
        ref: string
        title: string
        year: number
        references: number
      }[] = []
      const used = new Set<string>()

      for (const [field, query] of TOPICS) {
        const ids = (await searchPapers(query)) ?? []
        const found = (await getPapers(ids, false))
          .filter(
            (p) =>
              (p.year ?? 0) >= 2012 &&
              (p.year ?? 0) <= 2021 &&
              p.citationCount >= 80 &&
              p.citationCount <= 3000 &&
              !used.has(p.paperId)
          )
          .sort((a, b) => hash(a.paperId) - hash(b.paperId))

        let picked = 0
        for (const paper of found) {
          if (picked === PER_TOPIC) break
          try {
            const seed = await getSeed(paper.paperId)
            // enough of a bibliography to hide part of, and a vector to compare
            if (
              seed.references.length < 25 ||
              seed.references.length > 150 ||
              !seed.embedding
            ) {
              continue
            }
            chosen.push({
              field,
              query,
              ref: paper.paperId,
              title: paper.title,
              year: paper.year ?? 0,
              references: seed.references.length
            })
            used.add(paper.paperId)
            picked++
          } catch {
            // an id the API cannot serve: try the next one
          }
        }
        console.log(field, "-", query, "->", picked)
      }

      writeFileSync(
        join(__dirname, "seeds.json"),
        JSON.stringify(chosen, null, 2) + "\n"
      )
      console.log("seeds:", chosen.length)
    },
    20 * 60 * 1000
  )
})
