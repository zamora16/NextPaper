// @vitest-environment jsdom
import { createElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CitedBy } from "~components/CitedBy"
import {
  getCitingSentences,
  type CitingResult,
  type CitingSentence
} from "~lib/citing"

import { mountBench } from "./helpers/dom"

vi.mock("~lib/citing", () => ({ getCitingSentences: vi.fn() }))
const load = vi.mocked(getCitingSentences)

let bench: ReturnType<typeof mountBench>
beforeEach(() => {
  load.mockReset()
  bench = mountBench("en")
})
afterEach(async () => {
  await bench.unmount()
})

const sentence = (
  id: string,
  over: Partial<CitingSentence> = {}
): CitingSentence => ({
  text: `Sentence number ${id} that cites the paper (Author, 2015).`,
  paperId: id,
  title: `Citing paper ${id}`,
  year: 2024,
  venue: "J Test",
  url: `https://example.org/${id}`,
  influential: false,
  ...over
})

const result = (over: Partial<CitingResult> = {}): CitingResult => ({
  named: [],
  others: [],
  scanned: 500,
  withSentences: 120,
  ...over
})

const open = async () => {
  await bench.render(createElement(CitedBy, { paperRef: "DOI:10.1/x" }))
  await bench.click("How others cite it")
}
const shown = () => bench.container.querySelectorAll("blockquote").length

describe("CitedBy", () => {
  it("costs nothing until it is opened", async () => {
    await bench.render(createElement(CitedBy, { paperRef: "DOI:10.1/x" }))
    expect(bench.text()).toContain("How others cite it")
    expect(load).not.toHaveBeenCalled()
    expect(shown()).toBe(0)
  })

  it("asks once for the paper it is about, and not again when reopened", async () => {
    load.mockResolvedValue(result({ named: [sentence("a")] }))
    await open()
    expect(load).toHaveBeenCalledWith("DOI:10.1/x")
    await bench.click("How others cite it") // close
    await bench.click("How others cite it") // open again
    expect(load).toHaveBeenCalledTimes(1)
    expect(shown()).toBe(1)
  })

  it("shows the sentences with their source, the summary and the caveat", async () => {
    load.mockResolvedValue(
      result({ named: [sentence("a"), sentence("b", { venue: "" })] })
    )
    await open()
    const text = bench.text()
    expect(text).toContain("Sentence number a that cites the paper")
    expect(text).toContain("Citing paper a")
    expect(text).toContain("2024 · J Test")
    expect(text).toContain("Sentences found in 120 of 500 citing papers.")
    expect(text).toContain("can contain errors")
  })

  it("links the citing paper only through a safe address", async () => {
    load.mockResolvedValue(
      result({ named: [sentence("a"), sentence("b", { url: undefined })] })
    )
    await open()
    const links = [...bench.container.querySelectorAll("blockquote a")]
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.org/a"
    ])
    expect(bench.text()).toContain("Citing paper b")
  })

  it("keeps the sentences that do not name the paper out of sight until asked", async () => {
    load.mockResolvedValue(
      result({
        named: [sentence("a")],
        others: [
          sentence("o1", { text: "An unnamed sentence about something." })
        ]
      })
    )
    await open()
    expect(bench.text()).not.toContain("An unnamed sentence")
    expect(bench.text()).toContain("Show 1 that do not name the paper")

    await bench.click("Show 1 that do not name the paper")
    expect(bench.text()).toContain("An unnamed sentence")
    expect(bench.text()).toContain("may be about a neighboring reference")

    await bench.click("Hide those")
    expect(bench.text()).not.toContain("An unnamed sentence")
  })

  it("says so when no sentence names the paper, and still offers the others", async () => {
    load.mockResolvedValue(
      result({
        others: [sentence("o1", { text: "Some other sentence here." })]
      })
    )
    await open()
    expect(bench.text()).toContain("No sentence names this paper")
    expect(bench.button("Show 1 that do not name")).toBeTruthy()
  })

  it("says so when there is nothing to show", async () => {
    load.mockResolvedValue(result({ scanned: 0, withSentences: 0 }))
    await open()
    expect(bench.text()).toContain("has no citing sentences")
    expect(bench.button("Influential only")).toBeUndefined()
  })

  it("pages through long lists", async () => {
    const many = Array.from({ length: 22 }, (_, i) => sentence(`p${i}`))
    load.mockResolvedValue(result({ named: many }))
    await open()
    expect(shown()).toBe(5)
    await bench.click("Show 10 more")
    expect(shown()).toBe(15)
    await bench.click("Show 7 more")
    expect(shown()).toBe(22)
    expect(bench.button("more")).toBeUndefined()
  })

  it("can narrow to the influential citations", async () => {
    load.mockResolvedValue(
      result({
        named: [
          sentence("a", { influential: true }),
          sentence("b"),
          sentence("c")
        ]
      })
    )
    await open()
    expect(shown()).toBe(3)
    await bench.click("Influential only")
    expect(shown()).toBe(1)
    expect(bench.text()).toContain("Citing paper a")
    await bench.click("Influential only")
    expect(shown()).toBe(3)
  })

  it("offers no influential filter when none is", async () => {
    load.mockResolvedValue(result({ named: [sentence("a")] }))
    await open()
    expect(bench.button("Influential only")).toBeUndefined()
  })

  it("lets the user retry after a failure", async () => {
    load.mockResolvedValueOnce(null)
    await open()
    expect(bench.text()).toContain("could not be loaded")

    load.mockResolvedValue(result({ named: [sentence("a")] }))
    await bench.click("Retry")
    expect(shown()).toBe(1)
    expect(bench.text()).not.toContain("could not be loaded")
  })

  it("treats a thrown error like a failure", async () => {
    load.mockRejectedValueOnce(new Error("boom"))
    await open()
    expect(bench.text()).toContain("could not be loaded")
  })

  it("explains itself with an info icon", async () => {
    await bench.render(createElement(CitedBy, { paperRef: "R" }))
    const hint = bench.container.querySelector('[role="img"]')!
    expect(hint.getAttribute("aria-label")).toContain(
      "Only sentences that name this paper"
    )
  })
})
