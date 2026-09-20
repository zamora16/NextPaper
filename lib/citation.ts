import type { CrossrefMeta } from "~lib/crossref"
import type { RecommendedPaper } from "~lib/semantic-scholar"

export type CitationStyle =
  | "apa"
  | "mla"
  | "chicago"
  | "harvard"
  | "ieee"
  | "vancouver"
  | "ama"
  | "bibtex"
  | "ris"

// Saved papers can carry a personal note, exported to BibTeX/RIS.
export type Citable = RecommendedPaper & { note?: string }

export const CITATION_STYLES: CitationStyle[] = [
  "apa",
  "mla",
  "chicago",
  "harvard",
  "ieee",
  "vancouver",
  "ama",
  "bibtex",
  "ris"
]

interface Person {
  family: string
  given: string
}

// Everything a style needs, normalized from Semantic Scholar's data and,
// when available, Crossref's (which wins: it has structured author names,
// issue, article number and the journal abbreviation).
interface Ref {
  authors: Person[]
  title: string
  journal?: string
  journalShort?: string
  volume?: string
  issue?: string
  pages?: string
  articleNumber?: string
  year?: number
  month?: number
  doi?: string
  url: string
  abstract?: string
  note?: string
  publisher?: string
  kind: "article" | "conference"
}

const tidy = (value?: string | null): string | undefined =>
  value?.replace(/\s+/g, " ").trim() || undefined

// Semantic Scholar author names are free text ("S. Mölbert", "Michael J.
// Black"), so without Crossref the last word is taken as the family name.
// That is wrong for compound surnames — one reason Crossref is preferred.
function personFromName(name: string): Person {
  if (name.includes(",")) {
    const [family, ...rest] = name.split(",")
    return { family: family.trim(), given: rest.join(",").trim() }
  }
  const parts = name.trim().split(/\s+/)
  const family = parts.pop() ?? name
  return { family, given: parts.join(" ") }
}

function normalizePages(pages?: string): string | undefined {
  const value = tidy(pages)?.replace(/\s*[-–—]\s*/, "-")
  if (!value) return undefined
  const [start, end] = value.split("-")
  return end && start === end ? start : value
}

function toRef(paper: Citable, meta?: CrossrefMeta | null): Ref {
  const structured = (meta?.authors ?? [])
    .map(
      (a): Person => ({
        family: a.family ?? a.name ?? "",
        given: a.family ? a.given ?? "" : ""
      })
    )
    .filter((p) => p.family)

  let journal = meta?.journal ?? tidy(paper.journal?.name) ?? tidy(paper.venue)
  let volume = meta?.volume ?? tidy(paper.journal?.volume)
  // S2 reports preprints as journal "ArXiv", volume "abs/1706.03762".
  if (journal && /^arxiv$/i.test(journal)) {
    journal = "arXiv"
    volume = undefined
  }

  const short = meta?.journalShort
  return {
    authors: structured.length
      ? structured
      : paper.authors.map((a) => personFromName(a.name)),
    title: tidy(meta?.title) ?? tidy(paper.title) ?? "",
    journal,
    journalShort: short && short !== journal ? short : undefined,
    volume,
    issue: meta?.issue,
    pages: normalizePages(meta?.pages ?? paper.journal?.pages),
    articleNumber: meta?.articleNumber,
    year: meta?.year ?? paper.year ?? undefined,
    month: meta?.month,
    doi: paper.externalIds?.DOI?.toLowerCase(),
    url: paper.url,
    abstract: paper.abstract ?? undefined,
    note: paper.note?.trim() || undefined,
    publisher: meta?.publisher,
    kind:
      paper.publicationTypes?.includes("Conference") ||
      meta?.type === "proceedings-article"
        ? "conference"
        : "article"
  }
}

// ---- shared helpers -------------------------------------------------------

const trimEnd = (text: string) => text.replace(/[.\s]+$/, "")
const withPeriod = (text: string) => (/[.?!]$/.test(text) ? text : text + ".")
const endash = (pages: string) => pages.replace("-", "–")

const initialsOf = (given: string): string[] =>
  given
    .split(/[\s.\-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())

const doiUrl = (ref: Ref) =>
  ref.doi ? `https://doi.org/${ref.doi}` : undefined

const MONTHS_IEEE = [
  "Jan.",
  "Feb.",
  "Mar.",
  "Apr.",
  "May",
  "Jun.",
  "Jul.",
  "Aug.",
  "Sep.",
  "Oct.",
  "Nov.",
  "Dec."
]

// "12(1)" — volume with optional issue.
const volumeIssue = (ref: Ref) =>
  ref.volume ? ref.volume + (ref.issue ? `(${ref.issue})` : "") : undefined

// ---- styles ---------------------------------------------------------------

function toAPA(ref: Ref): string {
  const names = ref.authors.map((p) => {
    const initials = initialsOf(p.given)
      .map((i) => i + ".")
      .join(" ")
    return initials ? `${p.family}, ${initials}` : p.family
  })

  let authors = ""
  if (names.length === 1) authors = names[0]
  else if (names.length > 1 && names.length <= 20) {
    authors = `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`
  } else if (names.length > 20) {
    authors = `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`
  }

  const locator = ref.pages
    ? endash(ref.pages)
    : ref.articleNumber
      ? `Article ${ref.articleNumber}`
      : undefined
  const source = ref.journal
    ? [ref.journal, volumeIssue(ref), locator].filter(Boolean).join(", ") + "."
    : ""
  const title = withPeriod(trimEnd(ref.title))
  const year = `(${ref.year ?? "n.d."})`
  const doi = doiUrl(ref)

  const head = authors ? `${authors} ${year}. ${title}` : `${title} ${year}.`
  return [head, source, doi].filter(Boolean).join(" ")
}

function toMLA(ref: Ref): string {
  const [first, second] = ref.authors
  const inverted = (p: Person) =>
    p.given ? `${p.family}, ${p.given}` : p.family
  let authors = ""
  if (ref.authors.length === 1) authors = inverted(first)
  else if (ref.authors.length === 2) {
    authors = `${inverted(first)}, and ${second.given} ${second.family}`.trim()
  } else if (ref.authors.length > 2) authors = `${inverted(first)}, et al.`

  const title = /[?!]$/.test(ref.title) ? ref.title : trimEnd(ref.title) + "."
  const parts = [
    ref.journal,
    ref.volume ? `vol. ${ref.volume}` : undefined,
    ref.issue ? `no. ${ref.issue}` : undefined,
    ref.year ? String(ref.year) : undefined,
    ref.pages
      ? `pp. ${endash(ref.pages)}`
      : ref.articleNumber
        ? `article ${ref.articleNumber}`
        : undefined,
    doiUrl(ref)
  ].filter(Boolean)

  const source = parts.length ? parts.join(", ") + "." : ""
  return [authors ? withPeriod(authors) : "", `"${title}"`, source]
    .filter(Boolean)
    .join(" ")
}

function toChicago(ref: Ref): string {
  const natural = (p: Person) => `${p.given} ${p.family}`.trim()
  const inverted = (p: Person) =>
    p.given ? `${p.family}, ${p.given}` : p.family
  // 11+ authors: the first seven, then "et al."
  const listed = ref.authors.length > 10 ? ref.authors.slice(0, 7) : ref.authors
  const people = listed.map((p, i) => (i === 0 ? inverted(p) : natural(p)))

  let authors = ""
  if (people.length === 1) authors = people[0]
  else if (ref.authors.length > 10) authors = `${people.join(", ")}, et al.`
  else if (people.length === 2) authors = `${people[0]}, and ${people[1]}`
  else if (people.length > 2) {
    authors = `${people.slice(0, -1).join(", ")}, and ${people[people.length - 1]}`
  }

  const title = /[?!]$/.test(ref.title) ? ref.title : trimEnd(ref.title) + "."
  const journal = ref.journal
    ? [ref.journal, ref.volume, ref.volume && ref.issue ? `(${ref.issue})` : ""]
        .filter(Boolean)
        .join(" ")
    : ""
  const locator = ref.pages ? endash(ref.pages) : ref.articleNumber
  const source = journal
    ? locator
      ? `${journal}: ${locator}.`
      : `${journal}.`
    : ""

  return [
    authors ? withPeriod(authors) : "",
    `${ref.year ?? "n.d."}.`,
    `"${title}"`,
    source,
    doiUrl(ref) ? doiUrl(ref) + "." : ""
  ]
    .filter(Boolean)
    .join(" ")
}

function toHarvard(ref: Ref): string {
  const names = ref.authors.map((p) => {
    const initials = initialsOf(p.given)
      .map((i) => i + ".")
      .join("")
    return initials ? `${p.family}, ${initials}` : p.family
  })

  let authors = ""
  if (names.length === 1) authors = names[0]
  else if (names.length === 2) authors = `${names[0]} and ${names[1]}`
  else if (names.length === 3) {
    authors = `${names[0]}, ${names[1]} and ${names[2]}`
  } else if (names.length > 3) authors = `${names[0]} et al.`

  const locator = ref.pages
    ? `pp. ${endash(ref.pages)}`
    : ref.articleNumber
      ? `article ${ref.articleNumber}`
      : undefined
  const source = [ref.journal, volumeIssue(ref), locator]
    .filter(Boolean)
    .join(", ")
  const year = `(${ref.year ?? "n.d."})`
  const head = authors ? `${authors} ${year}` : year
  const body = `'${trimEnd(ref.title)}'${source ? `, ${source}` : ""}.`

  return [head, body, doiUrl(ref)].filter(Boolean).join(" ")
}

function toIEEE(ref: Ref): string {
  const names = ref.authors.map((p) =>
    [
      initialsOf(p.given)
        .map((i) => i + ".")
        .join(" "),
      p.family
    ]
      .filter(Boolean)
      .join(" ")
  )

  let authors = ""
  if (names.length === 1) authors = names[0]
  else if (names.length === 2) authors = `${names[0]} and ${names[1]}`
  else if (names.length > 2 && names.length <= 6) {
    authors = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
  } else if (names.length > 6) authors = `${names[0]} et al.`

  const date = ref.month
    ? `${MONTHS_IEEE[ref.month - 1]} ${ref.year ?? ""}`.trim()
    : ref.year
      ? String(ref.year)
      : undefined
  const parts = [
    ref.journal,
    ref.volume ? `vol. ${ref.volume}` : undefined,
    ref.issue ? `no. ${ref.issue}` : undefined,
    ref.pages
      ? `pp. ${ref.pages}`
      : ref.articleNumber
        ? `Art. no. ${ref.articleNumber}`
        : undefined,
    date,
    ref.doi ? `doi: ${ref.doi}` : undefined
  ].filter(Boolean)

  const title = `"${trimEnd(ref.title)},"`
  const source = parts.length ? parts.join(", ") + "." : ""
  return [authors ? authors + "," : "", title, source].filter(Boolean).join(" ")
}

// Vancouver (ICMJE/NLM) and AMA share one layout; they differ in how many
// authors are listed before "et al.".
function toNumeric(ref: Ref, listAll: number, listBeforeEtAl: number): string {
  const names = ref.authors.map((p) =>
    [p.family, initialsOf(p.given).join("")].filter(Boolean).join(" ")
  )
  const authors =
    names.length > listAll
      ? `${names.slice(0, listBeforeEtAl).join(", ")}, et al`
      : names.join(", ")

  const abbreviation = (ref.journalShort ?? ref.journal)?.replace(/\./g, "")
  const year = ref.year ?? "n.d."
  const locator = ref.pages ?? ref.articleNumber
  const source = abbreviation
    ? `${abbreviation}. ${year}` +
      (ref.volume ? `;${volumeIssue(ref)}` : "") +
      (locator ? `:${locator}` : "") +
      "."
    : `${year}.`

  return [
    authors ? withPeriod(authors) : "",
    withPeriod(trimEnd(ref.title)),
    source,
    ref.doi ? `doi:${ref.doi}` : ""
  ]
    .filter(Boolean)
    .join(" ")
}

// ---- reference-manager formats -------------------------------------------

const STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "using",
  "this",
  "that",
  "into",
  "their",
  "among",
  "for",
  "are"
])
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "")
const escapeBib = (value: string) => value.replace(/([&%$#_])/g, "\\$1")

// Author + year + first meaningful title word keeps keys unique within a
// library ("Molbert2017Assessing"), unlike author + year alone.
function citationKey(ref: Ref): string {
  const family = fold(ref.authors[0]?.family ?? "unknown").replace(
    /[^a-zA-Z0-9]/g,
    ""
  )
  const word =
    fold(ref.title)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find((w) => w.length > 3 && !STOP_WORDS.has(w)) ?? ""
  return `${family}${ref.year ?? "nd"}${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

function toBibTeX(ref: Ref): string {
  const authors = ref.authors
    .map((p) => (p.given ? `${p.family}, ${p.given}` : `{${p.family}}`))
    .join(" and ")

  const fields: Array<[string, string | undefined]> = [
    ["author", authors || undefined],
    ["title", ref.title],
    [ref.kind === "conference" ? "booktitle" : "journal", ref.journal],
    ["volume", ref.volume],
    ["number", ref.issue],
    ["pages", ref.pages?.replace("-", "--") ?? ref.articleNumber],
    ["year", ref.year ? String(ref.year) : undefined],
    ["publisher", ref.publisher],
    ["doi", ref.doi],
    ["url", ref.url],
    ["note", ref.note]
  ]

  const body = fields
    .filter(([, value]) => !!value)
    .map(
      ([key, value]) =>
        `  ${key}={${key === "doi" || key === "url" ? value : escapeBib(value!)}}`
    )
    .join(",\n")

  const type = ref.kind === "conference" ? "inproceedings" : "article"
  return `@${type}{${citationKey(ref)},\n${body}\n}`
}

function toRIS(ref: Ref): string {
  const [firstPage, lastPage] = (ref.pages ?? "").split("-")
  const authors = ref.authors.map((p): [string, string] => [
    "AU",
    p.given ? `${p.family}, ${p.given}` : p.family
  ])

  const lines: Array<[string, string | undefined]> = [
    ["TY", ref.kind === "conference" ? "CONF" : "JOUR"],
    ...authors,
    ["TI", ref.title],
    ["T2", ref.journal],
    ["J2", ref.journalShort],
    ["PY", ref.year ? String(ref.year) : undefined],
    ["VL", ref.volume],
    ["IS", ref.issue],
    ["SP", firstPage || undefined],
    ["EP", lastPage || undefined],
    ["C7", ref.articleNumber],
    ["PB", ref.publisher],
    ["DO", ref.doi],
    ["UR", ref.url],
    ["AB", ref.abstract],
    ["N1", ref.note],
    ["ER", ""]
  ]

  return lines
    .filter(([tag, value]) => tag === "ER" || !!value)
    .map(([tag, value]) => `${tag}  - ${value}`)
    .join("\n")
}

// ---- public API -----------------------------------------------------------

export function formatCitation(
  paper: Citable,
  style: CitationStyle,
  meta?: CrossrefMeta | null
): string {
  const ref = toRef(paper, meta)
  switch (style) {
    case "apa":
      return toAPA(ref)
    case "mla":
      return toMLA(ref)
    case "chicago":
      return toChicago(ref)
    case "harvard":
      return toHarvard(ref)
    case "ieee":
      return toIEEE(ref)
    case "vancouver":
      return toNumeric(ref, 6, 6)
    case "ama":
      return toNumeric(ref, 6, 3)
    case "bibtex":
      return toBibTeX(ref)
    case "ris":
      return toRIS(ref)
  }
}

const IN_TEXT_STYLES: CitationStyle[] = ["apa", "harvard", "chicago", "mla"]

export const supportsInText = (style: CitationStyle) =>
  IN_TEXT_STYLES.includes(style)

// Author-date in-text citation, e.g. "(Mölbert et al., 2017)". Numeric styles
// (Vancouver, IEEE, AMA) have no equivalent: the number depends on the
// manuscript's own reference order.
export function inTextCitation(
  paper: Citable,
  style: CitationStyle,
  meta?: CrossrefMeta | null
): string | null {
  const ref = toRef(paper, meta)
  const families = ref.authors.map((p) => p.family)
  if (!supportsInText(style) || families.length === 0) return null

  const year = ref.year ?? "n.d."
  const join = (and: string, listUpTo: number) => {
    if (families.length === 1) return families[0]
    if (families.length === 2) return `${families[0]}${and}${families[1]}`
    if (families.length <= listUpTo) {
      return `${families.slice(0, -1).join(", ")}${and}${families[families.length - 1]}`
    }
    return `${families[0]} et al.`
  }

  switch (style) {
    case "apa":
      return `(${join(" & ", 2)}, ${year})`
    case "harvard":
      return `(${join(" and ", 3)}, ${year})`
    case "chicago":
      return `(${join(" and ", 3)} ${year})`
    default:
      return `(${join(" and ", 2)})`
  }
}
