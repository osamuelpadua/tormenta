import {
  ENTRY_MAP,
  classLevel,
  magicAttribute,
  maxCircle,
  slug,
  racialMagic,
} from "../data/rules";
import { calculate } from "./calculate";
import { has } from "./character";
import { castingCost } from "./effects";
import { familiar, partnerModifiers } from "./partners";
import type {
  Acquisition,
  CatalogEntry,
  Character,
  RulesContext,
} from "./types";

export interface CastingContext {
  silent?: boolean;
  bound?: boolean;
  concentration?: "normal" | "bad" | "terrible" | "damage";
  damage?: number;
  discreet?: boolean;
  accelerated?: boolean;
  naturalTerrain?: boolean;
  wish?: boolean;
  materialsReady?: boolean;
  sourceAttribute?: "for" | "des" | "con" | "int" | "sab" | "car";
}
export function magicPlan(
  c: Character,
  e: CatalogEntry,
  ac: Acquisition | undefined,
  source: string,
  enhancements: Record<string, number>,
  context: CastingContext = {},
) {
  const isDevice = ac?.mode === "device";
  const d = calculate(c);
  const plan = castingCost(c, e, source, enhancements, isDevice, context);
  const errors = [...plan.errors];
  if (ac?.mode === "formula")
    errors.push(
      "Fórmulas são usadas para fabricar poções. Não podem ser lançadas diretamente.",
    );
  if (context.discreet && !has(c, "Magia Discreta"))
    errors.push("Requer Magia Discreta.");
  if (context.accelerated && !has(c, "Magia Acelerada"))
    errors.push("Requer Magia Acelerada.");
  if (context.accelerated && /minuto|hora|dia/.test(e.execution ?? ""))
    errors.push("Magia Acelerada exige execução de ação completa ou menor.");
  if (!isDevice && !context.discreet) {
    if (context.silent || context.bound)
      errors.push("A conjuração exige gestos e palavras.");
    const hands = c.inventory
      .filter((i) => i.quantity > 0 && i.state === "wielded")
      .reduce((n, i) => n + i.hands, 0);
    if (hands >= 2)
      errors.push("Libere uma mão para gesticular antes de lançar a magia.");
  }
  if (ac?.source === "arcanista" && c.choices.path === "Mago" && !ac.prepared)
    errors.push("Esta magia não foi memorizada.");
  if (
    c.effects.some(
      (x) =>
        x.active && ["furia", "transformacao-de-guerra"].includes(slug(x.name)),
    )
  )
    errors.push("O efeito ativo impede conjuração e ativação de engenhocas.");
  if (
    c.effects.some((x) => x.active && slug(x.name) === "forma-selvagem") &&
    !has(c, "Magia Natural")
  )
    errors.push("A forma selvagem impede conjuração sem Magia Natural.");
  if (isDevice && ac?.broken)
    errors.push("Engenhoca enguiçada: conserte-a antes de ativar.");
  if (
    ["arcanista", "bardo", "clerigo", "druida"].includes(source) &&
    (e.circle ?? 1) > maxCircle(c, source)
  )
    errors.push(
      "O círculo desta magia não está disponível na classe de aprendizagem.",
    );
  if (isDevice) {
    const level = classLevel(c, "inventor");
    const circle = level < 6 ? 1 : Math.min(5, 2 + Math.floor((level - 6) / 4));
    if ((e.circle ?? 1) > circle)
      errors.push(
        "Círculo de engenhoca indisponível para este nível de inventor.",
      );
  }
  const armor = c.inventory.find(
    (i) =>
      i.quantity > 0 &&
      i.benefit &&
      i.state === "worn" &&
      i.category.startsWith("Armadura"),
  );
  const shield = c.inventory.find(
    (i) => i.quantity > 0 && i.state === "wielded" && i.category === "Escudo",
  );
  const armorPenalty =
    (armor?.penalty ?? 0) +
    (shield?.penalty ?? 0) +
    (c.raceId === "golem" ? -2 : 0) +
    (d.conditions.includes("sobrecarregado") ? -5 : 0);
  const checks: { skill: string; dc: number; bonus: number; label: string }[] =
    [];
  if (isDevice) {
    const skill = String(c.choices.deviceCraft ?? "oficio-engenhoqueiro");
    if (!c.trained.some((t) => t.id === skill))
      errors.push("Requer treinamento em Ofício (engenhoqueiro).");
    checks.push({
      skill,
      dc: 15 + (e.cost ?? 0) + plan.cost + 5 * (ac?.uses ?? 0),
      bonus: (d.skills[skill]?.total ?? 0) + armorPenalty,
      label: "Ativar engenhoca",
    });
  } else if (
    armor &&
    ["arcanista", "bardo"].includes(source) &&
    !(source === "bardo" && !armor.heavy)
  ) {
    checks.push({
      skill: "misticismo",
      dc: 20 + plan.cost,
      bonus: d.skills.misticismo.total + armorPenalty,
      label: "Conjuração arcana com armadura",
    });
  }
  let condition = context.concentration ?? "normal";
  if (d.conditions.includes("surdo") || d.conditions.includes("caido"))
    if (condition === "normal") condition = "bad";
  if (d.conditions.includes("agarrado")) condition = "terrible";
  if (condition !== "normal" && !isDevice)
    checks.push({
      skill: "vontade",
      dc:
        condition === "damage"
          ? Math.max(0, context.damage ?? 0)
          : (condition === "terrible" ? 20 : 15) + plan.cost,
      bonus: d.skills.vontade.total,
      label: "Concentração",
    });
  const full = e.description.replace(/-\s+/g, "").replace(/\s+/g, " ");
  let gold = 0;
  const material = full.match(
    /Componente\s*material:\s*([^]*?)(?:\.\s|$)/i,
  )?.[1];
  if (material) {
    const m = material.match(/T\$\s*([\d.,]+)/);
    gold = m
      ? Number(m[1].replaceAll(".", "").replace(",", ".")) *
        (/por PM gasto/.test(material) ? plan.cost : 1)
      : 0;
    if (!context.materialsReady)
      errors.push(`Separe os componentes materiais: ${material}`);
  }
  const sacrifice = Number(
    full.match(/Sacrifício(?: de PM)?:\s*(\d+)\s*PM/i)?.[1] ?? 0,
  );
  const penalty = Number(
    full.match(/Penalidade(?: de PM)?:\s*(\d+)\s*PM/i)?.[1] ?? 0,
  );
  const durationMinutes = /minuto|hora|dia/.test(e.execution ?? "")
    ? Number(e.execution?.match(/\d+/)?.[0] ?? 1) *
      (e.execution?.includes("dia")
        ? 1440
        : e.execution?.includes("hora")
          ? 60
          : 1)
    : 0;
  if (durationMinutes && c.combat.active)
    errors.push(
      `Execução de ${e.execution}: conclua fora do combate ou registre o tempo de conjuração na mesa.`,
    );
  const key = isDevice
    ? "int"
    : source === "Raça"
      ? racialMagic(c).attribute
      : (context.sourceAttribute ?? magicAttribute(c, source));
  let dcBonus = Math.max(
    0,
    ...partnerModifiers(c)
      .filter((m) => m.target === "spellDC")
      .map((m) => m.value),
  );
  if (source === "druida" && has(c, "Força da Natureza"))
    dcBonus += context.naturalTerrain ? 4 : 2;
  if (source === "arcanista") {
    if (has(c, "Fortalecimento Arcano"))
      dcBonus += maxCircle(c, "arcanista") >= 4 ? 2 : 1;
    if (
      c.acquisitions.some(
        (a) =>
          ENTRY_MAP.get(a.entryId)?.name === "Especialista em Escola" &&
          a.choices.school === e.school,
      )
    )
      dcBonus += 2;
    const resistance = slug(e.resistance ?? "");
    if (
      (familiar(c) === "Borboleta" && resistance.includes("vontade")) ||
      (familiar(c) === "Cobra" && resistance.includes("fortitude")) ||
      (familiar(c) === "Lagarto" && resistance.includes("reflexos"))
    )
      dcBonus++;
  }
  return {
    ...plan,
    action:
      isDevice && ["livre", "reacao", "movimento"].includes(plan.action)
        ? ("padrao" as const)
        : plan.action,
    errors: [...new Set(errors)],
    checks,
    gold,
    sacrifice,
    penalty,
    durationMinutes,
    dc:
      10 + Math.floor(c.levels.length / 2) + d.attributes[key].total + dcBonus,
    attribute: key,
  };
}
