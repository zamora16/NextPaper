// The data the extension passes around: what an analysis returns and what the
// library keeps. Types and sentinels only, so any module can import them
// without pulling in the pipeline or the storage code.
import type { RecommendedPaper } from "~lib/semantic-scholar"

export type Relation = "reference" | "citation" | null

export interface ScoredPaper extends RecommendedPaper {
  similarity: number | null
  // True when the seed paper has no embedding and similarity was measured
  // against the centroid of its likely-relevant neighbors instead.
  approximate: boolean
  relation: Relation
}

// Groups made of real subtopics carry their words as the label. These are
// stand-ins the interface shows in the user's language (a stored translated
// label would stay in the language that was active when it was cached):
// everything together, everything re-sorted into one list, and the papers that
// belong to no group with an honest name.
export const RELATED_GROUP = "@related"
export const ALL_GROUP = "@all"
export const OTHER_GROUP = "@other"

export interface PaperGroup {
  label: string
  papers: ScoredPaper[]
}

export type PickKind = "foundational" | "review" | "recent"

export interface Pick {
  kind: PickKind
  paper: ScoredPaper
}

export interface AnalysisResult {
  groups: PaperGroup[]
  picks: Pick[]
  // Publication year of the open paper, for the timeline marker.
  seedYear?: number | null
  // Which paper the results are about (shown at the top of the list).
  seedTitle?: string
  // "A, B, C +2": the first three authors and how many more there are.
  seedByline?: string
}

export type ReadStatus = "unread" | "reading" | "read"

export const STATUSES: ReadStatus[] = ["unread", "reading", "read"]

export type SavedPaper = ScoredPaper & {
  savedAt: number
  status: ReadStatus
  note: string
  // User-defined groups ("Tesis cap. 2", "Para revisar"...). A paper can be
  // in several. Items saved by older versions have none.
  collections: string[]
}
