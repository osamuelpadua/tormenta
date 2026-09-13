import index from "../data/book-references.json";
import type { CatalogEntry } from "../domain/types";
import type { Item } from "../domain/types";
import { CATALOG, ENTRY_MAP, slug } from "../data/rules";
import { ITEM_TEMPLATES } from "../domain/character";

export interface BookReference {
  bookId: string;
  printedPage: number;
  pdfPage: number;
  endPage: number;
  evidence: string;
}
const references: Record<string, BookReference> = index.references;
export const subjectReferences: Record<
  string,
  BookReference & { title: string }
> = index.subjects;
export function bookReference(entry: CatalogEntry) {
  const ref = references[entry.id];
  return ref &&
    ref.bookId === entry.sourceVersion &&
    ref.printedPage === entry.page &&
    ref.pdfPage === entry.pdfPage
    ? ref
    : undefined;
}
const equipment = CATALOG.filter((e) =>
  ["equipment", "magicItem"].includes(e.kind),
);
export function itemSource(item: Item): CatalogEntry | undefined {
  const entry = item.entryId ? ENTRY_MAP.get(item.entryId) : undefined;
  if (entry && bookReference(entry)) return entry;
  const base = ITEM_TEMPLATES.find(
    (template) => template.id === item.templateId,
  );
  const exact = equipment.find(
    (e) => slug(e.name) === slug(base?.name ?? item.name),
  );
  if (exact && bookReference(exact)) return exact;
  // A custom name may include a known base item (e.g. Marreta certeira).
  const known = equipment
    .filter((e) => `-${slug(item.name)}-`.includes(`-${slug(e.name)}-`))
    .sort((a, b) => b.name.length - a.name.length)
    .find((e) => bookReference(e));
  return known;
}
