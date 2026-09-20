# Roadmap

State as of 2026-09-19. Everything in the free layer costs **nothing per use** (no
servers, no LLM). The optional AI layer at the end is designed around tiny, cached,
on-demand calls so the cost stays negligible. Read `CONTRIBUTING.md` rules first.

Effort: S ≈ ≤1 session, M ≈ 1–2, L ≈ 3+. Value: ★ to ★★★.

## 0. Foundations — do these before adding features

| # | Item | Why / how |
|---|---|---|
| F0.1 | ~~Storage hygiene~~ **DONE 2026-09-19** | Result stored once, gzip-compressed (`lib/compress.ts`), bounded cache (40 entries, 24 h), pruning of legacy/expired/orphan keys (`pruneStorage`), clear-and-retry on write failure, `unlimitedStorage` as a safety net. One analysis went from ≈112 KB to ≈14.6 KB (~716 per 10 MB instead of ~93). Verified by `scripts/e2e-storage.cjs`. Remaining idea (optional): compress the library too if users ever save thousands of papers. |
| F0.2 | ~~Version control + CI~~ **DONE 2026-09-20** | Git repo on `main` (`.env.local` ignored), `.github/workflows/ci.yml` runs `tsc --noEmit`, `npm test` and `plasmo build` on every push/PR. `submit.yml` is Plasmo's manual Web Store template and is unrelated to CI. Not pushed to a remote yet. |
| F0.3 | ~~Unit tests for pure modules~~ **DONE 2026-09-19** | vitest 2.x (`npm test`; vitest ≥3 needs a newer `@types/node` than Plasmo pins) with jsdom for the extractor: 110 tests over `citation`, `import`/`backup`, `kmeans`/`silhouette`/`clusterAuto` (synthetic blobs, plus a mutation check that breaking the code fails them), `view`, `keywords`, `terms`, `projection`, `timeline`, `pipeline` (`assemble`, `dedupe`, `choosePicks`), `extractPaperRef`. Not unit-tested: `analyzePaper`/`analyzeQuery`, `s2-fetch` retries, `updates` (covered by the e2e scripts). |
| F0.4 | ~~Surface background failures~~ **DONE 2026-09-20** | `lastError` in `nextpaper_updates`, shown in `UpdatesPanel`. |
| F0.5 | Split `popup.tsx` — **partly done 2026-09-20** | `SavedTab`, `useStorageValue` and `ui.ts` extracted (650 → 512 lines). Left: `useAnalysis(activeRef)` (job + watchdog + cached result) and a `RelatedTab`. Behavior must not change (run the four e2e scripts). |

## 1. Free layer — quick wins (no cost, no AI)

| # | Item | Value | Effort | Notes |
|---|---|---|---|---|
| F1.1 | ~~Accurate citations via Crossref~~ **DONE 2026-09-19** | `lib/crossref.ts` + `lib/cite.ts`: structured authors, issue, article number, month, journal abbreviation; cached per DOI (bounded); falls back to Semantic Scholar's data (arXiv DOIs are not in Crossref). Verified in a real browser (`scripts/e2e-library.cjs`). Remaining idea: DataCite lookup for arXiv DOIs. |
| F1.2 | ~~More citation styles + in-text~~ **DONE 2026-09-19** (hand-written) | APA 7, MLA 9, Chicago author-date, Harvard, IEEE, Vancouver, AMA, BibTeX, RIS + in-text for author-date styles, all unit-tested. **Optional upgrade:** `citeproc-js` + a bundled subset of CSL styles for exact journal-specific styles (needs CSL-JSON mapping and bundle-size care). |
| F1.3 | Better open-access coverage | ★★ | S | Unpaywall (free, needs an email param) by DOI for PDF links when Semantic Scholar has none. Host permission `https://api.unpaywall.org/*`. |
| F1.4 | Library upgrades — **mostly done 2026-09-19** | Done: collections (add/remove/filter/delete), **backup/restore JSON**, **import** BibTeX/RIS/DOI/title lists (merge, never overwrites; hostile files sanitized), verified by `scripts/e2e-import.cjs`. **Remaining:** search + sort inside *Guardados*, bulk actions (multi-select → collection/status), rename collection, duplicate detection across differently-identified papers, map BibTeX `note` / RIS `N1` back to notes on import. |
| F1.5 | Extra filters | ★★ | S | Year range, minimum citations, "last 5 years", exclude preprints. Extend `lib/view.ts`; all data is already on each `ScoredPaper`. |
| F1.6 | ~~Study-card heuristics~~ **DONE (design + sample) 2026-09-20** | `lib/study.ts`: design (14 categories) and sample size (participants, or *included* studies for reviews), derived at render time (nothing stored, no cache bump). Chips on every card (*Relacionados* and *Guardados*) and a **Diseño** filter listing only the designs present. **Precision over coverage** (see `docs/PRODUCT.md`): it says nothing when the text is ambiguous. Audited by reading the evidence behind every chip on ~1,250 real abstracts in two rounds (the second, unseen set caught errors the first did not; each is a regression test). Coverage: design ~40–55%, sample ~25–30%. Ideas left: population keywords, measures, a sortable table of saved papers → CSV (the free version of A2), filter by minimum *n*. |
| F1.7 | Dark mode, keyboard shortcuts, a11y | ★ | S | Tailwind `dark:` variants (config `darkMode: "media"` already set). |
| F1.8 | English UI (i18n) | ★★ | M | Widens the audience. Centralize strings first (currently inline Spanish). |
| F1.9 | Stale-while-revalidate | ★ | S | Show an expired cached result immediately, refresh silently. |
| F1.10 | Performance follow-ups | ★★ | M | Cold analysis is ~4.5–9 s (was 15–34 s). Not done: pipeline the first batch with search/recommendations (~0.9 s), progressive display of a first result, trimming candidates. Details and measurements in `docs/PERFORMANCE.md`. Do these only if cold time matters again; do not trade away relevance. |

## 2. Free layer — differentiators

| # | Item | Value | Effort | Notes |
|---|---|---|---|---|
| F2.1 | ~~Literature map~~ **DONE 2026-09-19, then replaced** | A PCA scatter map was built and then **replaced by a timeline by subtopic** (`lib/timeline.ts`, `components/Timeline.tsx`) after the user questioned its value: the scatter was unlabeled and duplicated the groups; the timeline shows classic-vs-recent per subtopic, where the cited work sits and where the open paper falls in time (zero extra API calls). Ideas left: citation edges between papers, labelling the most-cited dots, a large labelled/zoomable semantic map in the workspace page (F3.4, would reuse `lib/projection.ts`). |
| F2.2 | ~~"Why is this relevant?"~~ **DONE (word-level) 2026-09-19** | "Coincide en: …" on each card: distinctive terms shared with the open paper (IDF over the candidate set; only terms the paper emphasizes). Not shown in topic search. Ideas left: phrases/bigrams (e.g. "body image"), and the AI feature A1 for a full sentence. |
| F2.3 | **How others cite this paper** | ★★★ | M | Semantic Scholar `/citations` accepts `contexts` and `intents` (background / method / result) — verified 2026-09-19 (HTTP 200). **Coverage is partial:** they came back empty for very recent citing papers, so treat it as best-effort and hide the UI when empty. Show the citing sentence and let the user filter citers by intent (e.g. "methodology"). Free. |
| F2.4 | Screening mode | ★★★ | M | Full-window "cards" view for triage: one abstract at a time, keys `j/k` navigate, `s` save, `x` dismiss, tag reasons. Big for literature reviews. Feeds F2.6. |
| F2.5 | Saved topic searches + alerts | ★★ | M | Re-run saved `QUERY:` searches daily and show only unseen results; reuse `lib/updates.ts` (`seen` set). |
| F2.6 | PRISMA-lite log | ★★ | M | Count identified / screened / included / excluded (with reasons) per project; CSV export. Systematic-review support. |
| F2.7 | Better cluster labels | ★★ | S | c-TF-IDF with bigrams, plus the *representative paper* of each cluster (closest to the centroid) as a chip. Replaces "Italian / Properties"-style labels. |
| F2.8 | Author / venue radar | ★★ | M | Follow authors (S2 author endpoints) and see their new papers in *Novedades*. |
| F2.9 | Side panel | ★★ | M | `chrome.sidePanel` keeps the tool next to the article. Challenge: `activeTab` is lost on navigation — needs an explicit re-run button or an optional broader permission. |

## 3. Free layer — big bets (heavier or riskier)

- **F3.1 On-device embeddings** (L, ★★★): run a small sentence-embedding model locally
  (transformers.js + ONNX/WASM, e.g. a MiniLM-class model, ~25 MB) so users can **paste
  their own abstract / research question / draft paragraph** and rank the results and their
  library against it — free forever, private. It is a different vector space than SPECTER2,
  so use it consistently on title+abstract. Risks: MV3 CSP needs `wasm-unsafe-eval`,
  model download on first run, run in an offscreen document rather than the service
  worker, bundle size. Prototype and measure before committing.
- **F3.2 Local full-text search** (L, ★★): the user drops their own PDFs into a workspace
  page (no host permissions needed), extract text with pdf.js, index with MiniSearch.
- **F3.3 Shared cache backend** (L, ★): only if scale makes Semantic Scholar's rate limit
  the bottleneck. A free-tier edge worker could pool/cached API calls. It breaks the
  "no server" principle — decide deliberately.
- **F3.4 Workspace page** (M, ★★): a full tab (extension page) for big libraries,
  screening, map and exports; the popup stays lightweight.

## 4. Optional AI layer — designed for negligible cost

The idea: keep retrieval, ranking and clustering **free and deterministic**, and add AI only
where words must be *understood or written*, with inputs so small that a heavy user spends
cents. Token counts below are estimates; the dollar figures assume a small, fast model at
roughly **$1 per million input tokens and $5 per million output tokens** (verify current
pricing before committing to numbers).

### Guardrails (non-negotiable if this is ever built)

1. **Opt-in per feature, never automatic.** The user clicks; the UI says what will be sent.
2. **Item-level, on demand.** No silent bulk spending; a per-day budget cap in settings.
3. **Tiny inputs.** Title + abstract + tl;dr only; truncate; never full text.
4. **Cache every output** per `(paperId, feature, model, promptVersion)` in bounded local
   storage — repeat clicks cost nothing.
5. **Small model by default;** a larger one only for multi-paper synthesis.
6. **AI never touches retrieval/ranking/clustering** (auditable, reproducible, free). It only
   explains, extracts or drafts from papers already retrieved.
7. **Never invent references.** The prompt may cite only the provided papers; outputs are
   labelled AI-generated and show the source snippet.
8. **Structured (JSON) outputs** to minimize tokens and avoid parsing errors.
9. **Free heuristic first** (F1.6, F2.2 exist for this reason); AI only where it cannot do it.
10. **Privacy:** abstracts leave the device only after explicit consent.

### Candidate features and their cost

| # | Feature | Tokens in / out | ≈ cost per action | Value | Free alternative to build first |
|---|---|---|---|---|---|
| A1 | One-sentence "why this is relevant to *my* paper" per result | ~600 / ~60 | ≈ $0.001 | ★★★ | F2.2 shared-terms highlight |
| A2 | Study card: design, n, population, measures, main finding, limitations (for saved papers → sortable table → CSV) | ~450 / ~120 | ≈ $0.001 per paper | ★★★ | F1.6 regex chips |
| A3 | Name + one-line summary for each subtopic cluster | ~460 / ~60 per analysis | < $0.001, cached | ★★ | F2.7 better labels |
| A4 | Screening assistant: include / exclude / maybe against the user's criteria, with a one-line reason | ~400 / ~25 per abstract | ≈ $0.0005 → ~$0.10 per 200 abstracts | ★★★ | F2.4 manual screening mode |
| A5 | Related-work outline from saved papers + the user's notes (cites only saved papers) | ~5,000 / ~600 | ≈ $0.01 (small model) | ★★★ | none |
| A6 | Research question → search queries and keyword suggestions | ~150 / ~100 | < $0.001 | ★★ | none |
| A7 | Plain-language / Spanish translation of tl;dr and abstracts | ~350 / ~250 | ≈ $0.0015 | ★ | none |

Rough monthly cost for one active user doing ~300 light actions (A1/A2/A3/A6): **around
$0.3**; a heavy systematic-review user screening ~2,000 abstracts (A4): **around $1**.
Prompt caching and the per-item cache lower this further.

### Delivery models

- **Bring-your-own-key (recommended first step):** the user pastes their own API key
  (stored in `chrome.storage.local`). No backend, no cost to us, no key-hiding problem.
  Friction: users must have a key — fine for researchers/developers, weak for a mass market.
- **Hosted credits:** the real cost is not tokens, it is the **backend** needed to hide the
  key, authenticate users, rate-limit and bill. That breaks the "no server" principle and
  adds recurring maintenance. Only worth it after BYOK proves demand. At the numbers above a
  small monthly plan would be comfortably margin-positive.
- **Decision rule:** ship F0 + a few free items first; add the AI module as opt-in BYOK
  (A2, A1, A4 first — the ones with the strongest triage value), measure real usage, and
  only then consider hosting.

## 5. Suggested order

1. ~~F0.1~~, ~~F0.2~~, ~~F0.3~~ done (storage, git + CI, unit tests). Next: push to a remote so CI actually runs.
2. ~~F1.1 + F1.2 + F1.4~~ done (see above; finish the F1.4 remainder if wanted).
3. ~~F2.1 + F2.2~~ done; **F2.3** (how others cite this paper) is next in this group.
4. ~~F1.6~~ done; **F2.4** (screening mode) is next — it builds the triage workflow that the AI
   layer would later enhance, and the design/sample chips are its first inputs.
5. Decide on the AI layer (BYOK), with A2/A1/A4 first.

## 6. Non-goals

No scraping of paywalled content or shadow libraries; no telemetry or accounts in the
free layer; no LLM in retrieval or ranking; no server unless a deliberate, documented
decision (F3.3 / hosted AI credits); no naming or copying of competitor products.

## 7. Checklist before finishing any change

1. `npx tsc --noEmit` and `npx plasmo build` pass.
2. For network/UI/storage changes: `node scripts/e2e-explore.cjs` and
   `node scripts/e2e-library.cjs` pass in a real browser.
3. Result shape or retrieval strategy changed → bumped `KEY_PREFIX` in `lib/cache.ts`.
4. Library item shape changed → backward compatible defaults in `getLibrary`.
5. `docs/ARCHITECTURE.md` (and `docs/PRODUCT.md` if user-visible) updated.
6. No rule in `CONTRIBUTING.md` violated.
