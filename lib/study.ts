import type { RecommendedPaper } from "~lib/semantic-scholar"

// "Study card": design and sample size read from a paper's title, abstract and
// Semantic Scholar publication types with plain rules (no AI, no requests).
// It is a heuristic: it favors precision — when unsure it says nothing.

export type DesignId =
  | "meta"
  | "systematic"
  | "rct"
  | "trial"
  | "protocol"
  | "review"
  | "case-control"
  | "cohort"
  | "psychometric"
  | "cross-sectional"
  | "qualitative"
  | "experimental"
  | "case"
  | "method"

// Ordered by priority: the first design that matches wins, so a systematic
// review that mentions randomized trials is a review, and a psychometric
// validation that mentions "cross-sectional" is a validation.
export const DESIGNS: { id: DesignId; label: string; pattern: RegExp }[] = [
  { id: "meta", label: "Metaanálisis", pattern: /meta-?analy|metaan[aá]lisis/i },
  {
    id: "systematic",
    label: "Revisión sistemática",
    pattern: /systematic(ally)? review|revisi[oó]n sistem[aá]tica|umbrella review/i
  },
  {
    id: "rct",
    label: "Ensayo aleatorizado",
    pattern:
      /randomi[sz]ed (controlled |clinical |crossover |cluster |pilot )*(trial|study)|\bRCTs?\b|randomly (assigned|allocated)|ensayo (cl[ií]nico )?aleatori[zs]ado/i
  },
  {
    id: "trial",
    label: "Ensayo clínico",
    pattern: /clinical trial|\bphase (I{1,3}|[123])\b|ensayo cl[ií]nico/i
  },
  {
    id: "protocol",
    label: "Protocolo de estudio",
    pattern: /study protocol|protocol (for|of) (a|an|the) |protocolo de (estudio|investigaci[oó]n)/i
  },
  {
    id: "review",
    label: "Revisión",
    pattern:
      /scoping review|narrative review|literature review|integrative review|critical review|\bthis review\b|revisi[oó]n (narrativa|bibliogr[aá]fica|de la literatura)/i
  },
  { id: "case-control", label: "Casos y controles", pattern: /case[- ]control|casos y controles/i },
  {
    id: "cohort",
    label: "Cohortes / longitudinal",
    pattern:
      /\bcohort\b|longitudinal|prospective (study|cohort|design)|retrospective (study|cohort|analysis)|seguimiento de \d|estudio de cohortes/i
  },
  {
    id: "psychometric",
    label: "Validación psicométrica",
    pattern:
      /psychometric|validity and reliability|factor(ial)? (structure|analysis)|confirmatory factor|cross-cultural adaptation|translation and validation|validaci[oó]n (de la|de|del)|propiedades psicom[eé]tricas/i
  },
  {
    id: "cross-sectional",
    label: "Transversal / encuesta",
    pattern: /cross-?sectional|online survey|questionnaire survey|survey study|estudio transversal|encuesta/i
  },
  {
    id: "qualitative",
    label: "Cualitativo",
    pattern:
      /qualitative|semi-?structured interviews?|focus groups?|thematic analysis|grounded theory|phenomenolog|entrevistas? (en profundidad|semiestructuradas)|cualitativ/i
  },
  {
    id: "experimental",
    label: "Experimental / piloto",
    pattern: /quasi-?experiment|experimental (study|design|paradigm)|pilot (study|trial|randomi)|estudio piloto|estudio experimental/i
  },
  { id: "case", label: "Caso clínico", pattern: /case (report|series|study)|caso cl[ií]nico/i },
  {
    id: "method",
    label: "Método propuesto",
    pattern:
      /we (propose|present|introduce|develop) (a |an |the )?(new|novel)|(a |an )?novel (method|approach|architecture|framework|algorithm|model)\b|state-of-the-art (results|performance)|outperform/i
  }
]

const LABELS = new Map(DESIGNS.map((d) => [d.id, d.label]))
export const designLabel = (id: DesignId) => LABELS.get(id) ?? id

// publicationTypes from Semantic Scholar are more reliable than text patterns
// when present, but only these map cleanly onto a design.
const FROM_PUBLICATION_TYPES: Record<string, DesignId> = {
  MetaAnalysis: "meta",
  ClinicalTrial: "trial",
  CaseReport: "case"
}

export type SampleUnit = "participants" | "studies"

export interface StudyInfo {
  design: DesignId | null
  sample: { n: number; unit: SampleUnit } | null
}

const NUMBER = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+)`

// "1,234" / "1.234" → 1234; a lone number is taken as is.
export function parseCount(raw: string): number {
  return /^\d{1,3}([.,]\d{3})+$/.test(raw)
    ? parseInt(raw.replace(/[.,]/g, ""), 10)
    : parseInt(raw, 10)
}

const PARTICIPANT_UNIT =
  "participants|patients|adults|adolescents|children|students|women|men|individuals|subjects|respondents|people|persons|volunteers|employees|workers|survivors|athletes|teachers|nurses|" +
  "participantes|pacientes|adultos|adolescentes|niños|niñas|estudiantes|mujeres|hombres|personas|sujetos|voluntarios|profesionales|trabajadores"
const STUDY_UNIT = "studies|trials|articles|papers|estudios|ensayos|artículos"

// A count directly after "to", "-", "aged"... is an age or a range end, not a
// sample ("aged 12 to 18 adolescents").
const isRangeOrAge = (text: string, index: number) =>
  /(\bto|\band|[-–]|\baged?|\bover|\bunder|\bthan|\bde|\ba)\s*$/i.test(
    text.slice(Math.max(0, index - 10), index)
  )

const MIN_SAMPLE = 5

function findParticipants(text: string): number | null {
  const counts: number[] = []

  // n = 245, N=1,234
  for (const match of text.matchAll(new RegExp(String.raw`\b[nN]\s*=\s*${NUMBER}`, "g"))) {
    counts.push(parseCount(match[1]))
  }

  // "245 participants", "1,234 healthy adults"
  for (const match of text.matchAll(
    new RegExp(String.raw`${NUMBER}\s+(?:[\p{L}-]+\s+){0,2}?(?:${PARTICIPANT_UNIT})\b`, "giu")
  )) {
    if (!isRangeOrAge(text, match.index ?? 0)) counts.push(parseCount(match[1]))
  }

  // "a sample of 245", "a total of 1,234"
  for (const match of text.matchAll(
    new RegExp(String.raw`(?:sample|total|cohort|population) of (?:approximately |about |n\s*=\s*)?${NUMBER}|muestra de ${NUMBER}`, "gi")
  )) {
    counts.push(parseCount(match[1] ?? match[2]))
  }

  const plausible = counts.filter((n) => n >= MIN_SAMPLE && n <= 50_000_000)
  // Group sizes are smaller than the total, so the largest figure is the total.
  return plausible.length ? Math.max(...plausible) : null
}

function findStudies(text: string): number | null {
  const counts: number[] = []
  for (const match of text.matchAll(
    new RegExp(String.raw`${NUMBER}\s+(?:[\p{L}-]+\s+){0,2}?(?:${STUDY_UNIT})\b`, "giu")
  )) {
    if (!isRangeOrAge(text, match.index ?? 0)) counts.push(parseCount(match[1]))
  }
  for (const match of text.matchAll(/\bk\s*=\s*(\d+)/g)) counts.push(parseInt(match[1], 10))
  const plausible = counts.filter((n) => n >= 2 && n <= 5000)
  return plausible.length ? Math.max(...plausible) : null
}

const REVIEW_DESIGNS: DesignId[] = ["meta", "systematic", "review"]

export function extractStudy(
  paper: Pick<RecommendedPaper, "title" | "abstract" | "publicationTypes">
): StudyInfo {
  const text = `${paper.title}. ${paper.abstract ?? ""}`

  let design: DesignId | null = null
  for (const type of paper.publicationTypes ?? []) {
    if (FROM_PUBLICATION_TYPES[type]) {
      design = FROM_PUBLICATION_TYPES[type]
      break
    }
  }
  if (!design) design = DESIGNS.find((d) => d.pattern.test(text))?.id ?? null

  // Sample size only comes from the abstract: titles rarely state it, and
  // without an abstract a number is far more likely to be noise.
  if (!paper.abstract) return { design, sample: null }

  if (design && REVIEW_DESIGNS.includes(design)) {
    const studies = findStudies(paper.abstract)
    return { design, sample: studies ? { n: studies, unit: "studies" } : null }
  }

  const participants = findParticipants(paper.abstract)
  return { design, sample: participants ? { n: participants, unit: "participants" } : null }
}

export function formatSample(sample: NonNullable<StudyInfo["sample"]>): string {
  return sample.unit === "studies"
    ? `${sample.n} estudios`
    : `n = ${sample.n.toLocaleString("es-ES")}`
}
