import type { ScoredPaper } from "~lib/pipeline"
import type { RecommendedPaper } from "~lib/semantic-scholar"
import { studyOf, type DesignId } from "~lib/study"

// "survey" is left out on purpose: in the social sciences it is a
// questionnaire ("a cross-sectional survey"), not a literature review.
const REVIEW_TITLE =
  /\b(systematic review|meta-analys[ie]s|scoping review|literature review|narrative review|umbrella review|revisi[oó]n sistem[aá]tica|metaan[aá]lisis)\b/i

const REVIEW_DESIGNS: DesignId[] = ["meta", "systematic", "review"]

// Semantic Scholar's own "Review" type is NOT used: it tags many primary
// studies (109 of 430 papers whose text declares a randomized trial, cohort,
// survey... in a check on ~1,250 real papers), which put RCTs under
// "Revisión". A paper is a review when its title or abstract says so;
// the "MetaAnalysis" type is consistent with the text and is kept (through
// studyOf, which only falls back to it when the text is silent).
export function isReview(paper: RecommendedPaper): boolean {
  return (
    REVIEW_TITLE.test(paper.title) ||
    REVIEW_DESIGNS.includes(studyOf(paper).design as DesignId)
  )
}

type Loose = RecommendedPaper & Partial<ScoredPaper> & { embedding?: unknown }

// A paper with no trace of the analysis it came from. Similarity, relation and
// shared terms only make sense next to the paper that was open; in the
// library, alerts or a backup they would describe a relationship to a paper
// that is no longer there. Embeddings are dropped too (rule 6).
export function plainPaper(paper: Loose): ScoredPaper {
  const { embedding, similarity, approximate, relation, sharedTerms, ...rest } =
    paper
  return { ...rest, similarity: null, approximate: false, relation: null }
}
