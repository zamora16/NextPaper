import { beforeEach, describe, expect, it, vi } from "vitest"

import { pruneStorage } from "~lib/cache"
import {
  CITING_MAX_ENTRIES,
  CITING_PREFIX,
  CITING_TTL_MS,
  distinctiveTitleTokens,
  getCitingSentences,
  isUsableSentence,
  MAX_NAMED,
  MAX_OTHERS,
  namesThePaper,
  selectCitingSentences,
  surnameOf,
  titlePhrase,
  type CitedPaperMeta,
  type RawCitation
} from "~lib/citing"
import { getCitationContexts } from "~lib/semantic-scholar"

import { installChrome, type FakeChrome } from "./helpers/chrome"

vi.mock("~lib/semantic-scholar", () => ({
  getCitationContexts: vi.fn()
}))
const request = vi.mocked(getCitationContexts)

let chrome: FakeChrome
beforeEach(() => {
  chrome = installChrome()
  request.mockReset()
})

const BAS2: CitedPaperMeta = {
  title:
    "The Body Appreciation Scale-2: item refinement and psychometric evaluation",
  year: 2015,
  authors: ["Tracy L. Tylka", "Nichole L. Wood-Barcalow"]
}
const ALPHAFOLD: CitedPaperMeta = {
  title: "Highly accurate protein structure prediction with AlphaFold",
  year: 2021,
  authors: ["J. Jumper", "Richard Evans", "Alexander Pritzel"]
}
const RESNET: CitedPaperMeta = {
  title: "Deep Residual Learning for Image Recognition",
  year: 2015,
  authors: ["Kaiming He", "X. Zhang", "Shaoqing Ren"]
}
const MEDIATION: CitedPaperMeta = {
  title:
    "The moderator-mediator variable distinction in social psychological research: Conceptual, strategic, and statistical considerations",
  year: 1986,
  authors: ["R. Baron", "D. Kenny"]
}

describe("surnameOf", () => {
  it("takes the last name, without accents or suffixes", () => {
    expect(surnameOf("Tracy L. Tylka")).toBe("Tylka")
    expect(surnameOf("Nichole L. Wood-Barcalow")).toBe("Wood-Barcalow")
    expect(surnameOf("José Pérez")).toBe("Perez")
    expect(surnameOf("Martin Luther King Jr.")).toBe("King")
    expect(surnameOf("Kaiming He")).toBe("He")
  })

  it("gives nothing for a name it cannot use", () => {
    expect(surnameOf("")).toBeNull()
    expect(surnameOf("X")).toBeNull()
  })
})

describe("distinctiveTitleTokens", () => {
  it("keeps names and acronyms, never plain words", () => {
    expect(distinctiveTitleTokens(ALPHAFOLD.title)).toEqual(["AlphaFold"])
    expect(
      distinctiveTitleTokens(
        "Preferred Reporting Items for Systematic Reviews and Meta-Analyses: The PRISMA Statement"
      )
    ).toEqual(["PRISMA"])
    expect(distinctiveTitleTokens(BAS2.title)).toEqual(["Scale-2"])
    expect(distinctiveTitleTokens(RESNET.title)).toEqual([])
  })

  it("has nothing for a title written in capitals", () => {
    expect(distinctiveTitleTokens("DEEP RESIDUAL LEARNING FOR IMAGES")).toEqual(
      []
    )
  })
})

describe("titlePhrase", () => {
  it("is the title up to the colon, without an article, when long enough", () => {
    expect(titlePhrase(BAS2.title)).toBe("body appreciation scale 2")
    expect(titlePhrase(RESNET.title)).toBe(
      "deep residual learning for image recognition"
    )
  })

  it("is nothing for a short title", () => {
    expect(titlePhrase("Attention is all")).toBeNull()
    expect(titlePhrase("Adam: a method for stochastic optimization")).toBeNull()
  })
})

describe("namesThePaper", () => {
  const yes = (sentence: string, paper: CitedPaperMeta) =>
    expect(namesThePaper(sentence, paper), sentence).toBe(true)
  const no = (sentence: string, paper: CitedPaperMeta) =>
    expect(namesThePaper(sentence, paper), sentence).toBe(false)

  it("accepts author and year, in the usual styles", () => {
    yes("This is well known (Tylka and Wood-Barcalow 2015a).", BAS2)
    yes("Positive body image (Tylka & Wood-Barcalow, 2015b) is broad.", BAS2)
    yes("Structures were predicted (Jumper et al., 2021).", ALPHAFOLD)
    yes("The mediation test of Baron and Kenny (1986) was used.", MEDIATION)
    yes("As in Baron & Kenny, 1986, we test mediation here.", MEDIATION)
    yes("Earlier work studied the Baron and Kenny [1986] estimator.", MEDIATION)
  })

  it("accepts 'et al.' and two first authors together", () => {
    yes("He et al. [11] introduced residual blocks to train deep nets.", RESNET)
    yes("According to Baron and Kenny [39], three conditions apply.", MEDIATION)
  })

  it("allows a year off by one (preprint versus published)", () => {
    yes("Residual networks (He et al., 2016) made depth trainable.", RESNET)
    yes("Residual networks (He et al., 2015) made depth trainable.", RESNET)
  })

  it("refuses another paper of the same author (a different year)", () => {
    no(
      "Features improve (He et al. [2022], Ronneberger et al. [2015]).",
      RESNET
    )
    no("See the earlier scale of Tylka (2013) for details of it.", BAS2)
  })

  it("refuses a sentence that names other people", () => {
    no(
      "Body dysmorphic disorder affects 2% of people (Phillips et al., 2010).",
      BAS2
    )
    no(
      "Structures were predicted with RoseTTAFold (Baek et al., 2021).",
      ALPHAFOLD
    )
  })

  it("does not take a plain word for a surname", () => {
    no(
      "He said that the results were surprising for everybody involved.",
      RESNET
    )
  })

  it("accepts a proper name from the title, as a whole word", () => {
    yes(
      "The model was folded with AlphaFold [22] and refined afterwards.",
      ALPHAFOLD
    )
    yes(
      "Body Appreciation Scale-2 (BAS-2) [15] is a validated instrument.",
      BAS2
    )
    no(
      "The model was folded with AlphaFold3 [11] and refined afterwards.",
      ALPHAFOLD
    )
    no(
      "We used plain scaling of the data before every single analysis here.",
      BAS2
    )
  })

  it("accepts the title itself, quoted", () => {
    yes(
      "we followed the deep residual learning for image recognition approach [3].",
      RESNET
    )
  })

  it("ignores accents on either side", () => {
    const paper: CitedPaperMeta = {
      title: "Some title",
      year: 2020,
      authors: ["José Pérez"]
    }
    yes(
      "Como muestran Perez et al. (2020), hay diferencias claras entre grupos.",
      paper
    )
    yes(
      "Como muestran Pérez et al. (2020), hay diferencias claras entre grupos.",
      paper
    )
  })

  it("works when the paper has no year", () => {
    const paper: CitedPaperMeta = { ...RESNET, year: null }
    yes("Residual networks (He et al., 2016) made depth trainable.", paper)
  })
})

describe("isUsableSentence", () => {
  const ok = "This sentence is long enough and made of real words to be shown."

  it("accepts a normal sentence", () => {
    expect(isUsableSentence(ok)).toBe(true)
  })

  it("rejects fragments, giants and extraction debris", () => {
    expect(isUsableSentence("132")).toBe(false)
    expect(isUsableSentence("Too short to mean much.")).toBe(false)
    expect(isUsableSentence(ok.repeat(20))).toBe(false)
    expect(isUsableSentence(`${ok} (cid:2) (cid:5)`)).toBe(false)
    expect(
      isUsableSentence("[1] [2] [3] [4] [5] 1 2 3 4 5 6 7 8 9 10 11 12 13 14")
    ).toBe(false)
  })
})

const citing = (
  id: string,
  contexts: unknown,
  over: Partial<NonNullable<RawCitation["citingPaper"]>> = {},
  isInfluential = false
): RawCitation => ({
  contexts,
  isInfluential,
  citingPaper: {
    paperId: id,
    title: `Paper ${id}`,
    year: 2024,
    venue: "J Test",
    url: `https://example.org/${id}`,
    ...over
  }
})

const NAMED = "Positive body image is broad (Tylka & Wood-Barcalow, 2015)."
const UNNAMED = "Scores were computed for every participant of the study [12]."

describe("selectCitingSentences", () => {
  it("separates sentences that name the paper from those that do not", () => {
    const r = selectCitingSentences(
      [citing("a", [NAMED]), citing("b", [UNNAMED]), citing("c", [])],
      BAS2
    )
    expect(r.named.map((s) => s.paperId)).toEqual(["a"])
    expect(r.others.map((s) => s.paperId)).toEqual(["b"])
    expect(r.scanned).toBe(3)
    expect(r.withSentences).toBe(2)
  })

  it("keeps one sentence per citing paper, the one that names the paper", () => {
    const r = selectCitingSentences([citing("a", [UNNAMED, NAMED])], BAS2)
    expect(r.named).toHaveLength(1)
    expect(r.named[0].text).toBe(NAMED)
    expect(r.others).toHaveLength(0)
  })

  it("puts influential citations first, then the most recent", () => {
    const r = selectCitingSentences(
      [
        citing("old", [NAMED], { year: 2016 }),
        citing("new", [NAMED + " Newer."], { year: 2025 }),
        citing("inf", [NAMED + " Influential."], { year: 2018 }, true)
      ],
      BAS2
    )
    expect(r.named.map((s) => s.paperId)).toEqual(["inf", "new", "old"])
    expect(r.named[0].influential).toBe(true)
  })

  it("does not repeat the same sentence", () => {
    const r = selectCitingSentences(
      [citing("a", [NAMED]), citing("b", [NAMED])],
      BAS2
    )
    expect(r.named).toHaveLength(1)
  })

  it("skips garbled or unusable text but still counts the paper", () => {
    const r = selectCitingSentences([citing("a", ["132", "(cid:1)"])], BAS2)
    expect(r.named).toHaveLength(0)
    expect(r.others).toHaveLength(0)
    expect(r.withSentences).toBe(1)
  })

  it("is not fooled by data of the wrong shape", () => {
    const rows = [
      citing("a", "not a list"),
      citing("b", [42, null, { text: NAMED }]),
      { contexts: [NAMED] } as RawCitation, // no citing paper
      null as unknown as RawCitation,
      citing("c", [NAMED], {
        title: 5 as any,
        year: "2020" as any,
        venue: {} as any
      })
    ]
    const r = selectCitingSentences(rows, BAS2)
    expect(r.named).toHaveLength(1)
    expect(r.named[0]).toMatchObject({
      paperId: "c",
      title: "",
      year: null,
      venue: ""
    })
  })

  it("never keeps a link that is not http(s)", () => {
    const r = selectCitingSentences(
      [citing("a", [NAMED], { url: "javascript:alert(1)" })],
      BAS2
    )
    expect(r.named[0].url).toBeUndefined()
  })

  it("keeps the lists bounded", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      citing(`p${i}`, [`${NAMED} Variant number ${i} of the sentence.`])
    ).concat(
      Array.from({ length: 200 }, (_, i) =>
        citing(`q${i}`, [`${UNNAMED} Another variant number ${i} here.`])
      )
    )
    const r = selectCitingSentences(rows, BAS2)
    expect(r.named).toHaveLength(MAX_NAMED)
    expect(r.others).toHaveLength(MAX_OTHERS)
    expect(r.scanned).toBe(400)
  })

  it("collapses whitespace in what it shows", () => {
    const r = selectCitingSentences(
      [
        citing("a", [
          `  Positive   body image\n is broad (Tylka & Wood-Barcalow, 2015).  `
        ])
      ],
      BAS2
    )
    expect(r.named[0].text).toBe(
      "Positive body image is broad (Tylka & Wood-Barcalow, 2015)."
    )
  })
})

describe("getCitingSentences", () => {
  const data = (rows: RawCitation[]) => ({
    paper: BAS2,
    rows
  })

  it("selects and remembers the result", async () => {
    request.mockResolvedValue(data([citing("a", [NAMED])]))
    const first = await getCitingSentences("DOI:10.1/x")
    expect(first?.named).toHaveLength(1)

    request.mockClear()
    const again = await getCitingSentences("DOI:10.1/x")
    expect(again).toEqual(first)
    expect(request).not.toHaveBeenCalled()
  })

  it("gives null, and remembers nothing, when the request failed", async () => {
    request.mockResolvedValue(null)
    expect(await getCitingSentences("DOI:10.1/x")).toBeNull()
    expect(
      [...chrome.data.keys()].filter((k) => k.startsWith(CITING_PREFIX))
    ).toEqual([])
  })

  it("does not remember a paper nobody cites yet", async () => {
    request.mockResolvedValue(data([]))
    const result = await getCitingSentences("DOI:10.1/new")
    expect(result?.scanned).toBe(0)
    expect(chrome.data.size).toBe(0)
  })

  it("asks again once the stored answer is old", async () => {
    request.mockResolvedValue(data([citing("a", [NAMED])]))
    await getCitingSentences("R")
    const key = CITING_PREFIX + "R"
    const stored = chrome.data.get(key) as { z: string; at: number }
    chrome.data.set(key, { ...stored, at: Date.now() - CITING_TTL_MS - 1000 })

    request.mockClear()
    request.mockResolvedValue(data([citing("b", [NAMED + " Other."])]))
    const fresh = await getCitingSentences("R")
    expect(request).toHaveBeenCalledTimes(1)
    expect(fresh?.named[0].paperId).toBe("b")
  })

  it("survives a full storage: it is only a cache", async () => {
    request.mockResolvedValue(data([citing("a", [NAMED])]))
    chrome.quotaBytes = 10
    const result = await getCitingSentences("R")
    expect(result?.named).toHaveLength(1)
  })
})

describe("pruning the citing cache", () => {
  const entry = (age: number) => ({ z: "x", at: Date.now() - age })

  it("drops old entries and keeps only the newest", async () => {
    chrome.data.set(CITING_PREFIX + "expired", entry(CITING_TTL_MS + 5000))
    for (let i = 0; i < CITING_MAX_ENTRIES + 5; i++) {
      chrome.data.set(CITING_PREFIX + "r" + i, entry(1000 * (i + 1)))
    }
    await pruneStorage()
    const left = [...chrome.data.keys()].filter((k) =>
      k.startsWith(CITING_PREFIX)
    )
    expect(left).toHaveLength(CITING_MAX_ENTRIES)
    expect(left).not.toContain(CITING_PREFIX + "expired")
    expect(left).toContain(CITING_PREFIX + "r0") // newest
    expect(left).not.toContain(CITING_PREFIX + `r${CITING_MAX_ENTRIES + 4}`) // oldest
  })
})
