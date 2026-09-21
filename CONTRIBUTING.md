# NextPaper — development guide

Chrome extension (Plasmo + React 18 + TypeScript + Tailwind 3) that helps
researchers find, triage, organize and cite related literature while they read.
**Everything runs locally in the extension: no server, no LLM, no per-use cost.**
Data comes from the Semantic Scholar API (free). It is also a data-science
project, so real, explainable ML (embeddings, cosine ranking, from-scratch clustering,
silhouette) is a feature, not overhead.

Read these before changing anything non-trivial:

- `docs/ARCHITECTURE.md` — data flow, module map, storage schema, API facts, decision log
- `docs/PERFORMANCE.md` — measured request behavior, why the pipeline is shaped this way, rules to keep it fast
- `docs/PRODUCT.md` — what users get today and the known limits
- `docs/ROADMAP.md` — prioritized improvement ideas (free layer first, optional low-token AI layer)
- `docs/EVALUATION.md` — how the ranking was measured, what it showed, and the limits of those numbers

## Commands

```bash
npm install
npm run dev                # then load build/chrome-mv3-dev via chrome://extensions
npx tsc --noEmit           # typecheck, `strict` + no unused locals/params (Parcel does NOT typecheck; run this every change)
npm run check:cycles       # no circular imports between modules (CI runs it)
npm run test:e2e           # offline e2e: the built extension in a real browser against a local imitation of the APIs (CI runs it; no key, no network)
npm run check:api          # the real APIs still answer the way lib/ expects (a nightly workflow runs it; S2_API_KEY optional)
npm run format             # prettier over lib/components/tests/popup/background (CI runs format:check)
npx plasmo build           # production build -> build/chrome-mv3-prod
npm test                   # vitest (~490 tests; `npm run test:coverage` enforces floors on lib/, ~98% lines): every module in lib/ —
                           # keywords, timeline, study (design/sample), rate limiter/retry, API client (mocked fetch), pipeline (assemble/dedupe/picks), extractPaperRef (jsdom)
```

API key: the extension ships **without any key**. Each user sets their own free Semantic
Scholar key on first run (setup screen) or later in Ajustes; it is stored in
`chrome.storage.local` (`lib/settings.ts`). Never bundle a key (`process.env`, constants):
it would be readable by anyone, and Semantic Scholar's terms forbid sharing a key. For the
real-browser tests put a key in `.env.local` as `S2_API_KEY=...` (gitignored); the test
launcher stores it in the extension the way the setup screen would.

### Real-browser tests (required for network/UI changes)

```bash
npm i --no-save puppeteer-core     # once; does not touch package.json
npx plasmo build
node scripts/e2e-explore.cjs       # analyze -> Explorar -> Volver -> topic search
node scripts/e2e-library.cjs       # save, status, notes, .bib/.ris export, alerts, badge
node scripts/e2e-storage.cjs       # compression, pruning, migration, user data untouched
node scripts/e2e-import.cjs        # import .bib, collections, backup/restore, hostile file
node scripts/e2e-setup.cjs         # first-run setup, personal API key, no key in the bundle
node scripts/e2e-english.cjs       # English UI, three tabs, hover hints, language switch
npx vitest run --config vitest.audit.config.ts <capture-groups|pick-seeds|collect-pools|evaluate>   # real-API audits (always name one: pick-seeds rewrites scripts/audit/seeds.json); see docs/EVALUATION.md
OUT=dir node scripts/screenshots.cjs   # screenshots of every screen (LANG_UI=es, DARK=1, SCALE=2)
node scripts/make-icon.cjs         # regenerates assets/icon.png from the app mark
node scripts/trace-network.cjs     # request-by-request timeline of a cold analysis (performance work)
```

They load the built extension in **Edge** (`BROWSER_PATH` overrides the path) and print
PASS/FAIL lines; exit code 1 on failure. Each takes 1–3 minutes because the API rate
limits erratically. **Do not rely on Node-only tests** for anything that touches the
network: Node has no CORS, and CORS is exactly what broke this project before.
Branded Chrome 137+ ignores `--load-extension`, hence Edge. PubMed/PMC/MDPI return 403 to
automated browsers, and the real toolbar click that grants `activeTab` cannot be
simulated (the popup accepts `?ref=DOI:...` for tests — keep that param).

## Rules that must not be broken (each one was learned the hard way)

1. **All Semantic Scholar traffic goes through `s2Fetch`** (`lib/s2-fetch.ts`): a concurrency
   limiter (3 in flight, 120 ms gap) plus short retries on 429/5xx. Never call `fetch` on the API
   directly. **Do not add fixed delays between requests** and do not remove the parallelism: the API's
   429s are random (25–45% at any pace), so pauses only made analyses 3–4x slower. Read
   `docs/PERFORMANCE.md` before touching this, and re-measure with `node scripts/trace-network.cjs`.
2. **Keep `host_permissions` for `https://api.semanticscholar.org/*`,
   `https://api.crossref.org/*` and `https://api.unpaywall.org/*`** in the `manifest` block of `package.json`. Without it the browser applies CORS: the API's 429 responses
   carry no CORS headers (they surface as "Failed to fetch") and the batch endpoint
   rejects cross-origin POST. Never move API calls into a page/content script.
3. **Guard every array from the API**: `?.data?.map(...) ?? []`. S2 returns
   `"data": null` for some papers (publisher-restricted references).
4. **The recommendations endpoint rejects `tldr` and `embedding`** (HTTP 400). Use it for
   ids only (`fields=paperId`) and fetch metadata through the batch endpoint.
5. **`extractPaperRef` (`lib/extract-ref.ts`) must stay fully self-contained** — it is
   serialized into the page by `chrome.scripting.executeScript`; no imports, no helpers
   outside the function body.
6. **Never store embeddings** (768 floats each). `strip()` in `lib/pipeline.ts` drops
   them; cached results and library items must stay small.
7. **Bump the cache prefix** (`KEY_PREFIX` in `lib/cache.ts`, currently `v14`) whenever the
   `AnalysisResult` shape or the retrieval/ranking strategy changes, or users get stale
   results from the old strategy. Also add the old prefix to `LEGACY_KEYS` so it gets
   cleaned up. Library items (`nextpaper_library`) persist forever: schema changes there
   must be backward compatible (see defaults in `getLibrary`).
8. **Storage discipline.** Finished results live ONLY in the compressed cache
   (`lib/cache.ts` + `lib/compress.ts`); `JobState` never carries a result. Every cache
   write must stay bounded: `pruneStorage` runs after each analysis and at worker start
   (expiry, 40-entry cap, legacy keys, orphan jobs) and must never touch
   `nextpaper_library` or `nextpaper_updates`. A new persistent key needs a bound or a
   pruning rule (the Crossref and Unpaywall caches are bounded to 500 entries each, 30 days, in
   `pruneStorage`). Re-check with `node scripts/e2e-storage.cjs`.
9. **Library writes go through the promise queue** (`createQueue` in `lib/queue.ts`, used by `lib/library.ts`). Concurrent
   read-modify-write on one storage key lost saves once.
10. **The analysis must survive the popup closing.** It runs in `background.ts`; the popup
   only observes `JobState`. The worker keeps itself alive (`syncKeepAlive`) and the popup
   re-sends `analyze` every 25 s while a job is "loading" (watchdog, in `components/useAnalysis.ts`, tested). Keep both.
11. **`all-cs` recommendation pool only for computer-science seeds.** It is CS-biased and
    returns irrelevant e-health/ML papers for other fields.
12. **No AI/LLM calls and no server in the default path.** Retrieval, ranking and
    clustering must stay deterministic and free. If AI features are ever added, follow the
    guardrails in `docs/ROADMAP.md` (opt-in, on-demand, tiny inputs, cached, BYOK).
13. **Citation formatters are pure and unit-tested** (`lib/citation.ts`, `tests/citation.test.ts`
    with expectations derived by hand from each style's rules). Change a style only together
    with its tests. Async enrichment with Crossref lives in `lib/cite.ts`; Crossref data
    wins over Semantic Scholar's, and every style must still work without it.
14. **Files the user imports are untrusted input.** `parseBackup`/`normalizeSaved`
    (`lib/backup.ts`) validate shape and keep only http(s) URLs; never render or link raw
    imported fields. Import merges, it never overwrites the user's own status/notes.
15. **Copy-to-clipboard goes through `useCopyAction`** (`components/useCopyAction.ts`):
    citations may need network calls first, and browsers reject clipboard writes when too
    much time passed since the click; the hook falls back to a "Pulsa para copiar" step.
    Do not add the `clipboardWrite` permission (it shows an install warning).
16. **Do not name or copy other products** (inspiration is fine, mentions and clones are
    not) in code, UI, README or manifest text.
17. **Precision over coverage for anything inferred.** If we are not sure a piece of information is
    true, do not show it: a missing chip is better than a wrong one (a standing project priority).
    Heuristics (`lib/study.ts`, cluster labels) must return nothing when the text is
    ambiguous, and any new one must be audited by reading its output on real abstracts — including a
    set it was not tuned on — before it ships. Tests written by the author alone are not enough.
18. **No API key in the bundle, one key per user.** The key is entered by each user (setup screen /
    Ajustes), stored only in `chrome.storage.local`, and sent only to Semantic Scholar. `npm run
    build` must produce an extension in which the key does not appear (`scripts/e2e-setup.cjs`
    checks it). Links from API or imported data become an `href` only through `httpUrl`; refs read
    from a page are bounded (`extract-ref`, `isPlausibleRef`).
19. **The interface is bilingual (Spanish / English) and language-neutral underneath.** Every visible
    string lives in `lib/i18n/en.ts` (source of truth) and `es.ts` (same keys, enforced by the type and
    `tests/i18n.test.ts`: same placeholders, same plural forms). Never put a translated sentence into
    stored or cached data: job state, updates and results carry **codes** (`ErrorCode`, `Step`, the
    `RELATED_GROUP` / `ALL_GROUP` sentinels) and are translated when rendered, so switching language
    needs no re-analysis. Keys ending in `.hint` are the hover explanations (`<Hint>` or `title`);
    a new control gets one. Use `useT()`; icon-only buttons need an `aria-label`.
20. **Colors are design tokens.** Every color is a CSS variable in `style.css` (light and dark),
    exposed through `tailwind.config.js` (`bg-surface`, `text-muted`, `bg-accent-soft`...). Never use a
    palette class (`text-slate-500`) or a hex code in a component: it would stay light in a dark popup
    (`tests/design-tokens.test.ts` fails on it). Icons are the inline SVGs in `components/icons.tsx`. The
    popup is a fixed 600 px frame: the header and tabs stay, the content scrolls.

## Conventions

- Prettier: no semicolons, double quotes, no trailing commas, 80 cols, imports sorted.
- UI strings are in the dictionaries (Spanish and English); code, identifiers and comments are English. Comments only for
  non-obvious *why* (hidden constraints, API quirks) — one short line, no docstrings.
- Path alias `~` = project root (e.g. `~lib/pipeline`, `~components/PaperCard`).
- Tailwind 3 (not 4: Plasmo's Parcel cannot resolve Tailwind 4's `node:module` import).
- Plasmo entry points are file-name conventions at the repo root: `popup.tsx`,
  `background.ts`. There is intentionally **no static content script** (it would need
  broad host permissions); the popup injects the extractor on demand (`activeTab` +
  `scripting`).
- Developed on Node 22 / Windows / Git Bash. When writing files from a shell, avoid heredocs with
  quotes or backticks — they silently break the whole command. Use the editor tools.
- When you change what `lib/` asks an API for (a field, an endpoint) or reads from an answer, update
  `scripts/api-contract/` (`requests.cjs`, `shapes.cjs`) and the imitation in `scripts/e2e-offline/world.cjs`:
  `tests/api-contract.test.ts` fails if `lib/` and the nightly check disagree, and validates the
  imitation's answers with the same shapes.
- CI (`.github/workflows/ci.yml`) runs `typecheck`, `format:check`, `test:coverage` (floors on
  `lib/`) and `plasmo build`. Commit small, working steps.
- Tests of storage-bound modules use the in-memory `chrome` in `tests/helpers/chrome.ts`. **Do not generate
  regexes or code with escapes through shell/Node scripts** (backslashes get eaten or turned into control
  characters, twice this broke a regex silently): use the editor tools.
- A test that has never failed proves nothing: when adding one for a fix, revert the fix once and see it fail.

## Where things are

```
popup.tsx            UI shell: tabs, search, trail (Explorar), filters/sort, saved tab
background.ts        service worker: runs analyses, daily alerts alarm, badge, keep-alive
components/          PaperCard, LibraryItem (status, note, collections), LibraryTools (backup/import),
                     RelatedTab, SavedTab, UpdatesTab, SearchField, icons, CitationButtons + useCopyAction (copy/export with progress), Timeline (SVG)
lib/model.ts         shared types and sentinels (ScoredPaper, AnalysisResult, SavedPaper, *_GROUP): types only, no imports of logic
lib/pipeline.ts      THE core: candidates -> embeddings -> ranking -> clusters -> picks
lib/semantic-scholar.ts   API client (seed, candidates, batch papers, search, recent)
lib/s2-fetch.ts, rate-limit.ts, api-key.ts   HTTP discipline (see rule 1-2); the key comes from lib/settings.ts (per user)
lib/settings.ts, url.ts, ref.ts             settings + key check; http(s)-only links; bounded refs
lib/clustering.ts, vector-math.ts, keywords.ts   from-scratch ML (hierarchical clustering, silhouette, labels)
lib/timeline.ts                              timeline-by-subtopic data
lib/keywords.ts                              subtopic labels (titles, coverage + contrast rules)
lib/study.ts                                 study design + sample size from the abstract (pure, derived at render time, not stored)
lib/citation.ts, cite.ts, crossref.ts        9 styles + in-text (pure, tested); async Crossref enrichment; Crossref client/cache
lib/backup.ts, import.ts, export.ts          backup/merge (pure, tested), BibTeX/RIS/DOI import (pure parsers, tested), file download
lib/library.ts, updates.ts, queue.ts, view.ts, paper-utils.ts, extract-ref.ts
components/KeySetup.tsx, useAnalysis.ts, useStorageValue.ts, ui.ts   setup/settings screen; analysis hook (job + watchdog + cached result); storage hook; class strings
components/i18n.tsx, lib/i18n/{en,es,index}.ts, lib/errors.ts   interface language (see rule 19); typed errors and their codes
lib/cache.ts, compress.ts, job.ts            compressed result cache, pruning, JobState (no result inside)
scripts/             real-browser e2e tests (see above); scripts/perf/ = API performance experiments
```
