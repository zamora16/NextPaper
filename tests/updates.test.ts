import { beforeEach, describe, expect, it, vi } from "vitest"

import { LIBRARY_KEY } from "~lib/library"
import { getPapers, getRecommendedIds } from "~lib/semantic-scholar"
import {
  checkForUpdates,
  clearUpdates,
  dismissUpdate,
  getUpdates,
  markUpdatesViewed,
  UPDATES_KEY,
  type UpdateItem
} from "~lib/updates"

import { installChrome, type FakeChrome } from "./helpers/chrome"

vi.mock("~lib/semantic-scholar", () => ({
  getRecommendedIds: vi.fn(),
  getPapers: vi.fn()
}))

const recommended = vi.mocked(getRecommendedIds)
const metadata = vi.mocked(getPapers)

let chrome: FakeChrome

const saved = (id: string, savedAt: number) => ({
  paperId: id,
  title: `Saved ${id}`,
  authors: [],
  year: 2020,
  citationCount: 1,
  venue: "",
  url: "https://example.org/" + id,
  savedAt,
  status: "unread",
  note: "",
  collections: []
})

const paperOf = (id: string) => ({
  paperId: id,
  title: `Fresh ${id}`,
  authors: [],
  year: 2025,
  citationCount: 0,
  venue: "",
  url: "https://example.org/" + id,
  embedding: null
})

const library = (...ids: string[]) =>
  chrome.data.set(
    LIBRARY_KEY,
    Object.fromEntries(ids.map((id, i) => [id, saved(id, 100 - i)]))
  )

// Fresh papers found for each saved paper, by its id.
function recommend(map: Record<string, string[] | null>) {
  recommended.mockImplementation(async (id) => map[id] ?? [])
  metadata.mockImplementation(async (ids) => ids.map(paperOf) as any)
}

beforeEach(() => {
  chrome = installChrome()
  recommended.mockReset()
  metadata.mockReset()
})

describe("checkForUpdates", () => {
  it("surfaces fresh papers related to what was saved, and says why", async () => {
    library("s1")
    recommend({ s1: ["n1", "n2"] })
    await checkForUpdates()

    const state = await getUpdates()
    expect(state.items.map((i) => i.paper.paperId)).toEqual(["n1", "n2"])
    expect(state.items[0]).toMatchObject({ because: "Saved s1", viewed: false })
    expect(state.checkedAt).toBeGreaterThan(0)
    expect(state.running).toBe(false)
    expect(state.lastError).toBeNull()
    expect(state.seen.sort()).toEqual(["n1", "n2"])
  })

  it("asks for the small 'recent' pool and no embeddings", async () => {
    library("s1")
    recommend({ s1: ["n1"] })
    await checkForUpdates()
    expect(recommended).toHaveBeenCalledWith("s1", "recent", 15)
    expect(metadata).toHaveBeenCalledWith(["n1"], false)
  })

  it("stores fresh papers without any trace of an analysis", async () => {
    library("s1")
    recommend({ s1: ["n1"] })
    await checkForUpdates()
    const [item] = (await getUpdates()).items
    expect(item.paper.similarity).toBeNull()
    expect(item.paper.relation).toBeNull()
    expect("embedding" in item.paper).toBe(false)
  })

  it("never alerts twice, nor about something the user already saved", async () => {
    library("s1", "s2")
    recommend({ s1: ["n1", "s2"], s2: ["n1", "n2"] })
    await checkForUpdates()
    expect(
      (await getUpdates()).items.map((i) => i.paper.paperId).sort()
    ).toEqual(["n1", "n2"])

    // a second run with the same recommendations finds nothing new
    metadata.mockClear()
    await checkForUpdates()
    expect((await getUpdates()).items).toHaveLength(2)
    expect(metadata).not.toHaveBeenCalled()
  })

  it("takes at most 5 per saved paper and marks the rest as seen", async () => {
    library("s1")
    recommend({ s1: ["a", "b", "c", "d", "e", "f", "g"] })
    await checkForUpdates()
    const state = await getUpdates()
    expect(state.items).toHaveLength(5)
    expect(state.seen).toHaveLength(7)
  })

  it("only looks at the 8 most recently saved papers", async () => {
    library(...Array.from({ length: 12 }, (_, i) => `s${i}`))
    recommend({})
    await checkForUpdates()
    expect(recommended).toHaveBeenCalledTimes(8)
    const asked = recommended.mock.calls.map((c) => c[0])
    expect(asked).toContain("s0")
    expect(asked).not.toContain("s11")
  })

  it("keeps the list and the seen set bounded", async () => {
    chrome.data.set(UPDATES_KEY, {
      seen: Array.from({ length: 599 }, (_, i) => `old${i}`),
      items: Array.from({ length: 40 }, (_, i) => ({
        paper: paperOf(`o${i}`),
        because: "x",
        foundAt: 1,
        viewed: true
      }))
    })
    library("s1")
    recommend({ s1: ["n1", "n2", "n3"] })
    await checkForUpdates()
    const state = await getUpdates()
    expect(state.items).toHaveLength(40)
    expect(state.items[0].paper.paperId).toBe("n1") // newest first
    expect(state.seen.length).toBeLessThanOrEqual(600)
    expect(state.seen).toContain("n3")
  })

  it("does nothing, without error, when nothing is saved", async () => {
    recommend({})
    await checkForUpdates()
    expect(recommended).not.toHaveBeenCalled()
    expect((await getUpdates()).lastError).toBeNull()
  })

  it("never touches the library", async () => {
    library("s1")
    const before = JSON.stringify(chrome.data.get(LIBRARY_KEY))
    recommend({ s1: ["n1"] })
    await checkForUpdates()
    expect(JSON.stringify(chrome.data.get(LIBRARY_KEY))).toBe(before)
  })
})

describe("when something fails", () => {
  it("skips a saved paper whose lookup failed and retries it next time", async () => {
    library("s1", "s2")
    recommend({ s1: null, s2: ["n1"] })
    await checkForUpdates()
    expect((await getUpdates()).items.map((i) => i.paper.paperId)).toEqual([
      "n1"
    ])
    expect((await getUpdates()).lastError).toBeNull()

    recommend({ s1: ["n9"], s2: ["n1"] })
    await checkForUpdates()
    expect(
      (await getUpdates()).items.map((i) => i.paper.paperId).sort()
    ).toEqual(["n1", "n9"])
  })

  it("records why a check failed, without swallowing news for next time", async () => {
    library("s1")
    recommended.mockResolvedValue(["n1"])
    metadata.mockResolvedValue([])
    await expect(checkForUpdates()).rejects.toThrow()

    const state = await getUpdates()
    expect(state.running).toBe(false)
    expect(state.lastError).toBe("no_data")
    expect(state.seen).toEqual([]) // n1 was not marked as seen

    recommend({ s1: ["n1"] })
    await checkForUpdates()
    const after = await getUpdates()
    expect(after.lastError).toBeNull()
    expect(after.items.map((i) => i.paper.paperId)).toEqual(["n1"])
  })

  it("does not leave 'running' stuck if the request rejects", async () => {
    library("s1")
    recommended.mockRejectedValue(new Error("boom"))
    await expect(checkForUpdates()).rejects.toThrow("boom")
    const state = await getUpdates()
    expect(state.running).toBe(false)
    expect(state.lastError).toBe("unknown")
  })
})

describe("the toolbar badge", () => {
  it("shows the number of alerts not seen yet", async () => {
    library("s1")
    recommend({ s1: ["n1", "n2", "n3"] })
    await checkForUpdates()
    expect(chrome.badge.text).toBe("3")

    await markUpdatesViewed()
    expect(chrome.badge.text).toBe("")
    expect((await getUpdates()).items.every((i) => i.viewed)).toBe(true)
  })

  it("dismissing removes only that alert", async () => {
    library("s1")
    recommend({ s1: ["n1", "n2"] })
    await checkForUpdates()
    await dismissUpdate("n1")
    expect((await getUpdates()).items.map((i) => i.paper.paperId)).toEqual([
      "n2"
    ])
    expect(chrome.badge.text).toBe("1")
  })

  it("clearing removes every alert and the badge, and they do not come back", async () => {
    library("s1")
    recommend({ s1: ["n1", "n2"] })
    await checkForUpdates()
    expect(chrome.badge.text).toBe("2")

    await clearUpdates()
    const state = await getUpdates()
    expect(state.items).toEqual([])
    expect(state.seen).toEqual(expect.arrayContaining(["n1", "n2"]))
    expect(chrome.badge.text).toBe("")

    await checkForUpdates() // the same recommendations again
    expect((await getUpdates()).items).toEqual([])
  })
})

// The popup and the background worker are different JS contexts, so a check
// that runs for seconds can finish after the user already acted on the list.
describe("acting on alerts while a check is running", () => {
  const existing = (id: string, viewed = false): UpdateItem => ({
    paper: paperOf(id) as any,
    because: "x",
    foundAt: 1,
    viewed
  })

  // Lets the test act while the check is waiting for the network.
  function slowMetadata() {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    metadata.mockImplementation(async (ids) => {
      await gate
      return ids.map(paperOf) as any
    })
    return release
  }

  it("does not bring back an alert the user dismissed meanwhile", async () => {
    chrome.data.set(UPDATES_KEY, { items: [existing("o1"), existing("o2")] })
    library("s1")
    recommended.mockResolvedValue(["n1"])
    const release = slowMetadata()

    const running = checkForUpdates()
    await vi.waitFor(() => expect(metadata).toHaveBeenCalled())
    await dismissUpdate("o1")
    release()
    await running

    expect(
      (await getUpdates()).items.map((i) => i.paper.paperId).sort()
    ).toEqual(["n1", "o2"])
  })

  it("keeps 'viewed' for alerts the user opened meanwhile", async () => {
    chrome.data.set(UPDATES_KEY, { items: [existing("o1")] })
    library("s1")
    recommended.mockResolvedValue(["n1"])
    const release = slowMetadata()

    const running = checkForUpdates()
    await vi.waitFor(() => expect(metadata).toHaveBeenCalled())
    await markUpdatesViewed()
    release()
    await running

    const items = (await getUpdates()).items
    expect(items.find((i) => i.paper.paperId === "o1")!.viewed).toBe(true)
    expect(items.find((i) => i.paper.paperId === "n1")!.viewed).toBe(false)
  })
})
