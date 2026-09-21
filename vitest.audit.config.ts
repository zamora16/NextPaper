import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Real-network audits of the heuristics (see scripts/audit). Kept apart from
// the unit tests: they need the API and are read by a person, not asserted.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "~lib": root("./lib"), "~components": root("./components") }
  },
  test: {
    include: ["scripts/audit/*.audit.ts"],
    environment: "node",
    testTimeout: 15 * 60 * 1000
  }
})
