import { describe, expect, it } from "vitest"

import { groupLabel } from "~components/i18n"
import { CITATION_STYLES } from "~lib/citation"
import { isLangPreference, resolveLang, richParts, translate } from "~lib/i18n"
import { en } from "~lib/i18n/en"
import { es } from "~lib/i18n/es"
import { OTHER_GROUP } from "~lib/pipeline"
import { DESIGNS } from "~lib/study"

const keys = Object.keys(en) as (keyof typeof en)[]
const params = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe("the two dictionaries", () => {
  it("have exactly the same keys", () => {
    expect(Object.keys(es).sort()).toEqual([...keys].sort())
  })

  it("have no empty text", () => {
    for (const key of keys) {
      expect(en[key].trim(), `en ${key}`).not.toBe("")
      expect(es[key].trim(), `es ${key}`).not.toBe("")
    }
  })

  it("use the same {placeholders} in both languages", () => {
    for (const key of keys) {
      expect(params(es[key]), key).toEqual(params(en[key]))
    }
  })

  it("open and close every **bold** marker", () => {
    for (const key of keys) {
      expect(en[key].split("**").length % 2, `en ${key}`).toBe(1)
      expect(es[key].split("**").length % 2, `es ${key}`).toBe(1)
    }
  })

  it("give every plural both forms, and every form its pair", () => {
    for (const key of keys) {
      if (key.endsWith("_one"))
        expect(keys, key).toContain(key.replace(/_one$/, "_other"))
      if (key.endsWith("_other"))
        expect(keys, key).toContain(key.replace(/_other$/, "_one"))
    }
  })

  it("name every study design and citation style the code can produce", () => {
    for (const { id } of DESIGNS)
      expect(keys, `design.${id}`).toContain(`design.${id}`)
    for (const id of CITATION_STYLES)
      expect(keys, `style.${id}`).toContain(`style.${id}`)
  })

  it("are actually translated: most Spanish texts differ from the English ones", () => {
    const same = keys.filter((k) => es[k] === en[k])
    // proper names and technical labels (APA 7, Harvard, English...) may match
    expect(same.length).toBeLessThan(keys.length * 0.15)
  })
})

describe("translate", () => {
  it("returns the text in the language asked for", () => {
    expect(translate("en", "back")).toBe("← Back")
    expect(translate("es", "back")).toBe("← Volver")
  })

  it("fills {placeholders}, leaving unknown ones visible", () => {
    expect(translate("en", "count", { shown: 3, total: 18 })).toBe(
      "3 of 18 papers"
    )
    expect(translate("es", "count", { shown: 3, total: 18 })).toBe(
      "3 de 18 papers"
    )
    expect(translate("en", "count", { shown: 3 })).toBe("3 of {total} papers")
  })

  it("picks singular or plural from n", () => {
    expect(translate("en", "papers", { n: 1 })).toBe("1 paper")
    expect(translate("en", "papers", { n: 2 })).toBe("2 papers")
    expect(translate("en", "papers", { n: 0 })).toBe("0 papers")
    expect(translate("es", "newPapers", { n: 1 })).toBe("1 paper nuevo")
    expect(translate("es", "newPapers", { n: 5 })).toBe("5 papers nuevos")
  })

  it("uses n as a plain value where the key is not a plural", () => {
    expect(translate("en", "step.scoring", { n: 132 })).toBe(
      "Computing similarity for 132 candidates..."
    )
  })

  it("shows the key itself rather than nothing when it is unknown", () => {
    expect(translate("en", "does.not.exist" as any)).toBe("does.not.exist")
  })
})

describe("resolveLang", () => {
  it("follows the browser when set to automatic: any Spanish, else English", () => {
    expect(resolveLang("auto", "es")).toBe("es")
    expect(resolveLang("auto", "es-MX")).toBe("es")
    expect(resolveLang("auto", "ES-ar")).toBe("es")
    expect(resolveLang("auto", "en-US")).toBe("en")
    expect(resolveLang("auto", "fr-FR")).toBe("en")
    expect(resolveLang("auto", undefined)).toBe("en")
  })

  it("obeys an explicit choice whatever the browser says", () => {
    expect(resolveLang("en", "es")).toBe("en")
    expect(resolveLang("es", "en-US")).toBe("es")
  })

  it("recognizes valid preferences only", () => {
    expect(isLangPreference("auto")).toBe(true)
    expect(isLangPreference("es")).toBe(true)
    expect(isLangPreference("fr")).toBe(false)
    expect(isLangPreference(undefined)).toBe(false)
  })
})

describe("richParts", () => {
  it("splits text into plain and bold parts", () => {
    expect(richParts("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false }
    ])
    expect(richParts("plain")).toEqual([{ text: "plain", bold: false }])
    expect(richParts("**all**")).toEqual([{ text: "all", bold: true }])
  })
})

describe("groupLabel", () => {
  const t = (lang: "en" | "es") => (key: any, params?: any) =>
    translate(lang, key, params)

  it("shows the words of a named group as they are", () => {
    expect(groupLabel("Machine translation", t("en"))).toBe(
      "Machine translation"
    )
  })

  it("translates the stand-ins", () => {
    expect(groupLabel(OTHER_GROUP, t("en"))).toBe("Other related")
    expect(groupLabel(OTHER_GROUP, t("es"))).toBe("Otros relacionados")
    expect(groupLabel("@related", t("es"))).toBe("Relacionados")
    expect(groupLabel("@all", t("en"))).toBe("All")
  })
})
