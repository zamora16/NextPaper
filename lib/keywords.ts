// Words that say nothing about a topic, in English and Spanish: grammar, the
// vocabulary every abstract shares ("results", "methods"), and study jargon.
const STOPWORDS = new Set(
  `the a an of in on for and or to with from using via by is are as at into
   based this that these those their there than then them they its it be been
   being was were has have had not but also can could may might will would
   should such more most many much some any other others both each between
   among during after before within without over under about across through
   however therefore thus while whether which whose who whom what when where
   why how our we us you your one two three first second new novel different
   various several same well use used uses study studies analysis analyses
   review reviews paper papers article articles research result results
   effect effects approach approaches method methods methodology purpose aim
   aims objective objectives background conclusion conclusions findings finding
   present presents presented show shows showed shown found find propose
   proposed high higher low lower large small significant significantly
   associated relationship relationships towards toward et al per via
   el la los las de del en y o para con por un una sobre entre como
   estudio estudios se su sus que es son al lo le les este esta estos estas
   mas pero sin muy tambien`
    .split(/\s+/)
    .filter(Boolean)
)

// Labels come from titles only: abstracts share the vocabulary of the whole
// topic (it would blur what sets a group apart) and add filler words.
//
// A term must be in at least this share of the group's titles (and in at
// least MIN_PAPERS of them), and be at least this much more frequent there
// than in the other groups. Anything less would put words on a group that
// most of its papers do not use.
const MIN_COVERAGE = 0.5
const MIN_PAPERS = 2
const MIN_LIFT = 0.3
const PHRASE_BONUS = 0.15
// A second term must be nearly as characteristic as the first, and a longer
// phrase replaces the words it contains when it is not much less characteristic
// ("graph neural networks" instead of "graph neural" and "networks").
const SECOND_TERM_SHARE = 0.6
const PHRASE_SLACK = 0.25
const MAX_WORDS = 3

// Plural folding only ("scales" and "scale" are one term). The words shown
// are always real words taken from the papers, never their stems.
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y"
  if (word.length > 5 && word.endsWith("sses")) return word.slice(0, -2)
  if (word.length > 4 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) {
    return word.slice(0, -1)
  }
  return word
}

// Acronyms and names keep their capitals (CRISPR, AlphaFold); any other word
// is shown in lowercase, whatever the title's style.
function display(word: string): string {
  const capitals = word.match(/\p{Lu}/gu)?.length ?? 0
  const shortName =
    capitals === word.replace(/-/g, "").length && word.length <= 7
  return capitals >= 2 && (shortName || capitals < word.length)
    ? word
    : word.toLowerCase()
}

interface Term {
  key: string // stemmed words joined by a space
  surface: string // as it will be shown
}

// Words and phrases (up to MAX_WORDS) of one title. Words are only joined
// inside a clause, never across punctuation, and never through a stopword.
function termsOf(title: string): Term[] {
  const terms: Term[] = []
  for (const clause of title.split(/[.;:!?()[\],\n]+/)) {
    const words = clause.split(/[^\p{L}-]+/u).filter(Boolean)
    const usable = words.map((word) => {
      const lower = word.toLowerCase()
      return (
        lower.length >= 4 &&
        !STOPWORDS.has(lower) &&
        !/^-|-$/.test(lower) &&
        /^[\p{L}-]+$/u.test(lower)
      )
    })
    for (let start = 0; start < words.length; start++) {
      for (let size = 1; size <= MAX_WORDS; size++) {
        const part = words.slice(start, start + size)
        if (
          part.length < size ||
          !usable.slice(start, start + size).every(Boolean)
        ) {
          break
        }
        terms.push({
          key: part.map((word) => stem(word.toLowerCase())).join(" "),
          surface: part.map(display).join(" ")
        })
      }
    }
  }
  return terms
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

const wordsOf = (key: string) => key.split(" ")

// Does `phrase` contain `part` as whole, consecutive words?
const contains = (phrase: string, part: string) =>
  ` ${phrase} `.includes(` ${part} `)

// A name for each group made of the terms that set it apart from the others,
// or null when no term is honest enough (the interface then says "Group N").
// Every term shown is in at least half of the group's titles.
export function labelClusters(
  clusters: string[][],
  maxTerms = 2
): (string | null)[] {
  // Which titles of which group use each term, and how it is written.
  const docTerms = clusters.map((titles) => titles.map(termsOf))
  const surfaces = new Map<string, Map<string, number>>()
  const docFrequency = clusters.map(() => new Map<string, number>())

  docTerms.forEach((docs, c) =>
    docs.forEach((terms) => {
      for (const key of new Set(terms.map((t) => t.key))) {
        docFrequency[c].set(key, (docFrequency[c].get(key) ?? 0) + 1)
      }
      for (const { key, surface } of terms) {
        const counts = surfaces.get(key) ?? new Map<string, number>()
        counts.set(surface, (counts.get(surface) ?? 0) + 1)
        surfaces.set(key, counts)
      }
    })
  )

  const shown = (key: string) => {
    const counts = [...(surfaces.get(key) ?? [])].sort((a, b) => b[1] - a[1])
    return counts[0]?.[0] ?? key
  }

  const total = clusters.reduce((sum, docs) => sum + docs.length, 0)
  const labels: (string | null)[] = clusters.map(() => null)
  const taken = new Set<string>()

  // Larger groups choose first, so a shared word goes to the group it fits best.
  const order = clusters
    .map((_, c) => c)
    .sort((a, b) => clusters[b].length - clusters[a].length)

  for (const c of order) {
    const size = clusters[c].length
    const outside = total - size
    const candidates: { key: string; score: number; papers: number }[] = []

    for (const [key, inside] of docFrequency[c]) {
      if (inside < MIN_PAPERS || taken.has(key)) continue
      const coverage = inside / size
      const elsewhere = docFrequency.reduce(
        (sum, counts, other) =>
          other === c ? sum : sum + (counts.get(key) ?? 0),
        0
      )
      const lift = coverage - (outside ? elsewhere / outside : 0)
      if (coverage < MIN_COVERAGE || lift < MIN_LIFT) continue
      candidates.push({
        key,
        score: lift + (key.includes(" ") ? PHRASE_BONUS : 0),
        papers: inside
      })
    }

    candidates.sort(
      (a, b) =>
        b.score - a.score || b.papers - a.papers || (a.key < b.key ? -1 : 1)
    )

    const chosen: string[] = []
    for (const candidate of candidates) {
      // The longest phrase that contains this term and is nearly as good.
      const phrase = candidates
        .filter(
          (other) =>
            other.key !== candidate.key &&
            contains(other.key, candidate.key) &&
            other.score >= candidate.score - PHRASE_SLACK
        )
        .sort((a, b) => wordsOf(b.key).length - wordsOf(a.key).length)[0]
      const key = phrase?.key ?? candidate.key

      // A later term must bring new words ("body image", then not "image")
      // and be nearly as characteristic as the first.
      const seen = new Set(chosen.flatMap(wordsOf))
      if (chosen.includes(key)) continue
      if (chosen.length && wordsOf(key).some((word) => seen.has(word))) continue
      if (
        chosen.length &&
        candidate.score < candidates[0].score * SECOND_TERM_SHARE
      ) {
        continue
      }
      chosen.push(key)
      if (chosen.length === maxTerms) break
    }

    if (chosen.length === 0) continue
    // A term goes to one group only, so two groups never read the same.
    labels[c] = capitalize(chosen.map(shown).join(" · "))
    chosen.forEach((key) => taken.add(key))
  }

  return labels
}
