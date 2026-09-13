import {
  ATTRIBUTES,
  CLASS_MAP,
  RACE_MAP,
  SKILLS,
  TRAINING_BONUS,
  classLevel,
  magicAttribute,
  sign,
  slug,
} from "../data/rules";
import { characterEntries, has } from "./character";
import { stepDamage } from "./dice";
import { WILD_FORMS } from "./forms";
import { partnerModifiers, partners, partnerLimit, familiar } from "./partners";
import type {
  Attribute,
  Character,
  Component,
  DerivedCharacter,
  DerivedValue,
  Modifier,
  RulesContext,
  Attack,
  Item,
} from "./types";

export function value(base: Component[], mods: Modifier[] = []): DerivedValue {
  const groups = new Map<string, Modifier[]>();
  for (const m of mods) {
    const key =
      m.stack || m.source === "ajuste"
        ? m.id
        : ["habilidade", "pericia"].includes(m.source)
          ? `${m.source}:${m.sourceId}`
          : m.source;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const components = [...base];
  let multiplier = 1;
  let replacement: number | undefined;
  for (const group of groups.values()) {
    const additive = group.filter((m) => !m.operation || m.operation === "add");
    const highest = Math.max(0, ...additive.map((m) => m.value));
    const lowest = Math.min(0, ...additive.map((m) => m.value));
    let pos = false,
      neg = false;
    for (const m of group) {
      let applied = true;
      if (m.operation === "multiply") multiplier += m.value - 1;
      else if (m.operation === "set") replacement = m.value;
      else {
        applied =
          m.value > 0
            ? m.value === highest && !pos
            : m.value < 0
              ? m.value === lowest && !neg
              : true;
        if (applied) {
          if (m.value > 0) pos = true;
          else if (m.value < 0) neg = true;
        }
      }
      components.push({
        label: m.label,
        value: m.value,
        applied,
        reason: applied
          ? m.operation === "multiply"
            ? "Multiplicador"
            : m.operation === "set"
              ? "Substituição"
              : undefined
          : "Não acumula com o efeito mais forte da mesma fonte.",
        page: m.page,
      });
    }
  }
  const total =
    (replacement ??
      base.filter((c) => c.applied).reduce((s, c) => s + c.value, 0)) *
      multiplier +
    components
      .slice(base.length)
      .filter(
        (c) =>
          c.applied &&
          c.reason !== "Multiplicador" &&
          c.reason !== "Substituição",
      )
      .reduce((s, c) => s + c.value, 0);
  return { total, components };
}
const component = (label: string, n: number, page?: number): Component => ({
  label,
  value: n,
  applied: true,
  page,
});
export function conditionNames(c: Character): string[] {
  const raw = c.effects
    .filter((e) => e.active && e.condition)
    .map((e) => e.condition!);
  const result = new Set(raw);
  for (const chain of [
    ["abalado", "apavorado"],
    ["fraco", "debilitado", "inconsciente"],
    ["frustrado", "esmorecido"],
    ["fatigado", "exausto", "inconsciente"],
  ]) {
    let carries = 0;
    for (let i = 0; i < chain.length; i++) {
      const count = raw.filter((x) => x === chain[i]).length + carries;
      if (count) {
        result.add(chain[i]);
        if (count >= 2 && i < chain.length - 1) {
          result.delete(chain[i]);
          carries = Math.floor(count / 2);
        } else carries = 0;
      }
    }
  }
  const implies: Record<string, string[]> = {
    agarrado: ["desprevenido", "imovel"],
    atordoado: ["desprevenido"],
    cego: ["desprevenido", "lento"],
    enredado: ["lento", "vulneravel"],
    exausto: ["debilitado", "lento", "vulneravel"],
    fatigado: ["fraco", "vulneravel"],
    inconsciente: ["indefeso"],
    indefeso: ["desprevenido"],
    paralisado: ["imovel", "indefeso"],
    petrificado: ["inconsciente"],
    surpreendido: ["desprevenido"],
  };
  for (let i = 0; i < 5; i++)
    for (const cond of [...result])
      for (const child of implies[cond] ?? []) result.add(child);
  return [...result];
}
export function calculate(
  c: Character,
  context: RulesContext = {},
): DerivedCharacter {
  const level = c.levels.length,
    race = RACE_MAP.get(c.raceId) ?? RACE_MAP.get("humano")!;
  const owned = characterEntries(c);
  const owns = (name: string) => owned.some((e) => slug(e.name) === slug(name));
  const attr = {} as Record<Attribute, DerivedValue>;
  const resourceAttrs = {} as Record<Attribute, number>;
  const active = c.effects.filter((e) => e.active);
  const noResourceModifiers = new Set(
    active
      .filter((e) =>
        [
          "spell-mente-divina",
          "spell-fisico-divino",
          "spell-aparencia-perfeita",
        ].includes(e.entryId ?? ""),
      )
      .flatMap((e) => e.modifiers.map((m) => m.id)),
  );
  const allMods = [
    ...c.modifiers,
    ...partnerModifiers(c),
    ...active.flatMap((e) => e.modifiers),
  ].filter(
    (m) =>
      !m.condition ||
      (m.condition.startsWith("target:") &&
        !!context.target &&
        m.condition === "target:" + context.target) ||
      (m.condition === "underwater" && context.underwater) ||
      (m.condition === "mounted" && context.mounted) ||
      (m.condition === "jumping" && context.jumping) ||
      (m.condition === "naturalTerrain" && context.naturalTerrain),
  );
  const powers = c.acquisitions.map((a) => ({
    a,
    e: owned.find((e) => e.id === a.entryId),
  }));
  let raceAttrs = race.attributes;
  if (c.raceId === "suraggel" && c.choices.suraggel === "Sulfure")
    raceAttrs = { des: 2, int: 1 };
  const ageFactor = ["anao", "qareen"].includes(c.raceId)
    ? 2
    : ["dahllan", "elfo", "golem", "osteon", "silfide"].includes(c.raceId)
      ? 5
      : 1;
  for (const a of ATTRIBUTES) {
    const base = [component("Valor inicial", c.attributes[a.id], 17)];
    if (raceAttrs[a.id])
      base.push(component(race.name, raceAttrs[a.id]!, race.page));
    if (race.choose && c.racialChoices.includes(a.id))
      base.push(component(`${race.name}: escolha`, 1, race.page));
    const increases = powers.filter(
      ({ a: ac, e }) =>
        e?.name === "Aumento de Atributo" && ac.choices.attribute === a.id,
    ).length;
    if (increases) base.push(component("Aumentos por poderes", increases, 38));
    const aged =
      c.age >= 70 * ageFactor
        ? ["for", "des", "con"].includes(a.id)
          ? -3
          : 2
        : c.age >= 45 * ageFactor
          ? ["for", "des", "con"].includes(a.id)
            ? -1
            : 1
          : 0;
    if (aged) base.push(component("Envelhecimento", aged, 108));
    if (a.id === "car") {
      const tormenta = powers.filter(
        ({ e, a }) => e?.group === "Tormenta" && a.source !== "Raça",
      ).length;
      const loss = tormenta ? Math.floor((tormenta + 1) / 2) : 0;
      if (loss) base.push(component("Poderes da Tormenta", -loss, 136));
    }
    attr[a.id] = value(
      base,
      allMods.filter((m) => m.target === `attribute:${a.id}`),
    );
    resourceAttrs[a.id] = value(
      base,
      allMods.filter(
        (m) =>
          m.target === `attribute:${a.id}` && !noResourceModifiers.has(m.id),
      ),
    ).total;
  }
  const a = Object.fromEntries(
    ATTRIBUTES.map((x) => [x.id, attr[x.id].total]),
  ) as Record<Attribute, number>;
  const mods: Modifier[] = [...allMods];
  let serial = 0;
  const add = (
    label: string,
    target: string,
    n: number,
    page: number,
    source: Modifier["source"] = "habilidade",
    sourceId = slug(label),
    stack = false,
  ) =>
    mods.push({
      id: `derived-${serial++}`,
      label,
      target,
      value: n,
      page,
      source,
      sourceId,
      stack,
    });
  const shape = allMods.find((m) => m.target.startsWith("form:"));
  const equipped = c.inventory.filter(
    (i) =>
      i.quantity > 0 &&
      i.benefit &&
      (i.state === "worn" || (!shape && i.state === "wielded")),
  );
  const wornArmor = equipped.find(
    (i) => i.state === "worn" && i.category.startsWith("Armadura"),
  );
  const wornLimit = 4 + (owns("Costas Largas") ? 1 : 0);
  let worn = 0;
  const valid = equipped.filter(
    (i) =>
      i.state !== "worn" ||
      (c.raceId === "golem" && i === wornArmor) ||
      ++worn <= wornLimit,
  );
  const armor = valid.find((i) => i === wornArmor),
    shield = valid.find(
      (i) => i.category === "Escudo" && i.state === "wielded",
    );
  const heavy = wornArmor?.heavy ?? false;
  for (const item of valid) {
    mods.push(...item.modifiers.map((m) => ({ ...m, sourceId: item.id })));
    if (
      item.improvements.includes("Certeira") ||
      item.improvements.includes("Pungente")
    )
      add(
        item.name,
        `attack:${item.id}`,
        item.improvements.includes("Pungente") ? 2 : 1,
        164,
        "item",
        item.id,
      );
    if (
      item.improvements.includes("Cruel") ||
      item.improvements.includes("Atroz")
    )
      add(
        item.name,
        `damage:${item.id}`,
        item.improvements.includes("Atroz") ? 2 : 1,
        164,
        "item",
        item.id,
      );
    if (item.improvements.includes("Banhado a Ouro"))
      add(item.name, "skill:diplomacia", 2, 164, "item", item.id);
    if (item.improvements.includes("Cravejado de Gemas"))
      add(item.name, "skill:enganacao", 2, 164, "item", item.id);
    if (item.templateId === "armadura-acolchoada")
      add(item.name, "skill:fortitude", 2, 154, "item", item.id);
    if (item.templateId === "simbolo-sagrado" && c.deityId)
      for (const s of ["fortitude", "reflexos", "vontade"])
        add(item.name, `skill:${s}`, 1, 157, "item", item.id);
  }
  const proficiencies = [
    ...(CLASS_MAP.get(c.levels[0].classId)?.proficiencyIds ?? []),
  ];
  if (c.raceId === "kliren") proficiencies.push("fogo");
  for (const { a: ac, e } of powers)
    if (e?.name === "Proficiência" && ac.choices.proficiency)
      proficiencies.push(ac.choices.proficiency);
  const hpBase = c.levels.map((l, i) => {
    const cls = CLASS_MAP.get(l.classId)!;
    return component(
      `${cls.name} · nível ${i + 1}`,
      i === 0
        ? cls.initialHp + resourceAttrs.con
        : Math.max(1, cls.hpPerLevel + resourceAttrs.con),
      cls.page + 1,
    );
  });
  const mpBase = c.levels.map((l, i) => {
    const cls = CLASS_MAP.get(l.classId)!;
    return component(
      `${cls.name} · nível ${i + 1}`,
      cls.mpPerLevel,
      cls.page + 1,
    );
  });
  const castingAttrs = new Set<Attribute>();
  for (const classId of new Set(c.levels.map((l) => l.classId)))
    if (
      ["arcanista", "bardo", "clerigo", "druida", "paladino"].includes(classId)
    )
      castingAttrs.add(
        classId === "paladino" ? "car" : magicAttribute(c, classId),
      );
  if (owns("Totem Espiritual") || owns("Elo com a Natureza"))
    castingAttrs.add("sab");
  for (const id of castingAttrs)
    mpBase.push(
      component(`Atributo: ${id.toUpperCase()}`, resourceAttrs[id], 106),
    );
  if (c.raceId === "anao")
    hpBase.push(component("Duro como Pedra", level + 2, 20));
  if (c.raceId === "elfo") mpBase.push(component("Sangue Mágico", level, 22));
  if (owns("Vitalidade")) hpBase.push(component("Vitalidade", level, 129));
  if (owns("Sarado")) {
    hpBase.push(component("Sarado", a.for, 77));
    add("Sarado", "skill:fortitude", a.for, 77);
  }
  if (familiar(c) === "Sapo")
    hpBase.push(
      component(
        "Familiar: Sapo",
        resourceAttrs[magicAttribute(c, "arcanista")],
        38,
      ),
    );
  if (owns("Poder Mágico"))
    mpBase.push(component("Poder Mágico", classLevel(c, "arcanista"), 38));
  if (owns("Vontade de Ferro")) {
    mpBase.push(component("Vontade de Ferro", level, 131));
    add("Vontade de Ferro", "skill:vontade", 2, 131);
  }
  const virtues = powers.filter(({ e }) =>
    e?.name.startsWith("Virtude Paladinesca:"),
  ).length;
  if (virtues)
    mpBase.push(
      component("Virtudes Paladinescas", (virtues * (virtues + 1)) / 2, 84),
    );
  if (c.sacrifice) mpBase.push(component("PM sacrificados", -c.sacrifice, 224));
  const hp = value(
      hpBase,
      mods.filter((m) => m.target === "hp"),
    ),
    mp = value(
      mpBase,
      mods.filter((m) => m.target === "mp"),
    );
  const loadItems = c.inventory.filter((i) => i.state !== "stored");
  const coinSpaces = Math.floor((c.coins.tc + c.coins.ts + c.coins.to) / 1000);
  const load = value([
    ...loadItems.map((i) =>
      component(`${i.name} × ${i.quantity}`, i.quantity * i.spaces, 141),
    ),
    component("Moedas", coinSpaces, 141),
  ]);
  const capAttr = owns("Inventário Organizado")
    ? Math.max(a.for, a.int)
    : a.for;
  const capacity = value(
    [
      component("Base", 10, 141),
      component(
        owns("Inventário Organizado") ? "Força / Inteligência" : "Força",
        capAttr >= 0 ? capAttr * 2 : capAttr,
        141,
      ),
      ...(owns("Costas Largas") ? [component("Costas Largas", 5, 130)] : []),
      ...(valid.some((i) => i.templateId === "mochila-de-aventureiro")
        ? [component("Mochila de aventureiro", 2, 155)]
        : []),
    ],
    mods.filter((m) => m.target === "capacity"),
  );
  const conds = new Set(conditionNames(c));
  if (load.total > capacity.total) conds.add("sobrecarregado");
  const effectiveHP = c.hp - c.nonlethal;
  if (
    effectiveHP <= 0 &&
    !(
      (owns("Espírito Inquebrável") &&
        active.some((e) => slug(e.name) === "furia")) ||
      active.some((e) => slug(e.name) === "bravura-final")
    )
  ) {
    conds.add("inconsciente");
    conds.add("indefeso");
    conds.add("desprevenido");
  }
  if (conds.has("debilitado")) conds.delete("fraco");
  if (conds.has("esmorecido")) conds.delete("frustrado");
  if (conds.has("apavorado")) conds.delete("abalado");
  for (const cond of conds) {
    const affect = (target: string, n: number, stack = false) =>
      add(cond, target, n, 394, "condicao", cond, stack);
    if (["abalado", "apavorado"].includes(cond))
      affect("skills", cond === "abalado" ? -2 : -5);
    if (["fraco", "debilitado"].includes(cond))
      affect("physical", cond === "fraco" ? -2 : -5);
    if (["frustrado", "esmorecido"].includes(cond))
      affect("mental", cond === "frustrado" ? -2 : -5);
    if (cond === "desprevenido") {
      affect("defense", -5);
      affect("skill:reflexos", -5);
    }
    if (cond === "indefeso") affect("defense", -10);
    if (cond === "vulneravel") affect("defense", -2);
    if (cond === "caido") {
      affect("defense", context.melee === false ? 5 : -5, true);
      if (context.melee !== false) affect("attack", -5);
    }
    if (["agarrado", "enredado", "ofuscado"].includes(cond))
      affect("attack", -2);
    if (cond === "ofuscado") affect("skill:percepcao", -2);
    if (cond === "cego") affect("strengthDex", -5);
    if (cond === "fascinado") affect("skill:percepcao", -5);
    if (cond === "surdo") affect("skill:iniciativa", -5);
  }
  if (c.raceId === "elfo")
    for (const s of ["misticismo", "percepcao"])
      add("Sentidos Élficos", `skill:${s}`, 2, 22);
  if (c.raceId === "goblin") add("Rato das Ruas", "skill:fortitude", 2, 23);
  if (c.raceId === "hynne")
    add("Pequeno e Rechonchudo", "skill:enganacao", 2, 28);
  if (c.raceId === "suraggel")
    for (const s of c.choices.suraggel === "Sulfure"
      ? ["enganacao", "furtividade"]
      : ["diplomacia", "intuicao"])
      add("Herança Divina", `skill:${s}`, 2, 31);
  if (c.raceId === "anao" && context.subterranean)
    for (const s of ["percepcao", "sobrevivencia"])
      add("Conhecimento das Rochas", `skill:${s}`, 2, 20);
  if (owns("Rastreador")) add("Rastreador", "skill:sobrevivencia", 2, 50);
  const simple: Record<string, [string[], number, number]> = {
    Esquiva: [["defense", "skill:reflexos"], 2, 125],
    Vitalidade: [["skill:fortitude"], 2, 129],
    Acrobático: [["skill:acrobacia"], 2, 129],
    Atlético: [["skill:atletismo", "speed"], 2, 130],
    Investigador: [["skill:investigacao", "skill:percepcao"], 2, 130],
    "Sentidos Aguçados": [["skill:percepcao"], 2, 130],
    Gatuno: [["skill:atletismo"], 2, 74],
    Sombra: [["skill:furtividade"], 2, 74],
    "Voz Poderosa": [["skill:diplomacia", "skill:intimidacao"], 2, 80],
    "Força dos Penhascos": [["skill:fortitude"], 2, 62],
    "Liberdade da Pradaria": [["skill:reflexos"], 2, 62],
    "Tranquilidade dos Lagos": [["skill:vontade"], 2, 63],
  };
  for (const [name, [targets, amount, page]] of Object.entries(simple))
    if (owns(name))
      for (const target of targets)
        add(
          name,
          target,
          name === "Atlético" && target === "speed" ? 3 : amount,
          page,
        );
  if (owns("Mente Criminosa"))
    for (const target of ["furtividade", "ladinagem"])
      add("Mente Criminosa", `skill:${target}`, a.int, 74);
  if (owns("Instinto Selvagem")) {
    const n = 1 + Math.floor((classLevel(c, "barbaro") - 3) / 6);
    for (const target of ["skill:percepcao", "skill:reflexos", "damage"])
      add("Instinto Selvagem", target, n, 42);
  }
  if (owns("Esquiva Sagaz") && !heavy && !conds.has("imovel")) {
    const n = classLevel(c, "bucaneiro");
    for (const target of ["defense", "skill:reflexos"])
      add("Esquiva Sagaz", target, Math.floor((n + 1) / 4), 48);
  }
  if (owns("Pele de Ferro") && !heavy)
    add("Pele de Ferro", "defense", owns("Pele de Aço") ? 8 : 4, 42);
  if (owns("Encouraçado") && heavy) add("Encouraçado", "defense", 2, 125);
  if (owns("Inexpugnável") && heavy)
    for (const target of ["fortitude", "reflexos", "vontade"])
      add("Inexpugnável", `skill:${target}`, 2, 128);

  if (c.raceId === "minotauro" || c.raceId === "trog")
    add("Couro / escamas", "defense", 1, race.page);
  if (c.raceId === "golem") add("Chassi", "defense", 2, 27);
  if (c.raceId === "trog" && !armor)
    add("Reptiliano", "skill:furtividade", 5, 31);
  if (owns("Solidez") && shield)
    for (const s of ["fortitude", "reflexos", "vontade"])
      add("Solidez", `skill:${s}`, shield.defense, 66);
  const penalty =
    (armor?.penalty ?? 0) +
    (shield?.penalty ?? 0) +
    (c.raceId === "golem" ? -2 : 0) +
    (conds.has("sobrecarregado") ? -5 : 0) +
    valid.reduce(
      (sum, i) => sum + (i.improvements.includes("Ajustada") ? 1 : 0),
      0,
    );
  let size = race.size;
  const sizeMod = mods.find((m) => m.target === "size");
  if (sizeMod)
    size =
      ["Minúsculo", "Pequeno", "Médio", "Grande", "Enorme", "Colossal"][
        sizeMod.value
      ] ?? size;
  const sizeStealth: Record<string, number> = {
    Minúsculo: 5,
    Pequeno: 2,
    Médio: 0,
    Grande: -2,
    Enorme: -5,
    Colossal: -10,
  };
  if (sizeStealth[size])
    add("Tamanho", "skill:furtividade", sizeStealth[size], 107);
  const skillDefs = [
    ...SKILLS.filter((s) => s.id !== "oficio"),
    ...c.crafts.map((name) => ({
      id: `oficio-${slug(name)}`,
      name: `Ofício (${name})`,
      attribute: "int" as Attribute,
      armor: false,
      trained: true,
    })),
  ];
  if (owns("Atraente") && context.attracted)
    for (const s of skillDefs.filter((s) => s.attribute === "car"))
      add("Atraente", `skill:${s.id}`, 2, 130);
  const skills: Record<string, DerivedValue> = {};
  if (familiar(c) === "Gato") add("Familiar: Gato", "skill:furtividade", 2, 38);
  for (const s of skillDefs) {
    let key = s.attribute;
    if (s.id === "fortitude" && familiar(c) === "Rato")
      key = magicAttribute(c, "arcanista");
    if (s.id === "atletismo" && c.raceId === "hynne" && a.des > a.for)
      key = "des";
    const trained = c.trained.some((t) => t.id === s.id);
    const smods = mods.filter(
      (m) =>
        m.target === `skill:${s.id}` ||
        m.target === "skills" ||
        (m.target === "physical" &&
          ["for", "des", "con"].includes(s.attribute)) ||
        (m.target === "mental" &&
          ["int", "sab", "car"].includes(s.attribute)) ||
        (m.target === "strengthDex" && ["for", "des"].includes(s.attribute)),
    );
    const nonProf =
      ((armor && !proficiencies.includes(armor.proficiency)) ||
        (shield && !proficiencies.includes("escudos"))) &&
      ["for", "des"].includes(s.attribute);
    if (s.armor || nonProf || (s.id === "atletismo" && context.underwater))
      smods.push({
        id: `armor-${s.id}`,
        source: "item",
        sourceId: "armor-penalty",
        target: `skill:${s.id}`,
        label: "Penalidade de armadura",
        value: Math.min(0, penalty),
        page: 153,
        stack: true,
      });
    skills[s.id] = value(
      [
        component(key.toUpperCase(), a[key], 17),
        component("½ nível", Math.floor(level / 2), 114),
        component("Treinamento", trained ? TRAINING_BONUS(level) : 0, 114),
      ],
      smods,
    );
  }
  const defenseAttrs = new Map<Attribute, number>();
  if (!heavy) {
    let key: Attribute = owns("Autoconfiança") && a.car > a.des ? "car" : "des";
    if (c.choices.defenseAttribute === "des") key = "des";
    defenseAttrs.set(key, a[key]);
  }
  if (heavy && armor?.improvements.includes("Delicada"))
    defenseAttrs.set("des", Math.min(1, a.des));
  if (owns("Armadura Brilhante") && heavy) defenseAttrs.set("car", a.car);
  if (owns("Insolência") && !heavy && !conds.has("imovel"))
    defenseAttrs.set(
      "car",
      Math.max(
        defenseAttrs.get("car") ?? -Infinity,
        Math.min(a.car, classLevel(c, "bucaneiro")),
      ),
    );
  if (owns("Casca Grossa") && !heavy) {
    defenseAttrs.set("con", Math.min(a.con, classLevel(c, "lutador")));
    add(
      "Casca Grossa",
      "defense",
      Math.max(0, Math.floor((classLevel(c, "lutador") - 3) / 4)),
      77,
    );
  }
  if (owns("Braços Calejados") && !armor)
    defenseAttrs.set("for", Math.min(a.for, classLevel(c, "lutador")));
  if (owns("Estilo de Arma e Escudo") && shield)
    add("Estilo de Arma e Escudo", "defense", 2, 125);
  const armorBonus = armor
    ? armor.defense + (armor.improvements.includes("Reforçada") ? 1 : 0)
    : 0;
  const arcaneArmor = Math.max(
    0,
    ...mods.filter((m) => m.target === "arcaneArmor").map((m) => m.value),
  );
  const defense = value(
    [
      component("Base", 10, 106),
      ...[...defenseAttrs].map(([key, n]) =>
        component(key.toUpperCase(), n, 106),
      ),
      ...(armor ? [component(armor.name, armorBonus, 153)] : []),
      ...(arcaneArmor > 0
        ? [
            {
              ...component(
                "Armadura Arcana (substitui armadura)",
                Math.max(0, arcaneArmor - armorBonus),
                181,
              ),
              applied: arcaneArmor > armorBonus,
              reason:
                arcaneArmor > armorBonus
                  ? "Diferença para o bônus de armadura; acumula com outras magias."
                  : "A armadura fornece um bônus igual ou maior.",
            },
          ]
        : []),
      ...(shield ? [component(shield.name, shield.defense, 153)] : []),
    ],
    mods.filter((m) => m.target === "defense"),
  );
  const speedBase = [component("Deslocamento racial", race.speed, race.page)];
  if (!["anao", "golem"].includes(c.raceId)) {
    if (heavy && !owns("Fanático"))
      speedBase.push(component("Armadura pesada", -3, 152));
    if (conds.has("sobrecarregado"))
      speedBase.push(component("Carga", -3, 141));
  }
  let speed = value(
    speedBase,
    mods.filter((m) => m.target === "speed"),
  );
  if (conds.has("lento")) {
    speed = {
      total: Math.floor(speed.total / 2 / 1.5) * 1.5,
      components: [
        ...speed.components,
        component(
          "Lento (metade, incrementos de 1,5m)",
          Math.floor(speed.total / 2 / 1.5) * 1.5 - speed.total,
          395,
        ),
      ],
    };
  }
  if (conds.has("caido"))
    speed = {
      total: 1.5,
      components: [
        ...speed.components,
        component("Caído", 1.5 - speed.total, 394),
      ],
    };
  if (conds.has("imovel"))
    speed = {
      total: 0,
      components: [...speed.components, component("Imóvel", -speed.total, 395)],
    };
  const rdMods = mods.filter((m) => m.target === "rd");
  if (owns("Redução de Dano"))
    rdMods.push({
      id: "barbarian-rd",
      label: "Redução de Dano (bárbaro)",
      source: "habilidade",
      sourceId: "barbaro-rd",
      target: "rd",
      value: Math.min(
        10,
        2 + 2 * Math.floor((classLevel(c, "barbaro") - 5) / 3),
      ),
      page: 42,
    });
  if (owns("Especialização em Armadura") && heavy)
    rdMods.push({
      id: "armor-rd",
      label: "Especialização em Armadura",
      source: "habilidade",
      sourceId: "especializacao-armadura",
      target: "rd",
      value: 5,
      page: 66,
    });
  if (conds.has("petrificado"))
    rdMods.push({
      id: "stone-rd",
      label: "Petrificado",
      source: "condicao",
      sourceId: "petrificado",
      target: "rd",
      value: 8,
      page: 395,
    });
  const rd = value([], rdMods);
  const attacks: Attack[] = [...c.attacks];
  for (const item of c.inventory.filter(
    (i) =>
      i.quantity > 0 &&
      i.damage &&
      (i.state === "wielded" ||
        (c.choices.showCarriedAttacks === "sim" && i.state === "carried")),
  ))
    if (!attacks.some((x) => x.itemId === item.id))
      attacks.push({
        id: item.id,
        itemId: item.id,
        name: item.name,
        skill: item.attackType === "melee" ? "luta" : "pontaria",
        damage: item.damage,
        damageType: item.damageType,
        threat: item.threat,
        critical: item.critical,
        range: item.range,
        attribute: item.attackType === "ranged" ? null : "for",
        attackBonus: 0,
        damageBonus: 0,
        natural: false,
        favorite: true,
      });
  if (!attacks.some((x) => x.id === "unarmed")) {
    const n = classLevel(c, "lutador");
    const damage =
      n >= 20
        ? "2d10"
        : n >= 17
          ? "2d8"
          : n >= 13
            ? "2d6"
            : n >= 9
              ? "1d10"
              : n >= 5
                ? "1d8"
                : n >= 1 || owns("Estilo Desarmado")
                  ? "1d6"
                  : "1d3";
    attacks.push({
      id: "unarmed",
      name: "Ataque desarmado",
      skill: "luta",
      damage,
      damageType: "impacto",
      threat: 20,
      critical: 2,
      range: "Corpo a corpo",
      attribute: "for",
      attackBonus: 0,
      damageBonus: 0,
      natural: true,
      favorite: false,
    });
  }
  if (
    ["minotauro", "trog"].includes(c.raceId) &&
    !attacks.some((x) => x.id === "racial")
  )
    attacks.push({
      id: "racial",
      name: c.raceId === "minotauro" ? "Chifres" : "Mordida",
      skill: "luta",
      damage: "1d6",
      damageType: "perfuração",
      threat: 20,
      critical: 2,
      range: "Corpo a corpo",
      attribute: "for",
      attackBonus: 0,
      damageBonus: 0,
      natural: true,
      favorite: true,
    });
  if (shape) {
    const form = WILD_FORMS.find((f) => `form:${f.id}` === shape.target);
    if (form)
      attacks.splice(0, attacks.length, {
        id: "wild-form",
        name: `Arma natural · forma ${form.name}`,
        skill: "luta",
        damage: form.damage[shape.value],
        damageType: "corte",
        threat: form.threat,
        critical: 2,
        range: "Corpo a corpo",
        attribute: "for",
        attackBonus: 0,
        damageBonus: 0,
        natural: true,
        favorite: true,
      });
  }
  const calculatedAttacks = attacks.map((attack) => {
    const weapon = c.inventory.find((i) => i.id === attack.itemId);
    const hitMods = mods.filter((m) =>
      [
        "attack",
        `attack:${attack.itemId}`,
        `attack:${attack.skill === "luta" ? "melee" : "ranged"}`,
      ].includes(m.target),
    );
    const prof = weapon?.proficiency;
    const racialWeapon =
      (c.raceId === "anao" &&
        /machad|martelo|marreta|picareta/i.test(weapon?.name ?? "")) ||
      (c.raceId === "sereia-tritao" && weapon?.name === "Tridente");
    if (prof && !proficiencies.includes(prof) && !racialWeapon)
      hitMods.push({
        id: "nonprof",
        label: "Arma sem proficiência",
        target: "attack",
        source: "habilidade",
        sourceId: "nonprof",
        value: -5,
        page: 142,
      });
    if (c.raceId === "anao" && racialWeapon)
      hitMods.push({
        id: "dwarfweapon",
        label: "Tradição de Heredrimm",
        target: "attack",
        source: "habilidade",
        sourceId: "dwarfweapon",
        value: 2,
        page: 20,
      });
    const damageMods = mods.filter(
      (m) =>
        m.target === "damage" ||
        m.target === `damage:${attack.itemId}` ||
        m.target === `damage:${attack.skill === "luta" ? "melee" : "ranged"}`,
    );
    let base = attack.damage;
    const sizeSteps =
      size === "Minúsculo"
        ? -1
        : ["Grande", "Enorme"].includes(size)
          ? 1
          : size === "Colossal"
            ? 2
            : 0;
    if (sizeSteps && attack.id !== "wild-form")
      base = stepDamage(base, sizeSteps);
    if (owns("Campeão")) base = stepDamage(base, 1);
    const damageBase = [component("Ajuste do ataque", attack.damageBonus)];
    if (attack.attribute)
      damageBase.push(
        component(attack.attribute.toUpperCase(), a[attack.attribute], 230),
      );
    if (
      owns("Estilo de Duas Mãos") &&
      weapon?.hands === 2 &&
      attack.skill === "luta"
    )
      damageBase.push(component("Estilo de Duas Mãos", 5, 128));
    if (owns("Estilo de Disparo") && weapon?.attackType === "ranged")
      damageBase.push(component("Estilo de Disparo", a.des, 125));
    if (owns("Arqueiro") && attack.skill === "pontaria")
      damageBase.push(
        component(
          "Arqueiro",
          Math.min(
            a.sab,
            Math.max(classLevel(c, "guerreiro"), classLevel(c, "cacador")),
          ),
          65,
        ),
      );
    if (owns("Trincado") && attack.id === "unarmed")
      damageBase.push(component("Trincado", a.con, 77));
    if (owns("Crítico Brutal") && weapon?.attackType !== "ranged")
      attack = { ...attack, critical: attack.critical + 1 };
    if (owns("Presas Afiadas") && attack.natural)
      attack = { ...attack, threat: attack.threat - 2 };
    const dmg = value(damageBase, damageMods).total;
    const toHit = value(
      [
        ...(skills[attack.skill]?.components ?? []),
        component("Ajuste do ataque", attack.attackBonus),
      ],
      hitMods,
    );
    return {
      ...attack,
      toHit,
      damageExpression: base + (dmg ? sign(dmg) : ""),
    };
  });
  const warnings: string[] = [];
  if (partners(c).filter((p) => p.active).length > partnerLimit(c))
    warnings.push(
      `Limite de ${partnerLimit(c)} parceiro(s) ativo(s). Somente os primeiros fornecem benefícios (p. 260).`,
    );
  if (load.total > 2 * capacity.total)
    warnings.push(
      "Carga acima do dobro da capacidade: distribua o equipamento.",
    );
  if (worn > wornLimit)
    warnings.push(
      `Somente os primeiros ${wornLimit} itens vestidos fornecem benefícios.`,
    );
  if (
    equipped.reduce((s, i) => s + (i.state === "wielded" ? i.hands : 0), 0) > 2
  )
    warnings.push("Os itens empunhados exigem mais de duas mãos.");
  if (c.hp <= Math.min(-10, Math.floor(-hp.total / 2)))
    warnings.push("O personagem atingiu o limite de morte.");
  return {
    level,
    attributes: attr,
    skills,
    hp,
    mp,
    defense,
    speed,
    load,
    capacity,
    rd,
    size,
    senses: [
      ...race.senses,
      ...(familiar(c) === "Gato"
        ? ["Visão no escuro (familiar)"]
        : familiar(c) === "Morcego"
          ? ["Percepção às cegas 9 m (familiar)"]
          : []),
      ...mods
        .filter((m) => ["flight", "swim", "climb"].includes(m.target))
        .map(
          (m) =>
            `${{ flight: "Voo", swim: "Natação", climb: "Escalada" }[m.target]} ${m.value} m`,
        ),
    ],
    proficiencies: [...new Set(proficiencies)],
    conditions: [...conds],
    warnings,
    attacks: calculatedAttacks,
  };
}
export const temporaryTotal = (c: Character, kind: "hp" | "mp") =>
  c.temporary.filter((p) => p.kind === kind).reduce((s, p) => s + p.value, 0);
export function itemBenefits(item: Item): string {
  return item.damage
    ? `${item.damage} · ${item.threat === 20 ? "" : item.threat + "/"}×${item.critical}`
    : item.defense
      ? `${sign(item.defense)} Defesa`
      : `${item.spaces} espaço${item.spaces === 1 ? "" : "s"}`;
}
