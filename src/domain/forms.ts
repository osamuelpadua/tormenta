import { classLevel } from "../data/rules";
import { has } from "./character";
import type { Character } from "./types";

export const WILD_FORMS = [
  { id: "agil", name: "Ágil", damage: ["1d6", "1d8", "1d10"], threat: 19 },
  { id: "feroz", name: "Feroz", damage: ["1d8", "2d6", "4d6"], threat: 20 },
  {
    id: "resistente",
    name: "Resistente",
    damage: ["1d6", "1d8", "2d6"],
    threat: 20,
  },
  {
    id: "sorrateira",
    name: "Sorrateira",
    damage: ["1d4", "1d4", "1d4"],
    threat: 20,
  },
  { id: "veloz", name: "Veloz", damage: ["1d6", "1d6", "1d6"], threat: 20 },
];
export function formPlan(c: Character, choices: Record<string, string>) {
  const tier = ["base", "aprimorada", "superior"].indexOf(
    choices.tier ?? "base",
  );
  const form = WILD_FORMS.find((f) => f.id === (choices.form ?? "feroz"));
  const errors: string[] = [];
  if (!form || tier < 0) errors.push("Escolha uma forma e um patamar válidos.");
  if (
    tier > 0 &&
    (!has(
      c,
      tier === 2 ? "Forma Selvagem Superior" : "Forma Selvagem Aprimorada",
    ) ||
      classLevel(c, "druida") < (tier === 2 ? 12 : 6))
  )
    errors.push(
      "O patamar requer o poder correspondente e seu nível de druida.",
    );
  const movement = choices.movement ?? (tier === 2 ? "flight" : "speed");
  if (
    form?.id === "veloz" &&
    !(tier === 2 ? ["swim", "flight"] : ["speed", "climb", "swim"]).includes(
      movement,
    )
  )
    errors.push("Escolha um deslocamento disponível para esta forma.");
  return { tier, form, movement, errors, cost: [3, 6, 10][tier] ?? 3 };
}
