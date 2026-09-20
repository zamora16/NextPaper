import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Unit tests for everything in lib/ (pure logic, plus the storage- and
// network-bound modules against an in-memory chrome.storage and a mocked
// fetch: see tests/helpers/chrome.ts). Components and the popup are tested in
// jsdom; the background worker and real request behavior (CORS, rate limits,
// the actual layout) are covered by the real-browser scripts.
export default defineConfig({
  // Same JSX transform as the Plasmo build (no `import React` in components).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "~lib": root("./lib"),
      "~components": root("./components"),
      "~style.css": root("./style.css")
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/**"],
      // downloadFile only touches the DOM (Blob + <a download>).
      exclude: ["lib/export.ts"],
      // Floors, not goals: they stop coverage from quietly eroding.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 85 }
    }
  }
})
