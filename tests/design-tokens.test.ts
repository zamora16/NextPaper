import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Colors come from the tokens in style.css, which is what lets the whole
// interface follow the system's dark mode. A raw Tailwind palette color
// (text-slate-500, bg-violet-50...) or a hex code in a component would stay
// light in a dark popup.
const root = join(__dirname, "..")
const files = [
  "popup.tsx",
  ...readdirSync(join(root, "components"))
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => join("components", name))
]

const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|placeholder|decoration|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
const HEX = /#[0-9a-fA-F]{3,8}\b/

describe("design tokens", () => {
  it("finds the components to check", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    it(`${file} uses no raw palette color`, () => {
      const source = readFileSync(join(root, file), "utf8")
      const raw = source.match(new RegExp(PALETTE, "g")) ?? []
      expect(raw).toEqual([])
    })

    it(`${file} has no hard-coded hex color`, () => {
      const source = readFileSync(join(root, file), "utf8")
      // comments may quote a color; code may not
      const code = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n")
      expect(code.match(new RegExp(HEX, "g")) ?? []).toEqual([])
    })
  }

  it("every token used by the Tailwind config exists in both themes", () => {
    const css = readFileSync(join(root, "style.css"), "utf8")
    const config = readFileSync(join(root, "tailwind.config.js"), "utf8")
    const used = [...config.matchAll(/token\("([a-z-]+)"\)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(15)

    const dark = css.slice(css.indexOf("prefers-color-scheme: dark"))
    const light = css.slice(0, css.indexOf("prefers-color-scheme: dark"))
    for (const name of used) {
      expect(light, `light --${name}`).toMatch(new RegExp(`--${name}:`))
      expect(dark, `dark --${name}`).toMatch(new RegExp(`--${name}:`))
    }
  })
})
