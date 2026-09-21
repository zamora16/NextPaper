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

// One line per topic: a field, and a query that finds well-cited papers in it.
const TOPICS: [string, string][] = [
  ["psychology", "adolescent depression treatment outcomes"],
  ["psychology", "working memory training in children"],
  ["psychology", "body image and social media"],
  ["medicine", "randomized trial cardiovascular prevention"],
  ["medicine", "COVID-19 vaccine effectiveness"],
  ["medicine", "immunotherapy checkpoint inhibitors survival"],
  ["cs-ml", "graph neural network node classification"],
  ["cs-ml", "contrastive learning visual representations"],
  ["cs-nlp", "neural machine translation low-resource languages"],
  ["cs-nlp", "question answering with pretrained language models"],
  ["biology", "single-cell RNA sequencing gene regulation"],
  ["biology", "CRISPR base editing efficiency"],
  ["neuroscience", "hippocampus memory consolidation during sleep"],
  ["economics", "minimum wage employment effects"],
  ["economics", "financial inclusion and household welfare"],
  ["education", "formative feedback and student achievement"],
  ["education", "teacher professional development effectiveness"],
  ["ecology", "species distribution modelling under climate change"],
  ["ecology", "pollinator decline agricultural intensification"],
  ["physics", "topological insulators surface states"],
  ["materials", "perovskite solar cell stability"],
  ["epidemiology", "air pollution and mortality cohort study"],
  ["sociology", "social media political polarization"],
  ["linguistics", "bilingual language acquisition in children"],
  ["environment", "microplastics effects on marine organisms"],
  ["nutrition", "Mediterranean diet and cardiovascular risk"],
  ["public-health", "physical activity and mental health older adults"],
  ["chemistry", "metal-organic frameworks gas separation"],
  ["engineering", "deep learning for structural health monitoring"],
  ["political-science", "electoral systems and democratic accountability"]
]

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
