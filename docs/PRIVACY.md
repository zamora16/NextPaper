# Privacy

NextPaper is built so that your reading stays yours. This page says exactly what the extension does with data. It is written to be usable as the privacy policy of a store listing.

## What stays on your device

Everything NextPaper stores is kept in your browser's local extension storage and never leaves it: your saved papers, reading status, notes and collections; cached analyses; the alerts state; and your Semantic Scholar API key. There are no accounts, no analytics, no advertising and no telemetry.

Uninstalling the extension deletes all of it. You can also back up your library to a file yourself (*Copia de seguridad*).

## What is sent, and to whom

| To | What | When |
|---|---|---|
| Semantic Scholar (`api.semanticscholar.org`) | The identifier (DOI, arXiv, PubMed or Semantic Scholar id) of the paper you are analyzing; its title (for a related-title search); the topic text you type in the search box; identifiers of papers found or saved; the DOIs or titles listed in a file you import; your own API key as a request header | When you open the popup on a paper, search a topic, explore a result, import references, or when the daily alert check runs |
| Crossref (`api.crossref.org`) | The DOI of a paper | Only when you copy or export a citation |
| Unpaywall (`api.unpaywall.org`) | The DOI of a paper, and the maintainer's contact address, which Unpaywall requires on every request (never yours) | Only when you click *Find PDF* on a paper Semantic Scholar has no free PDF for |

Nothing else is sent, and nothing is sent to any server run by the maintainers (there is none). Requests go straight from your browser to those services, which apply their own privacy policies.

## What the extension reads

- **The page you have open, only when you open the popup** (`activeTab`): NextPaper reads the page's metadata tags (for example `citation_doi`) to find the paper's identifier. It does not read the page's text, forms, cookies or your browsing history, and it has no permanent access to any site.
- **Files you choose** to import or restore, read locally.

## Your API key

Each person uses their own free Semantic Scholar key. It is stored only in this browser, shown masked in the settings, and sent only to Semantic Scholar. It is not included in the extension's code. You can remove it at any time in *Ajustes*.

## Permissions, and why

| Permission | Why |
|---|---|
| `activeTab`, `scripting` | Read the paper identifier from the page you have open, when you open the popup |
| `storage`, `unlimitedStorage` | Keep your library and cached analyses locally |
| `alarms` | Run the once-a-day check for new related papers |
| Access to `api.semanticscholar.org`, `api.crossref.org` and `api.unpaywall.org` | Query those three services from the extension |

## Contact

Angel Zamora — angelzamora1616@gmail.com
