# Performance

Measured 2026-09-19 in Edge with the built extension (`scripts/trace-network.cjs`) and directly
against the API (`scripts/perf/`). Read this before touching `lib/rate-limit.ts`, `lib/s2-fetch.ts`
or the request sequence in `lib/pipeline.ts` / `lib/semantic-scholar.ts`.

## Result

| | Before | After |
|---|---|---|
| Cold analysis of a paper | 15–34 s (one report: >1 min) | **4.5–9.3 s** |
| Requests per cold analysis | 8 (sequential) | 5–7 (parallel), 2 batch chunks |
| Sequential steps | 8 | 3 (seed ∥ recs → search ∥ CS pool → batch chunks ∥) |
| Cached analysis (reopen popup) | ~35 ms | ~40–55 ms to results on screen (unchanged) |
| Cache lifetime | 24 h | 7 days |
| Full e2e "explore" suite | several minutes | 19 s |

Per-seed cold runs after the change: BMC psychology paper 3.6–8.6 s, CRISPR (Jinek) 4.5 s,
AlphaFold 6.4 s, Transformers 9.3 s (5 of its 11 requests were 429s). Warm popup: DOMContentLoaded
~25 ms, shell ~35 ms, results ~45 ms; bundles are small (popup 200 KB, worker 32 KB) — nothing to win there.

## Where the time went (before)

`trace-network.cjs` showed 7–9 s of actual request time inside a 15–34 s analysis. The rest was
**waiting**: a fixed 1.5 s pause between each of the 8 requests, plus retry backoff of 1.5 s doubling up
to 10 s after every 429. In the worst trace, 7 of 13 requests were 429.

## Measurements and what they showed

**1. 429s are random, not caused by our pace** (`scripts/perf/rate-limit.cjs`, 20 requests per condition,
40 s cooldown between):

| Pace | OK |
|---|---|
| sequential, 1.5 s apart | 15/20 |
| sequential, 1.0 s apart | 12/20 |
| sequential, 0.6 s apart | 14/20 |
| sequential, 2.5 s apart | 8/14 |
| 3 parallel every 2 s | 15/21 |
| burst of 12 at once | 3/12 |

25–45% of requests fail at *any* pace, so waiting longer between requests protected nothing. Only a big
simultaneous burst hurts. Failures are independent, so the fastest strategy is: few requests in flight
(3), a small gap between starts (120 ms), and a **short retry** (0.35 s growing ×1.5 to 3 s) — not a long wait.

**2. One request can carry the seed, its references and its citations** (`scripts/perf/nested-request.cjs`):
`GET /graph/v1/paper/{id}?fields=…,references.paperId,citations.paperId,citations.citationCount,citations.year`
returned everything in 0.5–1.5 s (up to 1000 citations, 109 KB for a 150k-citation paper), replacing three
requests and sampling citers from 1000 instead of 500.

**3. Search and recommendations cannot be dropped** (`scripts/perf/source-contribution.cjs`; top-18 overlap
between "references+citations only" and "all sources"):

| Seed | Top-18 overlap | Top-5 overlap |
|---|---|---|
| Psychology (BMC) | 18/18 | 5/5 |
| Transformers (CS) | **1/18** | 1/5 |
| AlphaFold | 13/18 | 5/5 |
| CRISPR | 9/18 | **0/5** |

For heavily cited papers the neighbours come from search/recommendations (the citers sample and the
bibliography miss them). So they stay, but run **in parallel** instead of in series. The "recent"
recommendations even start together with the seed request (they accept the same id form).

**4. Batch lookups: several small chunks beat one big request** (`scripts/perf/batch-chunking.cjs`, 300 ids):
3×100 in parallel 1.6–1.8 s consistently; 1×300 took 1.7–5.1 s (a 429 on the big one repeats everything).
The batch response is still the largest fixed cost (~2.3 MB, mostly 768-float embeddings).

## Rules for future changes

1. **No fixed delays between API requests.** They were pure waste. Concurrency is capped in one place
   (`MAX_CONCURRENT = 3`, `MIN_GAP_MS = 120` in `lib/rate-limit.ts`).
2. **Retries are short** (`retryDelay` in `lib/s2-fetch.ts`); do not reintroduce long exponential waits.
3. **Do not remove search or the recommendation pools** to save time (measurement 3). Do not fetch them
   sequentially either.
4. **Keep the seed request nested** (references + citations inside it).
5. **Measure before and after** with `node scripts/trace-network.cjs [ref]` (request-by-request timeline,
   429 count, first result cards to catch relevance regressions). `tests/semantic-scholar.test.ts` pins the
   request count, parallelism and chunking; `tests/rate-limit.test.ts` pins the limiter and retry schedule.

## Risk to be aware of

Semantic Scholar documents an *introductory* limit of 1 request/second per key. Measured behaviour showed
429s independent of pace, and no penalty from bursts of 3, but the new code does exceed 1 req/s briefly
(3 concurrent). If the API ever restricts the key or answers with 403/blocks, lower `MAX_CONCURRENT`
(2, then 1) and raise `MIN_GAP_MS` in `lib/rate-limit.ts` — it is the only place to change. A user
analysing many papers back to back will see more 429s (the bucket does not refill instantly), which the
short retries absorb.

## Ideas measured or considered but not done

- **Pipelining** the first batch (references+citers) with search/recommendations, then a small second batch
  for the new ids: estimated ~0.9 s saved (~20% of the critical path) at the cost of merge complexity.
- **Progressive display** (show a first result at ~3–4 s, refine when search/recommendations arrive):
  bigger perceived gain but the list would change under the user's eyes for papers where those sources matter.
- **Trimming candidates** (e.g. 60+40 citers → 40+30) to shrink the batch ~15%: relevance impact not measured.
- **Requesting only what is needed** in the batch: embeddings dominate the payload, so removing abstracts
  saves little.
- Explore/topic search reuse the same path; a topic search takes ~3.5 s (one search + one batch chunk).
