import {
  ATTRIBUTES,
  CATALOG,
  CLASS_MAP,
  CLASSES,
  ENTRY_MAP,
  RACES,
  SCHOOLS,
  classLevel,
  slug,
} from "../data/rules";
import {
  characterEntries,
  emptyCharacter,
  originBenefits,
  validatePrerequisites,
} from "../domain/character";
import { calculate } from "../domain/calculate";
import { powerOptions, spellOptions } from "../domain/creation";
import type { CatalogEntry, Character } from "../domain/types";

export const POWER_KINDS = [
  "power",
  "classPower",
  "originPower",
  "raceAbility",
  "ability",
  "classChoice",
  "partner",
];
export const KIND_LABELS: Record<string, string> = {
  power: "Poder geral",
  classPower: "Poder de classe",
  originPower: "Poder de origem",
  raceAbility: "Habilidade racial",
  ability: "Habilidade de classe",
  classChoice: "Escolha de classe",
  partner: "Parceiro",
  spell: "Magia",
};
export const searchText = (text: string) => slug(text).replaceAll("-", " ");
export const ORIGINS = CATALOG.filter((e) => e.kind === "origin");
const originPowers = ORIGINS.map((origin) => {
  const profile = emptyCharacter();
  profile.originId = origin.id;
  return {
    origin,
    ids: new Set(
      [
        ...originBenefits(origin.id).powers,
        ...powerOptions(profile, "Origem"),
      ].map((e) => e.id),
    ),
  };
});
// Base class lists across their full progression. School choices are left open;
// the character-specific check below uses its actual level and chosen schools.
const spellClassLists = CLASSES.map((cls) => {
  const profile = emptyCharacter();
  profile.levels = Array.from({ length: 20 }, () => ({
    classId: cls.id,
    powers: [],
    notes: "",
  }));
  profile.choices.schools = [...SCHOOLS];
  return {
    id: cls.id,
    entries: new Set(spellOptions(profile, cls.id).map((e) => e.id)),
  };
}).filter((list) => list.entries.size);
export interface LibraryRow {
  entry: CatalogEntry;
  text: string;
  classes: string[];
  races: string[];
  origins: string[];
  levels: number[];
}
export const LIBRARY_ROWS: LibraryRow[] = CATALOG.filter(
  (e) => POWER_KINDS.includes(e.kind) || e.kind === "spell",
).map((entry) => {
  const classes =
    entry.kind === "spell"
      ? spellClassLists
          .filter((list) => list.entries.has(entry.id))
          .map((list) => list.id)
      : ["classPower", "ability", "classChoice"].includes(entry.kind)
        ? CLASSES.filter((cls) => cls.name === entry.group).map((cls) => cls.id)
        : [];
  const races =
    entry.kind === "raceAbility"
      ? RACES.filter(
          (r) =>
            r.abilities.some((name) => slug(name) === slug(entry.name)) ||
            (r.id === "suraggel" &&
              entry.name === "Sombras Profanas (Sulfure)"),
        ).map((r) => r.id)
      : [];
  const origins = originPowers
    .filter((o) => o.ids.has(entry.id))
    .map((o) => o.origin.id);
  const levels = [
    ...(entry.prerequisites ?? "").matchAll(/(\d+)[º°ª]\s*nível/gu),
  ].map((m) => Number(m[1]));
  if (entry.kind === "ability") {
    const cls = CLASS_MAP.get(classes[0]);
    const first = Object.entries(cls?.progression ?? {}).find(([, text]) =>
      slug(text).includes(slug(entry.name)),
    );
    if (first) levels.push(Number(first[0]));
  }
  return {
    entry,
    classes,
    races,
    origins,
    levels: [...new Set(levels)],
    text: searchText(
      [
        entry.name,
        entry.description,
        entry.prerequisites,
        entry.group,
        KIND_LABELS[entry.kind],
        ...classes.map((id) => CLASS_MAP.get(id)?.name),
        ...races.map((id) => RACES.find((r) => r.id === id)?.name),
        ...origins.map((id) => ENTRY_MAP.get(id)?.name),
      ].join(" "),
    ),
  };
});
export const LIBRARY_ROW_MAP = new Map(
  LIBRARY_ROWS.map((row) => [row.entry.id, row]),
);
export type Relation = {
  status: "owned" | "blocked" | "review" | "option";
  label: string;
  reasons: string[];
  sources: string[];
};
export function libraryContext(c: Character) {
  const own = new Set(characterEntries(c).map((e) => e.id));
  const sources = [
    ...new Set(c.levels.map((l) => l.classId)),
    "Raça",
    "Origem",
    "Devoção",
  ];
  const powerPools = sources.map((source) => ({
    source,
    ids: new Set(powerOptions(c, source).map((e) => e.id)),
  }));
  const spellPools = sources
    .filter((source) => !["Origem", "Devoção"].includes(source))
    .map((source) => ({
      source,
      ids: new Set(spellOptions(c, source).map((e) => e.id)),
    }));
  const d = calculate(c);
  const attrs = Object.fromEntries(
    ATTRIBUTES.map((a) => [a.id, d.attributes[a.id].total]),
  );
  return (entry: CatalogEntry): Relation => {
    if (own.has(entry.id))
      return { status: "owned", label: "Já possui", reasons: [], sources: [] };
    const row = LIBRARY_ROW_MAP.get(entry.id);
    const reasons = validatePrerequisites(c, entry, attrs);
    if (
      entry.kind !== "spell" &&
      row?.classes.length &&
      !row.classes.some((id) => classLevel(c, id))
    )
      reasons.push(`Requer a classe ${entry.group}.`);
    if (row?.races.length && !row.races.includes(c.raceId))
      reasons.push(
        `Habilidade de ${row.races.map((id) => RACES.find((r) => r.id === id)?.name).join(" / ")}.`,
      );
    if (
      entry.kind === "originPower" &&
      row?.origins.length &&
      !row.origins.includes(c.originId)
    )
      reasons.push(
        `Associado à origem ${row.origins.map((id) => ENTRY_MAP.get(id)?.name).join(" / ")}.`,
      );
    if (
      entry.kind === "ability" &&
      row?.levels.length &&
      classLevel(c, row.classes[0]) < Math.min(...row.levels)
    )
      reasons.push(
        `Requer ${Math.min(...row.levels)}º nível de ${entry.group}.`,
      );
    const available = (entry.kind === "spell" ? spellPools : powerPools)
      .filter((pool) => pool.ids.has(entry.id))
      .map((pool) => pool.source);
    if (reasons.length)
      return {
        status: "blocked",
        label: "Requisitos pendentes",
        reasons: [...new Set(reasons)],
        sources: available,
      };
    if (entry.kind === "spell" && !available.length)
      return {
        status: "review",
        label: "Conferir aprendizagem",
        reasons: [
          "Não consta nas opções atuais de classe, círculo, escolas ou raça. Outras formas de aprendizagem precisam de conferência.",
        ],
        sources: [],
      };
    if (
      ["raceAbility", "ability", "classChoice", "partner"].includes(entry.kind)
    )
      return {
        status: "review",
        label: "Conferir progressão",
        reasons: [
          "Consulte a escolha ou progressão que concede este benefício.",
        ],
        sources: available,
      };
    return {
      status: available.length ? "option" : "review",
      label: available.length ? "Opção de aprendizagem" : "Conferir requisitos",
      reasons: [
        "A progressão, as escolhas disponíveis e os requisitos não automatizados precisam ser conferidos antes de adquirir.",
      ],
      sources: available,
    };
  };
}
export interface LibraryFilters {
  kind: string;
  category: string;
  classId: string;
  raceId: string;
  originId: string;
  magicType: string;
  school: string;
  circle: string;
  level: string;
  cost: string;
  prerequisites: string;
  relation: string;
}
export const EMPTY_FILTERS: LibraryFilters = {
  kind: "",
  category: "",
  classId: "",
  raceId: "",
  originId: "",
  magicType: "",
  school: "",
  circle: "",
  level: "",
  cost: "",
  prerequisites: "",
  relation: "",
};
export function filterLibrary(
  rows: LibraryRow[],
  query: string,
  filters: LibraryFilters,
  relation: (e: CatalogEntry) => Relation,
) {
  const terms = searchText(query).split(" ").filter(Boolean);
  return rows.filter((row) => {
    const e = row.entry;
    return (
      terms.every((term) => row.text.includes(term)) &&
      (!filters.kind || e.kind === filters.kind) &&
      (!filters.category || e.group === filters.category) &&
      (!filters.classId || row.classes.includes(filters.classId)) &&
      (!filters.raceId || row.races.includes(filters.raceId)) &&
      (!filters.originId || row.origins.includes(filters.originId)) &&
      (!filters.magicType || e.magicType === filters.magicType) &&
      (!filters.school || e.school === filters.school) &&
      (!filters.circle || String(e.circle) === filters.circle) &&
      (!filters.level || row.levels.includes(Number(filters.level))) &&
      (!filters.cost || String(e.cost) === filters.cost) &&
      (!filters.prerequisites ||
        (filters.prerequisites === "with"
          ? !!e.prerequisites
          : !e.prerequisites)) &&
      (!filters.relation || relation(e).status === filters.relation)
    );
  });
}
