import { RateLimitedError, s2Fetch } from "~lib/s2-fetch"

export interface Author {
  authorId: string
  name: string
}

export interface RecommendedPaper {
  paperId: string
  title: string
  authors: Author[]
  year: number | null
  citationCount: number
  venue: string
  url: string
  externalIds?: { DOI?: string }
  openAccessPdf?: { url: string } | null
  abstract?: string | null
  journal?: { name?: string; volume?: string; pages?: string } | null
  tldr?: { text: string } | null
  publicationTypes?: string[] | null
  influentialCitationCount?: number | null
}

export type PaperWithEmbedding = RecommendedPaper & {
  embedding: number[] | null
}

// A citing paper as returned inside the seed request (ids + what is needed to
// pick the most useful ones).
export interface Citer {
  paperId: string
  citationCount?: number
  year?: number
}

export interface Seed {
  // Ids of the papers this one cites (its bibliography).
  references: string[]
  // Up to 1000 papers citing this one, in no useful order.
  citers: Citer[]
  paperId: string
  title: string
  abstract: string | null
  year: number | null
  embedding: number[] | null
  isComputerScience: boolean
}

const BASE = "https://api.semanticscholar.org"

const FIELDS =
  "title,authors,year,citationCount,url,venue,externalIds,openAccessPdf,abstract,journal,tldr,publicationTypes,influentialCitationCount"

// SPECTER2 is the newer document-embedding model and separates topics better
// than v1, which is what the plain "embedding" field returns.
const EMBEDDING = "embedding.specter_v2"

// "recent" surfaces fresh papers on the same topic. "all-cs" is a computer-
// science-biased corpus (it returns e-health/ML papers for a psychology
// paper), so it is only asked for when the seed itself is a CS paper. Results
// are just candidates: every one is re-ranked by embedding similarity.

const TOP_CITERS = 60 // most cited citing papers kept
const RECENT_CITERS = 40 // most recent citing papers kept
const SEARCH_LIMIT = 100
const BATCH_SIZE = 500
// Batch lookups are split into parallel chunks: measured 1.6-1.8 s for 3x100
// ids versus 1.7-5.1 s for one request of 300 (a 429 on a small chunk only
// repeats that chunk).
const BATCH_CHUNK = 100

export class PaperNotFoundError extends Error {
  constructor() {
    super("Este paper no esta indexado en Semantic Scholar todavia.")
  }
}

async function getJson<T>(
  url: string,
  init?: { method?: string; body?: unknown }
): Promise<T | null> {
  try {
    const response = await s2Fetch(url, init)
    if (!response.ok) {
      console.warn("[NextPaper] request failed", response.status, url)
      return null
    }
    return (await response.json()) as T
  } catch (err) {
    if (err instanceof RateLimitedError) return null
    throw err
  }
}

// ref is a Semantic Scholar paper id such as "DOI:10.1000/xyz",
// "ARXIV:1706.03762", "PMID:123" or "PMCID:123".
//
// One request returns the paper, its embedding, its references and up to 1000
// citing papers — measured 0.5-1.5 s, replacing three sequential requests.
export async function getSeed(ref: string): Promise<Seed> {
  const response = await s2Fetch(
    `${BASE}/graph/v1/paper/${ref}?fields=title,abstract,year,fieldsOfStudy,${EMBEDDING},references.paperId,citations.paperId,citations.citationCount,citations.year`
  )

  if (response.status === 404) throw new PaperNotFoundError()
  if (response.status === 429) throw new RateLimitedError()
  if (!response.ok) throw new Error("No se pudo conectar con Semantic Scholar.")

  const data = await response.json()
  return {
    paperId: data.paperId,
    title: data.title,
    abstract: data.abstract ?? null,
    year: data.year ?? null,
    embedding: data.embedding?.vector ?? null,
    isComputerScience: !!data.fieldsOfStudy?.includes("Computer Science"),
    references: (data.references ?? [])
      .map((r: { paperId?: string }) => r.paperId)
      .filter((id: string | undefined): id is string => !!id),
    citers: (data.citations ?? []).filter((c: Citer) => !!c?.paperId)
  }
}

export type CandidateSource = "reference" | "citation" | "search" | "recommended"

// Ids of Semantic Scholar's own recommendations for a paper (any id form,
// including "DOI:..."). Null when the request failed.
export async function getRecommendedIds(
  ref: string,
  pool: "recent" | "all-cs"
): Promise<string[] | null> {
  const data = await getJson<{ recommendedPapers?: { paperId: string }[] }>(
    `${BASE}/recommendations/v1/papers/forpaper/${ref}?fields=paperId&from=${pool}&limit=50`
  )
  return data ? (data.recommendedPapers ?? []).map((p) => p.paperId) : null
}

// Gathers candidate papers from several independent sources; each is a
// different notion of "related": what the paper builds on (references), what
// builds on it (citations), lexical matches, and S2's own recommendations.
// References and citations already arrived with the seed; the remaining
// sources are independent of each other, so they run in parallel.
// `recentEarly` lets the caller start the "recent" recommendations alongside
// the seed request instead of after it.
export async function collectCandidates(
  seed: Seed,
  recentEarly?: Promise<string[] | null>
): Promise<Map<string, Set<CandidateSource>>> {
  const candidates = new Map<string, Set<CandidateSource>>()

  const add = (ids: (string | undefined)[], source: CandidateSource) => {
    for (const id of ids) {
      if (!id || id === seed.paperId) continue
      if (!candidates.has(id)) candidates.set(id, new Set())
      candidates.get(id)!.add(source)
    }
  }

  add(seed.references, "reference")

  // The citing papers come in no useful order, so keep the most cited plus
  // the most recent — otherwise a heavily cited paper would show random citers.
  const topCited = [...seed.citers]
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, TOP_CITERS)
  const mostRecent = [...seed.citers]
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, RECENT_CITERS)
  add([...topCited, ...mostRecent].map((p) => p.paperId), "citation")

  const [search, recent, allCs] = await Promise.all([
    getJson<{ data: { paperId: string }[] }>(
      `${BASE}/graph/v1/paper/search?query=${encodeURIComponent(seed.title)}&limit=30&fields=paperId`
    ),
    recentEarly ?? getRecommendedIds(seed.paperId, "recent"),
    seed.isComputerScience
      ? getRecommendedIds(seed.paperId, "all-cs")
      : Promise.resolve(null)
  ])

  add(search?.data?.map((p) => p.paperId) ?? [], "search")
  // If the early attempt (made with the user's id form) failed, retry with
  // the canonical id now that the seed is known.
  add(recent ?? (await getRecommendedIds(seed.paperId, "recent")) ?? [], "recommended")
  add(allCs ?? [], "recommended")

  return candidates
}

// One batched request for metadata + embeddings of every candidate. This is
// only possible from a browser because host_permissions exempts extension
// requests from CORS (the batch endpoint's preflight rejects POST).
export async function getPapers(
  ids: string[],
  withEmbedding = true
): Promise<PaperWithEmbedding[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    chunks.push(ids.slice(i, i + BATCH_CHUNK))
  }

  const url = `${BASE}/graph/v1/paper/batch?fields=${FIELDS}${withEmbedding ? "," + EMBEDDING : ""}`
  const batches = await Promise.all(
    chunks.map((chunk) =>
      getJson<
        (
          | (RecommendedPaper & { embedding?: { vector: number[] } | null })
          | null
        )[]
      >(url, { method: "POST", body: { ids: chunk } })
    )
  )

  const papers: PaperWithEmbedding[] = []
  for (const batch of batches) {
    for (const paper of batch ?? []) {
      if (!paper) continue
      const { embedding, ...rest } = paper
      papers.push({ ...rest, embedding: embedding?.vector ?? null })
    }
  }
  return papers
}

// Ids of fresh papers related to one paper, from Semantic Scholar's "recent"
// pool. The recommendations endpoint rejects some metadata fields (tldr), so
// only ids are requested and metadata comes from one batch call afterwards.
// Returns null when the request failed (as opposed to "nothing new").
export async function getRecentRelated(
  paperId: string
): Promise<string[] | null> {
  const data = await getJson<{ recommendedPapers: { paperId: string }[] }>(
    `${BASE}/recommendations/v1/papers/forpaper/${paperId}?fields=paperId&from=recent&limit=15`
  )
  return data ? (data.recommendedPapers ?? []).map((p) => p.paperId) : null
}

// Papers matching a free-text topic, ranked by Semantic Scholar's relevance.
// Returns null when the request failed (as opposed to "no results").
export async function searchPapers(
  query: string,
  limit = SEARCH_LIMIT
): Promise<string[] | null> {
  const data = await getJson<{ data?: { paperId: string }[] }>(
    `${BASE}/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=paperId`
  )
  return data ? (data.data ?? []).map((p) => p.paperId) : null
}

// Metadata for arbitrary ids (e.g. "DOI:10.x/y"), in the SAME order as the ids
// with null for the ones Semantic Scholar does not know — which is what
// importing needs to report what was not found. A failed request throws,
// unlike getPapers, so the caller can tell "not found" from "try again".
export async function getPapersAligned(
  ids: string[]
): Promise<(RecommendedPaper | null)[]> {
  const aligned: (RecommendedPaper | null)[] = []

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    const batch = await getJson<(RecommendedPaper | null)[]>(
      `${BASE}/graph/v1/paper/batch?fields=${FIELDS}`,
      { method: "POST", body: { ids: chunk } }
    )
    if (!batch) throw new RateLimitedError()
    chunk.forEach((_, index) => aligned.push(batch[index] ?? null))
  }

  return aligned
}
