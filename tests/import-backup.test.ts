import { describe, expect, it } from "vitest"

import {
  buildBackup,
  mergeItems,
  normalizeSaved,
  parseBackup
} from "~lib/backup"
import { parseReferences, similarTitles } from "~lib/import"
import { collectionCounts, type SavedPaper } from "~lib/library"

describe("parseReferences: BibTeX", () => {
  const bib = `
@article{molbert2017,
  title = {Assessing body image disturbance in patients with anorexia nervosa},
  author = {M{\\"o}lbert, S. and Thaler, A.},
  journal = {Journal of Psychosomatic Research},
  doi = {10.1016/j.jpsychores.2017.03.271},
  year = {2017}
}

@book{noDoi,
  title = "A {Practical} Guide to Meta-Analysis \\& More",
  year = 2010
}

@comment{ignore me, doi = {10.9999/never}}

@article{urlDoi, doi = "https://doi.org/10.1186/S40337-024-01004-0", title={Ignored because a DOI exists}}
`

  it("collects DOIs (normalized) and falls back to titles only without a DOI", () => {
    expect(parseReferences(bib)).toEqual({
      dois: ["10.1016/j.jpsychores.2017.03.271", "10.1186/s40337-024-01004-0"],
      titles: ["A Practical Guide to Meta-Analysis & More"]
    })
  })
})

describe("parseReferences: RIS", () => {
  const ris = `TY  - JOUR
AU  - Mölbert, S.
TI  - Assessing body image disturbance
DO  - 10.1016/j.jpsychores.2017.03.271
ER  -

TY  - BOOK
T1  - Meta-analysis basics for clinicians
ER  -
`

  it("reads DO and falls back to TI/T1", () => {
    expect(parseReferences(ris)).toEqual({
      dois: ["10.1016/j.jpsychores.2017.03.271"],
      titles: ["Meta-analysis basics for clinicians"]
    })
  })
})

describe("parseReferences: plain text", () => {
  const plain = `10.1016/j.jpsychores.2017.03.271
https://doi.org/10.1038/s41586-021-03819-2.
Attention is all you need and other titles are long enough
short
(doi:10.1186/s40337-024-01004-0)
10.1016/J.JPSYCHORES.2017.03.271`

  it("extracts DOIs from bare, URL and wrapped forms, deduplicated and lowercased", () => {
    const { dois, titles } = parseReferences(plain)
    expect(dois).toEqual([
      "10.1016/j.jpsychores.2017.03.271",
      "10.1038/s41586-021-03819-2",
      "10.1186/s40337-024-01004-0"
    ])
    expect(titles).toEqual(["Attention is all you need and other titles are long enough"])
  })
})

describe("similarTitles", () => {
  it("accepts the same title despite case and punctuation", () => {
    expect(
      similarTitles(
        "Assessing body image disturbance: a study.",
        "assessing body image disturbance - a study"
      )
    ).toBe(true)
  })

  it("rejects a different paper that merely shares words", () => {
    expect(
      similarTitles(
        "Body image and eating disorders in virtual reality",
        "Body image in adolescents"
      )
    ).toBe(false)
  })
})

const saved = (overrides: Partial<SavedPaper> = {}): SavedPaper => ({
  paperId: "p1",
  title: "A paper",
  authors: [{ authorId: "1", name: "Ada Lovelace" }],
  year: 2020,
  citationCount: 3,
  venue: "",
  url: "https://example.org/p1",
  similarity: null,
  approximate: false,
  relation: null,
  savedAt: 1,
  status: "unread",
  note: "",
  collections: [],
  ...overrides
})

describe("backup file", () => {
  it("round-trips a library", () => {
    const library = [saved({ status: "read", note: "keep", collections: ["Tesis"] })]
    const restored = parseBackup(JSON.stringify(buildBackup(library)))
    expect(restored).toHaveLength(1)
    expect(restored![0]).toMatchObject({ paperId: "p1", status: "read", note: "keep", collections: ["Tesis"] })
  })

  it("rejects anything that is not a NextPaper backup", () => {
    expect(parseBackup("not json")).toBeNull()
    expect(parseBackup(JSON.stringify({ library: [] }))).toBeNull()
    expect(parseBackup(JSON.stringify({ app: "other", library: [] }))).toBeNull()
    expect(parseBackup(JSON.stringify({ app: "nextpaper", library: "nope" }))).toBeNull()
  })

  it("drops malformed items and repairs missing fields", () => {
    const restored = parseBackup(
      JSON.stringify({
        app: "nextpaper",
        library: [{ paperId: "ok", title: "T" }, { title: "no id" }, null, { paperId: 5, title: "bad id" }]
      })
    )!
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      paperId: "ok",
      status: "unread",
      note: "",
      collections: [],
      citationCount: 0,
      authors: []
    })
    expect(restored[0].url).toBe("https://www.semanticscholar.org/paper/ok")
  })

  it("never lets a non-http(s) link through", () => {
    const item = normalizeSaved({
      paperId: "x",
      title: "T",
      url: "javascript:alert(1)",
      openAccessPdf: { url: "javascript:alert(2)" }
    })!
    expect(item.url).toBe("https://www.semanticscholar.org/paper/x")
    expect(item.openAccessPdf).toBeNull()

    const ok = normalizeSaved({
      paperId: "y",
      title: "T",
      url: "https://example.org/y",
      openAccessPdf: { url: "http://example.org/y.pdf" }
    })!
    expect(ok.url).toBe("https://example.org/y")
    expect(ok.openAccessPdf).toEqual({ url: "http://example.org/y.pdf" })
  })

  it("normalizes collections: trimmed, deduplicated, strings only", () => {
    const item = normalizeSaved({
      paperId: "c",
      title: "T",
      collections: [" Tesis ", "Tesis", "", 7, null, "Otra"]
    })!
    expect(item.collections).toEqual(["Tesis", "Otra"])
  })
})

describe("mergeItems", () => {
  it("adds new papers and never overwrites the user's own status or note", () => {
    const existing = { p1: saved({ status: "read", note: "mine", collections: ["A"] }) }
    const incoming = [
      saved({ status: "unread", note: "theirs", collections: ["B"] }),
      saved({ paperId: "p2", title: "New" })
    ]
    const { library, added, updated } = mergeItems(existing, incoming)

    expect(added).toBe(1)
    expect(updated).toBe(1)
    expect(library.p1.status).toBe("read")
    expect(library.p1.note).toBe("mine")
    expect(library.p1.collections).toEqual(["A", "B"])
    expect(library.p2.title).toBe("New")
  })

  it("fills an empty note from the backup", () => {
    const { library, updated } = mergeItems({ p1: saved() }, [saved({ note: "from backup" })])
    expect(library.p1.note).toBe("from backup")
    expect(updated).toBe(1)
  })

  it("reports nothing changed when the backup adds nothing", () => {
    const item = saved({ collections: ["A"], note: "n" })
    const { added, updated } = mergeItems({ p1: item }, [item])
    expect(added).toBe(0)
    expect(updated).toBe(0)
  })

  it("does not mutate the existing library object", () => {
    const existing = { p1: saved() }
    mergeItems(existing, [saved({ paperId: "p2" })])
    expect(Object.keys(existing)).toEqual(["p1"])
  })
})

describe("collectionCounts", () => {
  it("counts papers per collection, biggest first, then alphabetically", () => {
    const library = [
      saved({ paperId: "1", collections: ["B", "A"] }),
      saved({ paperId: "2", collections: ["B"] }),
      saved({ paperId: "3", collections: [] })
    ]
    expect(collectionCounts(library)).toEqual([
      { name: "B", count: 2 },
      { name: "A", count: 1 }
    ])
  })
})
