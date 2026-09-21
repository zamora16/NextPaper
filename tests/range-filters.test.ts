// @vitest-environment jsdom
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseYear, RangeFilters } from "~components/RangeFilters"
import { DEFAULT_VIEW, RelatedTab } from "~components/RelatedTab"
import type { AnalysisResult, ScoredPaper } from "~lib/pipeline"
import { lastYears, NO_RANGE, type Range } from "~lib/view"

import { installChrome } from "./helpers/chrome"
import { mountBench } from "./helpers/dom"

vi.mock("~lib/semantic-scholar", () => ({
  getCitationContexts: vi.fn()
}))

let bench: ReturnType<typeof mountBench>
beforeEach(() => {
  installChrome()
  bench = mountBench("en")
})
afterEach(async () => {
  await bench.unmount()
})

describe("parseYear", () => {
  it("reads a four-digit year, an empty box, and a year still being typed", () => {
    expect(parseYear("2019")).toBe(2019)
    expect(parseYear(" 2019 ")).toBe(2019)
    expect(parseYear("")).toBeNull()
    expect(parseYear("   ")).toBeNull()
    expect(parseYear("20")).toBeUndefined()
    expect(parseYear("20190")).toBeUndefined()
    expect(parseYear("abcd")).toBeUndefined()
  })
})

const yearInputs = () =>
  [...bench.container.querySelectorAll("input")] as HTMLInputElement[]

const mountFilters = async (range: Range, onChange = vi.fn()) => {
  await bench.render(createElement(RangeFilters, { range, onChange }))
  return onChange
}

describe("RangeFilters", () => {
  it("applies a year only once it is complete", async () => {
    const onChange = await mountFilters(NO_RANGE)
    await bench.type("input[aria-label='From']", "20")
    expect(onChange).not.toHaveBeenCalled()
    expect(yearInputs()[0].getAttribute("aria-invalid")).toBe("true")

    await bench.type("input[aria-label='From']", "2019")
    expect(onChange).toHaveBeenLastCalledWith({ yearFrom: 2019 })
    await bench.type("input[aria-label='To']", "2023")
    expect(onChange).toHaveBeenLastCalledWith({ yearTo: 2023 })
  })

  it("removes a bound when its box is emptied", async () => {
    const onChange = await mountFilters({ ...NO_RANGE, yearFrom: 2019 })
    expect(yearInputs()[0].value).toBe("2019")
    await bench.type("input[aria-label='From']", "")
    expect(onChange).toHaveBeenLastCalledWith({ yearFrom: null })
  })

  it("has presets for the last 5 and 10 years, and marks the active one", async () => {
    const onChange = await mountFilters(NO_RANGE)
    await bench.click("Last 5 years")
    expect(onChange).toHaveBeenLastCalledWith(lastYears(5))
    await bench.click("Last 10 years")
    expect(onChange).toHaveBeenLastCalledWith(lastYears(10))

    await mountFilters({ ...NO_RANGE, ...lastYears(5) })
    expect(bench.button("Last 5 years")!.getAttribute("aria-pressed")).toBe(
      "true"
    )
    expect(bench.button("Last 10 years")!.getAttribute("aria-pressed")).toBe(
      "false"
    )
    // the boxes follow the preset
    expect(yearInputs()[0].value).toBe(String(lastYears(5).yearFrom))
  })

  it("sets a minimum number of citations", async () => {
    const onChange = await mountFilters(NO_RANGE)
    const select = bench.container.querySelector("select")!
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Any",
      "10+",
      "50+",
      "100+",
      "500+"
    ])
    await bench.select(select, "100")
    expect(onChange).toHaveBeenLastCalledWith({ minCitations: 100 })
  })

  it("explains what happens to papers with no year, only while a year is set", async () => {
    await mountFilters({ ...NO_RANGE, minCitations: 10 })
    expect(bench.text()).not.toContain("Papers without a year")
    await mountFilters({ ...NO_RANGE, yearTo: 2020 })
    expect(bench.text()).toContain("Papers without a year are left out")
  })

  it("offers to clear the filters only when some are on", async () => {
    await mountFilters(NO_RANGE)
    expect(bench.button("Clear filters")).toBeUndefined()

    const onChange = await mountFilters({
      yearFrom: 2010,
      yearTo: 2020,
      minCitations: 50
    })
    await bench.click("Clear filters")
    expect(onChange).toHaveBeenCalledWith({
      yearFrom: null,
      yearTo: null,
      minCitations: 0
    })
  })
})

const paper = (id: string, year: number | null, citations: number) =>
  ({
    paperId: id,
    title: `Title ${id}`,
    authors: [],
    year,
    citationCount: citations,
    venue: "",
    url: "https://example.org/" + id,
    similarity: 0.9,
    approximate: false,
    relation: null
  }) as ScoredPaper

const result: AnalysisResult = {
  groups: [
    {
      label: "@related",
      papers: [
        paper("old", 2005, 900),
        paper("mid", 2016, 40),
        paper("new", 2025, 2),
        paper("nodate", null, 300)
      ]
    }
  ],
  picks: [{ kind: "foundational", paper: paper("old", 2005, 900) }]
}

const tab = (view: Partial<typeof DEFAULT_VIEW>, onView = vi.fn()) =>
  createElement(RelatedTab, {
    pageRef: "DOI:10.1/x",
    current: null,
    job: { phase: "done" },
    result,
    hasKey: true,
    view: { ...DEFAULT_VIEW, ...view },
    onView,
    citationStyle: "apa",
    onStyleChange: () => {},
    selectedId: null,
    onSelectPaper: () => {},
    onBack: () => {},
    onSearch: () => {},
    onRetry: () => {},
    onOpenSettings: () => {},
    renderCard: (p) =>
      createElement("div", { key: p.paperId, "data-card": p.paperId }, p.title)
  })

const cards = () =>
  [...bench.container.querySelectorAll("[data-card]")].map((el) =>
    el.getAttribute("data-card")
  )

describe("the filters in the related tab", () => {
  it("opens and closes the panel from a button that says so", async () => {
    const onView = vi.fn()
    await bench.render(tab({}, onView))
    expect(bench.container.querySelector("input[aria-label='From']")).toBeNull()
    await bench.click("More filters")
    expect(onView).toHaveBeenCalledWith({ moreFilters: true })

    await bench.render(tab({ moreFilters: true }))
    expect(
      bench.container.querySelector("input[aria-label='From']")
    ).toBeTruthy()
    expect(bench.button("More filters")!.getAttribute("aria-expanded")).toBe(
      "true"
    )
  })

  it("narrows the list by year and by citations, and says how many are shown", async () => {
    await bench.render(tab({ yearFrom: 2010 }))
    expect(cards()).toEqual(["mid", "new"]) // no picks, no undated paper
    expect(bench.text()).toContain("2 of 4 papers")

    await bench.render(tab({ minCitations: 100 }))
    expect(cards()).toEqual(["old", "nodate"])
  })

  it("counts the active filters on the button", async () => {
    await bench.render(tab({}))
    expect(bench.button("More filters")!.textContent).toBe("")
    await bench.render(tab({ yearFrom: 2010 }))
    expect(bench.button("More filters")!.textContent).toBe("1")
    await bench.render(tab({ yearFrom: 2010, yearTo: 2020, minCitations: 10 }))
    expect(bench.button("More filters")!.textContent).toBe("2")
  })

  it("hides 'Start here' while a filter is on and brings it back after", async () => {
    await bench.render(tab({}))
    expect(bench.text()).toContain("Start here")
    await bench.render(tab({ minCitations: 10 }))
    expect(bench.text()).not.toContain("Start here")
  })
})
