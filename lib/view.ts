import { isReview } from "~lib/paper-utils"
import type { PaperGroup, ScoredPaper } from "~lib/pipeline"
import { DESIGNS, studyOf, type DesignId } from "~lib/study"

export type Filter = "all" | "reference" | "citation" | "open" | "review"
export type Sort = "relevance" | "citations" | "year"

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "reference", label: "Referencias" },
  { id: "citation", label: "Lo citan" },
  { id: "review", label: "Revisiones" },
  { id: "open", label: "PDF libre" }
]

export const SORTS: { id: Sort; label: string }[] = [
  { id: "relevance", label: "Relevancia" },
  { id: "citations", label: "Más citados" },
  { id: "year", label: "Más recientes" }
]

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

// Designs present in the results with their paper counts, most common first
// (ties keep the priority order of DESIGNS). Papers with no detected design
// are left out: the filter only offers what it can deliver.
export function designOptions(
  groups: PaperGroup[]
): { id: DesignId; label: string; count: number }[] {
  const counts = new Map<DesignId, number>()
  for (const paper of new Set(groups.flatMap((g) => g.papers))) {
    const { design } = studyOf(paper)
    if (design) counts.set(design, (counts.get(design) ?? 0) + 1)
  }
  return DESIGNS.filter((d) => counts.has(d.id))
    .map((d) => ({ id: d.id, label: d.label, count: counts.get(d.id)! }))
    .sort((a, b) => b.count - a.count)
}

// Relevance keeps the semantic groups; any other ordering is a single flat
// list, since groups and a global sort can't both hold.
export function applyView(
  groups: PaperGroup[],
  filter: Filter,
  sort: Sort,
  design: DesignFilter = "all"
): PaperGroup[] {
  const filtered = groups
    .map((g) => ({
      ...g,
      papers: g.papers.filter(
        (p) =>
          matches(p, filter) &&
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
  return flat.length ? [{ label: "Todos", papers: flat }] : []
}
