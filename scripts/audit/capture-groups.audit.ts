// Captures REAL analyses (network + your key) so the subtopic labels can be
// read and judged offline, on papers from very different fields.
//
//   npx vitest run --config vitest.audit.config.ts
//
// Writes the groups of every analysis to AUDIT_OUT (default: audit-groups.json
// in the OS temp dir). Not part of `npm test`: it needs the API and takes a
// few minutes.
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "vitest"

import { analyze } from "~lib/pipeline"

import { installChrome } from "../../tests/helpers/chrome"
import { setSettingsForTests } from "./key"

// Two sets on purpose: labels are tuned on `tuning` and judged on `heldOut`,
// which the labeling code has never been adjusted to.
export const SEEDS = {
  tuning: [
    "DOI:10.1186/s40337-024-01004-0",
    "DOI:10.1016/j.bodyim.2014.09.006",
    "ARXIV:1706.03762",
    "ARXIV:1810.04805",
    "DOI:10.1038/s41586-021-03819-2",
    "DOI:10.1037/0022-3514.51.6.1173",
    "DOI:10.1371/journal.pmed.1000097",
    "QUERY:body image and eating disorders in virtual reality",
    "QUERY:transformer models for protein folding"
  ],
  heldOut: [
    "DOI:10.1126/science.1225829",
    "DOI:10.3102/003465430298487",
    "DOI:10.2307/1914185",
    "DOI:10.1056/NEJMoa1511939",
    "DOI:10.1038/35012251",
    "ARXIV:2005.14165",
    "DOI:10.1038/nrn2787",
    "DOI:10.1037/0022-3514.92.6.1087",
    "QUERY:mindfulness intervention for anxiety in students",
    "QUERY:graph neural networks for drug discovery",
    "QUERY:climate change adaptation smallholder agriculture"
  ]
}

const out = process.env.AUDIT_OUT || join(tmpdir(), "audit-groups.json")

describe("capture", () => {
  it(
    "analyzes every seed",
    async () => {
      installChrome()
      await setSettingsForTests()
      const captured: Record<string, unknown> = {}

      for (const [set, refs] of Object.entries(SEEDS)) {
        for (const ref of refs) {
          try {
            const result = await analyze(ref)
            captured[ref] = {
              set,
              seedTitle: result.seedTitle ?? null,
              groups: result.groups.map((g) => ({
                label: g.label,
                papers: g.papers.map((p) => ({
                  title: p.title,
                  abstract: p.abstract ?? null,
                  year: p.year
                }))
              }))
            }
            console.log(
              "ok",
              ref,
              result.groups.map((g) => g.label).join(" | ")
            )
          } catch (error) {
            console.log("FAILED", ref, String(error))
          }
        }
      }

      mkdirSync(join(out, ".."), { recursive: true })
      writeFileSync(out, JSON.stringify(captured))
      console.log("wrote", out, Object.keys(captured).length, "analyses")
    },
    15 * 60 * 1000
  )
})
