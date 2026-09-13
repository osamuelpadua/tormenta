import { classLevel, ENTRY_MAP, slug } from "../data/rules";
import { has } from "./character";
import { calculate } from "./calculate";
import type { Character } from "./types";

export interface AttackOptions {
  special?: number;
  specialHit?: number;
  divine?: number;
  extra?: "ataque-extra" | "frenesi" | "golpe-relampago";
}

/** p. 40–42, 65–66, 76, 82: abilities belong to the attack that triggers them. */
export function attackPlan(
  c: Character,
  attackId: string,
  options: AttackOptions = {},
) {
  const d = calculate(c),
    attack = d.attacks.find((a) => a.id === attackId);
  const errors: string[] = [];
  let cost = 0,
    hit = 0,
    damage = 0,
    divineDice = 0;
  if (!attack) errors.push("Ataque indisponível.");
  const melee = attack?.skill === "luta";
  const special = options.special ?? 0,
    divine = options.divine ?? 0;
  if (special) {
    const max = 1 + Math.floor((classLevel(c, "guerreiro") - 1) / 4);
    if (
      !has(c, "Ataque Especial") ||
      !Number.isInteger(special) ||
      special < 1 ||
      special > max
    )
      errors.push(
        "Custo de Ataque Especial indisponível neste nível de guerreiro.",
      );
    const allotted = options.specialHit ?? special * 4;
    if (
      !Number.isInteger(allotted) ||
      allotted < 0 ||
      allotted > special * 4 ||
      allotted % 2
    )
      errors.push("Distribua o bônus de Ataque Especial em parcelas de +2.");
    hit += allotted;
    damage += special * 4 - allotted;
    cost += special;
  }
  if (divine) {
    const max = 2 + Math.floor((classLevel(c, "paladino") - 1) / 4);
    if (
      !has(c, "Golpe Divino") ||
      !Number.isInteger(divine) ||
      divine < 2 ||
      divine > max ||
      !melee
    )
      errors.push(
        "Golpe Divino exige um ataque corpo a corpo e o custo permitido pelo nível de paladino.",
      );
    hit += d.attributes.car.total;
    divineDice = divine - 1;
    cost += divine;
  }
  if (options.extra) {
    const names = {
      "ataque-extra": "Ataque Extra",
      frenesi: "Frenesi",
      "golpe-relampago": "Golpe Relâmpago",
    };
    if (
      !has(c, names[options.extra]) ||
      !c.combat.pending.includes(options.extra)
    )
      errors.push(
        "Este ataque extra exige uma ação agredir imediatamente anterior.",
      );
    if (c.combat.used.includes(`round:${options.extra}`))
      errors.push("Este ataque extra já foi usado nesta rodada.");
    if (
      options.extra === "frenesi" &&
      (!c.effects.some((e) => e.active && e.name === "Fúria") ||
        (!melee &&
          c.inventory.find((i) => i.id === attack?.itemId)?.attackType !==
            "thrown"))
    )
      errors.push(
        "Frenesi exige Fúria e um ataque corpo a corpo ou de arremesso.",
      );
    if (options.extra === "golpe-relampago" && attackId !== "unarmed")
      errors.push("Golpe Relâmpago exige um ataque desarmado.");
    cost += options.extra === "golpe-relampago" ? 1 : 2;
  }
  if (cost && d.conditions.includes("alquebrado"))
    cost += (special ? 1 : 0) + (divine ? 1 : 0) + (options.extra ? 1 : 0);
  const weapon = c.inventory.find((i) => i.id === attack?.itemId);
  const preferred =
    ENTRY_MAP.get(c.deityId)?.description.match(
      /Arma Preferida\.\s*([^.]*)/i,
    )?.[1] ?? "";
  const divineSides =
    has(c, "Arma Sagrada") && !!weapon && slug(preferred) === slug(weapon.name)
      ? 12
      : 8;
  return { cost, hit, damage, divineDice, divineSides, errors };
}
