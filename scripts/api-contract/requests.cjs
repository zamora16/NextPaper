// The requests NextPaper makes, spelled exactly as lib/ spells them.
// tests/api-contract.test.ts fails if lib/ stops containing these strings, so
// the nightly check cannot go on verifying an old version of the extension.

const S2 = "https://api.semanticscholar.org"
const CROSSREF = "https://api.crossref.org"
const UNPAYWALL = "https://api.unpaywall.org"

const SEED_FIELDS =
  "title,abstract,year,authors.name,fieldsOfStudy,embedding.specter_v2,references.paperId,citations.paperId,citations.citationCount,citations.year"

const PAPER_FIELDS =
  "title,authors,year,citationCount,url,venue,externalIds,openAccessPdf,abstract,journal,tldr,publicationTypes,influentialCitationCount"

const EMBEDDING = "embedding.specter_v2"

module.exports = { S2, CROSSREF, UNPAYWALL, SEED_FIELDS, PAPER_FIELDS, EMBEDDING }
