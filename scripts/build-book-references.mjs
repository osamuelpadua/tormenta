import fs from "node:fs";
import { createHash } from "node:crypto";

const manifest = JSON.parse(fs.readFileSync("docs/sources.json", "utf8"));
const book = manifest.sources.find((source) => source.id === "book");
const hash = createHash("sha256")
  .update(fs.readFileSync(book.file))
  .digest("hex");
if (hash !== book.sha256) throw new Error("PDF diferente da fonte auditada.");
const normalize = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const pages = JSON.parse(fs.readFileSync("src/data/book-pages.json", "utf8"));
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
const references = {};
const subjects = {};
const missing = [];
for (const entry of catalog) {
  const page = pages.find(
    (page) => page.printed === entry.page && page.page === entry.pdfPage,
  );
  const title = normalize(entry.name);
  const shortHeading = page?.text
    .split(/\r?\n/)
    .some((line) => line.trim() === entry.name);
  if (
    entry.sourceVersion === manifest.ruleset &&
    page &&
    (title.length >= 4 || (title.length >= 3 && shortHeading)) &&
    normalize(page.text).includes(title)
  ) {
    references[entry.id] = {
      bookId: manifest.ruleset,
      printedPage: entry.page,
      pdfPage: entry.pdfPage,
      endPage: entry.endPage,
      evidence: "title-on-page",
    };
  } else missing.push({ id: entry.id, name: entry.name, page: entry.page });
}
for (const subject of JSON.parse(
  fs.readFileSync("src/data/reference-subjects.json", "utf8"),
)) {
  const page = pages.find((page) => page.printed === subject.page);
  if (page && normalize(page.text).includes(normalize(subject.name)))
    subjects[subject.id] = {
      bookId: manifest.ruleset,
      printedPage: page.printed,
      pdfPage: page.page,
      endPage: page.printed,
      evidence: "title-on-page",
      title: subject.name,
    };
}
fs.writeFileSync(
  "src/data/book-references.json",
  JSON.stringify(
    { bookId: manifest.ruleset, sha256: hash, references, subjects },
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(
  "docs/book-reference-audit.json",
  JSON.stringify(
    {
      checked: catalog.length,
      verified: Object.keys(references).length,
      missing,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${Object.keys(references).length}/${catalog.length} referências verificadas no texto das páginas do PDF; ${missing.length} sem link.`,
);
