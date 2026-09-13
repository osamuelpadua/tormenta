import { describe, expect, it } from "vitest";
import {
  bookMatches,
  normalizeBookQuery,
  parseBookPage,
} from "../src/ui/book-search";
import { entityArtwork } from "../src/ui/entity-icon";

describe("pesquisa no PDF original", () => {
  it("localiza todas as ocorrências ignorando acentos e preserva os trechos originais", () => {
    const text = "🛡️ AÇÃO e ação; Ação";
    expect(
      bookMatches(text, "acao").map(({ start, end }) => text.slice(start, end)),
    ).toEqual(["AÇÃO", "ação", "Ação"]);
  });
  it("encontra palavras hifenizadas, ligaturas e espaços de extração", () => {
    const text = "A resis-\ntência  \n mágica e oﬁcio";
    expect(normalizeBookQuery(text)).toBe("a resistencia magica e oficio");
    expect(
      bookMatches(text, "resistencia magica").map(({ start, end }) =>
        text.slice(start, end),
      ),
    ).toEqual(["resis-\ntência  \n mágica"]);
    expect(bookMatches("ofí\u00adcio", "oficio")).toEqual([
      { start: 0, end: 7 },
    ]);
    expect(
      bookMatches(text, "oficio").map(({ start, end }) =>
        text.slice(start, end),
      ),
    ).toEqual(["oﬁcio"]);
    expect(bookMatches(text, "a")).toEqual([]);
  });
  it("aceita apenas páginas completas dentro dos limites incluindo a capa", () => {
    for (const value of ["", "-", "3e1", "32.5", "402", "-6", "texto"])
      expect(parseBookPage(value)).toBeUndefined();
    for (const value of [-5, 0, 32, 401])
      expect(parseBookPage(String(value))).toBe(value);
  });
});

it("mantém a identidade de armas com modificações no nome", () => {
  expect(entityArtwork("Marreta certeira")).toBe(entityArtwork("Marreta"));
  expect(entityArtwork("Machado de batalha aprimorado")).toBe(
    entityArtwork("Machado de batalha"),
  );
  expect(entityArtwork("Objeto inventado sem catálogo xyz")).toBeUndefined();
});
