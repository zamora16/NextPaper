import { getCachedResult, setCachedResult } from "~lib/cache"
import { RateLimitedError } from "~lib/errors"
import type { Step } from "~lib/job"
import { labelClusters } from "~lib/keywords"
import { clusterAuto } from "~lib/kmeans"
import { isReview } from "~lib/paper-utils"
import {
  collectCandidates,
  getPapers,
  getRecommendedIds,
  getSeed,
  searchPapers,
  type CandidateSource,
  type PaperWithEmbedding,
  type RecommendedPaper
} from "~lib/semantic-scholar"
import { cosineSimilarity, meanVector } from "~lib/vector-math"

export type Relation = "reference" | "citation" | null

export interface ScoredPaper extends RecommendedPaper {
  similarity: number | null
  // True when the seed paper has no embedding and similarity was measured
  // against the centroid of its likely-relevant neighbors instead.
  approximate: boolean
  relation: Relation
}

// Groups made of real subtopics carry their words as the label. These two are
// stand-ins the interface shows in the user's language (a stored translated
// label would stay in the language that was active when it was cached).
export const RELATED_GROUP = "@related"
export const ALL_GROUP = "@all"

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

type Embedded = PaperWithEmbedding & { embedding: number[] }
interface Entry {
  paper: Embedded
  sources: Set<CandidateSource>
  score: number
}

// The first three authors and how many more there are.
export function byline(names: string[]): string {
  const shown = names.slice(0, 3).join(", ")
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown
}

const TOP_N = 18
const SHORTLIST = 40
const QUERY_TOP_N = 24
const CITATION_WEIGHT = 0.02
const RECENT_YEARS = 2

function relationOf(sources: Set<CandidateSource> | undefined): Relation {
  if (sources?.has("citation")) return "citation"
  if (sources?.has("reference")) return "reference"
  return null
}

// When the seed paper has no embedding (e.g. no abstract indexed), use the
// centroid of the candidates most likely to be on-topic instead: those found
// by several independent sources, or in its citation neighborhood.
function fallbackReference(entries: Omit<Entry, "score">[]): number[] {
  const strong = entries.filter((e) => e.sources.size >= 2)
  const neighborhood = entries.filter(
    (e) => e.sources.has("reference") || e.sources.has("citation")
  )
  const pool =
    strong.length >= 3 ? strong : neighborhood.length ? neighborhood : entries
  return meanVector(pool.map((e) => e.paper.embedding))
}

const blended = (e: Entry) =>
  e.score + CITATION_WEIGHT * Math.log10(1 + e.paper.citationCount)

// "Where do I start?": the classic to read first, the most relevant review,
// and the latest work — each a different way into an unfamiliar literature.
export function choosePicks(
  shortlist: Entry[],
  toScored: (e: Entry) => ScoredPaper
): Pick[] {
  const byRelevance = [...shortlist].sort((a, b) => blended(b) - blended(a))
  const recentFrom = new Date().getFullYear() - RECENT_YEARS
  const used = new Set<string>()
  const picks: Pick[] = []

  const choose = (kind: PickKind, candidates: Entry[]) => {
    const found = candidates.find((e) => !used.has(e.paper.paperId))
    if (!found) return
    used.add(found.paper.paperId)
    picks.push({ kind, paper: toScored(found) })
  }

  const byCitations = (a: Entry, b: Entry) =>
    b.paper.citationCount - a.paper.citationCount

  const older = shortlist.filter((e) => (e.paper.year ?? 0) < recentFrom)
  const priorWork = older.filter((e) => e.sources.has("reference"))
  choose(
    "foundational",
    [...(priorWork.length ? priorWork : older)].sort(byCitations)
  )
  choose(
    "review",
    byRelevance.filter((e) => isReview(e.paper))
  )
  choose(
    "recent",
    byRelevance.filter((e) => (e.paper.year ?? 0) >= recentFrom)
  )

  return picks
}

export const QUERY_PREFIX = "QUERY:"

export const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

// Preprint and published versions of one paper often come back as two
// entries. Keep the most cited one and merge how it was found.
export function dedupe(
  papers: PaperWithEmbedding[],
  sources: Map<string, Set<CandidateSource>>
): PaperWithEmbedding[] {
  const best = new Map<string, PaperWithEmbedding>()

  for (const paper of papers) {
    const key = normalizeTitle(paper.title)
    const current = best.get(key)
    if (!current) {
      best.set(key, paper)
      continue
    }
    const [keep, drop] =
      paper.citationCount > current.citationCount
        ? [paper, current]
        : [current, paper]
    const merged = sources.get(keep.paperId) ?? new Set<CandidateSource>()
    sources.get(drop.paperId)?.forEach((s) => merged.add(s))
    sources.set(keep.paperId, merged)
    best.set(key, keep)
  }

  return [...best.values()]
}

// Vectors are dropped so they never reach storage.
export function makeStrip(
  sources: Map<string, Set<CandidateSource>>,
  approximate: boolean
) {
  return (
    paper: PaperWithEmbedding,
    similarity: number | null
  ): ScoredPaper => {
    const { embedding: _embedding, ...rest } = paper
    return {
      ...rest,
      similarity,
      approximate,
      relation: relationOf(sources.get(paper.paperId))
    }
  }
}

function flatFallback(
  papers: PaperWithEmbedding[],
  strip: ReturnType<typeof makeStrip>,
  topN: number
): AnalysisResult {
  return {
    picks: [],
    groups: [
      {
        label: RELATED_GROUP,
        papers: [...papers]
          .sort((a, b) => b.citationCount - a.citationCount)
          .slice(0, topN)
          .map((p) => strip(p, null))
      }
    ]
  }
}

// Turns scored candidates (best first) into clustered groups plus the
// "where to start" picks. Topical score decides the shortlist; among
// near-equal candidates (SPECTER cosines of on-topic papers differ by only a
// few points) a small log-citations bonus favors established work.
export function assemble(
  ranked: Entry[],
  strip: ReturnType<typeof makeStrip>,
  options: {
    topN: number
    maxClusters: number
    showScore: boolean
  }
): AnalysisResult {
  const shortlist = ranked.slice(0, SHORTLIST)
  const toScored = (e: Entry) =>
    strip(e.paper, options.showScore ? e.score : null)
  const top = [...shortlist]
    .sort((a, b) => blended(b) - blended(a))
    .slice(0, options.topN)

  if (top.length < 4) {
    return {
      groups: [{ label: RELATED_GROUP, papers: top.map(toScored) }],
      picks: choosePicks(shortlist, toScored)
    }
  }

  const assignments = clusterAuto(
    top.map((e) => e.paper.embedding),
    2,
    options.maxClusters
  )
  const clusterCount = Math.max(...assignments) + 1

  const clusters = Array.from({ length: clusterCount }, (_, id) =>
    top.filter((_, i) => assignments[i] === id)
  ).filter((members) => members.length > 0)

  const labels = labelClusters(
    clusters.map((members) => members.map((m) => m.paper.title))
  )

  const groups = clusters
    .map((members, i) => ({
      label: labels[i],
      avgScore: members.reduce((s, m) => s + m.score, 0) / members.length,
      papers: members.map(toScored)
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .map(({ label, papers }) => ({ label, papers }))

  return { groups, picks: choosePicks(shortlist, toScored) }
}

// Candidates come from the paper's references, citations, title search and
// Semantic Scholar's own recommendations; every candidate's SPECTER2 embedding
// is fetched in one batch, ranked by cosine similarity to the seed and
// clustered with k-means.
async function analyzePaper(
  ref: string,
  onStep: (step: Step) => void
): Promise<AnalysisResult> {
  const cached = await getCachedResult(ref)
  if (cached) return cached

  onStep({ code: "reading" })
  // The recommendations accept the same id as the seed request, so they start
  // together with it. They never reject (failures resolve to null).
  const recentEarly = getRecommendedIds(ref, "recent").catch(() => null)
  const seed = await getSeed(ref)

  onStep({ code: "gathering" })
  const sources = await collectCandidates(seed, recentEarly)
  if (sources.size === 0) throw new RateLimitedError()

  onStep({ code: "scoring", n: sources.size })
  const fetched = await getPapers([...sources.keys()])
  if (fetched.length === 0) throw new RateLimitedError()

  // Another version of the seed itself (preprint/published) is not a result.
  const seedTitle = normalizeTitle(seed.title)
  const papers = dedupe(fetched, sources).filter(
    (p) => normalizeTitle(p.title) !== seedTitle
  )

  const strip = makeStrip(sources, seed.embedding === null)
  const embedded = papers
    .filter((p): p is Embedded => !!p.embedding)
    .map((paper) => ({
      paper,
      sources: sources.get(paper.paperId) ?? new Set<CandidateSource>()
    }))

  let result: AnalysisResult

  if (embedded.length < 2) {
    result = flatFallback(papers, strip, TOP_N)
  } else {
    const reference = seed.embedding ?? fallbackReference(embedded)
    const ranked: Entry[] = embedded
      .map((e) => ({
        ...e,
        score: cosineSimilarity(reference, e.paper.embedding)
      }))
      .sort((a, b) => b.score - a.score)

    result = assemble(ranked, strip, {
      topN: TOP_N,
      maxClusters: 4,
      showScore: true
    })
  }
  result.seedYear = seed.year
  result.seedTitle = seed.title
  if (seed.authors?.length) result.seedByline = byline(seed.authors)

  await setCachedResult(ref, result)
  return result
}

// Topic search: results come ranked by Semantic Scholar's relevance, then get
// the same embedding-based grouping so a topic reads as a map of subtopics.
async function analyzeQuery(
  ref: string,
  onStep: (step: Step) => void
): Promise<AnalysisResult> {
  const cached = await getCachedResult(ref)
  if (cached) return cached

  const query = ref.slice(QUERY_PREFIX.length)

  onStep({ code: "searching" })
  const ids = await searchPapers(query)
  if (!ids) throw new RateLimitedError()
  if (ids.length === 0) {
    // Cached too: the popup reads every finished result from the cache.
    const empty: AnalysisResult = { groups: [], picks: [] }
    await setCachedResult(ref, empty)
    return empty
  }

  onStep({ code: "analyzing", n: ids.length })
  const fetched = await getPapers(ids)
  if (fetched.length === 0) throw new RateLimitedError()

  const sources = new Map<string, Set<CandidateSource>>(
    ids.map((id) => [id, new Set<CandidateSource>(["search"])])
  )
  const papers = dedupe(fetched, sources)
  const strip = makeStrip(sources, false)

  const rank = new Map(ids.map((id, i) => [id, i]))
  const embedded: Entry[] = papers
    .filter((p): p is Embedded => !!p.embedding)
    .sort((a, b) => (rank.get(a.paperId) ?? 0) - (rank.get(b.paperId) ?? 0))
    .map((paper, i, all) => ({
      paper,
      sources: sources.get(paper.paperId) ?? new Set<CandidateSource>(),
      // Relevance order mapped to (0.9, 1] so the citations bonus in
      // `blended` stays a tie-breaker, as it is for similarity scores.
      score: 1 - (0.1 * i) / Math.max(1, all.length - 1)
    }))

  const result =
    embedded.length < 2
      ? flatFallback(papers, strip, QUERY_TOP_N)
      : assemble(embedded, strip, {
          topN: QUERY_TOP_N,
          maxClusters: 5,
          showScore: false
        })

  await setCachedResult(ref, result)
  return result
}

export function analyze(
  ref: string,
  onStep: (step: Step) => void = () => {}
): Promise<AnalysisResult> {
  return ref.startsWith(QUERY_PREFIX)
    ? analyzeQuery(ref, onStep)
    : analyzePaper(ref, onStep)
}
