// Makes a copy of the production build that talks to the local test server
// instead of the real APIs: the same code, with the three API origins rewritten
// and the server's address allowed in host_permissions (which is what exempts
// extension requests from CORS, exactly as for the real hosts).
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const ORIGINS = {
  "https://api.semanticscholar.org": "s2",
  "https://api.crossref.org": "crossref",
  "https://api.unpaywall.org": "unpaywall"
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function prepareBuild(buildDir, port) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "nextpaper-offline-"))
  fs.cpSync(buildDir, target, { recursive: true })

  const counts = Object.fromEntries(Object.keys(ORIGINS).map((o) => [o, 0]))
  for (const file of walk(target).filter((f) => f.endsWith(".js"))) {
    let text = fs.readFileSync(file, "utf8")
    for (const [origin, prefix] of Object.entries(ORIGINS)) {
      const parts = text.split(origin)
      if (parts.length > 1) {
        counts[origin] += parts.length - 1
        text = parts.join(`http://127.0.0.1:${port}/${prefix}`)
      }
    }
    fs.writeFileSync(file, text)
  }

  // If the extension stopped mentioning an API, the test would silently stop
  // covering it: fail loudly instead.
  for (const [origin, n] of Object.entries(counts)) {
    if (n === 0) throw new Error(`the build never mentions ${origin}`)
  }

  const manifestPath = path.join(target, "manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.host_permissions = [...(manifest.host_permissions ?? []), "http://127.0.0.1/*"]
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))

  return { dir: target, counts }
}

module.exports = { prepareBuild }
