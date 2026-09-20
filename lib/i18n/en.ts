// English is the source of truth: `es.ts` must have exactly the same keys
// (TypeScript and tests/i18n.test.ts enforce it). `{name}` marks a value the
// code fills in; keys ending in `_one` / `_other` are the singular and plural
// forms picked by `t(key, { n })`. `**text**` is shown in bold.
//
// Text ending in `.hint` is a tooltip: it explains a control in a sentence.
export const en = {
  // header and tabs
  "tab.related": "Related",
  "tab.saved": "Saved",
  "tab.updates": "Updates",
  "tab.settings": "Settings",
  "tab.settings.hint":
    "Settings: your Semantic Scholar key, language and about",
  "tab.related.hint":
    "Papers related to the article you have open, or to a topic you search",
  "tab.saved.hint":
    "The papers you saved, with reading status, notes and collections",
  "tab.updates.hint":
    "New papers related to what you saved, checked automatically once a day",
  "updates.unseen": "Unseen updates",

  // language
  "lang.title": "Language",
  "lang.auto": "Automatic",
  "lang.es": "Español",
  "lang.en": "English",
  "lang.hint": "The language of NextPaper's interface",

  // search and navigation
  "search.placeholder": "Search a topic, e.g. body image and eating disorders",
  "search.button": "Search",
  "search.hint":
    "Type a research topic to find and group papers about it, without needing an open article",
  exploring: "Exploring:",
  back: "← Back",
  "back.hint": "Go back to the previous analysis",
  detecting: "Detecting paper...",
  noPaper:
    "No paper was detected on this page. Open an article on PubMed, arXiv, bioRxiv, PMC or any publisher site that publishes the DOI in its metadata, or search a topic above.",

  // analysis progress and errors
  "step.default": "Looking for related papers...",
  "step.reading": "Reading the paper...",
  "step.gathering": "Gathering references, citations and recommendations...",
  "step.scoring": "Computing similarity for {n} candidates...",
  "step.searching": "Searching papers on the topic...",
  "step.analyzing": "Analyzing {n} results...",
  runsInBackground:
    "Runs in the background: you can close the popup and come back.",
  loadingResults: "Loading results...",
  noResults: "No related papers were found.",
  retry: "Retry",
  "error.rate_limited":
    "Semantic Scholar is limiting requests. Try again in a moment.",
  "error.not_found": "This paper is not indexed in Semantic Scholar yet.",
  "error.key_rejected":
    "Semantic Scholar rejected your API key. Check it in Settings (⚙) or remove it to use NextPaper without a key.",
  "error.storage_full": "There is not enough extension storage left.",
  "error.unavailable": "Semantic Scholar could not be reached.",
  "error.no_data": "The data for the new papers could not be retrieved.",
  "error.unknown": "Something went wrong.",
  "error.noKeyHint":
    "Without your own key, Semantic Scholar limits requests more.",
  "error.addKey": "Add yours in Settings",

  // filters, sorting, list
  "filter.all": "All",
  "filter.reference": "References",
  "filter.citation": "Cites it",
  "filter.review": "Reviews",
  "filter.open": "Free PDF",
  "filter.all.hint": "Show every result",
  "filter.reference.hint":
    "Papers that the one you are reading cites (its bibliography)",
  "filter.citation.hint": "Papers that cite the one you are reading",
  "filter.review.hint": "Literature reviews and meta-analyses",
  "filter.open.hint": "Papers with a free full text available",
  "design.label": "Design",
  "design.all": "All",
  "design.hint":
    "Filter by study design, detected from the title and abstract with plain rules; it may be wrong",
  "sort.label": "Sort",
  "sort.hint": "Order of the results",
  "sort.relevance": "Relevance",
  "sort.citations": "Most cited",
  "sort.year": "Most recent",
  citeAs: "Cite as",
  "citeAs.hint": "The citation style used when you copy or export citations",
  count: "{shown} of {total} papers",
  "timeline.show": "Show timeline",
  "timeline.hide": "Hide timeline",
  "timeline.hint":
    "A chart with one row per subtopic and every paper placed by year (bigger dot = more cited). It shows which lines of work are classic and which are recent.",
  noneMatch: "No paper matches this filter.",
  "picks.title": "Start here",
  "picks.hint":
    "Three ways into an unfamiliar topic: a classic, the most relevant review and the most recent work",
  "pick.foundational": "A classic to start with",
  "pick.review": "A relevant review",
  "pick.recent": "The latest",
  "group.related": "Related",
  "group.all": "All",
  "group.hint": "Papers grouped by similarity of content (subtopics)",

  // copy and export
  copyCitations_one: "Copy {n} citation",
  copyCitations_other: "Copy {n} citations",
  "copyCitations.hint":
    "Copy the citations of the papers shown, in the chosen style",
  "copy.preparing": "Preparing...",
  "copy.progress": "Preparing {done}/{total}",
  "copy.ready": "Click to copy",
  "copy.copied": "Copied",
  "export.bib.hint":
    "Download the papers shown as a .bib file (Zotero, Mendeley, LaTeX)",
  "export.ris.hint":
    "Download the papers shown as a .ris file (Zotero, Mendeley, EndNote)",

  // paper card
  "card.save": "Save to read later",
  "card.unsave": "Remove from saved",
  "card.noYear": "n.d.",
  "card.abstract.show": "Show abstract",
  "card.abstract.hide": "Hide abstract",
  "card.citations_one": "{n} citation",
  "card.citations_other": "{n} citations",
  "card.citations.hint": "How many papers cite this one",
  "card.influential": "{n} influential citations",
  "card.similar": "{n}% similar",
  "card.similar.hint":
    "How close its content is to the paper you are reading (cosine similarity between SPECTER2 embeddings)",
  "card.similar.approx.hint":
    "Approximate: the paper you are reading has no embedding, so it is compared with its most likely neighbors",
  "card.relation.reference": "Reference",
  "card.relation.reference.hint": "The paper you are reading cites this one",
  "card.relation.citation": "Cites it",
  "card.relation.citation.hint": "This paper cites the one you are reading",
  "card.review": "Review",
  "card.review.hint": "A literature review or meta-analysis",
  "card.design.hint":
    "Study design detected from the title and abstract with plain rules; it may be wrong",
  "card.sample.hint":
    "Sample size read from the abstract with plain rules; it may be wrong",
  "card.sample.studies_one": "{n} study",
  "card.sample.studies_other": "{n} studies",
  "card.explore": "Explore",
  "card.explore.hint":
    "Analyze this paper the same way: see its references, citations and similar papers",
  "card.pdf": "Free PDF",
  "card.pdf.hint": "Open the free full text",
  "card.inText": "In text",
  "card.inText.hint": "Copy the in-text citation, e.g. (Author, 2020)",
  "card.cite": "Cite",
  "card.cite.hint": "Copy the reference in the chosen citation style",

  // reading status
  "status.unread": "To read",
  "status.reading": "Reading",
  "status.read": "✓ Read",
  "status.read.plain": "Read",

  // study design (chips and filter)
  "design.protocol": "Study protocol",
  "design.meta": "Meta-analysis",
  "design.systematic": "Systematic review",
  "design.rct": "Randomized trial",
  "design.trial": "Clinical trial",
  "design.psychometric": "Psychometric validation",
  "design.experimental": "Experimental / pilot",
  "design.review": "Review",
  "design.case-control": "Case-control",
  "design.cohort": "Cohort / longitudinal",
  "design.mixed": "Mixed methods",
  "design.cross-sectional": "Cross-sectional / survey",
  "design.qualitative": "Qualitative",
  "design.case": "Case report",

  // citation styles
  "style.apa": "APA 7",
  "style.mla": "MLA 9",
  "style.chicago": "Chicago (author-date)",
  "style.harvard": "Harvard",
  "style.ieee": "IEEE",
  "style.vancouver": "Vancouver",
  "style.ama": "AMA",
  "style.bibtex": "BibTeX",
  "style.ris": "RIS (Zotero, Mendeley)",

  // saved tab
  "saved.empty":
    "You have not saved anything yet. Press the ☆ on any paper to save it here, or import your references from another tool.",
  "saved.status.all": "All",
  "saved.collections.all": "All collections",
  "saved.collection.delete": "Delete collection",
  "saved.collection.delete.hint":
    "Removes the collection from every paper; the papers stay saved",
  "saved.none": "No saved paper matches this filter.",
  "item.note.hide": "Hide note",
  "item.note.view": "View note",
  "item.note.add": "Add note",
  "item.note.placeholder": "Why it matters, what to cite from it, doubts...",
  "item.collection.add": "+ collection",
  "item.collection.hint":
    "Group papers in collections, e.g. one per thesis chapter",
  "item.collection.remove": "Remove from {name}",

  // backup and import
  "tools.backup": "Backup",
  "tools.backup.hint":
    "Download all your saved papers, notes and collections as a file",
  "tools.import": "Import...",
  "tools.import.hint":
    "Restore a NextPaper backup, or import a .bib or .ris file or a list of DOIs",
  "tools.reading": "Reading file...",
  "tools.step.dois": "Looking up {n} DOIs...",
  "tools.step.titles": "Looking up {n} titles...",
  "tools.backupDone": "Backup saved ({papers}).",
  "tools.restored": "Backup restored: {added}",
  "tools.imported": "Imported {papers} into the “{collection}” collection",
  "tools.collectionName": "Imported",
  "tools.alreadySaved": "{n} were already saved",
  "tools.notFound": "{n} not found",
  "tools.skipped": "{n} titles not searched (maximum 25 per file)",
  "tools.noRefs": "No references (DOIs or titles) were found in the file.",
  "tools.failed": "The file could not be imported.",
  papers_one: "{n} paper",
  papers_other: "{n} papers",
  newPapers_one: "{n} new paper",
  newPapers_other: "{n} new papers",
  updatedPapers_one: "{n} updated",
  updatedPapers_other: "{n} updated",

  // updates tab
  "updates.title": "New for you",
  "updates.check": "Check now",
  "updates.checking": "Checking...",
  "updates.check.hint": "Look now for new papers related to what you saved",
  "updates.description":
    "New papers related to what you saved. They are checked automatically every 24 h",
  "updates.lastChecked": " (last time {ago})",
  "updates.error":
    "The last check failed: {error} It will retry on its own; you can also press “Check now”.",
  "updates.nothing": "Nothing new for now.",
  "updates.notChecked": "Not checked yet. Press “Check now”.",
  "updates.noSaved":
    "Save some papers with the ☆ and NextPaper will look for new related papers here.",
  "updates.because": "Because you saved: {title}",
  "updates.new": "New",
  "updates.dismiss": "Dismiss",
  "ago.now": "just now",
  "ago.minutes": "{n} min ago",
  "ago.hours": "{n} h ago",
  "ago.days": "{n} d ago",

  // timeline chart
  "timeline.aria": "Timeline of the papers by subtopic",
  "timeline.you": "★ your paper ({year})",
  "timeline.tooltip": "{title} ({year}) · {citations}",
  "timeline.median": "median {year}",
  "timeline.undated": "{n} without a year are not shown.",
  "timeline.legend":
    "Each dot is a paper (bigger = more cited). Click a dot to jump to its card.",

  // first-run setup and settings
  "setup.title": "Welcome to NextPaper",
  "setup.subtitle": "First-time setup · only the first time",
  "settings.title": "Settings",
  "settings.close": "Close",
  "setup.intro":
    "NextPaper finds literature related to what you read using **Semantic Scholar**, a free and open scientific database. To work well it needs **your own access key**, which is free.",
  "settings.keyStatus": "Semantic Scholar key: {status}",
  "settings.key.saved": "saved ({masked})",
  "settings.key.none": "no key (slow mode)",
  "why.title": "Why your own key?",
  "why.fast":
    "**It is faster.** Without a key, a paper's first analysis can take about 20 seconds instead of about 5, and fails more often.",
  "why.private":
    "**It is private.** It is stored only in this browser and sent only to Semantic Scholar.",
  "why.yours":
    "**It is yours.** Everyone uses their own, so NextPaper does not depend on a server or on a limit shared with others.",
  step1:
    "**Request your free key** on Semantic Scholar's website. Fill in the form and they will send it to you by **email**.",
  "step1.button": "Open Semantic Scholar's form ↗",
  step2:
    "**Copy the key** from the email: a long text of letters and numbers. Do not share it with anyone.",
  step3: "**Paste it here** and press Save.",
  "key.placeholder": "Paste your key here",
  "key.label": "Semantic Scholar API key",
  "key.saveFirst": "Save and start",
  "key.save": "Save key",
  "key.checking": "Checking...",
  "key.remove": "Remove key",
  "key.msg.notKey":
    "That does not look like a key. It is a text of about 40 letters and numbers, with no spaces. Copy it whole from the Semantic Scholar email.",
  "key.msg.refused":
    "Semantic Scholar does not accept that key. Check that you copied it whole and with no spaces.",
  "key.msg.saved": "Key saved and checked ✓",
  "key.msg.savedUnchecked":
    "Key saved, but I could not check it right now (Semantic Scholar is busy). If something fails, review it here.",
  "key.msg.removed": "Key removed. NextPaper will work without a key (slower).",
  "setup.skipHint":
    "Do not want to request a key now? You can start without one and add it later in Settings (⚙).",
  "setup.skip": "Continue without a key (slower)",
  "about.dataPrefix": "Data from ",
  "about.dataAnd": " (Allen Institute for AI) and ",
  "about.local":
    "Your library, notes and key are stored only in this browser. NextPaper uses no accounts, servers or analytics.",
  "about.license": "Free software (MIT license) · version {version}"
} as const

export type Key = keyof typeof en
