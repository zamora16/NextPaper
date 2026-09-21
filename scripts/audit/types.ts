import type { CandidateSource } from "~lib/semantic-scholar"

// One candidate of one seed, with what an offline evaluation needs.
export interface PoolItem {
  id: string
  title: string
  year: number | null
  citations: number
  // cosine to the seed's SPECTER2 vector; null when the paper has none
  cos: number | null
  sources: CandidateSource[]
  // 1 = the most cited of the papers citing the seed (only the top 120 have one)
  citedRank?: number
  // 1 = the most recent citing paper (only the top 80 have one)
  recentRank?: number
  // position in Semantic Scholar's own recommendations for the seed
  recRank?: number
  isRef: boolean
  // references shared with the seed; null when its reference list is unknown
  coupling: number | null
}

export interface Pool {
  ref: string
  field: string
  title: string
  year: number
  seedReferences: number
  isComputerScience: boolean
  items: PoolItem[]
  // the 40 closest candidates' vectors (Float32, base64), for later analyses
  top40: { id: string; vec: string }[]
}
