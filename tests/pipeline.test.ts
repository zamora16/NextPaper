import { describe, expect, it } from "vitest"

import {
  assemble,
  choosePicks,
  dedupe,
  makeStrip,
  normalizeTitle,
  OTHER_GROUP,
  RELATED_GROUP
} from "~lib/pipeline"
import type { CandidateSource, PaperWithEmbedding } from "~lib/semantic-scholar"

const YEAR = new Date().getFullYear()
const DIM = 48

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5
}

function paper(
  id: string,
  over: Partial<PaperWithEmbedding> = {}
): PaperWithEmbedding {
  return {
    paperId: id,
    title: `Paper ${id}`,
    authors: [{ authorId: "1", name: "Ada Lovelace" }],
    year: YEAR - 5,
    citationCount: 10,
    venue: "",
    url: `https://example.org/${id}`,
    embedding: null,
    ...over
  }
}

describe("normalizeTitle", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeTitle("  Hello,  WORLD: a test. ")).toBe(
      "hello world a test"
    )
    expect(normalizeTitle("Ünïcode Títle")).toBe("ünïcode títle")
  })
})

describe("dedupe", () => {
  it("keeps the most cited version and merges how each was found", () => {
    const preprint = paper("pre", {
      title: "Deep Things: A Study",
      citationCount: 3
    })
    const published = paper("pub", {
      title: "deep things - a study.",
      citationCount: 40
    })
    const other = paper("other", { title: "Something else" })
    const sources = new Map<string, Set<CandidateSource>>([
      ["pre", new Set<CandidateSource>(["reference"])],
      ["pub", new Set<CandidateSource>(["search"])],
      ["other", new Set<CandidateSource>(["citation"])]
    ])

    const result = dedupe([preprint, published, other], sources)

    expect(result.map((p) => p.paperId).sort()).toEqual(["other", "pub"])
    expect([...sources.get("pub")!].sort()).toEqual(["reference", "search"])
  })

  it("is a no-op when every title is distinct", () => {
    const list = [paper("a"), paper("b"), paper("c")]
    expect(dedupe(list, new Map())).toHaveLength(3)
  })
})

// Three topics as axis-aligned blobs; within a topic the score decreases.
function topicEntries(
  perTopic: number,
  titleOf = (topic: number, i: number) =>
    `${["Alpha", "Bravo", "Charlie"][topic]} topic paper ${i}`
) {
  const random = rng(3)
  const entries = []
  const sources = new Map<string, Set<CandidateSource>>()
  for (let topic = 0; topic < 3; topic++) {
    for (let i = 0; i < perTopic; i++) {
      const id = `t${topic}-${i}`
      const embedding = Array.from(
        { length: DIM },
        (_, d) => (d % 3 === topic ? 1 : 0) + random() * 0.2
      )
      const p = paper(id, {
        embedding,
        title: titleOf(topic, i),
        citationCount: 5 + i
      })
      sources.set(id, new Set<CandidateSource>(["search"]))
      entries.push({
        paper: p as PaperWithEmbedding & { embedding: number[] },
        sources: sources.get(id)!,
        score: 0.95 - topic * 0.01 - i * 0.001
      })
    }
  }
  return { entries, sources }
}

describe("assemble", () => {
  const options = { topN: 18, maxClusters: 4 }

  it("groups the top papers by topic and strips the vectors", () => {
    const { entries, sources } = topicEntries(6)
    const result = assemble(entries, makeStrip(sources), options)

    expect(result.groups).toHaveLength(3)
    expect(result.groups.map((g) => g.papers.length)).toEqual([6, 6, 6])
    for (const group of result.groups) {
      // every group holds a single topic
      expect(new Set(group.papers.map((p) => p.title.split(" ")[0])).size).toBe(
        1
      )
    }
    const all = result.groups.flatMap((g) => g.papers)
    expect(new Set(all.map((p) => p.paperId)).size).toBe(18)
    expect(all.every((p) => !("embedding" in p))).toBe(true)
    expect(all.every((p) => !("similarity" in p))).toBe(true)
  })

  it("respects topN and returns a single group for a handful of papers", () => {
    const { entries, sources } = topicEntries(6)
    const capped = assemble(entries, makeStrip(sources), {
      topN: 9,
      maxClusters: 4
    })
    expect(capped.groups.flatMap((g) => g.papers)).toHaveLength(9)

    const few = assemble(entries.slice(0, 3), makeStrip(sources), options)
    expect(few.groups).toHaveLength(1)
    expect(few.groups[0].label).toBe(RELATED_GROUP)
  })
})

describe("naming the groups", () => {
  it("names each group with the words its titles share", () => {
    const { entries, sources } = topicEntries(6)
    const result = assemble(entries, makeStrip(sources), {
      topN: 18,
      maxClusters: 4
    })
    const labels = result.groups.map((g) => g.label)
    expect(labels).toHaveLength(3)
    expect(labels.some((l) => /alpha/i.test(l))).toBe(true)
    expect(labels.some((l) => /bravo/i.test(l))).toBe(true)
    expect(labels.some((l) => /charlie/i.test(l))).toBe(true)
    // the words come from the group's own titles
    for (const group of result.groups) {
      const word = group.label.split(" ")[0].toLowerCase()
      expect(
        group.papers.every((p) => p.title.toLowerCase().includes(word))
      ).toBe(true)
    }
  })

  // Titles nothing is shared by: no honest name exists for that group.
  const first = ["volcano", "harbor", "tundra", "saffron", "quartz", "marble"]
  const second = ["falcon", "glacier", "lantern", "orchid", "pebble", "thistle"]
  const unique = (topic: number, i: number) =>
    `${first[(i + topic) % 6]} ${second[(i * 5 + topic * 2) % 6]}`

  it('puts the papers of a group with no honest name under "other", last', () => {
    const { entries, sources } = topicEntries(6, (topic, i) =>
      topic === 2
        ? unique(topic, i)
        : `${["Alpha", "Bravo"][topic]} topic paper ${i}`
    )
    const result = assemble(entries, makeStrip(sources), {
      topN: 18,
      maxClusters: 4
    })
    const labels = result.groups.map((g) => g.label)
    expect(labels).toHaveLength(3)
    expect(labels[2]).toBe(OTHER_GROUP)
    expect(
      result.groups[2].papers.every((p) => p.paperId.startsWith("t2-"))
    ).toBe(true)
    expect(labels.slice(0, 2).every((l) => /alpha|bravo/i.test(l))).toBe(true)
  })

  it("shows one plain list when no group can be named, instead of made-up groups", () => {
    const { entries, sources } = topicEntries(6, unique)
    const result = assemble(entries, makeStrip(sources), {
      topN: 18,
      maxClusters: 4
    })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].label).toBe(RELATED_GROUP)
    expect(result.groups[0].papers).toHaveLength(18)
  })
})

describe("choosePicks", () => {
  const entry = (
    id: string,
    over: Partial<PaperWithEmbedding>,
    sources: CandidateSource[] = ["search"]
  ) => ({
    paper: paper(id, { embedding: [1], ...over }) as PaperWithEmbedding & {
      embedding: number[]
    },
    sources: new Set<CandidateSource>(sources),
    score: 0.9
  })
  const toScored = (e: ReturnType<typeof entry>) =>
    ({
      ...e.paper,
      similarity: e.score,
      approximate: false,
      relation: null
    }) as never

  it("picks a classic, a review and the latest work — all different", () => {
    const shortlist = [
      entry("classic", { year: YEAR - 15, citationCount: 900 }, ["reference"]),
      entry("minorOld", { year: YEAR - 12, citationCount: 20 }, ["reference"]),
      entry("review", {
        year: YEAR - 4,
        title: "A systematic review of things",
        citationCount: 60
      }),
      entry("fresh", { year: YEAR, citationCount: 1 })
    ]

    const picks = choosePicks(shortlist, toScored)

    expect(picks.map((p) => [p.kind, p.paper.paperId])).toEqual([
      ["foundational", "classic"],
      ["review", "review"],
      ["recent", "fresh"]
    ])
  })

  it("prefers prior work the paper cites for the classic", () => {
    const shortlist = [
      entry("citedByOthers", { year: YEAR - 10, citationCount: 5000 }, [
        "citation"
      ]),
      entry("prior", { year: YEAR - 10, citationCount: 100 }, ["reference"])
    ]
    expect(choosePicks(shortlist, toScored)[0].paper.paperId).toBe("prior")
  })

  it("never repeats a paper and skips picks it cannot fill", () => {
    const only = [
      entry("solo", { year: YEAR, title: "A meta-analysis", citationCount: 5 })
    ]
    const picks = choosePicks(only, toScored)
    expect(picks).toHaveLength(1)
    expect(picks[0].kind).toBe("review")
  })
})
