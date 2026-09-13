import { describe, expect, it } from "vitest";
import { CATALOG, entryNamed } from "../src/data/rules";
import {
  EMPTY_FILTERS,
  LIBRARY_ROWS,
  filterLibrary,
  libraryContext,
} from "../src/ui/library-data";
import {
  bookReference,
  itemSource,
  subjectReferences,
} from "../src/ui/book-reference";
import { readRoute, routeHash } from "../src/ui/reference-navigation";
import { hero, equip } from "./fixtures";

describe("biblioteca e fontes", () => {
  it("consulta todos os poderes e magias sem restringir pelo personagem", () => {
    const context = libraryContext(hero());
    const spells = LIBRARY_ROWS.filter((row) => row.entry.kind === "spell");
    expect(filterLibrary(spells, "", EMPTY_FILTERS, context)).toHaveLength(198);
    expect(
      filterLibrary(
        LIBRARY_ROWS,
        "",
        { ...EMPTY_FILTERS, classId: "guerreiro", kind: "classPower" },
        context,
      ).every((row) => row.entry.group === "Guerreiro"),
    ).toBe(true);
    expect(
      filterLibrary(
        LIBRARY_ROWS,
        "rochas",
        { ...EMPTY_FILTERS, raceId: "anao" },
        context,
      ).map((row) => row.entry.name),
    ).toContain("Conhecimento das Rochas");
    const soldier = CATALOG.find(
      (entry) => entry.kind === "origin" && entry.name === "Soldado",
    )!;
    expect(
      filterLibrary(
        LIBRARY_ROWS,
        "Acuidade com Arma",
        { ...EMPTY_FILTERS, originId: soldier.id },
        context,
      ).map((row) => row.entry.name),
    ).toContain("Acuidade com Arma");
  });
  it("combina escola, círculo e lista básica sem confundir com acesso atual", () => {
    const found = filterLibrary(
      LIBRARY_ROWS,
      "",
      {
        ...EMPTY_FILTERS,
        classId: "arcanista",
        school: "Evocação",
        circle: "5",
      },
      libraryContext(hero()),
    );
    expect(found.length).toBeGreaterThan(0);
    expect(
      found.every(
        (row) =>
          row.entry.kind === "spell" &&
          row.entry.circle === 5 &&
          row.entry.school === "Evocação",
      ),
    ).toBe(true);
    expect(libraryContext(hero())(found[0].entry).status).toBe("review");
  });
  it("distingue benefícios automáticos, requisitos não cumpridos e avaliação parcial", () => {
    const c = hero();
    c.raceId = "anao";
    c.attributes.des = 2;
    const context = libraryContext(c);
    expect(context(entryNamed("Conhecimento das Rochas")!).status).toBe(
      "owned",
    );
    expect(context(entryNamed("Frenesi")!).reasons).toContain(
      "Requer a classe Bárbaro.",
    );
    expect(context(entryNamed("Acuidade com Arma")!).label).toBe(
      "Opção de aprendizagem",
    );
    expect(
      context(entryNamed("Acuidade com Arma")!).reasons.join(" "),
    ).toContain("não automatizados");
  });
  it("abre a descrição do equipamento base e omite fontes desconhecidas", () => {
    const c = hero();
    const item = equip(c, "marreta");
    item.name = "Marreta certeira";
    const source = itemSource(item)!;
    expect(source.name).toBe("Marreta");
    expect(bookReference(source)?.printedPage).toBe(149);
    expect(
      itemSource({
        ...item,
        templateId: undefined,
        entryId: undefined,
        name: "Objeto inventado xyz",
      }),
    ).toBeUndefined();
    expect(bookReference({ ...source, page: 1 })).toBeUndefined();
    expect(
      bookReference(CATALOG.find((e) => e.id === "skillUse-intuicao-do")!),
    ).toBeUndefined();
    expect(bookReference(entryNamed("Luz")!)?.printedPage).toBe(197);
    expect(subjectReferences["skill:luta"].printedPage).toBe(121);
  });
  it("serializa consultas em rotas e rejeita páginas inválidas", () => {
    const route = {
      tab: "powers" as const,
      entryId: entryNamed("Frenesi")!.id,
      bookPage: 41,
      focus: "Frenesi",
    };
    expect(readRoute(routeHash(route))).toEqual(route);
    expect(readRoute("#powers?entry=falso&book=999")).toEqual({
      tab: "powers",
    });
    expect(readRoute("#spells?book=-5").bookPage).toBe(-5);
  });
});
