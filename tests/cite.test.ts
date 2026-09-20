import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Citable } from "~lib/citation"
import { citeMany, citeOne, inTextOne } from "~lib/cite"
import { getCrossref } from "~lib/crossref"

vi.mock("~lib/crossref", () => ({ getCrossref: vi.fn() }))

const crossref = vi.mocked(getCrossref)

const paper = (id: string, over: Partial<Citable> = {}): Citable => ({
  paperId: id,
  title: `Paper ${id}`,
  authors: [{ authorId: "1", name: "Jean van der Berg" }],
  year: 2020,
  citationCount: 0,
  venue: "Journal of Tests",
  url: "https://example.org/" + id,
  externalIds: { DOI: `10.1000/${id}` },
  ...over
})

beforeEach(() => crossref.mockReset())

describe("citeOne", () => {
  it("prefers Crossref's structured names over the heuristic parse of Semantic Scholar's text", async () => {
    // "Jean van der Berg" -> heuristics take the last word as the family name.
    crossref.mockResolvedValue({
      authors: [{ given: "Jean", family: "van der Berg" }]
    })
    expect(await citeOne(paper("a"), "apa")).toContain("van der Berg, J.")

    crossref.mockResolvedValue(null)
    expect(await citeOne(paper("a"), "apa")).not.toContain("van der Berg, J.")
  })

  it("asks Crossref by DOI, and only when the paper has one", async () => {
    crossref.mockResolvedValue(null)
    await citeOne(paper("a"), "apa")
    expect(crossref).toHaveBeenCalledWith("10.1000/a")

    crossref.mockClear()
    await citeOne(paper("b", { externalIds: undefined }), "apa")
    expect(crossref).not.toHaveBeenCalled()
  })

  it("still produces a citation when Crossref has nothing (arXiv-only papers)", async () => {
    crossref.mockResolvedValue(null)
    const text = await citeOne(paper("a"), "apa")
    expect(text).toContain("(2020)")
    expect(text).toContain("Paper a")
  })
})

describe("inTextOne", () => {
  it("returns an in-text citation for author-date styles and null for numeric ones", async () => {
    crossref.mockResolvedValue({
      authors: [{ given: "Ada", family: "Lovelace" }]
    })
    expect(await inTextOne(paper("a"), "apa")).toBe("(Lovelace, 2020)")
    expect(await inTextOne(paper("a"), "ieee")).toBeNull()
  })
})

describe("citeMany", () => {
  it("joins the citations with a blank line, in the order given", async () => {
    crossref.mockResolvedValue(null)
    const text = await citeMany([paper("a"), paper("b"), paper("c")], "apa")
    const parts = text.split("\n\n")
    expect(parts).toHaveLength(3)
    expect(parts.map((p) => /Paper (\w)/.exec(p)?.[1])).toEqual(["a", "b", "c"])
  })

  it("looks papers up one at a time (Crossref is throttled) and reports progress", async () => {
    let running = 0
    let peak = 0
    crossref.mockImplementation(async () => {
      peak = Math.max(peak, ++running)
      await new Promise((r) => setTimeout(r, 2))
      running--
      return null
    })
    const progress: [number, number][] = []
    await citeMany([paper("a"), paper("b"), paper("c")], "apa", (done, total) =>
      progress.push([done, total])
    )
    expect(peak).toBe(1)
    expect(progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3]
    ])
  })

  it("gives an empty string for an empty list", async () => {
    expect(await citeMany([], "apa")).toBe("")
    expect(crossref).not.toHaveBeenCalled()
  })

  it("works for the file formats too", async () => {
    crossref.mockResolvedValue(null)
    expect(await citeMany([paper("a")], "bibtex")).toMatch(/^@\w+\{/)
    expect(await citeMany([paper("a")], "ris")).toMatch(/^TY {2}- /)
  })
})
