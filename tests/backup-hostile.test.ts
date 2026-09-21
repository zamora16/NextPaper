import { describe, expect, it } from "vitest"

import { normalizeSaved, parseBackup } from "~lib/backup"

// A backup file is untrusted input (rule 14). The interface renders these
// fields directly, so a value of the wrong type is not just ugly: React throws
// when asked to render an object, which blanks the whole popup — and the
// broken item would stay in the library after the import.
const valid = {
  paperId: "abc123",
  title: "A fine paper",
  authors: [{ authorId: "1", name: "Ada Lovelace" }],
  year: 2020,
  citationCount: 12,
  venue: "J Test",
  url: "https://example.org/p",
  abstract: "An abstract.",
  tldr: { text: "A summary." },
  externalIds: { DOI: "10.1000/xyz" },
  journal: { name: "J Test", volume: "3", pages: "1-9" },
  publicationTypes: ["JournalArticle"],
  influentialCitationCount: 2,
  openAccessPdf: { url: "https://example.org/p.pdf" },
  savedAt: 1700000000000,
  status: "read",
  note: "my note",
  collections: ["Tesis"]
}

describe("normalizeSaved keeps a well-formed paper intact", () => {
  it("round-trips every field the interface uses", () => {
    expect(normalizeSaved(valid)).toMatchObject({
      paperId: "abc123",
      title: "A fine paper",
      authors: [{ authorId: "1", name: "Ada Lovelace" }],
      year: 2020,
      citationCount: 12,
      venue: "J Test",
      abstract: "An abstract.",
      tldr: { text: "A summary." },
      externalIds: { DOI: "10.1000/xyz" },
      journal: { name: "J Test", volume: "3", pages: "1-9" },
      publicationTypes: ["JournalArticle"],
      influentialCitationCount: 2,
      openAccessPdf: { url: "https://example.org/p.pdf" },
      savedAt: 1700000000000,
      status: "read",
      note: "my note",
      collections: ["Tesis"]
    })
  })
})

describe("normalizeSaved never lets a wrong type reach the interface", () => {
  it("drops non-string text fields instead of passing objects along", () => {
    const paper = normalizeSaved({
      ...valid,
      tldr: { text: { evil: true } },
      abstract: 12345,
      venue: { x: 1 },
      journal: { name: {}, volume: 4, pages: ["1"] },
      externalIds: { DOI: 10.5 },
      note: { a: 1 }
    })!
    expect(paper.tldr).toBeNull()
    expect(paper.abstract).toBeNull()
    expect(paper.venue).toBe("")
    expect(paper.journal ?? null).toBeNull()
    expect(paper.externalIds?.DOI).toBeUndefined()
    expect(paper.note).toBe("")
  })

  it("drops non-numeric counts and impossible years", () => {
    const paper = normalizeSaved({
      ...valid,
      year: "2020",
      citationCount: "many",
      influentialCitationCount: { n: 1 }
    })!
    expect(paper.year).toBeNull()
    expect(paper.citationCount).toBe(0)
    expect(paper.influentialCitationCount ?? null).toBeNull()

    expect(normalizeSaved({ ...valid, year: 99999 })!.year).toBeNull()
    expect(normalizeSaved({ ...valid, citationCount: -5 })!.citationCount).toBe(
      0
    )
  })

  it("keeps only string entries in list fields", () => {
    const paper = normalizeSaved({
      ...valid,
      publicationTypes: ["Review", 7, null, { a: 1 }],
      collections: ["Tesis", 3, "  ", { x: 1 }, "Tesis"],
      authors: [{ name: "Ok", authorId: 5 }, { name: 7 }, null, "x"]
    })!
    expect(paper.publicationTypes).toEqual(["Review"])
    expect(paper.collections).toEqual(["Tesis"])
    expect(paper.authors).toEqual([{ authorId: "", name: "Ok" }])
  })

  it("does not copy fields it does not know, nor the analysis context", () => {
    const paper = normalizeSaved({
      ...valid,
      evil: "<script>alert(1)</script>",
      similarity: 0.97,
      relation: "reference",
      sharedTerms: ["x"],
      embedding: [1, 2, 3],
      __proto__: { polluted: true }
    })! as unknown as Record<string, unknown>
    expect(paper.evil).toBeUndefined()
    expect(paper.sharedTerms).toBeUndefined()
    expect(paper.embedding).toBeUndefined()
    expect(paper.similarity).toBeNull()
    expect(paper.relation).toBeNull()
    expect(({} as any).polluted).toBeUndefined()
  })

  it("only accepts http(s) links", () => {
    const paper = normalizeSaved({
      ...valid,
      url: "javascript:alert(1)",
      openAccessPdf: { url: "data:text/html,<script>" }
    })!
    expect(paper.url).toBe("https://www.semanticscholar.org/paper/abc123")
    expect(paper.openAccessPdf).toBeNull()
  })

  it("caps text that could bloat storage", () => {
    const paper = normalizeSaved({
      ...valid,
      title: "T".repeat(100_000),
      abstract: "A".repeat(500_000),
      note: "N".repeat(500_000),
      collections: [
        "C".repeat(10_000),
        ...Array.from({ length: 500 }, (_, i) => `col${i}`)
      ],
      authors: Array.from({ length: 5000 }, (_, i) => ({
        authorId: String(i),
        name: `Author ${i}`
      }))
    })!
    expect(paper.title.length).toBeLessThanOrEqual(1000)
    expect(paper.abstract!.length).toBeLessThanOrEqual(10_000)
    expect(paper.note.length).toBeLessThanOrEqual(10_000)
    expect(paper.collections.length).toBeLessThanOrEqual(50)
    expect(
      Math.max(...paper.collections.map((c) => c.length))
    ).toBeLessThanOrEqual(100)
    expect(paper.authors.length).toBeLessThanOrEqual(200)
  })

  it("rejects entries without a usable id or title", () => {
    expect(normalizeSaved({ ...valid, paperId: 5 })).toBeNull()
    expect(normalizeSaved({ ...valid, title: null })).toBeNull()
    expect(normalizeSaved({ ...valid, paperId: "" })).toBeNull()
    expect(normalizeSaved(null)).toBeNull()
    expect(normalizeSaved("text")).toBeNull()
  })
})

describe("parseBackup", () => {
  const file = (library: unknown) =>
    JSON.stringify({ app: "nextpaper", version: 1, library })

  it("drops the broken entries and keeps the good ones", () => {
    const parsed = parseBackup(
      file([valid, { nope: 1 }, null, { ...valid, paperId: "b" }])
    )
    expect(parsed!.map((p) => p.paperId)).toEqual(["abc123", "b"])
  })

  it("refuses files that are not a NextPaper backup", () => {
    expect(parseBackup("not json")).toBeNull()
    expect(parseBackup(JSON.stringify({ library: [valid] }))).toBeNull()
    expect(
      parseBackup(JSON.stringify({ app: "other", library: [] }))
    ).toBeNull()
    expect(
      parseBackup(JSON.stringify({ app: "nextpaper", library: "x" }))
    ).toBeNull()
  })

  it("stops reading absurdly large libraries", () => {
    const many = Array.from({ length: 6000 }, (_, i) => ({
      ...valid,
      paperId: `p${i}`
    }))
    expect(parseBackup(file(many))!.length).toBeLessThanOrEqual(5000)
  })
})
