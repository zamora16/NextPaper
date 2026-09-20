import {
  getPapersAligned,
  searchPapers,
  type RecommendedPaper
} from "~lib/semantic-scholar"

// Reads references exported from other tools (BibTeX, RIS) or a plain list of
// DOIs / titles, and resolves them to Semantic Scholar papers.

export interface ParsedReferences {
  dois: string[]
  titles: string[]
}

export const MAX_TITLES = 25

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"'<>{},;]+/gi

const cleanDoi = (doi: string) => doi.replace(/[.)\]]+$/, "").toLowerCase()

const cleanTitle = (title: string) =>
  title
    .replace(/[{}]/g, "")
    .replace(/\\([&%$#_])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()

const unique = (values: string[]) => [...new Set(values)]

// Reads a BibTeX value starting at `start`: {balanced braces}, "quoted" or bare.
function readBibValue(source: string, start: number): [string, number] {
  let i = start
  while (/\s/.test(source[i] ?? "")) i++

  if (source[i] === "{") {
    let depth = 0
    let j = i
    for (; j < source.length; j++) {
      if (source[j] === "{") depth++
      else if (source[j] === "}" && --depth === 0) break
    }
    return [source.slice(i + 1, j), j + 1]
  }

  if (source[i] === '"') {
    let j = i + 1
    while (j < source.length && !(source[j] === '"' && source[j - 1] !== "\\"))
      j++
    return [source.slice(i + 1, j), j + 1]
  }

  let j = i
  while (j < source.length && !/[,\n}]/.test(source[j])) j++
  return [source.slice(i, j).trim(), j]
}

function bibFields(entry: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const fieldStart = /([A-Za-z][\w-]*)\s*=\s*/g
  // Skip "type{key," so the citation key is not read as a field.
  fieldStart.lastIndex = Math.max(0, entry.indexOf(","))

  let match: RegExpExecArray | null
  while ((match = fieldStart.exec(entry))) {
    const [value, end] = readBibValue(entry, match.index + match[0].length)
    fields[match[1].toLowerCase()] = value
    fieldStart.lastIndex = end
  }
  return fields
}

function parseBibtex(source: string): ParsedReferences {
  const dois: string[] = []
  const titles: string[] = []

  const entries = source.split(/^\s*@(?=[A-Za-z]+\s*\{)/m).slice(1)
  for (const entry of entries) {
    if (/^(comment|string|preamble)\b/i.test(entry)) continue
    const fields = bibFields(entry)
    const doi = fields.doi?.match(DOI_PATTERN)?.[0]
    if (doi) dois.push(cleanDoi(doi))
    else if (fields.title) titles.push(cleanTitle(fields.title))
  }
  return { dois, titles }
}

function parseRis(source: string): ParsedReferences {
  const dois: string[] = []
  const titles: string[] = []

  for (const block of source.split(/^ER\s+-.*$/m)) {
    const tag = (name: string) =>
      block.match(new RegExp(`^${name}\\s\\s-\\s?(.*)$`, "m"))?.[1]?.trim()
    const doi = tag("DO")?.match(DOI_PATTERN)?.[0]
    const title = tag("TI") ?? tag("T1")
    if (doi) dois.push(cleanDoi(doi))
    else if (title) titles.push(cleanTitle(title))
  }
  return { dois, titles }
}

function parsePlain(source: string): ParsedReferences {
  const dois: string[] = []
  const titles: string[] = []

  for (const line of source.split(/\r?\n/)) {
    const found = line.match(DOI_PATTERN)
    if (found) dois.push(...found.map(cleanDoi))
    else if (line.trim().length >= 20 && line.trim().length <= 300) {
      titles.push(cleanTitle(line))
    }
  }
  return { dois, titles }
}

export function parseReferences(source: string): ParsedReferences {
  const parsed = /^\s*@[A-Za-z]+\s*\{/m.test(source)
    ? parseBibtex(source)
    : /^TY\s\s-/m.test(source)
      ? parseRis(source)
      : parsePlain(source)

  return { dois: unique(parsed.dois), titles: unique(parsed.titles) }
}

const words = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter(Boolean)
  )

// A title search always returns something; only accept a near-identical title.
export function similarTitles(a: string, b: string): boolean {
  const x = words(a)
  const y = words(b)
  const shared = [...x].filter((word) => y.has(word)).length
  const total = new Set([...x, ...y]).size
  return total > 0 && shared / total >= 0.75
}

export interface Resolved {
  papers: RecommendedPaper[]
  notFound: string[]
  // Titles beyond MAX_TITLES, which are not looked up one by one.
  skipped: number
}

export async function resolveReferences(
  parsed: ParsedReferences,
  onStep: (step: string) => void = () => {}
): Promise<Resolved> {
  const papers = new Map<string, RecommendedPaper>()
  const notFound: string[] = []

  if (parsed.dois.length > 0) {
    onStep(`Buscando ${parsed.dois.length} DOI...`)
    const aligned = await getPapersAligned(
      parsed.dois.map((doi) => `DOI:${doi}`)
    )
    aligned.forEach((paper, i) => {
      if (paper) papers.set(paper.paperId, paper)
      else notFound.push(parsed.dois[i])
    })
  }

  const titles = parsed.titles.slice(0, MAX_TITLES)
  const matches: { title: string; id: string }[] = []
  if (titles.length > 0) onStep(`Buscando ${titles.length} títulos...`)
  // All searches at once: the request limiter keeps a few in flight.
  const found = await Promise.all(titles.map((title) => searchPapers(title, 1)))
  titles.forEach((title, index) => {
    const id = found[index]?.[0]
    if (id) matches.push({ title, id })
    else notFound.push(title)
  })

  if (matches.length > 0) {
    const aligned = await getPapersAligned(matches.map((m) => m.id))
    aligned.forEach((paper, i) => {
      if (paper && similarTitles(paper.title, matches[i].title)) {
        papers.set(paper.paperId, paper)
      } else {
        notFound.push(matches[i].title)
      }
    })
  }

  return {
    papers: [...papers.values()],
    notFound,
    skipped: parsed.titles.length - titles.length
  }
}
