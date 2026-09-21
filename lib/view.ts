import { isReview } from "~lib/paper-utils"
import { ALL_GROUP, type PaperGroup, type ScoredPaper } from "~lib/pipeline"
import { DESIGNS, studyOf, type DesignId } from "~lib/study"

export type Filter = "all" | "reference" | "citation" | "open" | "review"
export type Sort = "relevance" | "citations" | "year"

export const FILTERS: Filter[] = [
  "all",
  "reference",
  "citation",
  "review",
  "open"
]
export const SORTS: Sort[] = ["relevance", "citations", "year"]

function matches(paper: ScoredPaper, filter: Filter): boolean {
  switch (filter) {
    case "reference":
      return paper.relation === "reference"
    case "citation":
      return paper.relation === "citation"
    case "review":
      return isReview(paper)
    case "open":
      return !!paper.openAccessPdf?.url
    default:
      return true
  }
}

export type DesignFilter = DesignId | "all"

// Bounds on year and citations. A paper with no year is left out while a year
// bound is set: we cannot say it falls inside.
export interface Range {
  yearFrom: number | null
  yearTo: number | null
  minCitations: number
}

export const NO_RANGE: Range = { yearFrom: null, yearTo: null, minCitations: 0 }

export const isRangeActive = (range: Range) =>
  range.yearFrom !== null || range.yearTo !== null || range.minCitations > 0

// "The last N years", counting the current one.
export const lastYears = (years: number, now = new Date().getFullYear()) => ({
  yearFrom: now - years + 1,
  yearTo: null
})

function inRange(paper: ScoredPaper, range: Range): boolean {
  if (range.yearFrom !== null || range.yearTo !== null) {
    if (paper.year === null || paper.year === undefined) return false
    if (range.yearFrom !== null && paper.year < range.yearFrom) return false
    if (range.yearTo !== null && paper.year > range.yearTo) return false
  }
  return (paper.citationCount ?? 0) >= range.minCitations
}

// Designs present in the results with their paper counts, most common first
// (ties keep the priority order of DESIGNS). Papers with no detected design
// are left out: the filter only offers what it can deliver.
export function designOptions(
  groups: PaperGroup[]
): { id: DesignId; count: number }[] {
  const counts = new Map<DesignId, number>()
  for (const paper of new Set(groups.flatMap((g) => g.papers))) {
    const { design } = studyOf(paper)
    if (design) counts.set(design, (counts.get(design) ?? 0) + 1)
  }
  return DESIGNS.filter((d) => counts.has(d.id))
    .map((d) => ({ id: d.id, count: counts.get(d.id)! }))
    .sort((a, b) => b.count - a.count)
}

// Relevance keeps the semantic groups; any other ordering is a single flat
// list, since groups and a global sort can't both hold.
export function applyView(
  groups: PaperGroup[],
  filter: Filter,
  sort: Sort,
  design: DesignFilter = "all",
  range: Range = NO_RANGE
): PaperGroup[] {
  const filtered = groups
    .map((g) => ({
      ...g,
      papers: g.papers.filter(
        (p) =>
          matches(p, filter) &&
          inRange(p, range) &&
          (design === "all" || studyOf(p).design === design)
      )
    }))
    .filter((g) => g.papers.length > 0)

  if (sort === "relevance") return filtered

  const flat = filtered.flatMap((g) => g.papers)
  flat.sort((a, b) =>
    sort === "citations"
      ? b.citationCount - a.citationCount
      : (b.year ?? 0) - (a.year ?? 0)
  )
  return flat.length ? [{ label: ALL_GROUP, papers: flat }] : []
}

// Text search inside the library: every word typed must appear somewhere in
// the title, authors, venue, year, note or collection names (accents and case
// ignored), so "tylka 2015" narrows down instead of matching nothing.
const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

export function searchLibrary<
  T extends {
    title: string
    authors: { name: string }[]
    venue?: string | null
    year?: number | null
    note?: string
    collections?: string[]
  }
>(items: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  return items.filter((item) => {
    const haystack = fold(
      [
        item.title,
        item.authors.map((a) => a.name).join(" "),
        item.venue ?? "",
        item.year ?? "",
        item.note ?? "",
        (item.collections ?? []).join(" ")
      ].join(" ")
    )
    return words.every((word) => haystack.includes(word))
  })
}
