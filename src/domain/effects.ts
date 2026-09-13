import {
  classLevel,
  slug,
  magicAttribute,
  ENTRY_MAP,
  racialMagic,
} from "../data/rules";
import type { CastingContext } from "./magic";
import { calculate } from "./calculate";
import { has, uid } from "./character";
import { formPlan } from "./forms";
import type {
  ActionType,
  CatalogEntry,
  Character,
  Duration,
  Effect,
  Modifier,
  SourceKind,
} from "./types";
export function durationFor(text = "", anchor = 0): Duration {
  const t = text.toLowerCase();
  const n = Number(t.match(/\d+/)?.[0] ?? 1);
  const unit: Duration["unit"] = t.includes("sustentad")
    ? "sustained"
    : t.includes("instant")
      ? "instant"
      : t.includes("rodada")
        ? "round"
        : t.includes("minuto")
          ? "minute"
          : t.includes("hora")
            ? "hour"
            : t.includes("dia")
              ? "day"
              : t.includes("permanente")
                ? "permanent"
                : t.includes("descarreg")
                  ? "discharge"
                  : "scene";
  return { unit, value: n, remaining: n, anchor, end: "before" };
}
export const durationLabel = (d: Duration) =>
  d.unit === "scene"
    ? "Até o fim da cena"
    : d.unit === "sustained"
      ? "Sustentado"
      : d.unit === "permanent"
        ? "Permanente"
        : d.unit === "instant"
          ? "Instantânea"
          : d.unit === "discharge"
            ? "Até descarregar"
            : `${Number(d.remaining.toFixed(1))} ${{ round: "rodada(s)", minute: "minuto(s)", hour: "hora(s)", day: "dia(s)" }[d.unit]}`;
export function execution(text = ""): ActionType {
  const t = text.toLowerCase();
  return t.includes("reaç")
    ? "reacao"
    : t.includes("livre")
      ? "livre"
      : t.includes("movimento")
        ? "movimento"
        : t.includes("completa")
          ? "completa"
          : "padrao";
}
export interface Usage {
  action: ActionType;
  minimum: number;
  maximum: number;
  duration: string;
  active: boolean;
  limit?: "round" | "scene";
}
export function usageFor(c: Character, e: CatalogEntry): Usage {
  const name = slug(e.name),
    cls = slug(e.group),
    level = classLevel(c, cls) || c.levels.length;
  const exact: Record<
    string,
    [ActionType, number, string, ("round" | "scene")?]
  > = {
    furia: ["livre", 2, "cena"],
    "armadura-de-allihanna": ["movimento", 1, "cena"],
    inspiracao: ["padrao", 2, "cena"],
    "marca-da-presa": ["movimento", 1, "cena"],
    baluarte: ["reacao", 1, "1 rodada"],
    duelo: ["livre", 2, "cena"],
    "aura-sagrada": ["livre", 1, "sustentada"],
    "cura-pelas-maos": ["movimento", 1, "instantânea"],
    "ataque-especial": ["reacao", 1, "instantânea"],
    "golpe-divino": ["reacao", 2, "instantânea"],
    durao: ["reacao", 3, "instantânea"],
    "golpe-relampago": ["reacao", 1, "instantânea"],
    "ataque-extra": ["reacao", 2, "instantânea", "round"],
    frenesi: ["reacao", 2, "instantânea", "round"],
    "surto-heroico": ["livre", 5, "instantânea", "round"],
    "velocidade-ladina": ["livre", 2, "instantânea", "round"],
    impeto: ["livre", 1, "1 rodada"],
    "olhar-atordoante": ["movimento", 1, "1 rodada", "scene"],
    "natureza-venenosa": ["movimento", 1, "cena"],
    "mau-cheiro": ["padrao", 2, "1d6 rodadas"],
    "simbolo-sagrado-energizado": ["movimento", 1, "cena"],
    "forma-selvagem": ["completa", 3, "permanente"],
    "palavras-afiadas": ["padrao", 1, "instantânea"],
    "golpe-magico": ["reacao", 0, "instantânea"],
    "egide-sagrada": ["movimento", 2, "cena"],
    "vingador-sagrado": ["completa", 10, "cena"],
    "rolamento-defensivo": ["reacao", 2, "instantânea"],
  };
  if (e.kind === "spell")
    return {
      action: execution(e.execution),
      minimum: e.cost ?? 0,
      maximum: level,
      duration: e.duration ?? "instantânea",
      active: true,
    };
  if (exact[name]) {
    const [action, minimum, duration, limit] = exact[name];
    const caps: Record<string, number> = {
      furia: 2 + Math.floor((level - 1) / 5),
      inspiracao: 2 + 2 * Math.floor((level - 1) / 4),
      baluarte: 1 + Math.floor((level - 1) / 4),
      duelo: 2 + Math.max(0, Math.floor((level - 2) / 5)),
      "ataque-especial": 1 + Math.floor((level - 1) / 4),
      "golpe-divino": 2 + Math.floor((level - 1) / 4),
      "cura-pelas-maos": 1 + Math.max(0, Math.floor((level - 2) / 4)),
      "forma-selvagem": level >= 12 ? 10 : level >= 6 ? 6 : 3,
    };
    return {
      action: name === "inspiracao" && level >= 20 ? "livre" : action,
      minimum,
      maximum: caps[name] ?? minimum,
      duration,
      active: true,
      limit,
    };
  }
  if (e.name.startsWith("Música:"))
    return {
      action: "padrao",
      minimum: 1,
      maximum: Math.max(level, 1),
      duration: e.name.includes("Curativa") ? "instantânea" : "cena",
      active: true,
    };
  if (e.name.startsWith("Postura de Combate:"))
    return {
      action: "movimento",
      minimum: 2,
      maximum: Math.max(level, 2),
      duration: "cena",
      active: true,
    };
  if (e.name.startsWith("Armadilha:"))
    return {
      action: "completa",
      minimum: 3,
      maximum: Math.max(level, 3),
      duration: "permanente",
      active: true,
    };
  if (e.name.startsWith("Julgamento Divino:"))
    return {
      action: "movimento",
      minimum: Number(e.description.match(/gastar\s*(\d+)\s*PM/)?.[1] ?? 0),
      maximum: level,
      duration: "cena",
      active: true,
    };
  const active =
    /pode(?:m)?\s+(?:gastar|pagar)|você pode usar|você pode lançar/i.test(
      e.description,
    );
  const min = Number(
    e.description.match(/(?:gastar|pagar)(?:[\s\S]{0,45}?)\b(\d+)\s*PM/)?.[1] ??
      0,
  );
  const a = e.description.match(
    /(?:gastar|exige|gasta)\s+(?:uma\s+)?ação\s+(padrão|de movimento|completa|livre)/i,
  )?.[1];
  return {
    action: a
      ? execution(a)
      : /quando (?:faz|sofre|acerta|erra)/i.test(e.description)
        ? "reacao"
        : "livre",
    minimum: min,
    maximum: Math.max(level, min),
    duration: /até o fim da cena|até o final da cena/i.test(e.description)
      ? "cena"
      : /por uma rodada/i.test(e.description)
        ? "1 rodada"
        : "instantânea",
    active,
  };
}
export function createEffect(
  c: Character,
  e: CatalogEntry,
  cost: number,
  sourceClass = "",
  target = "",
  counts: Record<string, number> = {},
  choices: Record<string, string> = {},
): Effect {
  const usage = usageFor(c, e),
    source: SourceKind = e.kind === "spell" ? "magia" : "habilidade";
  const d = calculate(c);
  const lv = classLevel(c, sourceClass || slug(e.group)) || c.levels.length;
  const name = slug(e.name);
  const effect: Effect = {
    id: uid(),
    name: e.name,
    entryId: e.id,
    source,
    description: e.description,
    active: true,
    startedRound: c.combat.round,
    startedTurn: c.combat.turn,
    modifiers: [],
    duration: durationFor(usage.duration, c.combat.initiative),
    maintenance: usage.duration.includes("sustentad") ? 1 : 0,
    target,
  };
  const mod = (
    target: string,
    value: number,
    operation: Modifier["operation"] = "add",
  ) =>
    effect.modifiers.push({
      id: uid(),
      label: e.name,
      target,
      value,
      source,
      sourceId: e.id,
      page: e.page,
      operation,
    });
  const enhancementText = (e.enhancements ?? [])
    .filter((x) => counts[x.id] > 0)
    .map((x) => x.text.replace(/\s+/g, " "))
    .join(" ");
  const scaled = (base: number) => base + Math.floor((lv - 1) / 4);
  if (name === "furia") {
    const bonus = 2 + Math.min(Math.max(0, cost - 2), Math.floor((lv - 1) / 5));
    mod("attack:melee", lv >= 20 ? bonus * 2 : bonus);
    mod("damage:melee", lv >= 20 ? bonus * 2 : bonus);
  }
  if (name === "forma-selvagem") {
    const { tier, form, movement } = formPlan(c, choices);
    if (form) {
      mod(`form:${form.id}`, tier);
      if (["agil", "sorrateira", "veloz"].includes(form.id))
        mod("attribute:des", 2 * (tier + 1));
      if (form.id === "agil" && tier) {
        mod("speed", 3 * tier);
        mod("size", 3, "set");
      }
      if (form.id === "feroz") {
        mod("attribute:for", [3, 5, 10][tier]);
        mod("defense", 2 * (tier + 1));
        if (tier) mod("size", tier + 2, "set");
      }
      if (form.id === "resistente") {
        mod("defense", [5, 8, 10][tier]);
        mod("rd", [5, 8, 10][tier]);
        if (tier) {
          mod("attribute:for", [0, 3, 5][tier]);
          mod("size", tier + 2, "set");
        }
      }
      if (form.id === "sorrateira") {
        mod("size", tier ? 0 : 1, "set");
        if (tier === 2) mod("flight", 18, "set");
      }
      if (form.id === "veloz")
        mod(
          movement,
          tier === 2
            ? movement === "flight"
              ? 24
              : 18
            : movement === "speed"
              ? [15, 18][tier]
              : [9, 12][tier],
          "set",
        );
      effect.description =
        `Forma ${form.name} · ${["básica", "aprimorada", "superior"][tier]}. ` +
        effect.description;
    }
  }
  if (name === "inspiracao")
    mod("skills", Math.min(scaled(1), 1 + Math.floor((cost - 2) / 2)));
  if (name === "armadura-de-allihanna") mod("defense", 2);
  if (name === "baluarte") {
    const n = Math.min(scaled(1), cost) * 2;
    mod("defense", n);
    for (const s of ["fortitude", "reflexos", "vontade"]) mod(`skill:${s}`, n);
  }
  if (name === "duelo") {
    const n = Math.min(2 + Math.floor((lv - 2) / 5), cost);
    mod("attack", n);
    mod("damage", n);
    for (const m of effect.modifiers) m.condition = "target:" + target;
  }
  if (name === "impeto") mod("speed", 6);
  if (name === "aura-sagrada")
    for (const s of ["fortitude", "reflexos", "vontade"])
      mod(`skill:${s}`, d.attributes.car.total);
  if (name === "egide-sagrada") mod("defense", d.attributes.car.total);
  if (name === "vingador-sagrado") {
    mod("rd", 20);
    mod("flight", 18);
  }
  if (name === "bencao") {
    mod("attack", 1);
    mod("damage", 1);
  }
  if (name === "perdicao") mod("attack", -1);
  if (name === "oracao") {
    const bonus =
      2 +
      (e.enhancements ?? [])
        .filter((h) => /aumenta os bônus/.test(h.text))
        .reduce((n, h) => n + (counts[h.id] ?? 0), 0);
    mod("skills", bonus);
    mod("damage", bonus);
    for (const m of effect.modifiers) m.stack = true;
    effect.maintenance = 1;
  }
  if (name === "armadura-arcana") {
    const reaction = enhancementText.includes("reação");
    mod(reaction ? "defense" : "arcaneArmor", 5);
    effect.modifiers.forEach((m) => (m.stack = true));
    if (reaction) {
      effect.name += " (reação)";
      effect.duration = durationFor("descarregada", c.combat.initiative);
    }
  }
  if (name === "escudo-da-fe") mod("defense", 2);
  if (name === "imagem-espelhada") mod("defense", 6);
  if (name === "pele-de-pedra") mod("rd", 5);
  if (name === "protecao-divina") {
    const reaction = enhancementText.includes("reação");
    for (const s of ["fortitude", "reflexos", "vontade"])
      mod(`skill:${s}`, reaction ? 5 : 2);
    if (reaction) {
      effect.name += " (reação)";
      effect.modifiers.forEach((m) => (m.stack = true));
    }
    if (enhancementText.includes("imune a efeitos")) {
      mod("immunity:medo", 1);
      mod("immunity:mental", 1);
    }
  }
  if (name === "heroismo") {
    mod("attack", enhancementText.includes("+6") ? 6 : 4);
    mod("damage", enhancementText.includes("+6") ? 6 : 4);
    for (const m of effect.modifiers) m.condition = "target:" + target;
    mod("immunity:medo", 1);
  }
  if (name === "primor-atletico") {
    mod("skill:atletismo", 10);
    mod("speed", 9);
    if (enhancementText.includes("+20")) {
      mod("skill:atletismo", 20);
      effect.modifiers.at(-1)!.condition = "jumping";
      effect.modifiers.at(-1)!.stack = true;
    }
  }
  if (name === "aparencia-perfeita") mod("attribute:car", 5, "set");
  if (name === "mente-divina" || name === "fisico-divino") {
    const attrs =
      name === "mente-divina" ? ["int", "sab", "car"] : ["for", "des", "con"];
    for (const attr of enhancementText.includes("três atributos")
      ? attrs
      : [choices.attribute || attrs[0]])
      if (attrs.includes(attr))
        mod(`attribute:${attr}`, enhancementText.includes("+4") ? 4 : 2);
  }
  for (const enh of e.enhancements ?? []) {
    const repeat = counts[enh.id] ?? 0;
    if (!repeat) continue;
    const duration = enh.text
      .replace(/\s+/g, " ")
      .match(/(?:muda|aumenta|e) a duração para ([^,.]+)/i);
    if (duration) {
      effect.duration = durationFor(duration[1], c.combat.initiative);
      effect.maintenance = effect.duration.unit === "sustained" ? 1 : 0;
    }
    const bonus = enh.text.match(
      /^aumenta o bônus (?:na Defesa|em testes de resistência|concedido) em \+(\d+)/i,
    );
    if (bonus)
      for (const m of effect.modifiers.filter(
        (m) =>
          m.target === "defense" ||
          m.target === "arcaneArmor" ||
          m.target.startsWith("skill:"),
      ))
        m.value += Number(bonus[1]) * repeat;
  }
  return effect;
}
export function castingCost(
  c: Character,
  e: CatalogEntry,
  sourceClass: string,
  counts: Record<string, number>,
  device = false,
  context: CastingContext = {},
): { cost: number; gross: number; errors: string[]; action: ActionType } {
  const errors: string[] = [];
  const selected = (e.enhancements ?? []).filter((x) => counts[x.id] > 0);
  let gross = e.cost ?? 0;
  const max = classLevel(c, sourceClass) || c.levels.length;
  const circle = device
    ? classLevel(c, "inventor") < 6
      ? 1
      : Math.min(5, 2 + Math.floor((classLevel(c, "inventor") - 6) / 4))
    : sourceClass
      ? maxCircleFor(c, sourceClass)
      : 0;
  for (const [id, n] of Object.entries(counts))
    if (
      !e.enhancements?.some((h) => h.id === id) ||
      !Number.isInteger(n) ||
      n < 0
    )
      errors.push("Aprimoramento ou quantidade inválida.");
  for (const h of selected) {
    const qty = counts[h.id];
    if (!Number.isInteger(qty) || qty < 0 || (!h.repeatable && qty > 1))
      errors.push("Este aprimoramento não pode ser repetido.");
    if (h.requiresCircle > circle)
      errors.push(
        `Aprimoramento requer ${h.requiresCircle}º círculo na classe de origem.`,
      );
    gross += h.cost * qty;
  }
  if (selected.some((h) => h.trick)) {
    if (selected.length > 1)
      errors.push("Truque não pode ser combinado com outros aprimoramentos.");
    gross = 0;
  }
  const changed = new Set<string>();
  for (const h of selected)
    for (const m of h.text
      .replace(/\s+/g, " ")
      .matchAll(
        /(?:muda|e) (?:o|a) (alcance|alvo|área|duração|resistência|execução|efeito) para/g,
      )) {
      if (changed.has(m[1]))
        errors.push(`Dois aprimoramentos alteram ${m[1]}.`);
      changed.add(m[1]);
    }
  if (
    ["mente-divina", "fisico-divino"].includes(slug(e.name)) &&
    selected.filter((h) => h.text.startsWith("em vez do normal")).length > 1
  )
    errors.push("Escolha apenas uma versão do fortalecimento de atributos.");
  if (slug(e.name) === "oracao")
    for (const h of selected.filter((h) =>
      /^aumenta (?:os bônus|as penalidades)/.test(h.text),
    ))
      if (2 + counts[h.id] > circle)
        errors.push(
          "O bônus ou penalidade de Oração está limitado ao círculo máximo da origem.",
        );
  gross += (context.discreet ? 2 : 0) + (context.accelerated ? 4 : 0);
  const limit =
    max +
    (has(c, "Magia Ilimitada")
      ? calculate(c).attributes[magicAttribute(c, sourceClass)].total
      : 0);
  if (
    device
      ? gross - (e.cost ?? 0) > calculate(c).attributes.int.total
      : gross > Math.max(e.cost ?? 0, limit)
  )
    errors.push(
      `Limite de ${limit} PM por lançamento (custo mínimo preservado).`,
    );
  let reduction = 0;
  const racialKnown =
    racialMagic(c).fixed.includes(e.name) ||
    c.acquisitions.some((a) => a.source === "Raça" && a.entryId === e.id);
  if (
    racialKnown &&
    c.acquisitions.some((a) => a.source !== "Raça" && a.entryId === e.id)
  )
    reduction = 1;
  for (const ac of c.acquisitions) {
    if (
      ac.choices.spell === e.id &&
      ENTRY_MAP.get(ac.entryId)?.name === "Foco em Magia"
    )
      reduction = Math.max(reduction, 1);
  }
  if (
    c.effects.some(
      (x) => x.active && slug(x.name) === "simbolo-sagrado-energizado",
    ) &&
    e.magicType === "Divina"
  )
    reduction = Math.max(reduction, 1);
  if (c.raceId === "qareen" && context.wish) reduction = Math.max(reduction, 1);
  if (sourceClass === "druida" && has(c, "Força da Natureza"))
    reduction = Math.max(reduction, context.naturalTerrain ? 4 : 2);
  let cost = device
    ? Math.max(0, gross - (e.cost ?? 0))
    : gross === 0
      ? 0
      : Math.max(1, gross - reduction);
  if (
    sourceClass === "bardo" &&
    cost > 0 &&
    has(c, "Artista Completo") &&
    c.effects.some((x) => x.active && slug(x.name) === "inspiracao")
  )
    cost = Math.max(1, Math.floor(cost / 2));
  if (calculate(c).conditions.includes("alquebrado")) cost += 1;
  const action = context.accelerated
    ? "livre"
    : execution(
        selected
          .map((h) => h.text.replace(/\s+/g, " "))
          .find((t) => t.includes("execução"))
          ?.match(/execução para ([^,.]+)/)?.[1] ?? e.execution,
      );
  return { cost, gross, errors: [...new Set(errors)], action };
}
function maxCircleFor(c: Character, id: string) {
  const n = classLevel(c, id);
  if (!n) return 0;
  return ["arcanista", "clerigo"].includes(id)
    ? Math.min(5, Math.floor((n - 1) / 4) + 1)
    : ["bardo", "druida"].includes(id)
      ? n < 6
        ? 1
        : n < 10
          ? 2
          : n < 14
            ? 3
            : 4
      : 0;
}
