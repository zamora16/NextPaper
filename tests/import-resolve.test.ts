import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveReferences } from "~lib/import"
import { RateLimitedError } from "~lib/s2-fetch"
import { getPapersAligned, searchPapers } from "~lib/semantic-scholar"

vi.mock("~lib/semantic-scholar", () => ({
  getPapersAligned: vi.fn(),
  searchPapers: vi.fn()
}))

const aligned = vi.mocked(getPapersAligned)
const search = vi.mocked(searchPapers)

const paper = (paperId: string, title: string) =>
  ({
    paperId,
    title,
    authors: [],
    year: 2020,
    citationCount: 0,
    venue: "",
    url: ""
  }) as any

beforeEach(() => {
  aligned.mockReset()
  search.mockReset()
})

describe("resolving DOIs", () => {
  it("asks for them as DOI ids and reports the ones Semantic Scholar does not know", async () => {
    aligned.mockResolvedValue([paper("p1", "One"), null, paper("p3", "Three")])
    const result = await resolveReferences({
      dois: ["10.1/a", "10.1/b", "10.1/c"],
      titles: []
    })
    expect(aligned).toHaveBeenCalledWith([
      "DOI:10.1/a",
      "DOI:10.1/b",
      "DOI:10.1/c"
    ])
    expect(result.papers.map((p) => p.paperId)).toEqual(["p1", "p3"])
    expect(result.notFound).toEqual(["10.1/b"])
    expect(result.skipped).toBe(0)
  })

  it("makes no request when there is nothing to look up", async () => {
    const result = await resolveReferences({ dois: [], titles: [] })
    expect(result).toEqual({ papers: [], notFound: [], skipped: 0 })
    expect(aligned).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it("lets a failed request surface, so it is not reported as 'not found'", async () => {
    aligned.mockRejectedValue(new RateLimitedError())
    await expect(
      resolveReferences({ dois: ["10.1/a"], titles: [] })
    ).rejects.toBeInstanceOf(RateLimitedError)
  })
})

describe("resolving titles", () => {
  const TITLE =
    "Assessing body image disturbance in anorexia nervosa with avatars"

  it("accepts a match only when the found title is nearly identical", async () => {
    search.mockImplementation(async (title) =>
      title === TITLE ? ["good"] : ["wrong"]
    )
    aligned.mockImplementation(async (ids) =>
      ids.map((id) =>
        id === "good"
          ? paper("good", TITLE)
          : paper("wrong", "A completely different subject")
      )
    )
    const result = await resolveReferences({
      dois: [],
      titles: [TITLE, "Some other reference title that is not found"]
    })
    expect(result.papers.map((p) => p.paperId)).toEqual(["good"])
    expect(result.notFound).toEqual([
      "Some other reference title that is not found"
    ])
  })

  it("searches for one result per title", async () => {
    search.mockResolvedValue([])
    await resolveReferences({
      dois: [],
      titles: ["A long enough title number one"]
    })
    expect(search).toHaveBeenCalledWith("A long enough title number one", 1)
  })

  it("reports a title with no search result as not found", async () => {
    search.mockResolvedValue([])
    const result = await resolveReferences({
      dois: [],
      titles: ["Nothing matches this title"]
    })
    expect(result.notFound).toEqual(["Nothing matches this title"])
    expect(aligned).not.toHaveBeenCalled()
  })

  it("does not look up more than 25 titles, and says how many were left out", async () => {
    const titles = Array.from(
      { length: 30 },
      (_, i) => `Reference title number ${i}`
    )
    search.mockResolvedValue([])
    const result = await resolveReferences({ dois: [], titles })
    expect(search).toHaveBeenCalledTimes(25)
    expect(result.skipped).toBe(5)
  })

  it("does not list the same paper twice when a DOI and a title lead to it", async () => {
    aligned.mockImplementation(async (ids) =>
      ids.map(() => paper("same", TITLE))
    )
    search.mockResolvedValue(["same"])
    const result = await resolveReferences({
      dois: ["10.1/a"],
      titles: [TITLE]
    })
    expect(result.papers).toHaveLength(1)
  })

  it("reports progress", async () => {
    aligned.mockResolvedValue([paper("p1", "One")])
    search.mockResolvedValue([])
    const steps: unknown[] = []
    await resolveReferences(
      { dois: ["10.1/a"], titles: ["A long enough title to search"] },
      (s) => steps.push(s)
    )
    expect(steps).toEqual([
      { code: "dois", n: 1 },
      { code: "titles", n: 1 }
    ])
  })
})
