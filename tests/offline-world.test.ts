import { createRequire } from "node:module"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { OTHER_GROUP, RELATED_GROUP } from "~lib/model"
import { analyze } from "~lib/pipeline"

import { installChrome } from "./helpers/chrome"

// The pipeline, run for real, against the offline world the browser tests use:
// the same code and the same answers, without a browser. If the world stops
// producing a sensible analysis, the browser tests would fail for the wrong
// reason, so it is checked here first.
const load = createRequire(import.meta.url)
const { createHandler } = load("../scripts/e2e-offline/world.cjs")

const ORIGINS: Record<string, string> = {
  "https://api.semanticscholar.org": "/s2",
  "https://api.crossref.org": "/crossref",
  "https://api.unpaywall.org": "/unpaywall"
}

let world: any
beforeEach(() => {
  installChrome()
  const server = createHandler()
  world = server.world
  vi.stubGlobal(
    "fetch",
    async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input)
      const origin = Object.keys(ORIGINS).find((o) => url.startsWith(o))!
      const answer = server.handle(
        {
          method: init.method ?? "GET",
          url: ORIGINS[origin] + url.slice(origin.length),
          headers: Object.fromEntries(new Headers(init.headers).entries())
        },
        typeof init.body === "string" ? init.body : ""
      )
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: answer.headers
      })
    }
  )
})
afterEach(() => vi.unstubAllGlobals())

describe("the pipeline on the offline world", () => {
  it("analyzes the open paper: 18 related papers, the noise left out, groups named", async () => {
    const result = await analyze(`DOI:${world.seed.doi}`)
    const papers = result.groups.flatMap((g) => g.papers)

    expect(papers).toHaveLength(18)
    expect(papers.some((p) => p.paperId === world.seed.paperId)).toBe(false)
    // the unrelated topic (index 3) is never among the closest 18
    const topicOf = (id: string) => world.byId.get(id).topic
    expect(papers.every((p) => topicOf(p.paperId) !== 3)).toBe(true)

    expect(result.seedTitle).toBe(world.seed.title)
    expect(result.seedByline).toBe("Ana Torres, Luis Prieto, Marta Vidal +2")
    expect(papers.every((p) => typeof p.similarity === "number")).toBe(true)
    expect(result.picks.length).toBeGreaterThan(0)
  })

  it("groups by subtopic with honest names, or shows one plain list", async () => {
    const result = await analyze(`DOI:${world.seed.doi}`)
    const labels = result.groups.map((g) => g.label)
    if (labels.length > 1 || labels[0] !== RELATED_GROUP) {
      const named = labels.filter((l) => l !== OTHER_GROUP)
      expect(named.length).toBeGreaterThan(0)
      // a name is made of words the group's own titles use
      for (const group of result.groups.filter(
        (g) => g.label !== OTHER_GROUP
      )) {
        const word = group.label.split(" ")[0].toLowerCase()
        expect(
          group.papers.filter((p) => p.title.toLowerCase().includes(word))
            .length
        ).toBeGreaterThanOrEqual(Math.ceil(group.papers.length / 2))
      }
    }
  })

  it("the most similar papers are the seed's own subtopic", async () => {
    const result = await analyze(`DOI:${world.seed.doi}`)
    const papers = result.groups
      .flatMap((g) => g.papers)
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    const top = papers.slice(0, 6).map((p) => world.byId.get(p.paperId).topic)
    expect(top.every((t: number) => t === 0)).toBe(true)
  })

  it("a topic search returns papers without a similarity to any open paper", async () => {
    const result = await analyze("QUERY:social media body image")
    const papers = result.groups.flatMap((g) => g.papers)
    expect(papers.length).toBeGreaterThan(8)
    expect(papers.every((p) => p.similarity === null)).toBe(true)
  })

  it("explores any paper of the world, not only the seed", async () => {
    const other = world.papers[10]
    const result = await analyze(other.paperId)
    expect(result.groups.flatMap((g) => g.papers).length).toBeGreaterThan(5)
  })
})
