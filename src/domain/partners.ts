import { ENTRY_MAP, classLevel, slug } from "../data/rules";
import type { Character, Modifier } from "./types";

export const FAMILIARS = [
  "Borboleta",
  "Cobra",
  "Coruja",
  "Corvo",
  "Falcão",
  "Gato",
  "Lagarto",
  "Morcego",
  "Rato",
  "Sapo",
];
export const ANIMAL_PARTNERS = [
  "Ajudante",
  "Assassino",
  "Atirador",
  "Combatente",
  "Fortão",
  "Guardião",
  "Perseguidor",
];
export function partners(c: Character) {
  return c.acquisitions.flatMap((ac) => {
    const e = ENTRY_MAP.get(ac.entryId);
    if (!e) return [];
    const animal = e.name === "Companheiro Animal";
    if (e.kind !== "partner" && !animal) return [];
    const level = classLevel(c, ac.source);
    const tier = animal
      ? level >= 15
        ? 2
        : level >= 7
          ? 1
          : 0
      : Math.max(0, Math.min(2, Number(ac.choices.tier ?? 0)));
    return [
      {
        id: ac.id,
        name: ac.choices.name || e.name,
        type: animal ? (ac.choices.partnerType ?? "") : e.name,
        tier,
        skills: [
          ac.choices.skill1,
          ac.choices.skill2,
          ac.choices.skill3,
        ].filter(Boolean),
        active: ac.choices.active !== "não",
        page: e.page,
        animal,
      },
    ];
  });
}
export const partnerLimit = (c: Character) =>
  c.levels.length >= 17 ? 3 : c.levels.length >= 5 ? 2 : 1;
export function partnerModifiers(c: Character): Modifier[] {
  const result: Modifier[] = [];
  for (const p of partners(c)
    .filter((p) => p.active)
    .slice(0, partnerLimit(c))) {
    const add = (target: string, value: number) =>
      result.push({
        id: `${p.id}:${target}`,
        label: p.name,
        source: "parceiro",
        sourceId: p.id,
        target,
        value,
        page: p.page,
      });
    if (p.type === "Combatente") add("attack", p.tier + 2);
    if (p.type === "Guardião") {
      add("defense", p.tier + 2);
      if (p.tier === 2)
        for (const s of ["fortitude", "reflexos", "vontade"])
          add(`skill:${s}`, 2);
    }
    if (p.type === "Ajudante")
      for (const s of p.skills
        .slice(0, p.tier ? 3 : 2)
        .filter((s) => !["luta", "pontaria"].includes(s)))
        add(`skill:${s}`, p.tier === 2 ? 4 : 2);
    if (p.type === "Perseguidor")
      for (const s of ["percepcao", "sobrevivencia"]) add(`skill:${s}`, 2);
    if (p.type === "Vigilante")
      for (const s of ["percepcao", "iniciativa"]) add(`skill:${s}`, 2);
    if (p.type === "Magivocador" && p.tier) add("spellDC", p.tier);
  }
  return result;
}
export function familiar(c: Character) {
  return (
    c.acquisitions.find((a) => ENTRY_MAP.get(a.entryId)?.name === "Familiar")
      ?.choices.familiar ?? ""
  );
}
