import {
  formatCitation,
  inTextCitation,
  type Citable,
  type CitationStyle
} from "~lib/citation"
import { getCrossref } from "~lib/crossref"

// Async layer over the pure formatters: enriches each paper with Crossref
// metadata (cached per DOI) before formatting. If Crossref has no record or
// is unreachable the citation is still produced from Semantic Scholar's data.
const metaFor = (paper: Citable) => {
  const doi = paper.externalIds?.DOI
  return doi ? getCrossref(doi) : Promise.resolve(null)
}

export async function citeOne(paper: Citable, style: CitationStyle) {
  return formatCitation(paper, style, await metaFor(paper))
}

export async function inTextOne(paper: Citable, style: CitationStyle) {
  return inTextCitation(paper, style, await metaFor(paper))
}

// Sequential on purpose: Crossref requests are throttled, and the first run
// over a big list is what takes time (later runs are served from the cache).
export async function citeMany(
  papers: Citable[],
  style: CitationStyle,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  const citations: string[] = []
  for (const [index, paper] of papers.entries()) {
    onProgress?.(index, papers.length)
    citations.push(await citeOne(paper, style))
  }
  onProgress?.(papers.length, papers.length)
  return citations.join("\n\n")
}
