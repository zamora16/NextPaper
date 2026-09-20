import type { RecommendedPaper } from "~lib/semantic-scholar"

// "Study card": design and sample size read from a paper's title, abstract and
// Semantic Scholar publication types with plain rules (no AI, no requests).
// PRECISION OVER COVERAGE: a wrong chip is worse than none, so every rule
// below prefers saying nothing when the text is ambiguous.

export type DesignId =
  | "protocol"
  | "meta"
  | "systematic"
  | "rct"
  | "trial"
  | "experimental"
  | "review"
  | "case-control"
  | "cohort"
  | "psychometric"
  | "cross-sectional"
  | "mixed"
  | "qualitative"
  | "case"

interface DesignRule {
  id: DesignId
  label: string
  // Matched against the title and against abstract sentences that talk about
  // the study itself (see SELF).
  pattern: RegExp
  // Matched against the title only: phrases too common in abstracts to trust
  // there ("based on a literature review, we used a survey").
  titlePattern?: RegExp
}

// Ordered by priority: the first design that matches wins. A protocol for a
// trial is a protocol, a systematic review that mentions randomized trials is
// a review, and a psychometric validation that mentions "cross-sectional" is a
// validation.
export const DESIGNS: DesignRule[] = [
  {
    id: "protocol",
    label: "Protocolo de estudio",
    pattern:
      /\bprotocol for a (randomi[sz]ed|clinical|trial|study|pilot|systematic|scoping)|\bthis (paper|article) (describes|presents|outlines) the (\w+ ){0,3}protocol\b/i,
    // "according to a prespecified trial protocol" is a results paper.
    titlePattern:
      /\b(study|trial|review) protocol\b|\bprotocol\b[^.:]{0,30}\b(for|of) (a|an|the)\b|protocolo de (estudio|investigaci[oó]n)/i
  },
  {
    id: "meta",
    label: "Metaanálisis",
    // "no meta-analysis was performed" and "a systematic review of
    // meta-analyses" are not meta-analyses.
    pattern:
      /(?<!\bno |\bnot |without |non-|\bof |\bfrom )meta-?(analysis|analytic)\b|metaan[aá]lisis/i
  },
  {
    id: "systematic",
    label: "Revisión sistemática",
    pattern:
      // "systematically review" is a verb, not the design.
      /systematic review|revisi[oó]n sistem[aá]tica|umbrella review/i
  },
  {
    id: "rct",
    label: "Ensayo aleatorizado",
    pattern:
      /(?<!non-?|non |quasi-?)randomi[sz]ed,?\s+(?:[\w-]+,?\s+){0,5}?(trial|study)\b|\bRCT\b|randomly (assigned|allocated)|ensayo (cl[ií]nico )?aleatori[zs]ado/i
  },
  {
    id: "trial",
    label: "Ensayo clínico",
    // "clinical trial screening / progress / results" is talk about trials,
    // not the design of this study.
    pattern:
      /(?<!\bfrom the [\w-]+ )clinical trial\b(?! (screening|matching|design|eligib|registr|data|enrol|progress|results|outcomes|phase|stage|success|failure))|\bphase (I{1,3}|[123]) (clinical )?(trial|study)\b|non-?randomi[sz]ed|controlled (trial|evaluation)\b|(feasibility|acceptability) (and \w+ )?trial|ensayo cl[ií]nico/i
  },
  {
    id: "psychometric",
    label: "Validación psicométrica",
    // "tested for validity and reliability" or a factor analysis appear in many
    // ordinary surveys, so they are not enough.
    pattern:
      /psychometric|cross-cultural adaptation|transcultural adaptation|translation and validation|validation of (the |a |an )?[\w\s\-()']{0,60}?(scale|questionnaire|version|instrument|inventory|index|measure)\b|propiedades psicom[eé]tricas|validaci[oó]n (de la|del|de) [\w\s\-()']{0,60}?(escala|cuestionario|versi[oó]n|instrumento|inventario)/i
  },
  {
    id: "experimental",
    label: "Experimental / piloto",
    // "experimental design" alone is usually a topic; it counts only when the
    // study says it used one.
    pattern:
      /quasi-?experiment|\b(employ|conduct|use|adopt|implement)(ed|s|ing)? an? (\w+ )?experimental (study|design)|pilot (study|trial|randomi)|estudio piloto|estudio experimental/i
  },
  {
    id: "review",
    label: "Revisión",
    pattern:
      /scoping review|narrative review|integrative review|critical review|\b(this|present|current) (\w+ )?review\b|revisi[oó]n (narrativa|bibliogr[aá]fica|de la literatura)/i,
    titlePattern:
      /literature review|:\s*an? (\w+\s+){0,2}review\b|\ban? (\w+\s+)?review of\b/i
  },
  {
    id: "case-control",
    label: "Casos y controles",
    pattern: /case[- ]control|casos y controles/i
  },
  {
    id: "cohort",
    label: "Cohortes / longitudinal",
    // Only explicit study phrases: the bare word "cohort" also names a data
    // source ("cross-sectional data from a cohort").
    pattern:
      /\bcohort (study|analysis|design)\b|(prospective|retrospective|longitudinal) (study|design|cohort|analysis)\b|estudio de cohortes/i
  },
  {
    id: "mixed",
    label: "Métodos mixtos",
    pattern: /mixed[- ]methods?|m[eé]todos? mixtos?/i
  },
  {
    id: "cross-sectional",
    label: "Transversal / encuesta",
    pattern:
      /cross-?sectional (survey|study|design|analysis|research|online)|survey study|estudio transversal|encuesta transversal/i
  },
  {
    id: "qualitative",
    label: "Cualitativo",
    // Needs a research-method cue: "qualitative agreement" or "quantitative
    // and qualitative data" is not a design. Focus groups and thematic
    // analysis also serve surveys and mixed studies, so they are left out.
    pattern:
      /qualitative (study|research|interviews?|design)|semi-?structured interviews?|grounded theory|phenomenolog|entrevistas? (en profundidad|semiestructuradas)|estudio cualitativo/i
  },
  {
    id: "case",
    label: "Caso clínico",
    // "case study" is deliberately absent: in education, business or ML it is
    // not a clinical case.
    pattern: /case reports?|case series|caso cl[ií]nico/i
  }
]

const LABELS = new Map(DESIGNS.map((d) => [d.id, d.label]))
export const designLabel = (id: DesignId) => LABELS.get(id) ?? id

// publicationTypes from Semantic Scholar only fill in when the text says
// nothing, and only for types that map cleanly onto a design.
const FROM_PUBLICATION_TYPES: Record<string, DesignId> = {
  MetaAnalysis: "meta",
  ClinicalTrial: "trial",
  CaseReport: "case"
}

// A sentence "talks about the study itself" when it has one of these cues.
// Background ("several clinical trials are underway", "numerous reviews and
// meta-analyses report...") has none, so designs mentioned there are ignored.
const SELF =
  /\b(this|our|we|herein|aims?|aimed|objectives?|purpose|design|methods?|conducted|performed|carried out|undertaken|employed|adopted|used|using|(were|was) (randomly |randomi[sz]ed )?(assigned|allocated|recruited|enrolled|surveyed|interviewed)|este|esta|nuestro|realiz\w+|dise[nñ]o|m[eé]todos?|objetivos?|utiliz\w+|emple\w+)\b/i
// ...unless it is about earlier work: "Prior work used a randomized trial".
const BACKGROUND =
  /\b(prior|previous(ly)?|earlier|existing|past|recent|several|numerous|many|most|other|some|few) (\w+ )?(work|studies|research|trials?|reviews?|literature|evidence|reports?|papers?|meta-analyses)\b|\b(studies|research|evidence|trials|reviews) (have|has|show|suggest|report)\b|\bhas been shown\b/i
const HEADER = /^(study )?(design|methods?|setting|study type)\W*$/i

// Title plus the abstract sentences that describe the study itself; a short
// section header ("Design.") lends its cue to the sentence after it.
function selfText(title: string, abstract: string | null): string {
  const kept = [title]
  if (abstract) {
    const sentences = abstract.split(/(?<=[.!?])\s+/)
    sentences.forEach((sentence, i) => {
      if (
        (SELF.test(sentence) ||
          (i > 0 && HEADER.test(sentences[i - 1].trim()))) &&
        !BACKGROUND.test(sentence)
      ) {
        kept.push(sentence)
      }
    })
  }
  return kept.join(". ")
}

export type SampleUnit = "participants" | "studies"

export interface StudyInfo {
  design: DesignId | null
  sample: { n: number; unit: SampleUnit } | null
}

// "105 159" (space as thousands separator) must not swallow a year: "2015 300".
const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+|(?<![\d.,])\d{1,3}(?:\s\d{3})+|\d+)`

// "1,234" / "1.234" / "105 159" → number; a lone number is taken as is.
export function parseCount(raw: string): number {
  return /^\d{1,3}([.,\s]\d{3})+$/.test(raw)
    ? parseInt(raw.replace(/[.,\s]/g, ""), 10)
    : parseInt(raw, 10)
}

const HUMAN_UNIT =
  "participants|patients|adults|adolescents|children|students|women|men|respondents|volunteers|employees|workers|survivors|athletes|teachers|nurses|" +
  "participantes|pacientes|adultos|adolescentes|niños|niñas|estudiantes|mujeres|hombres|voluntarios|profesionales|trabajadores|" +
  // Other roles: a study often counts several kinds of people, and missing one
  // would leave a subgroup looking like the whole sample.
  "directors|managers|physicians|doctors|clinicians|parents|caregivers|therapists|supervisors|leaders|principals|mothers|fathers|residents|graduates|undergraduates|pupils|farmers|veterans|older adults|dyads|families|couples"
const NUMBER_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred"
// Generic nouns: "180 individuals" can be mussels. Only counted when the
// abstract also shows it is about people.
const GENERIC_UNIT = "individuals|subjects|people|persons|personas|sujetos"
const HUMAN_CONTEXT =
  /\b(aged?|mean age|years old|participants|patients|adults|volunteers|respondents|questionnaires?|survey|clinic\w*|hospital\w*|cohort|women|men|children)\b/i
const STUDY_UNIT = "studies|trials|articles|papers|estudios|ensayos|artículos"

// A count directly after "to", "-", "aged"... is an age or a range end, not a
// sample ("aged 12 to 18 adolescents"); "per 1000 people" is a rate.
// "and" only makes a range when an age or "between" opens it ("aged 18 and 65
// adults"); in "150 women and 120 men" it joins two groups, and dropping the
// second would leave one figure that looks like the total.
const isRangeOrAge = (text: string, index: number) =>
  /(\bto|[-–]|\baged?|\bover|\bunder|\bthan|\ba|\bper|\bevery|\bout of)\s*$/i.test(
    text.slice(Math.max(0, index - 10), index)
  ) ||
  (/\band\s*$/i.test(text.slice(Math.max(0, index - 10), index)) &&
    /\b(aged?|ages?|between|from)\b[^.]{0,20}$/i.test(
      text.slice(Math.max(0, index - 35), index)
    ))

// Smaller counts are usually schools, clinics or groups, not the sample.
const MIN_SAMPLE = 10

// The verbs and nouns that introduce the whole sample, as opposed to a group,
// a subgroup or the pool it was drawn from.
const TOTAL_CUE =
  /(total|sample|cohort|population|included|enrolled|recruited|analy[sz]ed|comprised|comprising|consisted of|surveyed|interviewed|incluy\w+|participaron|muestra)\s*(of\s*|de\s*)?(a\s*)?(total\s*)?(of\s*|de\s*)?(approximately |about )?$/i

interface Count {
  n: number
  total: boolean
  // Written as "30 patients in each group", or joined to another figure
  // ("121 physicians and 125 nurses"): a part of the sample, not all of it.
  part: boolean
}

// "4812 observations of individuals" counts measurements, not people.
const NOT_PEOPLE =
  /\b(observations?|measurements?|visits?|samples?|records?|scans?|images?|episodes?|events?|encounters?|admissions?|claims?|responses?)\b/i
// "10551 participants (80%) were on..." is a share of a bigger, unstated total;
// "3157 students (50.4% boys)" merely describes the whole and does not match.
const SHARE_AFTER = /^\s*\(\s*\d+(?:\.\d+)?\s*%\s*\)/
// The people who were invited, not the ones who took part ("Of the 3000
// participants approached, 700 responded").
const POOL =
  /\b(approached|invited|contacted|screened|eligible|distributed|targeted)\b/i
// "in each group", "per arm": the figure repeats for every group.
const EACH_AFTER =
  /^[^.;]{0,25}?\b(in each|per|for each|each (group|arm|condition|cohort|sample))\b/i
// "... 121 physicians and 125 nurses": the counted phrase sits next to another.
const JOINED_BEFORE =
  /\d[\d.,]*\s+[\p{L}-]+(?:\s+[\p{L}-]+)?\s*(?:,|and|or|vs\.?|versus|y)\s*$/iu
const JOINED_AFTER = /^\s*(?:,|and|or|vs\.?|versus|y)\s*\d/i

function participantCounts(text: string, allowEq: boolean): Count[] {
  const counts: Count[] = []
  const cued = (index: number) =>
    TOTAL_CUE.test(text.slice(Math.max(0, index - 40), index))

  // Group sizes are written "n = 30" too, so a bare "n =" is a total only
  // when it is the one figure in the text.
  for (const match of allowEq
    ? text.matchAll(new RegExp(String.raw`\b[nN]\s*=\s*${NUMBER}`, "g"))
    : []) {
    counts.push({ n: parseCount(match[1]), total: false, part: false })
  }

  // "245 participants", "recruited 1,234 healthy adults"
  const units = HUMAN_CONTEXT.test(text)
    ? `${HUMAN_UNIT}|${GENERIC_UNIT}`
    : HUMAN_UNIT
  for (const match of text.matchAll(
    new RegExp(
      String.raw`${NUMBER}\s+(?:[\p{L}-]+\s+){0,2}?(?:${units})\b`,
      "giu"
    )
  )) {
    const index = match.index ?? 0
    if (isRangeOrAge(text, index) || NOT_PEOPLE.test(match[0])) continue
    const end = index + match[0].length
    const part =
      SHARE_AFTER.test(text.slice(end, end + 12)) ||
      POOL.test(text.slice(Math.max(0, index - 40), end + 40)) ||
      EACH_AFTER.test(text.slice(end, end + 40)) ||
      JOINED_BEFORE.test(text.slice(Math.max(0, index - 40), index)) ||
      JOINED_AFTER.test(text.slice(end, end + 12))
    counts.push({ n: parseCount(match[1]), total: !part && cued(index), part })
  }

  // "a sample of 245", "a total of 1,234"
  for (const match of text.matchAll(
    new RegExp(
      String.raw`(?:sample|total|cohort|population) of (?:approximately |about |n\s*=\s*)?${NUMBER}|(?:muestra|total) de ${NUMBER}`,
      "gi"
    )
  )) {
    const index = match.index ?? 0
    const end = index + match[0].length
    counts.push({
      n: parseCount(match[1] ?? match[2]),
      total: !JOINED_AFTER.test(text.slice(end, end + 12)),
      part: JOINED_AFTER.test(text.slice(end, end + 12))
    })
  }

  return counts.filter((c) => c.n >= MIN_SAMPLE && c.n <= 50_000_000)
}

// A spelled-out number next to a kind of person ("two directors", "eight
// teachers") is a count this reader cannot see, so it may be part of a sample
// whose other part is a digit.
const SPELLED_COUNT = new RegExp(
  String.raw`\b(?:${NUMBER_WORD})\s+(?:[\p{L}-]+\s+){0,2}?(?:${HUMAN_UNIT}|${GENERIC_UNIT})\b`,
  "iu"
)

// Only two situations are clear enough to report:
//  - the text introduces a figure as the whole sample ("a total of", "we
//    included", "sample of") and no other figure is larger;
//  - exactly one figure appears at all.
// Anything else is groups ("placebo (n = 30) or drug (n = 30)"), subgroups or
// the pool the sample was drawn from, and the total is unknown: say nothing.
function findParticipants(text: string, allowEq: boolean): number | null {
  if (SPELLED_COUNT.test(text)) return null
  const counts = participantCounts(text, allowEq)
  if (counts.some((c) => c.part)) return null
  const totals = counts.filter((c) => c.total)
  if (totals.length) {
    const max = Math.max(...totals.map((c) => c.n))
    // "358 patients in one arm and 300 in the other" or "2195 nurses and 1914
    // assistants" are introduced like a total but are parts of one: any other
    // figure above half of it makes the total unclear.
    return counts.every((c) => c.n === max || c.n <= max / 2) ? max : null
  }
  return counts.length === 1 ? counts[0].n : null
}

// What a review is built on: "included 24 studies", "12 trials met the
// inclusion criteria". Screening numbers ("screened 3,184 studies") never
// match, and neither do bare counts, so nothing is guessed.
const INCLUDED_BEFORE = new RegExp(
  String.raw`(?:included|including|pooled|synthesi[sz]ed|analy[sz]ed|reviewed|comprising|incluy[oó]|incluyeron)\s+(?:a total of |un total de )?${NUMBER}\s+(?:[\p{L}-]+\s+){0,2}?(?:${STUDY_UNIT})\b`,
  "giu"
)
const INCLUDED_AFTER = new RegExp(
  String.raw`${NUMBER}\s+(?:[\p{L}-]+\s+){0,2}?(?:${STUDY_UNIT})\s+(?:(?:were|was|that|which)\s+)?(?:included|eligible|met|fulfilled|incluidos)`,
  "giu"
)

const ANY_STUDIES = new RegExp(
  String.raw`${NUMBER}\s+(?:[\p{L}-]+\s+){0,2}?(?:${STUDY_UNIT})\b`,
  "giu"
)

function findStudies(text: string): number | null {
  const counts = new Set<number>()
  for (const match of text.matchAll(INCLUDED_BEFORE)) {
    counts.add(parseCount(match[1]))
  }
  for (const match of text.matchAll(INCLUDED_AFTER)) {
    // This pattern starts at the number: "eight out of 15 studies were
    // included" kept eight, not 15.
    const before = text.slice(Math.max(0, (match.index ?? 0) - 10), match.index)
    if (!/\b(of|to|and)\s*$/i.test(before)) counts.add(parseCount(match[1]))
  }
  // Two different "included" figures mean we cannot tell which is final.
  if (counts.size !== 1) return null
  const [n] = counts
  if (n < 2 || n > 5000) return null
  // "34 articles comprising 80 studies": a smaller count of the same kind of
  // thing means "included" may refer to either. Larger ones are the screening
  // funnel ("3,184 screened, 12 included") and are fine.
  for (const match of text.matchAll(ANY_STUDIES)) {
    const other = parseCount(match[1])
    if (other >= 2 && other < n) return null
  }
  return n
}

const REVIEW_DESIGNS: DesignId[] = ["meta", "systematic", "review"]

// "Cross-sectional analysis of the X Cohort Study" names a data source, and
// its design is the cross-sectional one: when both appear, say nothing.
const CROSS_SECTIONAL_WORD = /cross-?sectional/i
// A study with a survey or statistics next to its interviews is not purely
// qualitative, and "mixed methods" would need to be stated.
const QUANTITATIVE_WORD =
  /questionnaire|survey|regression|structural equation|quantitative|statistical/i

// Semantic Scholar text mixes real hyphens with Unicode ones ("cross‐sectional",
// "non‑randomized"), which the patterns above would silently miss.
const normalize = (text: string) => text.replace(/[‐-―−]/g, "-")

function findDesign(
  paper: Pick<RecommendedPaper, "title" | "abstract" | "publicationTypes">
): DesignId | null {
  const title = normalize(paper.title)
  const scope = selfText(title, paper.abstract && normalize(paper.abstract))
  const fromText = DESIGNS.find(
    (d) => d.pattern.test(scope) || d.titlePattern?.test(title)
  )?.id
  if (fromText === "cohort" && CROSS_SECTIONAL_WORD.test(scope)) return null
  if (fromText === "qualitative" && QUANTITATIVE_WORD.test(scope)) return null
  if (fromText) return fromText
  for (const type of paper.publicationTypes ?? []) {
    if (FROM_PUBLICATION_TYPES[type]) return FROM_PUBLICATION_TYPES[type]
  }
  return null
}

export function extractStudy(
  paper: Pick<RecommendedPaper, "title" | "abstract" | "publicationTypes">
): StudyInfo {
  const design = findDesign(paper)

  // Sample size only comes from the abstract: titles rarely state it, and
  // without an abstract a number is far more likely to be noise.
  if (!paper.abstract) return { design, sample: null }
  const abstract = normalize(paper.abstract)

  if (design && REVIEW_DESIGNS.includes(design)) {
    const studies = findStudies(abstract)
    return { design, sample: studies ? { n: studies, unit: "studies" } : null }
  }

  // Without a recognized design the text may not describe a study at all, so
  // a bare "n = 20" is not trusted; only people-counting phrases are.
  const participants = findParticipants(abstract, !!design)
  return {
    design,
    sample: participants ? { n: participants, unit: "participants" } : null
  }
}

// The view asks for every paper on each render; results are immutable objects.
const memo = new WeakMap<object, StudyInfo>()
export function studyOf(
  paper: Pick<RecommendedPaper, "title" | "abstract" | "publicationTypes">
): StudyInfo {
  let info = memo.get(paper)
  if (!info) {
    info = extractStudy(paper)
    memo.set(paper, info)
  }
  return info
}

export function formatSample(sample: NonNullable<StudyInfo["sample"]>): string {
  return sample.unit === "studies"
    ? `${sample.n} estudios`
    : `n = ${sample.n.toLocaleString()}`
}
