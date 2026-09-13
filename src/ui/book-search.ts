/** Original offsets survive accent folding, ligatures and PDF line breaks. */
export function indexBookText(text: string) {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < text.length;) {
    const brokenWord =
      /[-\u00ad]/.test(text[i]) &&
      text.slice(i).match(/^[-\u00ad]\s*\r?\n\s*(?=\p{L})/u);
    if (brokenWord && i > 0 && /\p{L}/u.test(text[i - 1])) {
      i += brokenWord[0].length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)!);
    const end = i + char.length;
    const folded = char
      .normalize("NFKD")
      .replace(/\p{M}|\u00ad/gu, "")
      .toLowerCase();
    for (let j = 0; j < folded.length; j++) {
      const part = folded[j];
      const value = /\s/u.test(part) ? " " : part;
      if (value === " " && normalized.endsWith(" "))
        ends[ends.length - 1] = end;
      else {
        normalized += value;
        starts.push(i);
        ends.push(end);
      }
    }
    i = end;
  }
  return { normalized, starts, ends };
}
export const normalizeBookQuery = (text: string) =>
  text
    .replace(/(\p{L})[-\u00ad]\s*\r?\n\s*(?=\p{L})/gu, "$1")
    .normalize("NFKD")
    .replace(/\p{M}|\u00ad/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function bookMatches(text: string, query: string) {
  const term = normalizeBookQuery(query);
  if (term.length < 3) return [];
  const indexed = indexBookText(text);
  const matches: { start: number; end: number }[] = [];
  let at = indexed.normalized.indexOf(term);
  while (at !== -1) {
    matches.push({
      start: indexed.starts[at],
      end: indexed.ends[at + term.length - 1],
    });
    at = indexed.normalized.indexOf(term, at + term.length);
  }
  return matches;
}
export const FIRST_BOOK_PAGE = -5;
export const LAST_BOOK_PAGE = 401;
export function parseBookPage(value: string) {
  if (!/^-?\d+$/.test(value.trim())) return undefined;
  const page = Number(value);
  return Number.isInteger(page) &&
    page >= FIRST_BOOK_PAGE &&
    page <= LAST_BOOK_PAGE
    ? page
    : undefined;
}
export function bookPageLabel(page: number) {
  return page >= 1
    ? `Página ${page}`
    : page === -5
      ? "Capa"
      : `Páginas iniciais · ${page + 6}`;
}
