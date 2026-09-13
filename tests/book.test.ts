import { describe, expect, it } from "vitest";
import raw from "../src/data/book-pages.json";
import layout from "../src/data/book-layout.json";
import type { BookBlock } from "../src/ui/book-types";

describe("leitura do livro", () => {
  it("mantém a correspondência das 407 páginas com a extração original", () => {
    expect(layout).toHaveLength(407);
    for (const [index, page] of layout.entries()) {
      expect(page.page).toBe(raw[index].page);
      expect(page.printed).toBe(raw[index].printed);
      for (const block of page.blocks as BookBlock[]) {
        if (block.type !== "table") expect(block.text.trim()).not.toBe("");
        if (block.type === "paragraph") {
          expect(block.text).not.toContain("\n");
          if (block.lead) expect(block.text.startsWith(block.lead)).toBe(true);
        }
      }
    }
  });

  it("recompõe as seções da página 32 sem quebras de coluna ou palavras partidas", () => {
    const blocks = layout.find((p) => p.printed === 32)!.blocks as BookBlock[];
    expect(
      blocks.filter((b) => b.type === "heading").map((b) => b.text),
    ).toEqual([
      "Classes",
      "Escolhendo sua Classe",
      "Características das Classes",
    ]);
    const paragraphs = blocks.filter((b) => b.type === "paragraph");
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[1].text).toContain(
      "resumo das classes, com uma descrição curta",
    );
    expect(paragraphs[4].text).toContain("Os tipos de armas e armaduras");
    expect(paragraphs[2].lead).toBe("Pontos de Vida e Mana.");
    expect(blocks).not.toContainEqual(
      expect.objectContaining({ text: "Capítulo Um" }),
    );
  });

  it("preserva os valores e notas da tabela impressa, inclusive diferenças do catálogo", () => {
    const table = (
      layout.find((p) => p.printed === 32)!.blocks as BookBlock[]
    ).find((b) => b.type === "table")!;
    expect(table.headers).toEqual([
      "Classe",
      "Descrição",
      "Atributo",
      "PV¹",
      "PM",
      "Perícias²",
    ]);
    expect(table.rows).toHaveLength(14);
    expect(table.rows.map((row) => row.slice(2))).toEqual([
      ["Inteligência ou Carisma", "8", "6", "Misticismo e Vontade, mais 2"],
      ["Força", "24", "3", "Fortitude e Luta, mais 4"],
      ["Carisma", "12", "4", "Atuação e Reflexos, mais 6"],
      ["Destreza", "16", "3", "Luta ou Pontaria, Reflexos, mais 4"],
      [
        "Força ou Destreza",
        "16",
        "4",
        "Luta ou Pontaria, Sobrevivência, mais 4",
      ],
      ["Força", "20", "3", "Fortitude e Luta, mais 2"],
      ["Sabedoria", "16", "5", "Religião e Vontade, mais 2"],
      ["Sabedoria", "16", "4", "Sobrevivência e Vontade, mais 4"],
      ["Força ou Destreza", "20", "3", "Luta ou Pontaria, Fortitude, mais 2"],
      ["Inteligência", "12", "4", "Ofício e Vontade, mais 4"],
      ["Destreza ou Inteligência", "12", "4", "Ladinagem e Reflexos, mais 8"],
      ["Força", "20", "3", "Fortitude e Luta, mais 4"],
      ["Carisma", "16", "4", "Diplomacia ou Intimidação, Vontade, mais 4"],
      ["Força e Carisma", "20", "3", "Luta e Vontade, mais 2"],
    ]);
    expect(table.rows[2][1]).toContain("faz-tudo");
    expect(table.notes).toEqual([
      "1. Mais sua Constituição.",
      "2. Mais sua Inteligência, se positiva. Perícias por Inteligência não precisam ser da lista da classe.",
    ]);
  });
});
