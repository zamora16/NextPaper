import { describe, expect, it } from "vitest"

import { compressJson, decompressJson } from "~lib/compress"

describe("compressJson / decompressJson", () => {
  it("round-trips structured data, including accents and emoji", async () => {
    const value = {
      title: "Imágenes corporales y trastornos alimentarios — ñandú 🧠",
      numbers: [1, 2.5, -3, 1e9],
      nested: { ok: true, none: null, list: ["a", "b"] }
    }
    expect(await decompressJson(await compressJson(value))).toEqual(value)
  })

  it("shrinks the repetitive JSON of a result a lot (that is what keeps the cache small)", async () => {
    const value = {
      groups: Array.from({ length: 18 }, (_, i) => ({
        label: "Subtopic",
        papers: [
          {
            paperId: `id${i}`,
            title: "A paper about body image and eating disorders",
            venue: "Journal of Eating Disorders",
            authors: [{ authorId: "1", name: "Some Author" }]
          }
        ]
      }))
    }
    const raw = JSON.stringify(value).length
    const packed = (await compressJson(value)).length
    expect(packed).toBeLessThan(raw / 2)
  })

  it("handles payloads bigger than the base64 chunk size", async () => {
    const value = { blob: "x".repeat(300_000), tail: "end" }
    const back = await decompressJson<typeof value>(await compressJson(value))
    expect(back.blob.length).toBe(300_000)
    expect(back.tail).toBe("end")
  })

  it("output is plain base64 text, safe to store in chrome.storage", async () => {
    expect(await compressJson({ a: 1 })).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it("rejects corrupt input instead of returning garbage", async () => {
    await expect(decompressJson("this is not gzip!!")).rejects.toThrow()
    await expect(decompressJson("aGVsbG8=")).rejects.toThrow()
  })
})
