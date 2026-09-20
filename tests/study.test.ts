import { describe, expect, it } from "vitest"

import type { PaperGroup, ScoredPaper } from "~lib/pipeline"
import {
  designLabel,
  extractStudy,
  formatSample,
  parseCount,
  studyOf
} from "~lib/study"
import { applyView, designOptions } from "~lib/view"

const study = (title: string, abstract: string | null, types?: string[]) =>
  extractStudy({ title, abstract, publicationTypes: types ?? null })

describe("parseCount", () => {
  it("reads plain numbers and thousands separators", () => {
    expect(parseCount("245")).toBe(245)
    expect(parseCount("1,234")).toBe(1234)
    expect(parseCount("1.234")).toBe(1234)
    expect(parseCount("12,345,678")).toBe(12345678)
  })
})

describe("extractStudy design", () => {
  it("detects the common designs", () => {
    const cases: [string, string, string][] = [
      ["Meta-analysis of exercise on depression", "", "meta"],
      ["A systematic review of body image interventions", "", "systematic"],
      [
        "Effect of CBT",
        "In this randomized controlled trial, 120 adults were assigned.",
        "rct"
      ],
      ["A phase III clinical trial of drug X", "", "trial"],
      ["Study protocol for a trial of sleep", "", "protocol"],
      ["A scoping review of eating disorders", "", "review"],
      [
        "Smoking and cancer",
        "A case-control study of lung cancer.",
        "case-control"
      ],
      ["Diet and risk", "A prospective cohort study.", "cohort"],
      [
        "Spanish version of the scale",
        "We examined its psychometric properties and factor structure.",
        "psychometric"
      ],
      ["Habits", "A cross-sectional online survey.", "cross-sectional"],
      [
        "Experiences of nurses",
        "Semi-structured interviews and thematic analysis.",
        "qualitative"
      ],
      ["A pilot study of mindfulness", "", "experimental"],
      ["A case report of rare syndrome", "", "case"],
      [
        "Attention",
        "We propose a novel architecture that outperforms baselines.",
        "method"
      ]
    ]
    for (const [title, abstract, expected] of cases) {
      expect(study(title, abstract).design, title).toBe(expected)
    }
  })

  it("prefers the strongest design when several appear", () => {
    // a systematic review that mentions randomized trials is a review
    expect(
      study(
        "Interventions for insomnia",
        "This systematic review pooled randomized controlled trials."
      ).design
    ).toBe("systematic")
    // a validation that mentions cross-sectional is a validation
    expect(
      study(
        "Validation of the scale",
        "A cross-sectional sample; we tested the psychometric properties."
      ).design
    ).toBe("psychometric")
  })

  it("uses Semantic Scholar publication types when they map cleanly", () => {
    expect(study("Untitled work", null, ["MetaAnalysis"]).design).toBe("meta")
    expect(
      study("Untitled work", null, ["JournalArticle", "ClinicalTrial"]).design
    ).toBe("trial")
  })

  it("says nothing when unsure", () => {
    expect(
      study("Thoughts on attention", "An essay about focus.").design
    ).toBeNull()
    expect(study("Title only", null)).toEqual({ design: null, sample: null })
  })

  it("does not read 'review' from a paper that merely cites reviews", () => {
    expect(
      study(
        "Effect of drug",
        "Prior reviews were inconclusive; we ran a new experiment."
      ).design
    ).toBeNull()
  })

  // Regressions found by running the extractor over ~170 real abstracts.
  it("does not read a design from an unrelated use of the words", () => {
    expect(
      study(
        "Deep-learning-based protein structure prediction",
        "The protocol of the pipeline is described; results compared with the protocol of the benchmark."
      ).design
    ).toBeNull()
    expect(
      study(
        "Generative emulation of protein ensembles",
        "The model shows qualitative agreement with simulations."
      ).design
    ).toBeNull()
    expect(
      study(
        "Gene editing in the kidney",
        "Several clinical trials are underway to test these therapies."
      ).design
    ).toBeNull()
  })

  it("ignores trials mentioned as context, not as the design", () => {
    expect(
      study(
        "A language model for pathology",
        "Uses include treatment selection and clinical trial screening."
      ).design
    ).toBeNull()
    expect(
      study(
        "Ethics of early trials",
        "First-in-human Phase 1 clinical trials raise questions."
      ).design
    ).toBeNull()
    expect(
      study(
        "Gene therapy",
        "This is an open-label, single-arm, non-randomized interventional trial."
      ).design
    ).toBe("trial")
  })

  it("keeps a pilot trial with qualitative feedback as experimental", () => {
    expect(
      study(
        "Pilot trial of a self-compassion program",
        "Participants also gave qualitative feedback."
      ).design
    ).toBe("experimental")
  })

  it("recognizes feasibility and non-randomized trials", () => {
    expect(
      study("Pilot feasibility and acceptability trial of X", "").design
    ).toBe("trial")
    expect(
      study("Digital Bodies: a controlled evaluation of a brief program", "")
        .design
    ).toBe("trial")
  })

  it("labels every design", () => {
    expect(designLabel("rct")).toBe("Ensayo aleatorizado")
  })
})

describe("extractStudy sample", () => {
  const n = (abstract: string) => study("A study", abstract).sample

  it("reads n = and 'N participants'", () => {
    expect(n("Results (n = 245) were clear.")).toEqual({
      n: 245,
      unit: "participants"
    })
    expect(n("We surveyed 1,234 healthy adults.")).toEqual({
      n: 1234,
      unit: "participants"
    })
    expect(n("A sample of 312 was recruited.")).toEqual({
      n: 312,
      unit: "participants"
    })
    expect(n("Se incluyeron 150 pacientes.")).toEqual({
      n: 150,
      unit: "participants"
    })
  })

  it("takes the largest figure as the total, not a group size", () => {
    expect(
      n(
        "Of 300 participants, 150 patients were in the treatment arm (n = 150)."
      )
    ).toEqual({
      n: 300,
      unit: "participants"
    })
  })

  it("ignores ages and ranges", () => {
    expect(n("Adolescents aged 12 to 18 years took part.")).toBeNull()
    expect(n("Participants were aged 18 and 65 adults.")).toBeNull()
  })

  it("ignores implausibly small counts", () => {
    expect(n("Only 3 participants dropped out.")).toBeNull()
    // usually schools or clinics, not the sample
    expect(n("Randomized in 7 schools (n = 7 clusters).")).toBeNull()
  })

  it("reads Spanish totals", () => {
    expect(n("Participaron un total de 150 pacientes.")).toEqual({
      n: 150,
      unit: "participants"
    })
  })

  it("uses the studies kept, not the records screened, in a review", () => {
    const review = study(
      "A systematic review",
      "We screened 3,184 studies and included 12 studies in the synthesis."
    )
    expect(review.sample).toEqual({ n: 12, unit: "studies" })
    expect(
      study(
        "A systematic review",
        "We identified 3,184 studies from the search."
      ).sample
    ).toBeNull()
    expect(
      study("A meta-analysis", "12 trials met the inclusion criteria.").sample
    ).toEqual({
      n: 12,
      unit: "studies"
    })
  })

  it("counts studies for reviews, not participants", () => {
    const meta = study(
      "Meta-analysis",
      "We included 24 studies with 5,000 participants."
    )
    expect(meta.design).toBe("meta")
    expect(meta.sample).toEqual({ n: 24, unit: "studies" })
    expect(
      study("A review", "k = 12 trials were pooled in this meta-analysis.")
        .sample
    ).toEqual({
      n: 12,
      unit: "studies"
    })
  })

  it("does not take a sample from the title alone", () => {
    expect(study("A trial of 500 patients", null).sample).toBeNull()
  })
})

describe("formatSample", () => {
  it("formats participants and studies", () => {
    expect(formatSample({ n: 245, unit: "participants" })).toBe("n = 245")
    expect(formatSample({ n: 24, unit: "studies" })).toBe("24 estudios")
  })
})

describe("studyOf", () => {
  it("returns the same result for the same paper object (memoized)", () => {
    const paper = {
      title: "Cohort of x",
      abstract: "n = 100",
      publicationTypes: null
    }
    expect(studyOf(paper)).toBe(studyOf(paper))
  })
})

describe("design filter in the view", () => {
  const paper = (
    id: string,
    title: string,
    abstract: string | null
  ): ScoredPaper =>
    ({
      paperId: id,
      title,
      abstract,
      publicationTypes: null,
      citationCount: 1,
      year: 2020,
      relation: null,
      openAccessPdf: null
    }) as unknown as ScoredPaper
  const groups: PaperGroup[] = [
    {
      label: "A",
      papers: [
        paper("r1", "Trial one", "A randomized controlled trial."),
        paper("r2", "Trial two", "A randomized controlled trial."),
        paper("c1", "Survey", "A cross-sectional survey."),
        paper("n1", "An essay", "Thoughts.")
      ]
    },
    { label: "B", papers: [paper("m1", "Pooling", "A meta-analysis.")] }
  ]
  const ids = (g: PaperGroup[]) =>
    g.flatMap((x) => x.papers.map((p) => p.paperId))

  it("lists only detected designs, most common first, with counts", () => {
    expect(designOptions(groups).map((d) => [d.id, d.count])).toEqual([
      ["rct", 2],
      ["meta", 1],
      ["cross-sectional", 1]
    ])
  })

  it("filters by design and drops emptied groups", () => {
    expect(ids(applyView(groups, "all", "relevance", "rct"))).toEqual([
      "r1",
      "r2"
    ])
    expect(
      applyView(groups, "all", "relevance", "meta").map((g) => g.label)
    ).toEqual(["B"])
    expect(ids(applyView(groups, "all", "relevance", "all"))).toHaveLength(5)
  })
})
