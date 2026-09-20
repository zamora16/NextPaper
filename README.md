# NextPaper

**Related literature while you read.** Open any paper in your browser and NextPaper shows the most relevant related work — ranked by semantic similarity, grouped by subtopic, with everything you need to triage, save and cite it. It runs entirely in your browser: no server, no account, no tracking, no AI calls, no cost.

The interface is in Spanish.

## What it does

- **Related papers** for the article you have open (from its references, its citing papers, title search and Semantic Scholar's recommendations), ranked by SPECTER2 embedding similarity and clustered into subtopics (k-means written from scratch, `k` chosen by silhouette score).
- **Where to start**: a classic, the most relevant review and the most recent work.
- **Triage**: one-sentence summary, abstract, citation counts, study design and sample size read from the abstract, a timeline of the subtopics, and free-PDF links.
- **Snowballing**: *Explorar* runs the same analysis on any result; the search box analyzes a free-text topic.
- **Library**: save papers with a reading status, notes and collections; back up and restore; import from BibTeX, RIS or a list of DOIs.
- **Citations** in APA 7, MLA 9, Chicago, Harvard, IEEE, Vancouver, AMA, BibTeX and RIS (plus in-text), enriched with Crossref; export `.bib` / `.ris` for Zotero or Mendeley.
- **Alerts**: once a day it looks for new papers related to what you saved.

Where a piece of information cannot be established reliably (a study design, a sample size), NextPaper shows nothing rather than a guess.

## Install

From source, until it is on the extension stores:

```bash
npm install
npx plasmo build          # creates build/chrome-mv3-prod
```

Then open `chrome://extensions` (or `edge://extensions`), turn on *Developer mode*, choose *Load unpacked* and select `build/chrome-mv3-prod`.

## First run: your own Semantic Scholar key

NextPaper gets its data from [Semantic Scholar](https://www.semanticscholar.org), a free and open scientific database. **Each person uses their own free API key**: it is faster (without a key the first analysis of a paper can take about 20 seconds instead of about 5, and fails more often), it stays private (it is stored only in your browser and sent only to Semantic Scholar), and nobody shares a rate limit with anybody else.

The first time you open NextPaper it walks you through it:

1. **Request your free key** on [Semantic Scholar's form](https://www.semanticscholar.org/product/api#api-key-form); they send it to you by e-mail.
2. **Copy the key** from the e-mail. Do not share it with anyone.
3. **Paste it** in NextPaper and press *Guardar y empezar*. It is checked before being saved.

You can also continue without a key and add it later from *Ajustes* (⚙).

## Privacy

Everything is stored locally in your browser (`chrome.storage`). NextPaper sends paper identifiers, the title of the paper you are reading (for a related-title search) and the topics you type to Semantic Scholar, and DOIs to Crossref when you copy or export a citation. There are no accounts, no analytics and no other servers. See [docs/PRIVACY.md](docs/PRIVACY.md).

## How it works

When you open the popup, an extractor is injected into the active tab on demand (`activeTab` + `scripting`, no permanent content script) and reads the paper id from page metadata: DOI, or arXiv/PubMed/PMC ids. It works on any site that exposes standard `citation_doi`-style metadata. The popup then asks a background service worker to analyze it. Candidates are gathered from the paper's references, citations, a title search and Semantic Scholar's recommendation pools; every candidate's SPECTER2 embedding is fetched in batches, ranked by cosine similarity to the paper (with a small log-citations bonus among near-equals) and clustered. Progress is stored in `chrome.storage`, so the analysis keeps running if the popup is closed. `api.semanticscholar.org` is declared in `host_permissions`, which exempts extension requests from CORS.

Deeper documentation: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (data flow, modules, storage), [docs/PERFORMANCE.md](docs/PERFORMANCE.md) (measured request behavior), [docs/PRODUCT.md](docs/PRODUCT.md) (what users get and its limits), [docs/ROADMAP.md](docs/ROADMAP.md).

## Development

Plasmo + React 18 + TypeScript + Tailwind 3.

```bash
npm run dev               # then load build/chrome-mv3-dev
npm run typecheck         # tsc --noEmit (strict); Parcel does not typecheck
npm test                  # vitest
npm run test:coverage     # with floors on lib/
npm run format            # prettier
```

Real-browser end-to-end scripts (they load the built extension in Edge and use a key from `S2_API_KEY` in `.env.local`, which is never bundled) live in [scripts/](scripts/); see [CONTRIBUTING.md](CONTRIBUTING.md) for the commands and the project's rules.

## Credits and license

Data from [Semantic Scholar](https://www.semanticscholar.org) (Allen Institute for AI) and [Crossref](https://www.crossref.org). NextPaper is free software under the [MIT license](LICENSE).
