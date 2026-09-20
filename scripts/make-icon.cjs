// Renders assets/icon.png (512x512) from the same mark the popup header uses:
// a paper linked to its neighbours, on the accent color.
//
//   node scripts/make-icon.cjs
//
// Uses the browser of the e2e scripts (BROWSER_PATH overrides it).
const fs = require("fs")
const path = require("path")
const puppeteer = require("puppeteer-core")

const BROWSER =
  process.env.BROWSER_PATH ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7a58ea"/>
      <stop offset="1" stop-color="#4a2bb5"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bg)"/>
  <g transform="translate(96 96) scale(13.33)" fill="none" stroke="#fff"
     stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9.7 10L5.9 6.7M14.5 10.3L18 8M13.95 14.3l2.9 3.3M9.7 14l-3.3 2.8"/>
    <circle cx="12" cy="12" r="3.2" fill="#fff"/>
    <circle cx="4.5" cy="5.5" r="1.9" fill="#fff"/>
    <circle cx="19.5" cy="7" r="1.9" fill="#fff"/>
    <circle cx="18" cy="19" r="1.9" fill="#fff"/>
    <circle cx="5" cy="18" r="1.9" fill="#fff"/>
  </g>
</svg>`

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: "new",
    defaultViewport: { width: 512, height: 512 }
  })
  const page = await browser.newPage()
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${SVG}</body></html>`
  )
  const out = path.join(__dirname, "..", "assets", "icon.png")
  fs.writeFileSync(out, await page.screenshot({ omitBackground: true }))
  await browser.close()
  console.log("wrote", out)
})()
