import { STOPWORDS } from "~lib/keywords"

// Abstract boilerplate that says nothing about a paper's topic.
const GENERIC = new Set([
  "results", "result", "conclusion", "conclusions", "method", "methods",
  "background", "objective", "objectives", "purpose", "aims", "participants",
  "sample", "samples", "data", "found", "showed", "shown", "also", "were",
  "have", "been", "which", "these", "those", "that", "between", "within",
  "across", "however", "could", "would", "should", "than", "then", "there",
  "when", "where", "while", "both", "each", "other", "such", "more", "most",
  "large", "small", "high", "higher", "lower", "used", "using", "use",
  "paper", "article", "research", "approach", "novel", "new", "propose",
  "proposed", "present", "presented", "show", "investigate", "examine",
  "examined", "significant", "significantly", "evidence", "findings", "finding",
  // function words and academic filler that survive the length filter
  "what", "whom", "whose", "about", "after", "again", "against", "because",
  "before", "being", "below", "cannot", "does", "doing", "during", "further",
  "having", "just", "only", "over", "same", "some", "through", "under",
  "until", "very", "will", "they", "them", "your", "among", "whether", "although",
  "individual", "individuals", "population", "populations", "better", "healthier",
  "supported", "support", "important", "various", "several", "including",
  "related", "associated", "association", "effect", "effects", "role", "studies",
  "well", "many", "much", "might", "likely", "potential", "future", "current",
  "recent", "existing", "provide", "provides", "provided", "suggest",
  "suggests", "suggested", "indicate", "indicates", "indicated", "demonstrate",
  "demonstrated", "understand", "understanding", "factor", "factors", "level",
  "levels", "increase", "increased", "decrease", "analysis", "analyses",
  "total", "different", "similar", "specific", "general", "overall", "main"
])

const MIN_DOCS_FOR_GENERIC_FILTER = 8

const singular = (word: string) =>
  word.length > 4 && word.endsWith("s") && !word.endsWith("ss")
    ? word.slice(0, -1)
    : word

function tokenList(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w) && !GENERIC.has(w))
    .map(singular)
}

const tokens = (text: string) => new Set(tokenList(text))

// Terms the reference itself emphasizes: those in its title, plus any it
// repeats. A word mentioned once in passing ("promote", "capable") says
// nothing about what the paper is about.
function emphasizedTerms(reference: string, title: string): Set<string> {
  const counts = new Map<string, number>()
  for (const term of tokenList(reference)) {
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }
  const emphasized = new Set(tokens(title))
  for (const [term, count] of counts) if (count >= 2) emphasized.add(term)
  return emphasized
}

// For each document, the few distinctive terms it shares with the reference
// text (the open paper, or the user's search). "Distinctive" = weighted by
// inverse document frequency across the whole result set, and terms present
// in more than 60% of the documents are dropped as generic for this topic.
// When `referenceTitle` is given, only terms the reference emphasizes (its
// title words and any it repeats) can be reported; otherwise every term of the
// reference is eligible.
export function sharedTerms(
  reference: string,
  docs: { id: string; text: string }[],
  maxTerms = 3,
  referenceTitle?: string
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const referenceTerms =
    referenceTitle === undefined
      ? tokens(reference)
      : emphasizedTerms(reference, referenceTitle)
  if (referenceTerms.size === 0) return result

  const docTerms = docs.map((d) => tokens(d.text))
  const total = docs.length + 1
  // "Present in most documents" is only meaningful with enough documents;
  // in a set of 2-3 every shared term would look generic.
  const dropGeneric = docs.length >= MIN_DOCS_FOR_GENERIC_FILTER
  const df = new Map<string, number>()
  for (const term of referenceTerms) df.set(term, 1)
  for (const terms of docTerms) {
    for (const term of terms) df.set(term, (df.get(term) ?? 0) + 1)
  }

  docs.forEach((doc, i) => {
    const shared = [...docTerms[i]]
      .filter(
        (t) =>
          referenceTerms.has(t) &&
          (!dropGeneric || (df.get(t) ?? 0) / total <= 0.6)
      )
      .map((t) => ({ t, score: Math.log((total + 1) / ((df.get(t) ?? 0) + 1)) }))
      .sort((a, b) => b.score - a.score || b.t.length - a.t.length)
      .slice(0, maxTerms)
      .map((x) => x.t)
    if (shared.length > 0) result.set(doc.id, shared)
  })

  return result
}
