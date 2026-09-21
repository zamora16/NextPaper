import { beforeEach, describe, expect, it } from "vitest"

import {
  addPapers,
  collectionCounts,
  deleteCollection,
  getLibrary,
  LIBRARY_KEY,
  restoreItems,
  toggleSaved,
  updateSaved
} from "~lib/library"
import { type ScoredPaper } from "~lib/model"

import { installChrome, type FakeChrome } from "./helpers/chrome"

// A result card as the analysis produced it: similarity and relation describe
// the relationship to the paper that was open at the time. `sharedTerms` no
// longer exists, but items saved by older versions still carry it.
const card = (id: string, over: Partial<ScoredPaper> = {}): ScoredPaper =>
  ({
    paperId: id,
    title: `Paper ${id}`,
    authors: [{ authorId: "1", name: "Ada Lovelace" }],
    year: 2020,
    citationCount: 5,
    venue: "J Test",
    url: `https://example.org/${id}`,
    similarity: 0.91,
    approximate: false,
    relation: "reference",
    sharedTerms: ["body", "image"],
    ...over
  }) as unknown as ScoredPaper

let chrome: FakeChrome
beforeEach(() => {
  chrome = installChrome()
})

describe("saving papers", () => {
  it("toggles a paper in and out of the library", async () => {
    await toggleSaved(card("a"))
    expect((await getLibrary()).map((p) => p.paperId)).toEqual(["a"])
    await toggleSaved(card("a"))
    expect(await getLibrary()).toEqual([])
  })

  it("starts unread, with no note and no collections", async () => {
    await toggleSaved(card("a"))
    const [saved] = await getLibrary()
    expect(saved).toMatchObject({ status: "unread", note: "", collections: [] })
  })

  // In Guardados nothing is "open", so "91% similar", "Referencia" or
  // "Coincide en: body · image" would describe a relationship to a paper that
  // is no longer there.
  it("does not keep what only made sense next to the paper that was open", async () => {
    await toggleSaved(card("a"))
    const [saved] = await getLibrary()
    expect(saved.similarity).toBeNull()
    expect(saved.relation).toBeNull()
    expect(saved.approximate).toBe(false)
    expect("sharedTerms" in saved).toBe(false)
  })

  it("also cleans items saved by earlier versions, which still carry that context", async () => {
    chrome.data.set(LIBRARY_KEY, {
      old: {
        ...card("old"),
        savedAt: 1,
        status: "read",
        note: "keep me",
        collections: ["Tesis"]
      }
    })
    const [saved] = await getLibrary()
    expect(saved).toMatchObject({
      similarity: null,
      relation: null,
      status: "read",
      note: "keep me",
      collections: ["Tesis"]
    })
    expect("sharedTerms" in saved).toBe(false)
  })

  it("gives items from before status/notes/collections existed their defaults", async () => {
    chrome.data.set(LIBRARY_KEY, {
      legacy: { ...card("legacy"), savedAt: 5 }
    })
    const [saved] = await getLibrary()
    expect(saved).toMatchObject({ status: "unread", note: "", collections: [] })
  })

  it("lists the newest saves first", async () => {
    chrome.data.set(LIBRARY_KEY, {
      a: { ...card("a"), savedAt: 1 },
      b: { ...card("b"), savedAt: 3 },
      c: { ...card("c"), savedAt: 2 }
    })
    expect((await getLibrary()).map((p) => p.paperId)).toEqual(["b", "c", "a"])
  })
})

describe("concurrent writes", () => {
  // Each write is read-modify-write on one storage key: without the queue two
  // quick clicks both read the old library and one save is lost (rule 9).
  it("loses no save when several happen at once", async () => {
    await Promise.all(["a", "b", "c", "d"].map((id) => toggleSaved(card(id))))
    expect((await getLibrary()).map((p) => p.paperId).sort()).toEqual([
      "a",
      "b",
      "c",
      "d"
    ])
  })

  it("keeps a status change made while other saves are in flight", async () => {
    await toggleSaved(card("a"))
    await Promise.all([
      toggleSaved(card("b")),
      updateSaved("a", { status: "read" }),
      toggleSaved(card("c"))
    ])
    const byId = Object.fromEntries(
      (await getLibrary()).map((p) => [p.paperId, p])
    )
    expect(Object.keys(byId).sort()).toEqual(["a", "b", "c"])
    expect(byId.a.status).toBe("read")
  })

  it("keeps working after a write fails", async () => {
    chrome.quotaBytes = 0
    await expect(toggleSaved(card("a"))).rejects.toThrow()
    chrome.quotaBytes = Infinity
    await toggleSaved(card("b"))
    expect((await getLibrary()).map((p) => p.paperId)).toEqual(["b"])
  })
})

describe("editing saved papers", () => {
  it("merges a patch and ignores unknown papers", async () => {
    await toggleSaved(card("a"))
    await updateSaved("a", { status: "reading", note: "check the methods" })
    await updateSaved("missing", { status: "read" })
    const library = await getLibrary()
    expect(library).toHaveLength(1)
    expect(library[0]).toMatchObject({
      status: "reading",
      note: "check the methods"
    })
  })
})

describe("collections", () => {
  it("counts papers per collection, biggest first, then by name", async () => {
    await Promise.all(["a", "b", "c"].map((id) => toggleSaved(card(id))))
    await updateSaved("a", { collections: ["Tesis", "Zeta"] })
    await updateSaved("b", { collections: ["Tesis", "Alfa"] })
    await updateSaved("c", { collections: ["Alfa"] })
    expect(collectionCounts(await getLibrary())).toEqual([
      { name: "Alfa", count: 2 },
      { name: "Tesis", count: 2 },
      { name: "Zeta", count: 1 }
    ])
  })

  it("deleting a collection removes the name everywhere and keeps the papers", async () => {
    await Promise.all(["a", "b"].map((id) => toggleSaved(card(id))))
    await updateSaved("a", { collections: ["Tesis", "Otra"] })
    await updateSaved("b", { collections: ["Tesis"] })
    await deleteCollection("Tesis")
    const library = await getLibrary()
    expect(library).toHaveLength(2)
    expect(
      Object.fromEntries(library.map((p) => [p.paperId, p.collections]))
    ).toEqual({
      a: ["Otra"],
      b: []
    })
  })
})

describe("importing", () => {
  it("adds new papers to a collection and reports what was already saved", async () => {
    await toggleSaved(card("a"))
    const result = await addPapers([card("a"), card("b")], "Importados")
    expect(result).toEqual({ added: 1, alreadySaved: 1 })

    const byId = Object.fromEntries(
      (await getLibrary()).map((p) => [p.paperId, p])
    )
    expect(byId.b.collections).toEqual(["Importados"])
    // the paper the user already had joins the collection, nothing else changes
    expect(byId.a.collections).toEqual(["Importados"])
    expect(byId.a.status).toBe("unread")
  })

  it("imported papers carry no analysis context either", async () => {
    await addPapers([card("b")])
    const [saved] = await getLibrary()
    expect(saved.similarity).toBeNull()
    expect(saved.relation).toBeNull()
    expect("sharedTerms" in saved).toBe(false)
  })

  it("restoring a backup never overwrites the user's own status or notes", async () => {
    await toggleSaved(card("a"))
    await updateSaved("a", { status: "read", note: "mine" })
    const result = await restoreItems([
      {
        ...card("a"),
        savedAt: 1,
        status: "unread",
        note: "theirs",
        collections: ["Nueva"]
      },
      { ...card("z"), savedAt: 2, status: "reading", note: "", collections: [] }
    ])
    expect(result).toEqual({ added: 1, updated: 1, total: 2 })

    const byId = Object.fromEntries(
      (await getLibrary()).map((p) => [p.paperId, p])
    )
    expect(byId.a).toMatchObject({
      status: "read",
      note: "mine",
      collections: ["Nueva"]
    })
    expect(byId.z.status).toBe("reading")
  })
})
