// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"

import { extractPaperRef } from "~lib/extract-ref"

// The extractor reads the live page (document + location), exactly as it runs
// when injected into a tab, so a DOM and a stubbed location are set per test.
function page(head: string, hostname = "example.org", pathname = "/") {
  document.head.innerHTML = head
  vi.stubGlobal("location", { hostname, pathname })
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ""
})

const meta = (name: string, content: string) =>
  `<meta name="${name}" content="${content}">`

describe("extractPaperRef", () => {
  it("reads citation_doi", () => {
    page(meta("citation_doi", "10.1186/s40337-024-01004-0"))
    expect(extractPaperRef()).toBe("DOI:10.1186/s40337-024-01004-0")
  })

  it("accepts the other common DOI meta names", () => {
    page(meta("prism.doi", "10.1000/prism"))
    expect(extractPaperRef()).toBe("DOI:10.1000/prism")
    page(meta("bepress_citation_doi", "10.1000/bepress"))
    expect(extractPaperRef()).toBe("DOI:10.1000/bepress")
    page(`<meta property="og:doi" content="10.1000/og">`)
    expect(extractPaperRef()).toBe("DOI:10.1000/og")
  })

  it("cleans prefixes and trailing punctuation from dc.identifier", () => {
    page(meta("dc.identifier", "doi:10.1000/abc.def)."))
    expect(extractPaperRef()).toBe("DOI:10.1000/abc.def")
    page(meta("citation_doi", "https://doi.org/10.1000/xyz"))
    expect(extractPaperRef()).toBe("DOI:10.1000/xyz")
  })

  it("ignores identifiers that are not DOIs", () => {
    page(meta("dc.identifier", "ISBN 978-3-16-148410-0"))
    expect(extractPaperRef()).toBeNull()
  })

  it("is case-insensitive about the meta attribute name", () => {
    page(`<meta name="Citation_DOI" content="10.1000/case">`)
    expect(extractPaperRef()).toBe("DOI:10.1000/case")
  })

  it("arXiv: uses citation_arxiv_id and strips the version", () => {
    page(meta("citation_arxiv_id", "1706.03762v5"), "arxiv.org", "/abs/1706.03762v5")
    expect(extractPaperRef()).toBe("ARXIV:1706.03762")
  })

  it("arXiv: falls back to the URL (abs and pdf)", () => {
    page("", "arxiv.org", "/abs/2101.00001v2")
    expect(extractPaperRef()).toBe("ARXIV:2101.00001")
    page("", "arxiv.org", "/pdf/2101.00001v2.pdf")
    expect(extractPaperRef()).toBe("ARXIV:2101.00001")
  })

  it("does not treat other sites' /abs/ paths as arXiv", () => {
    page("", "example.org", "/abs/1706.03762")
    expect(extractPaperRef()).toBeNull()
  })

  it("doi.org landing pages carry the DOI in the path", () => {
    page("", "doi.org", "/10.1038%2Fs41586-021-03819-2")
    expect(extractPaperRef()).toBe("DOI:10.1038/s41586-021-03819-2")
  })

  it("PubMed and PMC fall back to their own ids", () => {
    page("", "pubmed.ncbi.nlm.nih.gov", "/28129826/")
    expect(extractPaperRef()).toBe("PMID:28129826")
    page("", "pmc.ncbi.nlm.nih.gov", "/articles/PMC5391319/")
    expect(extractPaperRef()).toBe("PMCID:5391319")
  })

  it("a DOI in the metadata wins over the site-specific fallbacks", () => {
    page(meta("citation_doi", "10.1000/wins"), "pubmed.ncbi.nlm.nih.gov", "/28129826/")
    expect(extractPaperRef()).toBe("DOI:10.1000/wins")
  })

  it("never scans the page text (reference lists contain other DOIs)", () => {
    page("", "example.org", "/")
    document.body.innerHTML = "<p>See 10.1000/in-a-reference-list</p>"
    expect(extractPaperRef()).toBeNull()
  })

  it("returns null when nothing identifies the paper", () => {
    page("<title>Just a page</title>")
    expect(extractPaperRef()).toBeNull()
  })
})
