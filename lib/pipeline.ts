import { getCachedResult, setCachedResult } from "~lib/cache"
import { clusterAuto } from "~lib/clustering"
import { RateLimitedError } from "~lib/errors"
import type { Step } from "~lib/job"
import { labelClusters } from "~lib/keywords"
import {
  OTHER_GROUP,
  RELATED_GROUP,
  type AnalysisResult,
  type Pick,
  type PickKind,
  type Relation,
  type ScoredPaper
} from "~lib/model"
import { isReview } from "~lib/paper-utils"
import {
  collectCandidates,
  getPapers,
  getRecommendedIds,
  getSeed,
  searchPapers,
  type CandidateSource,
  type PaperWithEmbedding
} from "~lib/semantic-scholar"
import { cosineSimilarity, meanVector } from "~lib/vector-math"

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

// Turns scored candidates (best first) into groups plus the "where to start"
// picks. Topical score decides the shortlist; among near-equal candidates
// (SPECTER cosines of on-topic papers differ by only a few points) a small
// log-citations bonus favors established work.
//
// Groups come from clustering the shown papers, and only the ones an honest
// name was found for are kept (`labelClusters`); the rest go together into
// "other". When no group can be named there are no groups at all: among the
// papers closest to one paper there is often no real subtopic structure, and a
// forced partition would only look like knowledge (docs/EVALUATION.md).
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
  const picks = choosePicks(shortlist, toScored)
  const together = {
    groups: [{ label: RELATED_GROUP, papers: top.map(toScored) }],
    picks
  }

  if (top.length < 4) return together

  const assignments = clusterAuto(
    top.map((e) => e.paper.embedding),
    2,
    options.maxClusters
  )
  const clusterCount = Math.max(...assignments) + 1
  const clusters = Array.from({ length: clusterCount }, (_, id) =>
    top.filter((_, i) => assignments[i] === id)
  ).filter((members) => members.length > 0)
  if (clusters.length < 2) return together

  const labels = labelClusters(
    clusters.map((members) => members.map((m) => m.paper.title))
  )
  const named = clusters
    .map((members, i) => ({
      label: labels[i],
      members,
      avgScore: members.reduce((s, m) => s + m.score, 0) / members.length
    }))
    .filter((group) => group.label !== null)
    .sort((a, b) => b.avgScore - a.avgScore)
  if (named.length === 0) return together

  const namedIds = new Set(
    named.flatMap((g) => g.members.map((m) => m.paper.paperId))
  )
  const others = top.filter((e) => !namedIds.has(e.paper.paperId))

  const groups = named.map((g) => ({
    label: g.label as string,
    papers: g.members.map(toScored)
  }))
  if (others.length > 0) {
    groups.push({ label: OTHER_GROUP, papers: others.map(toScored) })
  }
  return { groups, picks }
}

// Candidates come from the paper's references, citations, title search and
// Semantic Scholar's own recommendations; every candidate's SPECTER2 embedding
// is fetched in one batch, ranked by cosine similarity to the seed and
// grouped by subtopic where the groups can be named.
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
// the same embedding-based grouping (where it can be named).
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
