import { describe, expect, it } from "vitest"

import { extractStudy, parseCount, studyOf } from "~lib/study"

// Precision over coverage: a wrong chip is worse than none. Many cases below
// come from errors found by auditing ~760 real Semantic Scholar abstracts.

const study = (title: string, abstract: string | null, types?: string[]) =>
  extractStudy({ title, abstract, publicationTypes: types ?? null })
const design = (title: string, abstract = "") => study(title, abstract).design

describe("parseCount", () => {
  it("reads plain numbers and thousands separators", () => {
    expect(parseCount("245")).toBe(245)
    expect(parseCount("1,234")).toBe(1234)
    expect(parseCount("1.234")).toBe(1234)
    expect(parseCount("12,345,678")).toBe(12345678)
    expect(parseCount("247 696")).toBe(247696)
  })
})

describe("design: what counts", () => {
  it("reads the design from the title", () => {
    const cases: [string, string][] = [
      ["Exercise for anxiety: a systematic review and meta-analysis", "meta"],
      ["Interventions for insomnia: a systematic review", "systematic"],
      ["Effect of CBT: a randomized controlled trial", "rct"],
      ["A cluster randomised trial of a school program", "rct"],
      ["Findings from a non-randomized controlled trial", "trial"],
      ["Smoking and cancer: a case-control study", "case-control"],
      ["Diet and risk: a prospective cohort study", "cohort"],
      ["Psychometric properties of the Spanish version", "psychometric"],
      ["Burnout in nurses: a cross-sectional survey", "cross-sectional"],
      ["Teachers' experiences: a qualitative study", "qualitative"],
      ["A rare tumor: a case report", "case"],
      ["A Dutch quasi-experimental study", "experimental"],
      ["Sleep and students: a mixed methods study", "mixed"],
      ["Attention in models: a review of the literature", "review"]
    ]
    for (const [title, expected] of cases) {
      expect(design(title), title).toBe(expected)
    }
  })

  it("reads the design from abstract sentences about the study itself", () => {
    expect(
      design(
        "Effect of CBT",
        "In this randomized controlled trial, 120 adults were assigned."
      )
    ).toBe("rct")
    expect(
      design("Habits", "Design. A cross-sectional survey. Participants. 400.")
    ).toBe("cross-sectional")
    expect(
      design("Experiences", "We conducted semi-structured interviews.")
    ).toBe("qualitative")
    expect(
      design(
        "Wanting more",
        "Addressing this gap, we employed an experimental design."
      )
    ).toBe("experimental")
  })

  it("prefers the strongest design when several appear", () => {
    expect(
      design(
        "Interventions for insomnia",
        "This systematic review pooled randomized controlled trials."
      )
    ).toBe("systematic")
    expect(
      design(
        "Validation of the scale",
        "This cross-sectional survey tested its psychometric properties."
      )
    ).toBe("psychometric")
    expect(
      design(
        "Transcultural adaptation and psychometric validation",
        "We ran a pilot study before the main sample."
      )
    ).toBe("psychometric")
  })

  it("uses Semantic Scholar publication types only when the text says nothing", () => {
    expect(study("Untitled work", null, ["MetaAnalysis"]).design).toBe("meta")
    expect(study("Untitled work", null, ["ClinicalTrial"]).design).toBe("trial")
    // the text is more specific than the type
    expect(
      study("A randomized controlled trial of X", null, ["ClinicalTrial"])
        .design
    ).toBe("rct")
  })

  it("says nothing when unsure", () => {
    expect(design("Thoughts on attention", "An essay about focus.")).toBeNull()
    expect(study("Title only", null)).toEqual({ design: null, sample: null })
  })
})

describe("design: background is not the design", () => {
  it("ignores designs mentioned in sentences that are not about this study", () => {
    expect(
      design(
        "Social media and adolescent wellbeing",
        "Numerous reviews and meta-analyses report mixed findings."
      )
    ).toBeNull()
    expect(
      design(
        "Gene editing in the kidney",
        "Several clinical trials are underway to test these therapies."
      )
    ).toBeNull()
    expect(
      design(
        "Insulin dosing",
        "Prior work used a randomized controlled trial. Here is an opinion."
      )
    ).toBeNull()
  })

  it("does not read a design from an unrelated use of the words", () => {
    expect(
      design(
        "Protein structure prediction",
        "We describe the protocol of the pipeline."
      )
    ).toBeNull()
    expect(
      design(
        "Generative emulation of protein ensembles",
        "The model shows qualitative agreement with simulations."
      )
    ).toBeNull()
    expect(
      design(
        "A language model for pathology",
        "Uses include treatment selection and clinical trial screening."
      )
    ).toBeNull()
    expect(
      design(
        "Cancer therapy",
        "We highlight mechanisms, clinical trial progress and outcomes."
      )
    ).toBeNull()
  })

  it("does not read a review from 'based on a literature review'", () => {
    expect(
      design(
        "Exploring online learning engagement",
        "Based on a literature review, the Delphi method was used to build a model."
      )
    ).toBeNull()
  })

  // Errors found on a second, unseen set of ~480 abstracts.
  it("does not read a meta-analysis from a negation or a review of them", () => {
    expect(
      design(
        "Traffic-related air pollution and asthma",
        "We conducted a review. Due to the low number of articles, no meta-analysis was performed."
      )
    ).toBeNull()
    expect(
      design(
        "Physical activity in care settings: a systematic review of meta-analyses"
      )
    ).toBe("systematic")
  })

  it("does not read the plural 'meta-analyses' or 'designs' as this study's design", () => {
    expect(
      design(
        "Upper limb rehabilitation",
        "We searched for randomized controlled studies, reviews and statistical meta-analyses."
      )
    ).toBeNull()
    expect(
      design(
        "Physical activity and sleep",
        "We conducted an analysis. The literature is limited by cross-sectional and retrospective designs."
      )
    ).toBeNull()
  })

  it("calls 'Protocol and rationale for a randomized trial' a protocol", () => {
    expect(
      design(
        "Community-based intervention effects: Protocol and rationale for a randomized optimization trial"
      )
    ).toBe("protocol")
  })

  it("does not take the RCTs a review includes for its own design", () => {
    expect(
      design(
        "Physical rehabilitation approaches",
        "Inclusion criteria: Randomised controlled trials (RCTs) of physical rehabilitation approaches aimed at balance."
      )
    ).toBeNull()
  })

  it("does not read 'systematically review' (a verb) as a systematic review", () => {
    expect(
      design(
        "Mirror therapy in stroke rehabilitation",
        "This paper attempts to systematically review and present the current perspectives."
      )
    ).toBeNull()
  })

  it("does not call a survey with 'qualitative data' qualitative", () => {
    expect(
      design(
        "Farmers' information sharing",
        "We collected quantitative and qualitative data from a survey of 100 farmers."
      )
    ).toBeNull()
    expect(
      design(
        "Teachers' views",
        "We conducted semi-structured interviews and also administered a questionnaire."
      )
    ).toBeNull()
  })

  it("sees designs written with Unicode hyphens", () => {
    expect(
      design(
        "Nurses' burnout",
        "We conducted a cross‐sectional survey of nurses."
      )
    ).toBe("cross-sectional")
    expect(design("Nurses' burnout: a cross‐sectional study")).toBe(
      "cross-sectional"
    )
  })

  it("does not read a database name as a trial", () => {
    expect(
      design(
        "Effects of exercise",
        "We searched the Cochrane Central Register of Controlled Trials."
      )
    ).toBeNull()
  })

  it("does not read a validation from 'tested for validity and reliability'", () => {
    expect(
      design(
        "Family support and nurses' burnout",
        "We used a questionnaire tested for validity and reliability."
      )
    ).toBeNull()
  })

  it("does not call a 'case study' a clinical case", () => {
    expect(
      design(
        "Reinforcement learning at the edge",
        "We illustrate this using a case study on the Atari benchmark."
      )
    ).toBeNull()
    expect(
      design(
        "Teaching practice",
        "We used an interpretive case study in five schools."
      )
    ).toBeNull()
  })

  it("does not call a results paper a protocol, nor a protocol a trial", () => {
    expect(
      design(
        "Effectiveness of a school intervention",
        "The trial followed a prespecified trial protocol. Schools were randomly allocated."
      )
    ).toBe("rct")
    expect(
      design("HeLP: study protocol for a randomised controlled trial")
    ).toBe("protocol")
  })

  it("does not call a secondary analysis the trial itself", () => {
    expect(
      design(
        "Genetic predictors of outcomes: findings from the ACCORD Clinical Trial"
      )
    ).toBeNull()
  })

  it("does not read 'non-randomized' as randomized", () => {
    expect(
      design(
        "Gene therapy",
        "This is an open-label, single-arm, non-randomized interventional trial."
      )
    ).toBe("trial")
  })

  it("gives a mixed-methods study its own label, not 'qualitative'", () => {
    expect(
      design(
        "AI in education",
        "A mixed-method research design was used. We ran semi-structured interviews."
      )
    ).toBe("mixed")
  })

  it("keeps a cohort's name from overriding a cross-sectional design", () => {
    expect(
      design(
        "Stress in nurses",
        "We applied cross-sectional data from the Nurses' Health Cohort Study."
      )
    ).toBeNull()
  })

  it("keeps a pilot trial with qualitative feedback as experimental", () => {
    expect(
      design(
        "Pilot trial of a self-compassion program",
        "Participants also gave qualitative feedback."
      )
    ).toBe("experimental")
  })

  it("recognizes feasibility trials and controlled evaluations", () => {
    expect(design("Pilot feasibility and acceptability trial of X")).toBe(
      "trial"
    )
    expect(
      design("Digital Bodies: a controlled evaluation of a brief program")
    ).toBe("trial")
  })

  it("has no design for a benchmark or method paper", () => {
    expect(
      design(
        "Soft actor-critic",
        "Our method achieves state-of-the-art performance on benchmarks."
      )
    ).toBeNull()
  })
})

describe("sample: participants", () => {
  const n = (abstract: string) =>
    study("A cross-sectional study", abstract).sample

  it("reads a single, unambiguous figure", () => {
    expect(n("Results (n = 245) were clear.")).toEqual({
      n: 245,
      unit: "participants"
    })
    expect(n("We surveyed 1,234 healthy adults.")).toEqual({
      n: 1234,
      unit: "participants"
    })
    expect(n("Se incluyeron 150 pacientes.")).toEqual({
      n: 150,
      unit: "participants"
    })
  })

  it("reads an explicitly introduced total", () => {
    expect(n("A sample of 312 was recruited.")).toEqual({
      n: 312,
      unit: "participants"
    })
    expect(n("Participaron un total de 150 pacientes.")).toEqual({
      n: 150,
      unit: "participants"
    })
    expect(
      n("A total of 917 students took part (n = 614 and n = 303 by arm).")
    ).toBeNull() // 614 is over half of 917: the total is unclear
    expect(
      n("A total of 300 participants took part; 100 were men (n = 100).")
    ).toEqual({ n: 300, unit: "participants" })
  })

  it("reads a number written with a space as thousands separator", () => {
    expect(
      n("Participants 105 159 participants aged at least 18 years.")
    ).toEqual({ n: 105159, unit: "participants" })
    expect(n("In 2015 300 participants joined.")).toEqual({
      n: 300,
      unit: "participants"
    })
  })

  it("says nothing when the groups are stated but the total is not", () => {
    expect(n("Patients received drug (n = 30) or placebo (n = 30).")).toBeNull()
    expect(n("Randomised to iCBT (n = 43) or usual care (n = 44).")).toBeNull()
    expect(n("We compared 150 women and 120 men.")).toBeNull()
  })

  it("says nothing for per-group figures and mixed kinds of people", () => {
    expect(
      n(
        "Participants were divided into two groups, with 30 patients in each group."
      )
    ).toBeNull()
    expect(
      n("121 physicians and 125 nurses were included in the study.")
    ).toBeNull()
    // "two directors" is a count this reader cannot see
    expect(
      n("We interviewed two directors and 17 students at the school.")
    ).toBeNull()
  })

  it("says nothing when the total could be a single arm or subgroup", () => {
    expect(
      n(
        "The follow-up sample included 358 patients in one condition and 300 patients in the other."
      )
    ).toBeNull()
    expect(
      n(
        "A total of 2195 registered nurses and 1914 assistant nurses took part."
      )
    ).toBeNull()
  })

  it("does not take repeated measurements or a stated share for the sample", () => {
    expect(
      n("We analysed 4812 observations of individuals aged 65 or older.")
    ).toBeNull()
    expect(n("10551 participants (80%) were on a single drug.")).toBeNull()
    // a percentage that describes the group is fine
    expect(
      n("3157 students (50.4% boys) completed the questionnaire.")
    ).toEqual({
      n: 3157,
      unit: "participants"
    })
  })

  it("does not take the people invited instead of those who took part", () => {
    expect(
      n("Of the 3000 participants approached, we received responses from 700.")
    ).toBeNull()
  })

  it("does not take the pool a sample was drawn from", () => {
    expect(
      n(
        "We selected children with obesity from 1340 students in third grade. 525 children took part."
      )
    ).toBeNull()
  })

  it("ignores ages, ranges and rates", () => {
    expect(n("Adolescents aged 12 to 18 years took part.")).toBeNull()
    expect(n("Participants were aged 18 and 65 adults.")).toBeNull()
    expect(
      n("Incidence was 5 per 1000 people, and 12 per 1000 people later.")
    ).toBeNull()
  })

  it("ignores implausibly small counts", () => {
    expect(n("Only 3 participants dropped out.")).toBeNull()
    expect(n("Randomized in 7 schools (n = 7 clusters).")).toBeNull()
  })

  it("does not count individuals that are not people", () => {
    expect(
      study(
        "A field experiment",
        "We employed an experimental design with patches of 180 individuals of mussels."
      ).sample
    ).toBeNull()
    expect(
      n(
        "We enrolled 70 individuals aged 18-28 years who were recruited online."
      )
    ).toEqual({ n: 70, unit: "participants" })
  })

  it("does not trust a bare 'n =' when no design was recognized", () => {
    expect(
      study("Sequencing of tonsils", "We performed RNA sequencing (n = 20).")
        .sample
    ).toBeNull()
    expect(
      study("Online learning", "Data came from 413 students in Germany.").sample
    ).toEqual({ n: 413, unit: "participants" })
  })
})

describe("sample: studies in a review", () => {
  it("counts the studies kept, not the records screened", () => {
    expect(
      study(
        "A systematic review",
        "We screened 3,184 studies and included 12 studies in the synthesis."
      ).sample
    ).toEqual({ n: 12, unit: "studies" })
    expect(
      study(
        "A meta-analysis",
        "Twelve reports were found. 12 trials met the inclusion criteria."
      ).sample
    ).toEqual({ n: 12, unit: "studies" })
    expect(
      study(
        "A meta-analysis",
        "We included 24 studies with 5,000 participants."
      ).sample
    ).toEqual({ n: 24, unit: "studies" })
  })

  it("says nothing without an 'included' figure", () => {
    expect(
      study(
        "A systematic review",
        "We identified 3,184 studies from the search."
      ).sample
    ).toBeNull()
    expect(
      study(
        "A meta-analysis",
        "Of a total of 229 studies considered potentially eligible, only 10 RCTs met the criteria."
      ).sample
    ).toBeNull()
  })

  it("does not take the larger half of 'X out of Y studies were included'", () => {
    expect(
      study(
        "A systematic review",
        "Of the 2161 records, eight out of 15 studies were included."
      ).sample
    ).toBeNull()
  })

  it("says nothing when 'included' could count articles or the studies inside them", () => {
    expect(
      study(
        "A meta-analysis",
        "A total of 34 articles comprising 80 individual studies were included."
      ).sample
    ).toBeNull()
  })

  it("says nothing when two different 'included' figures appear", () => {
    expect(
      study(
        "A meta-analysis",
        "We included 40 studies; 25 studies were included in the pooled model."
      ).sample
    ).toBeNull()
  })

  it("does not take a sample from the title alone", () => {
    expect(study("A trial of 500 patients", null).sample).toBeNull()
  })
})

describe("studyOf", () => {
  it("returns the same result for the same paper object (memoized)", () => {
    const paper = {
      title: "A cohort study of x",
      abstract: "n = 100",
      publicationTypes: null
    }
    expect(studyOf(paper)).toBe(studyOf(paper))
  })
})
