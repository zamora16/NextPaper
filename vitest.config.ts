import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Pure-module tests only (formatters, algorithms). Anything touching the
// network, chrome.* or the DOM is covered by the real-browser scripts.
export default defineConfig({
  resolve: {
    alias: {
      "~lib": root("./lib"),
      "~components": root("./components")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
})
