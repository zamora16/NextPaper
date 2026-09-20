This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

## Project documentation

Start with [CONTRIBUTING.md](CONTRIBUTING.md) (rules and commands), then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PRODUCT.md](docs/PRODUCT.md) and [docs/ROADMAP.md](docs/ROADMAP.md). Real-browser tests live in [scripts/](scripts/).

### How it works

When you open the popup, an extractor is injected into the active tab on demand (`activeTab` + `scripting`, no permanent content script) and reads the paper id from page metadata: DOI, or arXiv/PubMed/PMC ids. It works on any site that exposes standard `citation_doi`-style metadata. The popup then asks a background service worker to analyze it. Candidates are gathered from the paper's references, citations, a title search and Semantic Scholar's recommendation pools; every candidate's SPECTER2 embedding is fetched in one batched request, ranked by cosine similarity to the paper (with a small log-citations bonus among near-equals) and clustered with a from-scratch k-means whose k is chosen by silhouette score. Progress is stored in `chrome.storage`, so it keeps running if the popup is closed. `api.semanticscholar.org` is declared in `host_permissions`, which exempts extension requests from CORS (the API's 429 responses carry no CORS headers, and its batch endpoint rejects cross-origin POST).

### Exploring and topic search

Every card has an *Explorar* button that runs the same analysis on that paper (follow the references and citations trail, "snowballing"), with a breadcrumb to go back; results are cached, so going back is instant. The search box at the top analyzes a free-text topic instead: up to 100 results ranked by Semantic Scholar, then grouped into subtopics with the same embeddings. Candidate quality safeguards: preprint/published duplicates are merged, the paper's own other version is dropped, the most cited and most recent citing papers are sampled (not the first 100 arbitrary ones), and the computer-science recommendation pool is only used for CS papers.

### Library and alerts

Every paper has a ★ button. Saved papers live in the *Guardados* tab (local `chrome.storage`, no server) with a reading status (to read / reading / read) and a personal note. Papers can be grouped in collections. The whole list, or a filter of it, can be copied in APA 7, MLA 9, Chicago, Harvard, IEEE, Vancouver, AMA, BibTeX or RIS (plus in-text citations), or downloaded as `.bib` / `.ris` for Zotero and Mendeley; notes travel in the BibTeX `note` and RIS `N1` fields. Citation data is enriched with Crossref (exact author names, issue, article number, journal abbreviation). The whole library can be backed up to a JSON file and restored, and references can be imported from a `.bib`/`.ris` file or a list of DOIs. Once a day (`chrome.alarms`) the background worker looks for fresh papers related to your latest saves, shows them under *Novedades para ti* and puts a count on the toolbar icon; "Buscar ahora" runs the check on demand.

### Semantic Scholar API key (recommended)

An analysis takes 5-7 requests; without a key Semantic Scholar's shared anonymous rate limit makes that very unreliable. Get a free key at https://www.semanticscholar.org/product/api#api-key-form, then create a `.env.local` file in the project root:

```
PLASMO_PUBLIC_S2_API_KEY=your-key-here
```

Even with a key the API answers ~30% of requests with a temporary 429 at any pace; the extension retries quickly, so a first analysis takes about 4-9 s. Results are cached for 7 days.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
