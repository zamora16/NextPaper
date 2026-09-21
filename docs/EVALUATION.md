# Evaluating the ranking

State as of 2026-09-21. Until now the ranking constants (the 0.02 citation bonus, the 40-paper shortlist,
the 60 + 40 citing papers, the four candidate sources) were chosen by judgment. This measures them.

**Read the limits section before quoting any number.** The measurements use the citation graph as a stand-in for
"related", because there are no human labels yet; and SPECTER2, the model behind the similarity, was trained on
citations, so these proxies flatter it. They are good for comparing settings with each other and weak for judging
the model itself.

## What was measured

- **51 seed papers**, 18 fields, chosen by search (30 topics, 2 papers each) among papers from 2012–2021 with
  80–3,000 citations and 25–150 references, in a stable pseudo-random order (not "the most cited"). The list is in
  `scripts/audit/seeds.json`.
- For each seed, **every candidate the extension would collect** (median 248): references, the 60 most cited and
  40 most recent citing papers, a title search, Semantic Scholar's recommendations. Plus 120 + 80 citing papers to
  test using more.
- Each candidate's **cosine to the seed** (the extension's own similarity), its sources, and two proxies of
  "related":
  1. **A reference of the seed.** Valid for older background literature only.
  2. **Bibliographic coupling:** it shares at least 3 references with the seed. It works for papers newer than the
     seed. Conclusions were checked with 2 and 5 shared references (same picture).
- **Methods compared on identical candidates:** what the extension does (the 40 closest by cosine, reordered by
  `cosine + 0.02·log10(1 + citations)`, first 18 kept), cosine alone, other citation weights, citations alone,
  newest first, Semantic Scholar's own recommendation order, and random.
- **Metrics at 18** (what is shown): precision (how many of the 18 are related) and nDCG (do the related ones come
  first), with 95% bootstrap intervals over the seeds. Differences between methods are paired on the same seeds:
  an interval that excludes 0 is not explained by which seeds were drawn.

The code is in `scripts/audit/` (`metrics.ts` and `ranking-eval.ts` are unit-tested; the test also checks that the
evaluation shows the same 18 papers as `assemble()` in the real pipeline).

## Results

### The similarity works, and is well above chance

Related = shares ≥ 3 references, pool = everything the extension collects (51 seeds):

| method | P@18 | nDCG@18 | AUC |
|---|---|---|---|
| **the extension** (40 closest, blend 0.02) | 0.42 [0.35, 0.49] | 0.39 [0.32, 0.45] | – |
| cosine only | 0.41 [0.35, 0.46] | 0.36 [0.31, 0.42] | 0.70 [0.68, 0.72] |
| citations only | 0.18 [0.13, 0.23] | 0.12 [0.09, 0.15] | 0.62 [0.60, 0.65] |
| newest first | 0.10 [0.07, 0.13] | 0.06 [0.04, 0.08] | 0.43 [0.40, 0.46] |
| Semantic Scholar recommendations, in their order | 0.06 [0.04, 0.09] | 0.04 [0.02, 0.05] | – |
| random | 0.22 [0.18, 0.26] | 0.16 [0.13, 0.19] | 0.50 |

The extension's list is about 2.4× random in nDCG. Roughly 4 of the 18 shown share at least 3 references with the
paper, against 2 for a random draw. It is a decent list, not a perfect one; the same numbers say that around half
of what is shown is not tied to the seed by its bibliography (which is not the same as "irrelevant").

### The citation bonus and the shortlist: keep them

nDCG@18 difference against the extension (same seeds, 95% interval):

| citation weight | difference |
|---|---|
| 0.005 | +0.017 [−0.001, 0.036] |
| 0.01 | +0.019 [0.002, 0.036] |
| **0.02 (current, with the 40-paper shortlist)** | – |
| 0.03 | −0.067 [−0.097, −0.034] |
| 0.05 | −0.134 [−0.172, −0.095] |
| 0.1 | −0.207 [−0.253, −0.161] |
| 0.2 | −0.233 [−0.280, −0.185] |

Small weights are as good as none or slightly better; large ones are clearly worse. 0.01 is marginally above 0.02
(+0.019), which is not enough to change a constant on a proxy. Blending over the whole pool instead of only the
40 closest is worse (−0.028 [−0.051, −0.004]): the shortlist does protect against highly cited but less similar
papers. **No change.**

### What each source contributes

nDCG@18 of the extension's ranking without the papers only that source found (the best possible list is always
taken from the full pool, otherwise removing good candidates would lower the ideal and raise the score):

| without | change |
|---|---|
| citing papers | **−0.098** [−0.130, −0.066] |
| title search | −0.001 [−0.007, 0.005] |
| Semantic Scholar recommendations | +0.021 [0.001, 0.046] |
| the reference list | +0.039 [0.004, 0.075] |

Citing papers are the workhorse (46% of the 18 shown). The title search adds nothing measurable **on these seeds**,
which all have many citers; for a new paper with none it may matter, so it stays. Recommendations and reference-only
papers score slightly *worse* on this proxy, but the proxy cannot value what they are for: the recommendations are
the fresh work (median year 2021) and the reference list gives the classics and the *Reference* tag (median 2016).
**No change.**

### How many citing papers

| most cited + most recent | nDCG@18 | vs today (60 + 40) |
|---|---|---|
| 0 + 0 | 0.31 | −0.087 [−0.120, −0.055] |
| 30 + 20 | 0.36 | −0.015 [−0.025, −0.005] |
| **60 + 40** | 0.37 | – |
| 120 + 80 | 0.39 | +0.011 [0.003, 0.019] |

Using more helps a little (+0.011) at the cost of another batch chunk of embeddings per analysis. Not worth it.
**No change.**

### The scale of the similarity

| | min | p10 | median | p90 | max |
|---|---|---|---|---|---|
| all candidates (12,222) | 0.738 | 0.874 | 0.917 | 0.951 | 0.997 |
| the 18 shown (918) | 0.910 | 0.931 | **0.952** | 0.968 | 0.997 |

The best and the 18th shown differ by only **0.028** (median; 0.045 at the 90th percentile). So the "% similar"
on the cards is almost always between 93 and 97: it barely tells one card from another, and the meter fills almost
completely on every card. The number is a real cosine, but reading it as a percentage of anything is misleading.

## Limits

1. **The proxies come from the citation graph, and SPECTER2 was trained on citations.** Cosine's advantage over
   the other methods is probably overstated. Comparisons of weights and sources are fair; "cosine vs citations" is
   not a fair fight.
2. **"A reference of the seed" rewards popularity and age**, not similarity: on that truth, citations alone score
   0.93 nDCG and cosine is at chance (AUC 0.45; references have a median cosine of 0.913 against 0.918 for the
   others). It is background literature, not neighbours. It was not used for any decision above.
3. **Coupling cannot credit** a related paper with a different bibliography (interdisciplinary work), and treats a
   paper whose reference list the API does not give as unrelated.
4. **The seeds** are papers from 2012–2021 with many citations. New papers, or papers nobody cites, are not
   covered, and there the search and the recommendations probably matter more.
5. **Only the 18 shown were measured** for the ranking. The stability of the groups is measured in its own section; the picks and the timeline are not measured.
6. Small samples per field: the intervals are over the 51 seeds, not per field.

## Are the subtopic groups stable?

The ranking was measured above; the grouping into subtopics was not, and it looked fragile: among the 18 papers
closest to one paper the silhouette (how well separated the groups are) has a median of 0.078 and never passes
0.2, so there is often no real structure to find. The question is whether the groups the extension showed were
the same when the input barely changed.

**Method.** Take the papers to group, drop about 10% at random, regroup, and compare the two groupings on the
papers both contain with the adjusted Rand index (ARI: 1 = same groups, 0 = as similar as two random
groupings). Repeated over the 51 seeds and, for topic search, 30 topics (`collect-topics`), with bootstrap
intervals over seeds.

| Method | Paper mode: stability (ARI) | Topic mode: stability (ARI) |
| --- | --- | --- |
| k-means, best silhouette (what shipped) | 0.44 [0.40, 0.49] | 0.35 |
| Hierarchical (average linkage, cosine), best silhouette | 0.75 | 0.74 |
| Hierarchical + only groups with an honest name, rest in "Other" | 0.75 | 0.72 |

With the last variant 85% of the groups shown in paper mode had a name (65% in topic mode), there were about 2.2
groups per result, and the largest held about 72% of the papers (89% in topic mode).

**Decision.** Three changes, all shipped:

1. **Hierarchical clustering replaces k-means** (`lib/clustering.ts`; the old k-means is kept in
   `scripts/audit/kmeans-baseline.ts` as the baseline of this audit). It is more stable and it has no random
   start.
2. **Only groups that can be named are shown.** `labelClusters` decides; the papers of the other groups go
   together into "Other related", last. When no group can be named the result is one plain list with no headings:
   a partition nobody can describe would only look like knowledge (rule 17). The old "Group N" is gone.
3. **The "% similar" number and bar are gone.** On the 18 shown, the cosine varies by about 0.03 between the
   first and the last card: the number told cards apart no better than their order does, and "91% similar" read
   as a probability it is not. The order itself (closest in content first) is unchanged; papers without an
   indexed abstract still get an "approximate order" note.

**Limits.** Stability is not correctness: a stable grouping can still be a wrong one, and the names are checked
only by the rules in `labelClusters` and by reading them (rule 17). Dropping papers at random is a mild
perturbation; a different set of candidates would move the groups more.

## What would strengthen it

Human judgments. About 20 seeds × the 18 shown, marked related / partly / not (about an hour): they would check the
proxy itself, and are the only thing that can say whether the similarity is good rather than merely consistent.

## Reproducing it

Needs the API and a key in `.env.local` (`S2_API_KEY`); everything else is local.

```bash
npx vitest run --config vitest.audit.config.ts pick-seeds      # ~5 min, rewrites scripts/audit/seeds.json
npx vitest run --config vitest.audit.config.ts collect-pools   # ~20 min for 51 seeds; resumable
npx vitest run --config vitest.audit.config.ts evaluate        # seconds; prints and saves the report
npx vitest run --config vitest.audit.config.ts collect-topics  # topic-search pools for the group audit; resumable
npx vitest run --config vitest.audit.config.ts cluster-stability  # seconds; ARI under random drops
```

Pools are saved to `<tmp>/probe/pools` (`AUDIT_POOLS` overrides), one JSON per seed with the 40 closest vectors,
so later analyses (such as the stability of the groups) need no new requests.
