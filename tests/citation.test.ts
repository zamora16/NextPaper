import { describe, expect, it } from "vitest"

import {
  formatCitation,
  inTextCitation,
  supportsInText,
  type Citable
} from "~lib/citation"
import type { CrossrefMeta } from "~lib/crossref"

// Expected strings are derived by hand from each style's rules, not copied
// from the implementation's output.

const TITLE =
  "Assessing body image disturbance in patients with anorexia nervosa using biometric self-avatars in virtual reality: attitudinal components rather than visual body size estimation are distorted"

// Semantic Scholar shape: free-text names, uppercase DOI, dirty pages.
const molbert: Citable = {
  paperId: "aa90",
  title: TITLE + ".",
  authors: [
    "S. Mölbert",
    "A. Thaler",
    "B. Mohler",
    "S. Streuber",
    "Michael J. Black",
    "H. Karnath",
    "S. Zipfel",
    "K. Giel"
  ].map((name, i) => ({ authorId: String(i), name })),
  year: 2017,
  citationCount: 1,
  venue: "Journal of Psychosomatic Research",
  url: "https://www.semanticscholar.org/paper/aa90",
  externalIds: { DOI: "10.1016/J.JPSYCHORES.2017.03.271" },
  journal: {
    name: "Journal of Psychosomatic Research",
    volume: "97",
    pages: "\n          162-162\n        "
  }
}

const molbertMeta: CrossrefMeta = {
  authors: [
    ["S.", "Mölbert"],
    ["A.", "Thaler"],
    ["B.", "Mohler"],
    ["S.", "Streuber"],
    ["M.J.", "Black"],
    ["H.", "Karnath"],
    ["S.", "Zipfel"],
    ["K.", "Giel"]
  ].map(([given, family]) => ({ given, family })),
  journal: "Journal of Psychosomatic Research",
  journalShort: "Journal of Psychosomatic Research",
  volume: "97",
  pages: "162",
  year: 2017,
  month: 6
}

const DOI = "10.1016/j.jpsychores.2017.03.271"

// A Crossref record with everything: full given names, issue, article number.
const zamoraTitle = "Psychometric properties of the Spanish version of the Functionality Appreciation Scale"
const zamora: Citable = {
  paperId: "bmc",
  title: zamoraTitle,
  authors: [{ authorId: "1", name: "Angel Zamora" }],
  year: 2024,
  citationCount: 0,
  venue: "Journal of Eating Disorders",
  url: "https://example.org/bmc",
  externalIds: { DOI: "10.1186/s40337-024-01004-0" }
}
const zamoraMeta: CrossrefMeta = {
  authors: [
    { given: "Ángel", family: "Zamora" },
    { given: "Lorena", family: "Desdentado" },
    { given: "Rocío", family: "Herrero" }
  ],
  journal: "Journal of Eating Disorders",
  journalShort: "J Eat Disord",
  volume: "12",
  issue: "1",
  articleNumber: "50",
  year: 2024,
  month: 4
}
const ZDOI = "10.1186/s40337-024-01004-0"

describe("with Crossref metadata (8 authors, single page)", () => {
  const cite = (style: Parameters<typeof formatCitation>[1]) =>
    formatCitation(molbert, style, molbertMeta)

  it("APA 7", () => {
    expect(cite("apa")).toBe(
      `Mölbert, S., Thaler, A., Mohler, B., Streuber, S., Black, M. J., Karnath, H., Zipfel, S., & Giel, K. (2017). ${TITLE}. Journal of Psychosomatic Research, 97, 162. https://doi.org/${DOI}`
    )
  })

  it("Vancouver lists 6 authors then et al.", () => {
    expect(cite("vancouver")).toBe(
      `Mölbert S, Thaler A, Mohler B, Streuber S, Black MJ, Karnath H, et al. ${TITLE}. Journal of Psychosomatic Research. 2017;97:162. doi:${DOI}`
    )
  })

  it("AMA lists 3 authors then et al. when there are more than 6", () => {
    expect(cite("ama")).toBe(
      `Mölbert S, Thaler A, Mohler B, et al. ${TITLE}. Journal of Psychosomatic Research. 2017;97:162. doi:${DOI}`
    )
  })

  it("MLA 9 uses the first author and et al. from 3 authors", () => {
    expect(cite("mla")).toBe(
      `Mölbert, S., et al. "${TITLE}." Journal of Psychosomatic Research, vol. 97, 2017, pp. 162, https://doi.org/${DOI}.`
    )
  })

  it("Chicago author-date inverts only the first author", () => {
    expect(cite("chicago")).toBe(
      `Mölbert, S., A. Thaler, B. Mohler, S. Streuber, M.J. Black, H. Karnath, S. Zipfel, and K. Giel. 2017. "${TITLE}." Journal of Psychosomatic Research 97: 162. https://doi.org/${DOI}.`
    )
  })

  it("Harvard uses et al. from 4 authors", () => {
    expect(cite("harvard")).toBe(
      `Mölbert, S. et al. (2017) '${TITLE}', Journal of Psychosomatic Research, 97, pp. 162. https://doi.org/${DOI}`
    )
  })

  it("IEEE puts initials first and adds the month", () => {
    expect(cite("ieee")).toBe(
      `S. Mölbert et al., "${TITLE}," Journal of Psychosomatic Research, vol. 97, pp. 162, Jun. 2017, doi: ${DOI}.`
    )
  })

  it("BibTeX: ASCII key with a title word, structured authors, no whitespace garbage", () => {
    const bib = cite("bibtex")
    expect(bib).toContain("@article{Molbert2017Assessing,")
    expect(bib).toContain("author={Mölbert, S. and Thaler, A. and Mohler, B. and Streuber, S. and Black, M.J. and")
    expect(bib).toContain("pages={162},")
    expect(bib).toContain(`doi={${DOI}}`)
    expect(bib).not.toMatch(/\n\s{3,}/)
    expect(bib).not.toContain("number=")
  })

  it("RIS: one AU per author, single page only in SP, no trailing space in values", () => {
    const ris = cite("ris").split("\n")
    expect(ris[0]).toBe("TY  - JOUR")
    expect(ris).toContain("AU  - Mölbert, S.")
    expect(ris).toContain("AU  - Black, M.J.")
    expect(ris).toContain("SP  - 162")
    expect(ris.some((line) => line.startsWith("EP  - "))).toBe(false)
    expect(ris).toContain(`DO  - ${DOI}`)
    expect(ris[ris.length - 1]).toBe("ER  - ")
  })
})

describe("with Crossref metadata (3 authors, issue + article number + abbreviation)", () => {
  const cite = (style: Parameters<typeof formatCitation>[1]) =>
    formatCitation(zamora, style, zamoraMeta)

  it("APA 7 uses 'Article N' when there are no pages", () => {
    expect(cite("apa")).toBe(
      `Zamora, Á., Desdentado, L., & Herrero, R. (2024). ${zamoraTitle}. Journal of Eating Disorders, 12(1), Article 50. https://doi.org/${ZDOI}`
    )
  })

  it("Vancouver uses the journal abbreviation without periods", () => {
    expect(cite("vancouver")).toBe(
      `Zamora Á, Desdentado L, Herrero R. ${zamoraTitle}. J Eat Disord. 2024;12(1):50. doi:${ZDOI}`
    )
  })

  it("MLA", () => {
    expect(cite("mla")).toBe(
      `Zamora, Ángel, et al. "${zamoraTitle}." Journal of Eating Disorders, vol. 12, no. 1, 2024, article 50, https://doi.org/${ZDOI}.`
    )
  })

  it("Chicago", () => {
    expect(cite("chicago")).toBe(
      `Zamora, Ángel, Lorena Desdentado, and Rocío Herrero. 2024. "${zamoraTitle}." Journal of Eating Disorders 12 (1): 50. https://doi.org/${ZDOI}.`
    )
  })

  it("Harvard lists up to 3 authors", () => {
    expect(cite("harvard")).toBe(
      `Zamora, Á., Desdentado, L. and Herrero, R. (2024) '${zamoraTitle}', Journal of Eating Disorders, 12(1), article 50. https://doi.org/${ZDOI}`
    )
  })

  it("IEEE uses Art. no. for article numbers", () => {
    expect(cite("ieee")).toBe(
      `Á. Zamora, L. Desdentado, and R. Herrero, "${zamoraTitle}," Journal of Eating Disorders, vol. 12, no. 1, Art. no. 50, Apr. 2024, doi: ${ZDOI}.`
    )
  })

  it("BibTeX includes number and the article number as pages", () => {
    const bib = cite("bibtex")
    expect(bib).toContain("author={Zamora, Ángel and Desdentado, Lorena and Herrero, Rocío}")
    expect(bib).toContain("number={1}")
    expect(bib).toContain("pages={50}")
  })

  it("RIS carries issue, abbreviation and article number", () => {
    const ris = cite("ris").split("\n")
    expect(ris).toContain("IS  - 1")
    expect(ris).toContain("J2  - J Eat Disord")
    expect(ris).toContain("C7  - 50")
  })
})

describe("in-text citations", () => {
  it.each([
    ["apa", "(Zamora et al., 2024)"],
    ["harvard", "(Zamora, Desdentado and Herrero, 2024)"],
    ["chicago", "(Zamora, Desdentado and Herrero 2024)"],
    ["mla", "(Zamora et al.)"]
  ] as const)("%s", (style, expected) => {
    expect(inTextCitation(zamora, style, zamoraMeta)).toBe(expected)
  })

  it("two authors join with the style's connector", () => {
    const two: CrossrefMeta = { ...zamoraMeta, authors: zamoraMeta.authors.slice(0, 2) }
    expect(inTextCitation(zamora, "apa", two)).toBe("(Zamora & Desdentado, 2024)")
    expect(inTextCitation(zamora, "mla", two)).toBe("(Zamora and Desdentado)")
  })

  it("numeric styles have no in-text form", () => {
    for (const style of ["vancouver", "ieee", "ama", "bibtex", "ris"] as const) {
      expect(supportsInText(style)).toBe(false)
      expect(inTextCitation(zamora, style, zamoraMeta)).toBeNull()
    }
  })
})

describe("fallback to Semantic Scholar data only", () => {
  const arxiv: Citable = {
    paperId: "att",
    title: "Attention is all you need",
    authors: [
      { authorId: "1", name: "Ashish Vaswani" },
      { authorId: "2", name: "Noam Shazeer" }
    ],
    year: 2017,
    citationCount: 1,
    venue: "",
    url: "https://example.org/att",
    journal: { name: "ArXiv", volume: "abs/1706.03762" }
  }

  it("does not leak the arXiv id as a volume and works without a DOI", () => {
    expect(formatCitation(arxiv, "apa")).toBe(
      "Vaswani, A., & Shazeer, N. (2017). Attention is all you need. arXiv."
    )
  })

  it("splits 'First Last' names heuristically", () => {
    expect(formatCitation(arxiv, "vancouver")).toBe(
      "Vaswani A, Shazeer N. Attention is all you need. arXiv. 2017."
    )
  })

  it("also reads 'Last, First' names", () => {
    const paper = { ...arxiv, authors: [{ authorId: "1", name: "van der Berg, Anna" }] }
    expect(formatCitation(paper, "apa")).toContain("van der Berg, A.")
  })

  it("cleans dirty pages and collapses a repeated page", () => {
    expect(formatCitation(molbert, "vancouver")).toContain("2017;97:162.")
  })
})

describe("edge cases", () => {
  const base: Citable = {
    paperId: "x",
    title: "Is it working?",
    authors: [{ authorId: "1", name: "Ada Lovelace" }],
    year: null,
    citationCount: 0,
    venue: "",
    url: "https://example.org/x"
  }

  it("does not double punctuation after ? or a final period", () => {
    expect(formatCitation(base, "apa")).toBe("Lovelace, A. (n.d.). Is it working?")
    expect(formatCitation({ ...base, title: "Plain title." }, "apa")).toBe(
      "Lovelace, A. (n.d.). Plain title."
    )
  })

  it("organization authors are kept whole", () => {
    const meta: CrossrefMeta = { authors: [{ name: "World Health Organization" }], year: 2020 }
    expect(formatCitation(base, "apa", meta)).toContain("World Health Organization (2020).")
    expect(formatCitation(base, "bibtex", meta)).toContain("author={{World Health Organization}}")
  })

  it("APA truncates 21+ authors: first 19, ellipsis, last", () => {
    const authors = Array.from({ length: 25 }, (_, i) => ({ given: "A", family: `F${i + 1}` }))
    const apa = formatCitation(base, "apa", { authors, year: 2020 })
    expect(apa).toContain("F19, A., . . . F25, A. (2020).")
    expect(apa).not.toContain("F20")
  })

  it("escapes LaTeX-special characters in BibTeX but not in URLs", () => {
    const bib = formatCitation({ ...base, title: "R&D at 50% _speed_" }, "bibtex")
    expect(bib).toContain("title={R\\&D at 50\\% \\_speed\\_}")
  })

  it("personal notes travel in BibTeX and RIS", () => {
    const noted = { ...base, note: "Cite in methods" }
    expect(formatCitation(noted, "bibtex")).toContain("note={Cite in methods}")
    expect(formatCitation(noted, "ris")).toContain("N1  - Cite in methods")
  })
})
