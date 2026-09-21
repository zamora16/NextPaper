import { describe, expect, it } from "vitest"

import { isReview, plainPaper } from "~lib/paper-utils"
import type { ScoredPaper } from "~lib/pipeline"
import type { RecommendedPaper } from "~lib/semantic-scholar"

const paper = (over: Partial<RecommendedPaper>): RecommendedPaper => ({
  paperId: "p",
  title: "A title",
  authors: [],
  year: 2020,
  citationCount: 0,
  venue: "",
  url: "https://example.org/p",
  abstract: null,
  publicationTypes: null,
  ...over
})

// Semantic Scholar tags many primary studies (surveys, RCTs, cohorts) as
// "Review": 109 of 430 papers whose own text declares a primary design were
// tagged that way in a check on ~1,250 real papers. A "Revisión" tag, the
// Revisiones filter and the "Revisión relevante" pick must not rely on it.
describe("isReview", () => {
  it("does not trust the Semantic Scholar Review type on its own", () => {
    expect(
      isReview(
        paper({
          title: "Burnout among nurses: a cross-sectional survey",
          publicationTypes: ["JournalArticle", "Review"]
        })
      )
    ).toBe(false)
    expect(
      isReview(
        paper({
          title: "Effect of CBT on insomnia",
          abstract:
            "In this randomized controlled trial, 120 adults took part.",
          publicationTypes: ["Review"]
        })
      )
    ).toBe(false)
    expect(
      isReview(paper({ title: "Sleep and mood", publicationTypes: ["Review"] }))
    ).toBe(false)
  })

  it("recognizes reviews the text declares", () => {
    const yes = [
      "Exercise for anxiety: a systematic review and meta-analysis",
      "A scoping review of eating disorders",
      "Interventions for insomnia: a literature review",
      "Revisión sistemática de intervenciones"
    ]
    for (const title of yes)
      expect(isReview(paper({ title })), title).toBe(true)

    expect(
      isReview(
        paper({
          title: "Gut microbiota and inflammation",
          abstract: "This review summarizes the current evidence."
        })
      )
    ).toBe(true)
  })

  it("keeps the Semantic Scholar MetaAnalysis type, which is reliable", () => {
    expect(
      isReview(
        paper({ title: "Pooled effects", publicationTypes: ["MetaAnalysis"] })
      )
    ).toBe(true)
  })

  it("does not read 'survey' in a title as a review", () => {
    expect(
      isReview(paper({ title: "Vaccination hesitancy: a national survey" }))
    ).toBe(false)
  })
})

describe("plainPaper", () => {
  it("drops everything that depends on the analysis it came from", () => {
    const scored = {
      ...paper({ title: "Kept" }),
      similarity: 0.91,
      approximate: true,
      relation: "reference",
      sharedTerms: ["body", "image"],
      embedding: [0.1, 0.2]
    } as unknown as ScoredPaper

    const plain = plainPaper(scored)
    expect(plain).toMatchObject({ title: "Kept", relation: null })
    expect("similarity" in plain).toBe(false)
    expect("approximate" in plain).toBe(false)
    expect("sharedTerms" in plain).toBe(false)
    expect("embedding" in plain).toBe(false)
  })
})
