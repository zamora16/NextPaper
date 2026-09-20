// @vitest-environment jsdom
import { createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react-dom/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Hint, I18nProvider } from "~components/i18n"
import { KEY_FORM_URL, KeySetup } from "~components/KeySetup"
import type { Lang } from "~lib/i18n"
import { getSettings, saveApiKey, type Settings } from "~lib/settings"

import { installChrome } from "./helpers/chrome"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const KEY = "AbCdEf0123456789AbCdEf0123456789AbCdEf01"
const NO_KEY: Settings = { setupDone: false, s2ApiKey: null, language: "auto" }

let container: HTMLElement
let root: Root

const render = (
  props: {
    settings?: Settings
    firstRun: boolean
    onClose?: () => void
  },
  lang: Lang = "es"
) =>
  act(async () => {
    root.render(
      createElement(I18nProvider, {
        lang,
        children: createElement(KeySetup, { settings: NO_KEY, ...props })
      })
    )
  })
const text = () => container.textContent ?? ""
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(label)
  )
const click = (label: string) =>
  act(async () => {
    button(label)!.click()
  })
// React tracks input values itself: set it the way the browser does.
const type = (value: string) =>
  act(async () => {
    const input = container.querySelector("input")!
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
const answerKeyCheckWith = (status: number) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status }))
  )

beforeEach(() => {
  installChrome()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("first run", () => {
  it("explains what the key is for and the three steps", async () => {
    await render({ firstRun: true })
    for (const expected of [
      "Bienvenido a NextPaper",
      "¿Por qué una clave propia?",
      "Pide tu clave gratis",
      "Copia la clave",
      "Pégala aquí",
      "Continuar sin clave"
    ]) {
      expect(text(), expected).toContain(expected)
    }
  })

  it("links to Semantic Scholar's key request in a new tab, without leaking the referrer", async () => {
    await render({ firstRun: true })
    const link = [...container.querySelectorAll("a")].find(
      (a) => a.href === KEY_FORM_URL
    )!
    expect(link).toBeTruthy()
    expect(link.target).toBe("_blank")
    expect(link.rel).toContain("noreferrer")
  })

  it("does not let the user save an empty field", async () => {
    await render({ firstRun: true })
    expect((button("Guardar y empezar") as HTMLButtonElement).disabled).toBe(
      true
    )
    await type("   ")
    expect((button("Guardar y empezar") as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it("explains a mistake without calling the network or saving anything", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await render({ firstRun: true })
    await type("hola")
    await click("Guardar y empezar")
    expect(text()).toContain("no parece una clave")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await getSettings()).toEqual(NO_KEY)
  })

  it("does not save a key Semantic Scholar refuses", async () => {
    answerKeyCheckWith(403)
    await render({ firstRun: true })
    await type(KEY)
    await click("Guardar y empezar")
    expect(text()).toContain("no acepta esa clave")
    expect(await getSettings()).toEqual(NO_KEY)
  })

  it("saves a key that works, finishing the setup", async () => {
    answerKeyCheckWith(200)
    await render({ firstRun: true })
    await type(`  ${KEY} `) // pasted with stray spaces
    await click("Guardar y empezar")
    expect(await getSettings()).toEqual({
      setupDone: true,
      s2ApiKey: KEY,
      language: "auto"
    })
    expect(text()).toContain("guardada y comprobada")
  })

  it("keeps the key but warns when Semantic Scholar was too busy to check it", async () => {
    vi.useFakeTimers()
    answerKeyCheckWith(429)
    await render({ firstRun: true })
    await type(KEY)
    await act(async () => {
      button("Guardar y empezar")!.click()
      await vi.runAllTimersAsync()
    })
    expect(await getSettings()).toEqual({
      setupDone: true,
      s2ApiKey: KEY,
      language: "auto"
    })
    expect(text()).toContain("no he podido comprobarla")
  })

  it("lets the user continue without a key", async () => {
    await render({ firstRun: true })
    await click("Continuar sin clave")
    expect(await getSettings()).toEqual({
      setupDone: true,
      s2ApiKey: null,
      language: "auto"
    })
  })

  it("never shows the settings-only parts", async () => {
    await render({ firstRun: true })
    expect(text()).not.toContain("Quitar clave")
    expect(text()).not.toContain("licencia MIT")
  })
})

describe("settings", () => {
  it("says there is no key when there is none, and offers no removal", async () => {
    await render({
      settings: { setupDone: true, s2ApiKey: null, language: "auto" },
      firstRun: false
    })
    expect(text()).toContain("sin clave (modo lento)")
    expect(button("Quitar clave")).toBeUndefined()
  })

  it("shows a saved key only masked", async () => {
    await render({
      settings: { setupDone: true, s2ApiKey: KEY, language: "auto" },
      firstRun: false
    })
    expect(text()).toContain("guardada (••••••••Ef01)")
    expect(text()).not.toContain(KEY)
  })

  it("removes the key on request, keeping the setup done", async () => {
    await saveApiKey(KEY)
    await render({
      settings: { setupDone: true, s2ApiKey: KEY, language: "auto" },
      firstRun: false
    })
    await click("Quitar clave")
    expect(await getSettings()).toEqual({
      setupDone: true,
      s2ApiKey: null,
      language: "auto"
    })
    expect(text()).toContain("Clave quitada")
  })

  it("credits the data sources and states the license and version", async () => {
    await render({
      settings: { setupDone: true, s2ApiKey: null, language: "auto" },
      firstRun: false
    })
    expect(text()).toContain("Semantic Scholar")
    expect(text()).toContain("Crossref")
    expect(text()).toContain("licencia MIT")
    expect(text()).toContain("9.9.9")
  })

  it("can be closed", async () => {
    const onClose = vi.fn()
    await render({
      settings: { setupDone: true, s2ApiKey: null, language: "auto" },
      firstRun: false,
      onClose
    })
    await click("Cerrar")
    expect(onClose).toHaveBeenCalled()
  })
})

describe("in English", () => {
  it("shows the setup in English", async () => {
    await render({ firstRun: true }, "en")
    for (const expected of [
      "Welcome to NextPaper",
      "Why your own key?",
      "Save and start",
      "Continue without a key"
    ]) {
      expect(text(), expected).toContain(expected)
    }
    expect(text()).not.toContain("Bienvenido")
    expect(document.documentElement.lang).toBe("en")
  })

  it("explains a mistake in English", async () => {
    await render({ firstRun: true }, "en")
    await type("hi")
    await click("Save and start")
    expect(text()).toContain("does not look like a key")
  })
})

describe("language choice", () => {
  it("saves the chosen language and marks the current one", async () => {
    await render({ firstRun: true })
    expect(button("Español")!.getAttribute("aria-pressed")).toBe("false")
    await click("English")
    expect((await getSettings()).language).toBe("en")
    await click("Español")
    expect((await getSettings()).language).toBe("es")
  })

  it("is also offered in the settings screen", async () => {
    await render({
      settings: { setupDone: true, s2ApiKey: null, language: "es" },
      firstRun: false
    })
    expect(button("English")).toBeTruthy()
    expect(button("Automático")).toBeTruthy()
  })
})

describe("Hint", () => {
  it("is reachable by keyboard and carries its text for hover and screen readers", async () => {
    await act(async () => {
      root.render(createElement(Hint, { text: "Explains the control" }))
    })
    const hint = container.firstElementChild as HTMLElement
    expect(hint.getAttribute("title")).toBe("Explains the control")
    expect(hint.getAttribute("aria-label")).toBe("Explains the control")
    expect(hint.tabIndex).toBe(0)
    expect(hint.getAttribute("role")).toBe("img")
  })
})
