# Product: what NextPaper gives the user today

State as of 2026-09-19. UI language is Spanish.

**One line:** while you read a paper (or type a topic), NextPaper shows the most relevant
related literature, ranked by semantic similarity, grouped by subtopic, with everything
you need to triage, save and cite it — all local, free, no account, no AI calls.

## Who it is for and the pains it targets

| Researcher pain | What the tool does |
|---|---|
| "I found one good paper — what else should I read?" | Analyzes the open paper and returns the 18 most related papers, ranked by SPECTER2 embedding similarity, from its references, its citing papers, title search and Semantic Scholar recommendations. |
| "Where do I even start?" | **Empieza por aquí**: a classic (most cited older prior work), the most relevant review, and the most recent work. |
| "Is this worth my time?" | One-sentence tl;dr (from Semantic Scholar), abstract on demand, citation count (tooltip: influential citations), `% similar`, tags *Referencia* / *Lo cita* / *Revisión*, free-PDF button, and **"Coincide en"**: the distinctive words the result shares with the paper you are reading, to justify why it appears. |
| "What kind of study is this?" | Each card shows the **study design** (e.g. *Ensayo aleatorizado*, *Transversal / encuesta*, *Metaanálisis*) and the **sample size** (`n = 245`, or `24 estudios` for reviews), read from the title and abstract with plain rules. A **Diseño** filter narrows the list to one design (it only offers designs actually present, with counts). Shown only when detected — never guessed — so it is absent on roughly half of the papers (design) and most (sample size). |
| "There are too many results" | Automatic subtopic groups (k-means, k by silhouette) with labels; filters (Referencias, Lo citan, Revisiones, PDF libre); sort by relevance / most cited / most recent; **Ver cronología**: one lane per subtopic with the papers placed by year (size = citations, dashed line = the paper you are reading; click a dot to jump to its card) — shows which lines of work are classic vs recent and where the heavily cited papers sit. |
| "I want to follow the trail" | **Explorar** on any card runs the same analysis on that paper (snowballing) with a breadcrumb and instant *Volver*. |
| "I don't have a seed paper yet" | Topic search box: up to 100 results grouped into subtopics. |
| "I keep losing track of what I read" | ★ save → **Guardados** with status (por leer / leyendo / leído), a personal note and **collections** (e.g. one per thesis chapter) with filters; read status also shows on cards in later searches. **Copia de seguridad** to a JSON file and **Importar** from a NextPaper backup, a `.bib`/`.ris` file or a list of DOIs/titles (also for people who already have a reference library). |
| "Building the bibliography is tedious" | Copy one citation, an in-text citation or all visible/saved ones in **APA 7, MLA 9, Chicago, Harvard, IEEE, Vancouver, AMA, BibTeX or RIS**; download `.bib` / `.ris` (notes included). Data is enriched with **Crossref** (exact author names, issue, article number, journal abbreviation) and falls back to Semantic Scholar's. |
| "I don't notice new papers" | **Novedades para ti**: once a day (and on demand) looks for fresh papers related to your latest saves, tags them *Nuevo* with the reason, and puts a count on the toolbar icon. |
| "How do I set it up?" | A first-run screen explains, in three steps, how to get a **free personal Semantic Scholar key** (they e-mail it to you), checks the key before saving and lets you continue without one. Ajustes (⚙) shows it masked, lets you remove it, and credits the data sources and the license. |

## How it works from the user's side

1. Open any article page (or a PDF landing page with standard metadata) and click the
   NextPaper icon. It reads the paper id from the page's metadata (DOI, or arXiv /
   PubMed / PMC ids). No site list: any publisher that exposes `citation_doi`-style meta
   works.
2. Results appear in ~4–9 s the first time (network-bound) and in well under 0.1 s after that (cached for 7 days). The analysis continues if you close the popup; reopening shows it.
3. Close the popup any time — nothing is lost. Saved papers and notes persist.

## Cost and privacy

- **Cost per use: zero.** No servers, no LLM. Semantic Scholar's API is free (a free API
  key is recommended).
- **Privacy:** everything is stored locally in the browser. Requests to Semantic Scholar
  contain paper ids, the paper title (for search) or the topic text the user types. No
  analytics, no accounts, no tracking. The API key is bundled in the extension build.
- **Permissions:** `activeTab`, `scripting` (read the open page's metadata on click),
  `storage` and `unlimitedStorage` (local library and cache), `alarms` (daily alert check), and the hosts `api.semanticscholar.org` (papers) and `api.crossref.org` (citation metadata).

## Known limits (be honest with users about these)

- **Key:** without a personal key everything works but is slower (a first analysis ~20 s instead of ~5 s in our tests) and fails more often; the setup screen says so.
- **Speed:** a first analysis of a paper takes ~4–9 s (Semantic Scholar answers ~30% of requests with a temporary 429 that is retried); repeats are instant for 7 days.
- **Coverage:** papers without an indexed abstract have no embedding → the `% similar` is
  approximate (`~`), or missing in topic search. Some old papers have no reference list.
- **Citations sample:** only the 60 most cited + 40 most recent citing papers are
  considered per paper.
- **Citation formatting:** styles are hand-implemented (common rules, unit-tested) and not
  CSL-certified — journals with their own house style may differ. Papers without a Crossref
  record (e.g. arXiv-only) fall back to Semantic Scholar's data: author names are then parsed
  heuristically (family name = last word), which is wrong for compound surnames.
- **Import:** DOIs are resolved in bulk; entries with only a title are searched one by one (max
  25 per file) and accepted only when the found title is nearly identical.
- **Study design and sample size** are rule-based and built to **prefer no chip over a wrong one**: a design counts only if it is in the title or in a sentence about the study itself (background such as "several trials are underway" is ignored), and a sample size is shown only when one unambiguous figure exists (groups, subgroups, invited pools, repeated measurements and negations all produce *no* chip). The price is coverage: design appears on ~40–55% of papers and sample size on ~25–30%. Accuracy was checked by reading the exact text behind every chip on ~1,250 real abstracts; on a second, unseen set roughly 1 in 15 design chips was still wrong before the last round of fixes, so **treat a chip as a hint, not as fact** (the tooltip says so). Rules are English plus some Spanish; sample is never read from a paper without an abstract.
- **"Revisión" tag, filter and pick:** decided from the title or the abstract ("systematic review", "this review", meta-analysis...), not from Semantic Scholar's own `Review` label, which is wrong for many primary studies. A real review that never says so in its title or abstract will not be tagged.
- **Cluster labels** are word-frequency based and sometimes uninformative.
- **Timeline and "Coincide en":** the timeline needs publication years (papers without one are omitted; it is hidden with fewer than 4 dated papers), and shared terms are word-level, so they can be sparse or generic for very short abstracts. Topic searches have the timeline but not "Coincide en".
- **Language:** UI in Spanish only; abstracts and tl;dr in English.
- **Automation gaps:** PubMed/PMC/MDPI extraction, Chrome (only Edge automated) and the
  real toolbar click have not been verified by automated tests.
