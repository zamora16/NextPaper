import type { RecommendedPaper } from "~lib/semantic-scholar"

const REVIEW_TITLE =
  /\b(systematic review|meta-analys[ie]s|scoping review|literature review|narrative review|umbrella review|survey|revisi[oó]n sistem[aá]tica|metaan[aá]lisis)\b/i

// Semantic Scholar's publicationTypes is missing for many papers, so the
// title is used as a fallback signal.
export function isReview(paper: RecommendedPaper): boolean {
  return (
    !!paper.publicationTypes?.some((t) => t === "Review" || t === "MetaAnalysis") ||
    REVIEW_TITLE.test(paper.title)
  )
}
