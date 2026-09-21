// @vitest-environment jsdom
import { createElement, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PaperCard, type RenderCard } from "~components/PaperCard"
import { DEFAULT_VIEW, RelatedTab } from "~components/RelatedTab"
import { SavedTab } from "~components/SavedTab"
import { UpdatesTab } from "~components/UpdatesTab"
import type { JobState } from "~lib/job"
import { updateSaved, type SavedPaper } from "~lib/library"
import type { AnalysisResult, ScoredPaper } from "~lib/pipeline"
import { getUpdates, UPDATES_KEY, type UpdatesState } from "~lib/updates"

import { installChrome, type FakeChrome } from "./helpers/chrome"
import { mountBench } from "./helpers/dom"

vi.mock("~lib/semantic-scholar", () => ({
  getRecommendedIds: vi.fn(),
  getPapers: vi.fn()
}))

let chrome: FakeChrome
let bench: ReturnType<typeof mountBench>

beforeEach(() => {
  chrome = installChrome()
  bench = mountBench("en")
})
afterEach(async () => {
  await bench.unmount()
})

const paper = (over: Partial<ScoredPaper> = {}): ScoredPaper => ({
  paperId: "p1",
  title: "Attention in neural models",
  authors: [
    { authorId: "1", name: "Ada Lovelace" },
    { authorId: "2", name: "Alan Turing" }
  ],
  year: 2020,
  citationCount: 1234,
  venue: "J Test",
  url: "https://example.org/p1",
  abstract: "We study attention.",
  tldr: { text: "Attention is studied." },
  openAccessPdf: { url: "https://example.org/p1.pdf" },
  similarity: 0.87,
  approximate: false,
  relation: null,
  ...over
})

const card = (
  p: ScoredPaper,
  props: Partial<Parameters<typeof PaperCard>[0]> = {}
) =>
  createElement(PaperCard, {
    paper: p,
    citationStyle: "apa",
    saved: false,
    onToggleSave: () => {},
    ...props
  })

describe("PaperCard", () => {
  it("shows the similarity, the citations and the tl;dr", async () => {
    await bench.render(card(paper()))
    const text = bench.text()
    expect(text).toContain("87% similar")
    expect(text).toContain("1234 citations")
    expect(text).toContain("Attention is studied.")
    expect(text).toContain("Ada Lovelace, Alan Turing")
  })

  it("says nothing about similarity when there is none (saved papers)", async () => {
    await bench.render(card(paper({ similarity: null })))
    expect(bench.text()).not.toContain("similar")
  })

  it("the compact form keeps the essentials and drops the rest", async () => {
    await bench.render(card(paper(), { compact: true, onExplore: () => {} }))
    const text = bench.text()
    expect(text).toContain("Attention in neural models")
    expect(text).toContain("Explore")
    expect(text).not.toContain("Attention is studied.")
    expect(bench.button("Cite")).toBeUndefined()
    expect(text).not.toContain("Free PDF")
  })

  it("the save button reports its state and toggles", async () => {
    const onToggleSave = vi.fn()
    await bench.render(card(paper(), { onToggleSave }))
    const save = bench.container.querySelector("[data-save]")!
    expect(save.getAttribute("aria-pressed")).toBe("false")
    await bench.click("Save to read later")
    expect(onToggleSave).toHaveBeenCalledTimes(1)

    await bench.render(card(paper(), { saved: true, onToggleSave }))
    expect(
      bench.container.querySelector("[data-save]")!.getAttribute("aria-pressed")
    ).toBe("true")
  })

  it("never links to a non-http address", async () => {
    await bench.render(
      card(
        paper({
          url: "javascript:alert(1)",
          openAccessPdf: { url: "javascript:alert(2)" }
        })
      )
    )
    const links = [...bench.container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    )
    expect(links.filter((href) => /^javascript:/i.test(href ?? ""))).toEqual([])
  })

  it("puts the extra content (the library's controls) inside the card", async () => {
    await bench.render(
      card(paper(), { footer: createElement("p", null, "my controls") })
    )
    expect(bench.container.querySelector("article")!.textContent).toContain(
      "my controls"
    )
  })
})

const renderCard: RenderCard = (p, extra) =>
  createElement(
    "div",
    { key: p.paperId, "data-card": p.paperId },
    extra?.badge as ReactNode,
    p.title,
    extra?.footer as ReactNode
  )

const result = (over: Partial<AnalysisResult> = {}): AnalysisResult => ({
  groups: [{ label: "@related", papers: [paper(), paper({ paperId: "p2" })] }],
  picks: [],
  ...over
})

const relatedProps = (
  over: Partial<Parameters<typeof RelatedTab>[0]> = {}
): Parameters<typeof RelatedTab>[0] => ({
  pageRef: "DOI:10.1/x",
  current: null,
  job: { phase: "done" } as JobState,
  result: result(),
  hasKey: true,
  view: DEFAULT_VIEW,
  onView: () => {},
  citationStyle: "apa",
  onStyleChange: () => {},
  selectedId: null,
  onSelectPaper: () => {},
  onBack: () => {},
  onSearch: () => {},
  onRetry: () => {},
  onOpenSettings: () => {},
  renderCard,
  ...over
})

describe("RelatedTab", () => {
  it("names the open paper by its title, authors and year", async () => {
    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({
          result: result({
            seedTitle: "Deep learning for reading",
            seedByline: "A. Author, B. Author +2",
            seedYear: 2024
          })
        })
      )
    )
    expect(bench.text()).toContain("Deep learning for reading")
    expect(bench.text()).toContain("A. Author, B. Author +2 · 2024")
    expect(bench.text()).not.toContain("DOI:10.1/x")
  })

  it("shows the reference until the analysis says which paper it is", async () => {
    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({
          result: null,
          job: { phase: "loading", step: { code: "reading" } }
        })
      )
    )
    expect(bench.text()).toContain("DOI:10.1/x")
    expect(bench.text()).toContain("Reading the paper...")
    expect(bench.text()).toContain("Runs in the background")
  })

  it("explores with a way back", async () => {
    const onBack = vi.fn()
    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({
          current: { ref: "abc", label: "The explored paper" },
          onBack
        })
      )
    )
    expect(bench.text()).toContain("Exploring")
    expect(bench.text()).toContain("The explored paper")
    await bench.click("← Back")
    expect(onBack).toHaveBeenCalled()
  })

  it("labels a topic search as a topic", async () => {
    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({
          current: { ref: "QUERY:body image", label: "body image" }
        })
      )
    )
    expect(bench.text()).toContain("Topic")
  })

  it("offers to add a key when a failure may come from having none", async () => {
    const onOpenSettings = vi.fn()
    const props = relatedProps({
      result: null,
      job: { phase: "error", error: "rate_limited" },
      hasKey: false,
      onOpenSettings
    })
    await bench.render(createElement(RelatedTab, props))
    expect(bench.text()).toContain("Semantic Scholar is limiting requests")
    await bench.click("Add yours in Settings")
    expect(onOpenSettings).toHaveBeenCalled()

    await bench.render(createElement(RelatedTab, { ...props, hasKey: true }))
    expect(bench.button("Add yours in Settings")).toBeUndefined()
    expect(bench.button("Retry")).toBeTruthy()
  })

  it("survives a job stored without an error code", async () => {
    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({ result: null, job: { phase: "error" } as any })
      )
    )
    expect(bench.text()).toContain("Something went wrong")
  })

  it("explains an open page without a paper", async () => {
    await bench.render(
      createElement(RelatedTab, relatedProps({ pageRef: null, result: null }))
    )
    expect(bench.text()).toContain("No paper was detected")
  })

  it("searches a topic only from three letters, and empties the box", async () => {
    const onSearch = vi.fn()
    await bench.render(createElement(RelatedTab, relatedProps({ onSearch })))
    await bench.type("input[type=search]", "ab")
    const go = bench.button("Search") as HTMLButtonElement
    expect(go.disabled).toBe(true)

    await bench.type("input[type=search]", "  body   image ")
    expect((bench.button("Search") as HTMLButtonElement).disabled).toBe(false)
    await bench.click("Search")
    expect(onSearch).toHaveBeenCalledWith("body image")
    expect(
      (bench.container.querySelector("input[type=search]") as HTMLInputElement)
        .value
    ).toBe("")
  })

  it("puts 'Start here' first only with the default view", async () => {
    const pick = paper({ paperId: "pick", title: "The classic" })
    const withPicks = result({
      picks: [{ kind: "foundational", paper: pick }]
    })
    await bench.render(
      createElement(RelatedTab, relatedProps({ result: withPicks }))
    )
    expect(bench.text()).toContain("Start here")
    expect(bench.text()).toContain("A classic to start with")

    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({
          result: withPicks,
          view: { ...DEFAULT_VIEW, sort: "citations" }
        })
      )
    )
    expect(bench.text()).not.toContain("Start here")
  })

  it("explains the timeline with an info icon", async () => {
    const dated = ["a", "b", "c", "d", "e"].map((id, i) =>
      paper({
        paperId: id,
        year: 2015 + i,
        title: `A ${["randomized controlled trial", "cohort study"][i % 2]} ${id}`
      })
    )
    await bench.render(
      createElement(
        RelatedTab,
        relatedProps({
          result: result({ groups: [{ label: "@related", papers: dated }] })
        })
      )
    )
    const hints = [...bench.container.querySelectorAll('[role="img"]')].map(
      (el) => el.getAttribute("aria-label") ?? ""
    )
    expect(hints.some((h) => h.startsWith("A chart with one row"))).toBe(true)
    expect(bench.button("Timeline")).toBeTruthy()
  })

  it("lists every paper, with the count", async () => {
    await bench.render(createElement(RelatedTab, relatedProps()))
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(2)
    expect(bench.text()).toContain("2 papers")
  })
})

const savedPaper = (id: string, over: Partial<SavedPaper> = {}): SavedPaper =>
  ({
    ...paper({ paperId: id, title: `Title ${id}`, similarity: null }),
    savedAt: 1,
    status: "unread",
    note: "",
    collections: [],
    ...over
  }) as SavedPaper

describe("SavedTab", () => {
  const tab = (library: SavedPaper[]) =>
    createElement(SavedTab, {
      library,
      citationStyle: "apa",
      onStyleChange: () => {},
      renderCard
    })

  it("welcomes an empty library with the import controls", async () => {
    await bench.render(tab([]))
    expect(bench.text()).toContain("You have not saved anything yet")
    expect(bench.button("Import")).toBeTruthy()
  })

  it("filters as you type, over titles, notes and collections", async () => {
    const library = [
      savedPaper("a", { title: "Alpha waves", note: "read for chapter two" }),
      savedPaper("b", { title: "Beta waves", collections: ["Thesis"] })
    ]
    await bench.render(tab(library))
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(2)

    await bench.type("input[type=search]", "chapter")
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(1)
    expect(bench.text()).toContain("Alpha waves")

    await bench.type("input[type=search]", "thesis waves")
    expect(bench.text()).toContain("Beta waves")

    await bench.type("input[type=search]", "nothing like this")
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(0)
    expect(bench.text()).toContain("No saved paper matches")
  })

  it("filters by reading status", async () => {
    const library = [
      savedPaper("a", { status: "read" }),
      savedPaper("b", { status: "unread" })
    ]
    await bench.render(tab(library))
    await bench.click(/^Read \d/)
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(1)
    expect(bench.text()).toContain("Title a")
    expect(bench.text()).not.toContain("Title b")
  })

  it("puts the library's controls inside each card", async () => {
    await bench.render(tab([savedPaper("a")]))
    expect(bench.text()).toContain("Add note")
    expect(
      [...bench.container.querySelectorAll("input")].some(
        (input) => input.placeholder === "+ collection"
      )
    ).toBe(true)
  })

  it("keeps the status buttons working", async () => {
    chrome.data.set("nextpaper_library", { a: savedPaper("a") })
    await updateSaved("a", { status: "reading" })
    const stored = chrome.data.get("nextpaper_library") as Record<
      string,
      SavedPaper
    >
    expect(stored.a.status).toBe("reading")
  })
})

describe("UpdatesTab", () => {
  const state = (over: Partial<UpdatesState> = {}): UpdatesState => ({
    running: false,
    checkedAt: Date.now() - 3600e3,
    lastError: null,
    seen: ["n1", "n2"],
    items: [1, 2].map((n) => ({
      paper: paper({ paperId: `n${n}`, title: `Fresh ${n}` }),
      because: "Something saved",
      foundAt: 1,
      viewed: false
    })),
    ...over
  })

  const tab = (updates: UpdatesState | null, hasSaved = true) =>
    createElement(UpdatesTab, {
      updates,
      hasSaved,
      savedIds: new Set<string>(),
      newIds: new Set<string>(["n1"]),
      renderCard
    })

  it("asks to save something first when the library is empty", async () => {
    await bench.render(tab(null, false))
    expect(bench.text()).toContain("Save some papers")
    expect((bench.button("Check now") as HTMLButtonElement).disabled).toBe(true)
  })

  it("lists the updates with the reason and tags the new ones", async () => {
    await bench.render(tab(state()))
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(2)
    expect(bench.text()).toContain("Because you saved: Something saved")
    expect(bench.container.querySelectorAll("strong").length).toBe(1)
  })

  it("does not list a paper the user already saved", async () => {
    await bench.render(
      createElement(UpdatesTab, {
        updates: state(),
        hasSaved: true,
        savedIds: new Set(["n1"]),
        newIds: new Set<string>(),
        renderCard
      })
    )
    expect(bench.container.querySelectorAll("[data-card]").length).toBe(1)
  })

  it("clears the whole list on request and keeps what was shown", async () => {
    chrome.data.set(UPDATES_KEY, state())
    await bench.render(tab(state()))
    await bench.click("Clear all")
    const after = await getUpdates()
    expect(after.items).toEqual([])
    expect(after.seen).toEqual(["n1", "n2"])
  })

  it("offers no clearing when there is nothing to clear", async () => {
    await bench.render(tab(state({ items: [] })))
    expect(bench.button("Clear all")).toBeUndefined()
    expect(bench.text()).toContain("Nothing new for now")
  })

  it("says why a check failed", async () => {
    await bench.render(tab(state({ lastError: "rate_limited" })))
    expect(bench.text()).toContain("Semantic Scholar is limiting requests")
  })
})
