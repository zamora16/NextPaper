import { ALL_GROUP, type PaperGroup, type ScoredPaper } from "~lib/model"
import { isReview } from "~lib/paper-utils"

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

// Relevance keeps the semantic groups; any other ordering is a single flat
// list, since groups and a global sort can't both hold.
export function applyView(
  groups: PaperGroup[],
  filter: Filter,
  sort: Sort
): PaperGroup[] {
  const filtered = groups
    .map((g) => ({ ...g, papers: g.papers.filter((p) => matches(p, filter)) }))
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
