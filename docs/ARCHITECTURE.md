# Architecture

State as of 2026-09-19. Verified against the code and by real-browser e2e runs
(`scripts/`). If you change behavior, update this file in the same change.

## 1. Runtime overview

```
 web page (any site)                popup.tsx (React)                 background.ts (service worker)
 ───────────────────                ─────────────────                 ──────────────────────────────
 <meta citation_doi ...>  ◄─inject─ extractPaperRef()  (activeTab+scripting, on demand)
                                    activeRef = trail.top ?? pageRef
                                    sendMessage {type:"analyze", ref} ──► inFlight map (dedupe per ref)
                                    observes chrome.storage           ◄── writes JobState  nextpaper_job_<ref>
                                    nextpaper_job_<ref>                    analyze(ref) in lib/pipeline.ts
                                    watchdog: re-send "analyze" /25 s      └─ s2Fetch → api.semanticscholar.org
                                    while phase === "loading"              keep-alive interval while busy
                                                                           daily alarm → checkForUpdates()
```

- **The popup is only a view.** It dies whenever the user clicks away. All work happens in
  the service worker, which reports progress through `chrome.storage.local`. Reopening the
  popup resumes observing the same job. The job state only signals completion; the
  finished result is read from the compressed cache.
- **Paper reference (`ref`)** is a Semantic Scholar id string: `DOI:…`, `ARXIV:…` (version
  suffix stripped), `PMID:…`, `PMCID:…` (numeric, no "PMC" prefix), a raw S2 `paperId`
  (used by *Explorar*), or `QUERY:<lowercased text>` (topic search).
- **Manifest** (declared in the `manifest` block of `package.json`, Plasmo generates the
  file): permissions `activeTab`, `alarms`, `scripting`, `storage`, `unlimitedStorage`; host permissions
  `https://api.semanticscholar.org/*` and `https://api.crossref.org/*`. No content scripts.

## 2. The analysis pipeline (`lib/pipeline.ts`)

`analyze(ref)` dispatches on the `QUERY:` prefix.

### Paper mode (`analyzePaper`)

1. Cache lookup (`getCachedResult`), 7-day TTL.
2. **One request** (`getSeed`) returns the seed's title, abstract, year, `fieldsOfStudy`,
   `embedding.specter_v2`, its **references** and up to 1000 **citing papers** (with citation count and
   year). In parallel, the "recent" recommendations for the same id are already running
   (`getRecommendedIds`, started alongside; failures resolve to null). 404 → `PaperNotFoundError`;
   exhausted retries → `RateLimitedError`.
3. `collectCandidates(seed, recentEarly)`: references and citers come from step 2 with no request
   (citers: the **60 most cited + 40 most recent** of the ≤1000). Then, **in parallel**: title search
   (`limit=30`), the "recent" recommendations (reused from step 2, or retried with the canonical id if
   the early attempt failed) and — **only if the seed is Computer Science** — the `all-cs` pool.
   Result: `Map<paperId, Set<"reference"|"citation"|"search"|"recommended">>`.
4. `getPapers(ids)` — metadata + SPECTER2 embeddings of every candidate through `POST
   /graph/v1/paper/batch`, split into **parallel chunks of 100 ids** (measured faster and steadier than one
   big request). Only usable from the extension thanks to `host_permissions`.
   Critical path: seed ∥ recs → search ∥ CS pool → batch chunks ∥ (≈4.5–9 s cold; see
   `docs/PERFORMANCE.md`).
5. `dedupe` by normalized title (keeps the most cited version, merges `sources`), and drop
   any candidate whose title equals the seed's (another version of the same paper).
6. Ranking: cosine similarity to the seed embedding. If the seed has no embedding (usually
   no abstract), `fallbackReference` = centroid of multi-source or citation-neighborhood
   candidates, and results are marked `approximate` (UI shows `~NN% similar`).
7. `assemble()`: shortlist = top 40 by cosine; `blended = cosine + 0.02·log10(1+citations)`
   breaks near-ties toward established work; keep top 18 (`TOP_N`).
8. Clustering: `clusterAuto` runs k-means for k∈[2, min(4, ⌊n/2⌋)], merges clusters
   smaller than 2, and keeps the k with the best **silhouette score**. Labels come from
   `labelClusters` (distinctive words by document-frequency lift vs. all clusters).
   Groups are ordered by mean score.
9. `choosePicks` ("Empieza por aquí"): *foundational* = most cited older-than-2-years paper
   (prefers ones the seed references), *review* = best blended paper where `isReview`,
   *recent* = best blended from the last 2 years; all distinct.
10. `strip()` removes embeddings, adds `similarity`, `approximate`, `relation`
    (`reference` | `citation` | null).
11. **Timeline data**: `AnalysisResult.seedYear` (the open paper's year) is stored; the chart itself is
    derived in the popup by `buildTimeline(groups, seedYear)` (`lib/timeline.ts`) from data every
    `ScoredPaper` already has (year, citations, group) — nothing extra is stored per paper.
12. **Shared terms** (paper mode only, `attachSharedTerms` → `lib/terms.ts`): the ≤3 distinctive
    words each result shares with the open paper, stored as `ScoredPaper.sharedTerms`. Only terms
    the open paper *emphasizes* are eligible (its title words + words repeated in its abstract);
    words present in >60% of the candidates are dropped as generic (only when there are ≥8
    candidates); a long list of function/academic-filler words is excluded. Not used in topic
    mode: every result contains the query words, so there is nothing informative to say.
    Result cached as `AnalysisResult {groups, picks, map?}`.

### Topic mode (`analyzeQuery`)

`searchPapers` (limit 100, Semantic Scholar relevance order) → `getPapers` → dedupe →
score = relevance rank mapped to (0.9, 1] → `assemble` with `QUERY_TOP_N = 24` and up to 5
clusters, `showScore: false` (no seed, so no similarity %).

### Fallbacks

`flatFallback` (one "Relacionados" group ordered by citations) when fewer than 2 candidates
have embeddings. If all candidate/batch requests fail → `RateLimitedError` → popup shows
the message and a *Reintentar* button; nothing is cached.

## 3. Modules

| File | Responsibility |
|---|---|
| `popup.tsx` | UI shell (~510 lines): tabs, topic search, `trail` (Explorar breadcrumb), filters/design filter/sort, picks, timeline, bulk copy. Mirrors storage with `useStorageValue` (library, alerts). |
| `components/SavedTab.tsx` | The whole *Guardados* tab: status/collection filters, alerts panel, backup/import, bulk citation export, one `LibraryItem` per paper. |
| `components/useStorageValue.ts`, `components/ui.ts` | Hook that mirrors a `chrome.storage.local` key (read + re-read on change); shared class strings (`buttonClass`, `pillClass`). |
| `background.ts` | Message handler (`analyze`, `check-updates`), `inFlight` dedupe, `syncKeepAlive`, alarm `nextpaper-updates` (first after 5 min, then 24 h), badge refresh on start. |
| `components/PaperCard.tsx` | Card: title link, ★, authors, tl;dr, abstract toggle, tags (citations, similarity, relation, Revisión, reading status), actions (Explorar, PDF gratis, Citar). |
| `components/Timeline.tsx` | SVG chart of `buildTimeline`: one lane per subtopic, dots by year (radius = log citations), dashed line = the open paper's year, filtered-out papers dimmed, click → `selectPaper` (highlights + scrolls to the card via `data-paper-id`). |
| `components/LibraryItem.tsx` | Reading status chips, collection chips + add box, note textarea (saved on blur). |
| `components/LibraryTools.tsx` | "Copia de seguridad" and "Importar..." (one picker: NextPaper backup or BibTeX/RIS/DOI list); always visible, even with an empty library. |
| `components/CitationButtons.tsx`, `useCopyAction.ts` | `CopyCitationsButton`, `ExportButton` with progress, and the copy phases hook (busy → copied, or "Pulsa para copiar" fallback). |
| `components/UpdatesPanel.tsx` | "Novedades para ti": items with "Porque guardaste…", *Nuevo* tag, dismiss, "Buscar ahora". |
| `lib/semantic-scholar.ts` | API client: `getSeed`, `collectCandidates`, `getPapers`, `getPapersAligned` (import: same order, `null` for unknown, throws on failure), `searchPapers`, `getRecommendedIds(ref, pool, limit)` (alerts use limit 15). One shared `postBatch` → **parallel chunks of 100** for both batch lookups. Ids go into the URL path through `paperPath` (a DOI with `#` or `?` would otherwise be truncated and query a different paper). `getJson` (null on failure + `console.warn`). |
| `lib/s2-fetch.ts` | `s2Fetch` (limiter + up to 8 **short** retries on 429/5xx/network errors via `retryDelay`: 0.35 s ×1.5 up to 3 s, + ≤250 ms jitter; honors Retry-After if ever sent) and `RateLimitedError`. |
| `lib/rate-limit.ts` | `createLimiter(maxConcurrent, minGapMs)` (start slots reserved synchronously) and the shared instance: **3 in flight, 120 ms between starts**. No fixed pause between requests — see `docs/PERFORMANCE.md`. |
| `lib/api-key.ts` | `x-api-key` header from `process.env.PLASMO_PUBLIC_S2_API_KEY`. |
| `lib/pipeline.ts` | See §2. Also `QUERY_PREFIX`, `PickKind`, `ScoredPaper`, `AnalysisResult`. |
| `lib/kmeans.ts` | `kMeans` (k-means++ init, seeded mulberry32(42), Lloyd ≤25 iters, L2-normalized vectors ⇒ Euclidean ≈ cosine), `mergeSmallClusters`, `silhouetteScore`, `clusterAuto`. |
| `lib/vector-math.ts` | dot, norm, cosine, normalize, euclidean, mean. |
| `lib/keywords.ts` | `labelClusters` (EN/ES stopwords, words >3 chars). |
| `lib/projection.ts` | `project2D(vectors)`: PCA to 2-D via the Gram matrix. **Currently unused** by the product (the scatter map built on it was removed, see decision log); kept with its tests as a building block for a future full-window view (ROADMAP F3.4). |
| `lib/timeline.ts` | `buildTimeline(groups, seedYear?)`: per-subtopic lanes with year span/median, axis domain widened to include the open paper, round ticks, count of undated papers; `null` with fewer than 4 dated papers. |
| `lib/terms.ts` | `sharedTerms(reference, docs, maxTerms, referenceTitle?)`: IDF-weighted distinctive terms shared with the reference; naive singularization; generic-word list. |
| `lib/study.ts` | **Pure** study-card heuristics: `extractStudy` → `{design, sample}`; `studyOf` memoizes per paper object (WeakMap); **derived at render time, not stored** (no cache bump, works on old saved papers). **Precision over coverage.** Design: `DESIGNS` is ordered (first match wins: protocol → meta → systematic → rct → trial → psychometric → experimental → review → case-control → cohort → mixed → cross-sectional → qualitative → case); a pattern matches the **title** or an abstract sentence that talks about the study itself (`SELF` cues) and is not about earlier work (`BACKGROUND`); `titlePattern` is title-only; text beats `publicationTypes`; conflicting pairs (cohort vs cross-sectional, qualitative vs survey words) give no design; Unicode hyphens are normalized. Sample: a figure is reported only if it is the single figure, or the one introduced as the whole sample (`TOTAL_CUE`) with no other figure above half of it; group sizes (`n =`, "in each group", joined figures), invited pools, shares ("(80%)"), repeated measurements, spelled-out counts and "aged 18 and 65" ranges make it return nothing; reviews use only the studies *included* and give nothing when two counts conflict. Regressions in `tests/study.test.ts`, all from real abstracts. |
| `lib/citation.ts` | **Pure** formatter (`formatCitation(paper, style, meta?)`, `inTextCitation`): APA 7, MLA 9, Chicago author-date, Harvard (Cite Them Right), IEEE, Vancouver, AMA, BibTeX, RIS. `toRef` normalizes Semantic Scholar + optional Crossref data (Crossref wins); without Crossref, author names are parsed heuristically (last word = family). `citationKey` = author+year+first title word. Unit-tested (`tests/citation.test.ts`). |
| `lib/crossref.ts` | Crossref client: `getCrossref(doi)` → structured authors, issue, article number, month, ISO/NLM journal abbreviation. Own 300 ms queue; cache `nextpaper_crossref_v1_<doi>` (30 d hit / 7 d miss, ≤500 entries). Optional `PLASMO_PUBLIC_CROSSREF_MAILTO` for the polite pool (never set by default). |
| `lib/cite.ts` | Async layer: `citeOne`, `inTextOne`, `citeMany` (sequential, progress callback) = Crossref lookup + formatter. |
| `lib/export.ts` | `downloadFile` (Blob + `<a download>`). |
| `lib/backup.ts` | **Pure**: backup file format, `parseBackup`/`normalizeSaved` (**whitelist**: every field is rebuilt with its expected type, so a wrong type cannot reach React and blank the popup; http(s)-only URLs; length/count caps; ≤5000 items; analysis context dropped), `mergeItems` (adds new papers, keeps the user's status/note, unions collections). |
| `lib/import.ts` | Import from BibTeX / RIS / plain DOI-or-title lists: pure `parseReferences`, `similarTitles`, and `resolveReferences` (DOIs via one aligned batch; ≤25 titles via search + title-similarity check). |
| `lib/library.ts` | Saved papers with `status`, `note`, `collections`; writes queued (`toggleSaved`, `updateSaved`, `deleteCollection`, `addPapers`, `restoreItems`); `collectionCounts`. Saved papers go through `plainPaper`, so **similarity / relation / shared terms of the analysis they came from are not kept** (in Guardados nothing is "open"); `getLibrary` also cleans items saved by older versions. |
| `lib/queue.ts` | `createQueue()`: runs async tasks one at a time (a failed task does not block the next). Orders work **within one JS context** only; popup and worker are separate, so cross-context state re-reads right before saving (see `updates.ts`). |
| `lib/updates.ts` | Daily alerts: for the 8 latest saves, `recent`-pool ids (≤5 new each) → one batch for metadata; `seen` prevents repeats; badge = unseen count. Every change re-reads the state right before writing (a check lasts seconds; dismissing or viewing meanwhile used to be undone). `lastError` records why a check failed and `UpdatesPanel` shows it. |
| `lib/view.ts` | Filters (`reference`, `citation`, `review`, `open`), an independent design filter (`DesignFilter`, `designOptions` = designs present with counts) and sorts (`relevance` keeps groups; `citations`/`year` flatten). |
| `lib/paper-utils.ts` | `isReview`: title patterns or a review design declared in the text (`studyOf`); Semantic Scholar's `Review` type is **not trusted** (it tagged 109 of 430 papers whose text declares a trial, cohort or survey; `MetaAnalysis` is consistent and kept through `study.ts`). `plainPaper`: a paper with no analysis context and no embedding. |
| `lib/extract-ref.ts` | Self-contained page extractor (see Rules in `CONTRIBUTING.md`). |
| `lib/cache.ts` | Compressed result cache (`v9`, 7-day TTL), `pruneStorage` (expiry, 40-entry cap, legacy keys, orphan jobs; runs after each analysis and at worker start) and a clear-and-retry on write failure. |
| `lib/compress.ts` | `compressJson` / `decompressJson`: native gzip (`CompressionStream`) + base64. |
| `lib/job.ts` | `JobState` (`loading` \| `done` \| `error`; **no result inside**), `JOB_PREFIX`, `jobKey`. |

## 4. Storage schema (`chrome.storage.local`)

| Key | Value | Lifetime / bound |
|---|---|---|
| `nextpaper_job_<ref>` | `JobState`: `{phase:"loading",step?}` \| `{phase:"done"}` \| `{phase:"error",message}` (a few bytes) | Pruned when its cache entry disappears |
| `nextpaper_cache_v9_<ref>` | `{z, cachedAt}` where `z` = base64(gzip(JSON of `AnalysisResult`)) | 7-day TTL **and** newest 40 entries only; removed by `pruneStorage` |
| `nextpaper_library` | `Record<paperId, SavedPaper>` (`ScoredPaper` + `savedAt`, `status`, `note`, `collections`) | permanent, never pruned |
| `nextpaper_crossref_v1_<doi>` | `{m: CrossrefMeta \| null, at}` (`null` = Crossref has no record, e.g. arXiv DOIs) | 30 d hit / 7 d miss, newest 500 kept (`pruneStorage`) |
| `nextpaper_updates` | `{running, checkedAt, lastError, seen[≤600], items[≤40]}` | permanent, bounded |

Older prefixes (`nextpaper_cache_v1..v5_`, `nextpaper_emb_v1_`, `nextpaper_rec_v1_`) are
deleted on sight (`LEGACY_KEYS`), as are job states written in the old shape (with an
embedded `result`). If the popup finds a `done` job with no cached result it re-analyzes
once (self-healing).

Measured 2026-09-19 (`node scripts/e2e-storage.cjs`): one analysis ≈ **14.8 KB** (with shared terms) (was ≈112 KB
before compression and de-duplication) ⇒ with the 40-entry cap the cache stays under
~0.6 MB. The `unlimitedStorage` permission removes the hard 10 MB quota as a safety net for
a very large library (no install warning). If a write still fails, all cache entries are
dropped and the write retried once; the library and alerts are separate keys and are never
deleted.

## 5. Semantic Scholar API facts (all verified in a real browser or by direct calls)

- Base `https://api.semanticscholar.org`; header `x-api-key` (a bogus key answers 403).
- **429 is random, ~25–45% of requests at ANY pace** (1.0 s, 1.5 s, 2.5 s apart alike), with no `Retry-After` and no CORS headers. Only large simultaneous bursts (12 at once) make it worse. Cold analysis takes ~4.5–9 s with the current strategy (`docs/PERFORMANCE.md`).
- `embedding.specter_v2` works on `/graph/v1/paper/{id}` and the batch endpoint; the
  recommendations endpoint rejects `embedding` and `tldr` (400).
- Batch: `POST /graph/v1/paper/batch?fields=…` body `{ids:[…]}`, ≤500 ids, `null` entries
  for unknown ids. Only usable from the extension thanks to `host_permissions`.
- `/citations` order is arbitrary; `/references` may return `"data": null`.
- `journal.pages` / `journal.volume` can contain whitespace/newlines.
- Recommendation pools: `recent` ≈ fresh papers (mostly 0 citations); `all-cs` is a
  CS-biased corpus. Neither alone gave acceptable relevance for non-CS papers — that is why
  candidates are gathered from several sources and re-ranked by embedding similarity.
- Some papers have no embedding (no abstract indexed). Old Elsevier papers often lack
  references.
- Accepted id prefixes: `DOI:`, `ARXIV:`, `PMID:`, `PMCID:` (numeric), raw `paperId`.

### Crossref facts (verified 2026-09-19)

- `GET https://api.crossref.org/works/{doi}`; CORS `*`; authors come as `{given, family}` (organizations as `{name}`),
  plus `issue`, `article-number`, `page` (may be a single page), `issued.date-parts` (year, month),
  `container-title`, `short-container-title` (sometimes the NLM abbreviation, e.g. "J Eat Disord", sometimes
  identical to the full title), `publisher`.
- DOIs registered elsewhere (arXiv's 10.48550, DataCite) answer 404 → the formatter falls back to Semantic Scholar's data.
- Semantic Scholar reports single pages as "162-162" and can return whitespace/newlines in `journal.*` — both normalized in `toRef`.

## 6. Decision log (why it is built this way)

| Decision | Reason |
|---|---|
| Own candidate retrieval + embedding ranking instead of the recommendations API alone | The API's pools gave off-topic results (e-health/ML papers for a psychology paper). Ranking references/citations/search/recs by SPECTER2 cosine gave fully on-topic results with fewer requests. |
| `host_permissions` for the API host | Extension fetches obey CORS; the API's 429s lack CORS headers and its batch endpoint rejects cross-origin POST. |
| On-demand injection (`activeTab` + `scripting`), no content script | Works on any publisher site with no site list and no broad host permissions. |
| Analysis in a background service worker | Popups close on click-away; the analysis takes 10–50 s. |
| Concurrency limiter + short retries instead of a fixed 1.5 s pause | Measured: 429s are random at any pace, so the pause protected nothing and made a cold analysis 15–34 s (>1 min reported). Now 3 in flight + 0.35 s-growing retries: 4.5–9 s. |
| Nested seed request; search/recs kept but parallel | One request returns seed+references+citations (replaces 3); dropping search/recs would lose most relevant results for heavily cited papers (top-18 overlap 1/18 on Transformers). |
| Batch in parallel chunks of 100 | 1.6–1.8 s steady vs 1.7–5.1 s for one 300-id request. |
| One batched embeddings request | Per-paper GETs cost 13+ requests and tripped the rate limit constantly. |
| From-scratch k-means + silhouette | n ≤ 24 vectors; explainable, dependency-free, and the ML the user wants to show in a portfolio. |
| Timeline by subtopic instead of a semantic scatter map | The PCA scatter (built first) was **removed after review as low-value**: dots are unlabeled, the axes mean nothing readable, and the only thing it showed (which papers share a topic) the groups already say. A per-subtopic timeline answers real questions from data we already have: which lines of work are classic vs recent, where the heavily cited papers sit, how the open paper sits in time relative to each line. A semantic map could earn its place only in a large, labelled, zoomable view (workspace page, ROADMAP F3.4) — `lib/projection.ts` is kept for that. |
| Shared terms limited to what the open paper emphasizes | First version reported any shared word and produced noise ("promote · capable"): in a homogeneous result set the topic words are dropped as generic and only filler remained. |
| Embeddings not stored | 768 floats × N would blow the storage quota. |
| Result stored once, gzip-compressed, in a bounded cache | It used to be stored twice (job + cache) uncompressed: ≈112 KB per analysis ⇒ the 10 MB quota would fill after ~93 analyses and then even library saves would fail. Now ≈14.6 KB, capped at 40 entries, plus `unlimitedStorage` as a safety net. |
| Tailwind 3 | Plasmo's Parcel can't resolve Tailwind 4's `node:module`. |
| Edge for e2e | Branded Chrome ≥137 ignores `--load-extension`. |
| Crossref on demand, not during analysis | Only citations need it; one request per copied/exported paper, cached, so analyses stay at ~8 requests. |
| Hand-written citation styles (not CSL/citeproc) | Nine common styles with unit tests are enough and add no bundle weight; full CSL (10k journal styles) is a possible upgrade (ROADMAP F1.2). Not CSL-certified — say so if users ask. |
| Copy phases instead of `clipboardWrite` | Clipboard writes after a network wait can be rejected; the permission would add an install warning. |
| One import picker for backups and references | Fewer buttons; content sniffing (`parseBackup` first, then BibTeX/RIS/plain) avoids asking the user what the file is. |
| Heuristic author-name parsing | S2 gives free-text names ("S. Mölbert", "Michael J. Black"); wrong for compound surnames. A fix needs a structured source (Crossref) — see ROADMAP. |
| `?ref=` popup param | The only way to drive the popup in automation (no toolbar click ⇒ no `activeTab`). |

## 7. Known technical debt

1. ~~Storage growth with no eviction~~ — fixed 2026-09-19 (see §4).
2. Unit tests (330, `lib/` at ~98% line coverage, floors enforced by `npm run test:coverage`) cover every module in `lib/`: storage-bound ones against an in-memory `chrome.storage` (`tests/helpers/chrome.ts`, with a simulated quota), network-bound ones against a mocked `fetch`/module. Only the UI (popup, components, worker) and real request behavior rely on the e2e scripts.
3. ~~Not under version control~~ — git + CI since 2026-09-20 (no remote yet).
4. ~~`checkForUpdates` failures swallowed~~ — recorded in `lastError` and shown in the panel (2026-09-20).
   `strict` TypeScript is on (2026-09-20); `npm run typecheck`, `format:check` and coverage run in CI.
5. `popup.tsx` is large and mixes several concerns (tabs, search, filters, library).
6. Citation styles are hand-implemented and not CSL-certified; without Crossref (arXiv-only papers) author parsing is heuristic; Vancouver/AMA abbreviations depend on Crossref's short titles; IEEE uses the full journal name.
7. Cluster labels can be uninformative when all results are near-identical (e.g. all
   translations of one scale).
8. Only Edge was automated; PubMed/PMC/MDPI extraction and the real toolbar click
   (`activeTab`) are untested by automation.
9. UI is Spanish-only; abstracts/tl;dr are English.
10. The timeline needs a publication year: papers without one are left out (their count is shown), and it is hidden with fewer than 4 dated papers. Shared terms are word-level (no phrases, naive singularization) and can still be weak for very short abstracts.
11. The daily alarm was verified only through the on-demand "Buscar ahora" path.
