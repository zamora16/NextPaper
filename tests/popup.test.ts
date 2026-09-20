// @vitest-environment jsdom
import { createElement } from "react"
import { act } from "react-dom/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SETTINGS_KEY } from "~lib/settings"

import IndexPopup from "../popup"
import { installChrome, type FakeChrome } from "./helpers/chrome"
import { mountBench } from "./helpers/dom"

// The cache is compressed with browser streams that jsdom does not provide;
// its own behavior is covered in cache.test.ts.
vi.mock("~lib/cache", () => ({
  getCachedResult: vi.fn(async () => null)
}))

let chrome: FakeChrome
let bench: ReturnType<typeof mountBench>

const settle = () => act(async () => {})

const open = async (settings: Record<string, unknown> | null) => {
  if (settings) chrome.data.set(SETTINGS_KEY, settings)
  history.replaceState({}, "", "/popup.html?ref=DOI:10.1/x")
  // The popup builds its own provider from the stored language.
  await act(async () => {
    const { createRoot } = await import("react-dom/client")
    createRoot(bench.container).render(createElement(IndexPopup))
  })
  await settle()
}

beforeEach(() => {
  // jsdom has no layout, so it lacks scrolling
  Element.prototype.scrollTo = () => {}
  chrome = installChrome()
  bench = mountBench("en")
})
afterEach(async () => {
  await bench.unmount()
})

const tabs = () =>
  [...bench.container.querySelectorAll('[role="tab"]')] as HTMLElement[]
const selected = () =>
  tabs().find((tab) => tab.getAttribute("aria-selected") === "true")

describe("the popup", () => {
  it("shows the setup and nothing else on first run", async () => {
    await open({ setupDone: false, s2ApiKey: null, language: "en" })
    expect(bench.text()).toContain("Welcome to NextPaper")
    expect(tabs()).toHaveLength(0)
    // and asks the worker for nothing behind it
    expect(chrome.messages).toEqual([])
  })

  it("has three tabs, starting on the related papers", async () => {
    await open({ setupDone: true, s2ApiKey: null, language: "en" })
    expect(tabs().map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual([
      "Related",
      "Saved",
      "Updates"
    ])
    expect(selected()?.textContent).toContain("Related")
    expect(chrome.messages).toContainEqual(
      expect.objectContaining({ type: "analyze", ref: "DOI:10.1/x" })
    )
  })

  it("speaks the language of the settings", async () => {
    await open({ setupDone: true, s2ApiKey: null, language: "es" })
    expect(tabs()[0].textContent).toContain("Relacionados")
    expect(tabs()[1].textContent).toContain("Guardados")
    expect(tabs()[2].textContent).toContain("Novedades")
  })

  it("changes tab on click and counts the saved papers", async () => {
    chrome.data.set("nextpaper_library", {
      a: {
        paperId: "a",
        title: "Saved A",
        authors: [],
        year: 2020,
        citationCount: 1,
        venue: "",
        url: "https://example.org/a",
        savedAt: 1,
        status: "unread",
        note: "",
        collections: []
      }
    })
    await open({ setupDone: true, s2ApiKey: null, language: "en" })
    expect(tabs()[1].textContent).toContain("1")
    await act(async () => tabs()[1].click())
    expect(selected()?.textContent).toContain("Saved")
    expect(bench.text()).toContain("Saved A")
  })

  it("moves between the tabs with the arrow keys, wrapping around", async () => {
    await open({ setupDone: true, s2ApiKey: null, language: "en" })
    const press = (key: string) =>
      act(async () => {
        selected()!.dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true })
        )
      })
    await press("ArrowRight")
    expect(selected()?.textContent).toContain("Saved")
    await press("ArrowRight")
    expect(selected()?.textContent).toContain("Updates")
    await press("ArrowRight")
    expect(selected()?.textContent).toContain("Related")
    await press("ArrowLeft")
    expect(selected()?.textContent).toContain("Updates")
    // only the selected tab is in the tab order
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, 0])
  })

  it("opens the settings in place of the tabs, and closes them", async () => {
    await open({ setupDone: true, s2ApiKey: null, language: "en" })
    await act(async () => bench.button("Settings")!.click())
    expect(bench.text()).toContain("Semantic Scholar key")
    expect(tabs()).toHaveLength(0)

    await act(async () => bench.button("Close")!.click())
    expect(tabs()).toHaveLength(3)
  })

  it("marks the updates as seen when their tab is opened", async () => {
    const paper = (id: string) => ({
      paperId: id,
      title: `Fresh ${id}`,
      authors: [],
      year: 2025,
      citationCount: 0,
      venue: "",
      url: "https://example.org/" + id
    })
    chrome.data.set("nextpaper_library", {
      s: {
        ...paper("s"),
        savedAt: 1,
        status: "unread",
        note: "",
        collections: []
      }
    })
    chrome.data.set("nextpaper_updates", {
      running: false,
      checkedAt: Date.now(),
      lastError: null,
      seen: ["n1"],
      items: [
        { paper: paper("n1"), because: "Saved S", foundAt: 1, viewed: false }
      ]
    })
    await open({ setupDone: true, s2ApiKey: null, language: "en" })
    expect(tabs()[2].textContent).toContain("1") // the unseen badge

    await act(async () => tabs()[2].click())
    await settle()
    const stored = chrome.data.get("nextpaper_updates") as {
      items: { viewed: boolean }[]
    }
    expect(stored.items[0].viewed).toBe(true)
    expect(chrome.badge.text).toBe("")
  })
})
