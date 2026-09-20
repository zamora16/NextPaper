export const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "for", "and", "or", "to", "with",
  "from", "using", "via", "by", "is", "are", "as", "at", "into", "based",
  "study", "analysis", "review", "towards", "toward", "this", "their",
  "el", "la", "los", "las", "de", "del", "en", "y", "o", "para", "con",
  "por", "un", "una", "sobre", "entre", "como", "estudio"
])

function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOPWORDS.has(word))
  )
}

function documentFrequencies(titles: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const title of titles) {
    for (const word of tokenize(title)) {
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return counts
}

// Labels each cluster with its most *distinctive* terms: the lift of a
// word's share inside the cluster over its share across all clusters.
// Plain frequency would label every cluster with the words the whole
// result set shares (e.g. "language / model" for a set of NLP papers).
export function labelClusters(clusters: string[][], maxWords = 2): string[] {
  const allTitles = clusters.flat()
  const overall = documentFrequencies(allTitles)
  const total = allTitles.length

  return clusters.map((titles) => {
    const local = documentFrequencies(titles)

    const ranked = [...local.entries()]
      .map(([word, count]) => ({
        word,
        score: count / titles.length - (overall.get(word) ?? 0) / total,
        count
      }))
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .slice(0, maxWords)
      .map(({ word }) => word[0].toUpperCase() + word.slice(1))

    return ranked.length > 0 ? ranked.join(" / ") : "Grupo"
  })
}
