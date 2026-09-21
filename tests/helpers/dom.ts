import { createElement, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react-dom/test-utils"

import { I18nProvider } from "~components/i18n"
import type { Lang } from "~lib/i18n"

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// A small React test bench for component tests (run them in jsdom).
export function mountBench(lang: Lang = "en") {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)

  const bench = {
    container,
    render: (node: ReactNode) =>
      act(async () => {
        root.render(createElement(I18nProvider, { lang, children: node }))
      }),
    text: () => container.textContent ?? "",
    // A button by its visible text (a string is a substring, or a RegExp) or
    // by its accessible name.
    button: (label: string | RegExp) =>
      [...container.querySelectorAll("button")].find((b) => {
        const text = b.textContent?.trim() ?? ""
        return label instanceof RegExp
          ? label.test(text)
          : text.includes(label) || b.getAttribute("aria-label") === label
      }),
    click: (label: string | RegExp) =>
      act(async () => {
        const target = bench.button(label)
        if (!target) throw new Error(`no button "${label}"`)
        target.click()
      }),
    type: (selector: string, value: string) =>
      act(async () => {
        const input = container.querySelector(selector) as HTMLInputElement
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }),
    // Chooses an option of a <select> the way the browser does.
    select: (element: HTMLSelectElement, value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value"
        )!.set!.call(element, value)
        element.dispatchEvent(new Event("change", { bubbles: true }))
      }),
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    }
  }
  return bench
}
