// Injected into the active tab on demand via chrome.scripting.executeScript,
// so it is serialized and must stay fully self-contained (no imports, no
// helpers defined outside this function).
//
// Returns a Semantic Scholar paper id ("DOI:..." or "ARXIV:..."). Only
// structured page metadata is trusted: scanning the page text for a DOI would
// often grab one from the reference list instead of the article itself.
export function extractPaperRef(): string | null {
  const doiPattern = /10\.\d{4,9}\/[^\s"<>]+/i

  const meta = (...names: string[]): string | null => {
    for (const name of names) {
      const el = document.querySelector<HTMLMetaElement>(
        `meta[name="${name}" i], meta[property="${name}" i]`
      )
      const value = el?.content?.trim()
      if (value) return value
    }
    return null
  }

  const cleanDoi = (raw: string): string | null => {
    const match = raw.match(doiPattern)
    const doi = match ? match[0].replace(/[.,;)]+$/, "") : null
    // The page controls this text: real DOIs are far shorter than 200
    // characters, and an absurd one would become a URL and a storage key.
    return doi && doi.length <= 200 ? doi : null
  }

  const doi = cleanDoi(
    meta(
      "citation_doi",
      "dc.identifier",
      "dc.identifier.doi",
      "prism.doi",
      "bepress_citation_doi",
      "og:doi"
    ) ?? ""
  )
  if (doi) return `DOI:${doi}`

  if (location.hostname === "arxiv.org") {
    const id =
      meta("citation_arxiv_id") ??
      location.pathname.match(/^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?$/)?.[1]
    if (id) return `ARXIV:${id.replace(/v\d+$/, "")}`
  }

  if (location.hostname === "doi.org" || location.hostname === "dx.doi.org") {
    const fromPath = cleanDoi(decodeURIComponent(location.pathname.slice(1)))
    if (fromPath) return `DOI:${fromPath}`
  }

  // Fallbacks for NCBI pages whose metadata carries no DOI.
  if (location.hostname === "pubmed.ncbi.nlm.nih.gov") {
    const pmid =
      meta("citation_pmid") ?? location.pathname.match(/^\/(\d+)/)?.[1]
    if (pmid) return `PMID:${pmid}`
  }

  if (location.hostname.endsWith("ncbi.nlm.nih.gov")) {
    const pmcid = location.pathname.match(/\/articles\/PMC(\d+)/i)?.[1]
    if (pmcid) return `PMCID:${pmcid}`
  }

  return null
}
