import { afterEach, describe, expect, it, vi } from "vitest";
import { entryNamed } from "../src/data/rules";
import { acquisition } from "../src/domain/character";
import { calculate, value } from "../src/domain/calculate";
import { execute, conditionEffect, type Command } from "../src/domain/commands";
import { createEffect, castingCost } from "../src/domain/effects";
import { magicPlan } from "../src/domain/magic";
import { attackPlan } from "../src/domain/attacks";
import * as dice from "../src/domain/dice";
import type { Character } from "../src/domain/types";
import { hero, equip } from "./fixtures";
import { CATALOG, racialMagic } from "../src/data/rules";
import { characterEntries, itemFromTemplate } from "../src/domain/character";
import { formPlan } from "../src/domain/forms";
import { partnerModifiers, partnerLimit } from "../src/domain/partners";

const originalRoll = dice.roll;
afterEach(() => vi.restoreAllMocks());
function fixed(n: number) {
  vi.spyOn(dice, "roll").mockImplementation((expr) =>
    originalRoll(expr, () => n),
  );
}
function learn(c: Character, name: string, source = c.levels[0].classId) {
  const e = entryNamed(name)!;
  const ac = acquisition(e.id, c.levels.length, source);
  ac.prepared = true;
  ac.mode = "spell";
  c.acquisitions.push(ac);
  return { e, ac };
}
function cast(c: Character, name: string): Extract<Command, { type: "use" }> {
  const ac = c.acquisitions.find((a) => a.entryId === entryNamed(name)!.id)!;
  return {
    type: "use",
    entryId: ac.entryId,
    acquisitionId: ac.id,
    sourceClass: ac.source,
    cost: 1,
    target: c.name,
    enhancements: {},
    choices: {},
    applyToSelf: true,
  };
}
function begin(c: Character) {
  return execute(
    execute(c, { type: "combatStart", initiative: 15 }).character,
    { type: "turnStart", sustain: [] },
  ).character;
}

describe("conjuração conferida nas páginas 170–173 e 224–227", () => {
  it("falha de concentração consome PM e ação sem aplicar o efeito", () => {
    let c = hero("arcanista", 3);
    learn(c, "Armadura Arcana");
    c = begin(c);
    fixed(1);
    const result = execute(c, {
      ...cast(c, "Armadura Arcana"),
      casting: { concentration: "bad" },
    });
    expect(result.character.mp).toBe(c.mp - 1);
    expect(result.character.combat.standard).toBe(0);
    expect(result.character.effects).toHaveLength(0);
    expect(result.event.detail).toContain("falha; PM e componentes consumidos");
  });
  it("armadura arcana exige Misticismo; bardo com armadura leve é exceção", () => {
    const mage = hero("arcanista", 3),
      bard = hero("bardo", 3);
    equip(mage, "armadura-de-couro");
    equip(bard, "armadura-de-couro");
    const { e, ac } = learn(mage, "Armadura Arcana");
    const { ac: b } = learn(bard, "Armadura Arcana");
    expect(magicPlan(mage, e, ac, "arcanista", {}).checks[0].dc).toBe(21);
    expect(magicPlan(bard, e, b, "bardo", {}).checks).toHaveLength(0);
  });
  it("gestos precisam de mão livre e Mago precisa memorizar", () => {
    const c = hero("arcanista", 3);
    c.choices.path = "Mago";
    equip(c, "bordao");
    const { e, ac } = learn(c, "Armadura Arcana");
    ac.prepared = false;
    const plan = magicPlan(c, e, ac, "arcanista", {});
    expect(plan.errors.join(" ")).toContain("mão");
    expect(plan.errors.join(" ")).toContain("memorizada");
  });
  it("fórmula não é magia lançável e engenhoca quebrada não ativa", () => {
    const c = hero("inventor", 6);
    const { e, ac } = learn(c, "Armadura Arcana");
    ac.mode = "formula";
    expect(magicPlan(c, e, ac, "inventor", {}).errors.join(" ")).toContain(
      "Fórmulas",
    );
    ac.mode = "device";
    ac.broken = true;
    expect(magicPlan(c, e, ac, "inventor", {}).errors.join(" ")).toContain(
      "enguiçada",
    );
  });
  it("rejeita duas alterações de alcance, mesmo após quebra de linha", () => {
    const c = hero("clerigo", 20),
      e = entryNamed("Curar Ferimentos")!;
    const hs = e.enhancements!.filter((h) =>
      h.text.includes("alcance para curto"),
    );
    expect(
      castingCost(
        c,
        e,
        "clerigo",
        Object.fromEntries(hs.map((h) => [h.id, 1])),
      ).errors.join(" "),
    ).toContain("alcance");
  });
  it("Curar Ferimentos não aumenta dados pelo aprimoramento de alcance", () => {
    const c = hero("clerigo", 5);
    learn(c, "Curar Ferimentos");
    c.hp = 1;
    fixed(2);
    const e = entryNamed("Curar Ferimentos")!,
      h = e.enhancements!.find((h) => h.text === "muda o alcance para curto.")!;
    const result = execute(c, {
      ...cast(c, e.name),
      enhancements: { [h.id]: 1 },
    });
    expect(result.event.rolls![0].expression).toBe("2d8+2");
    expect(result.character.hp).toBe(7);
  });
  it("Oração exige oferendas e limita bônus pelo círculo", () => {
    const c = hero("clerigo", 5),
      { e, ac } = learn(c, "Oração");
    const plan = magicPlan(c, e, ac, "clerigo", {});
    expect(plan.gold).toBe(60);
    expect(plan.errors.join(" ")).toContain("componentes");
    expect(
      castingCost(c, e, "clerigo", { [e.enhancements![0].id]: 1 }).errors.join(
        " ",
      ),
    ).toContain("círculo máximo");
  });
  it("sustentação termina com inconsciência e não cobra PM", () => {
    let c = begin(hero("clerigo", 5));
    const effect = createEffect(c, entryNamed("Oração")!, 3, "clerigo");
    c.effects.push(effect);
    c.hp = 0;
    c = execute(c, { type: "turnEnd" }).character;
    c = execute(c, { type: "roundNext" }).character;
    const mp = c.mp;
    c = execute(c, { type: "turnStart", sustain: [effect.id] }).character;
    expect(c.effects).toHaveLength(0);
    expect(c.mp).toBe(mp);
  });
});

describe("efeitos e cálculos", () => {
  it("Primor Atlético concede +10 em Atletismo e +9 m", () => {
    const c = hero(),
      before = calculate(c);
    c.effects.push(createEffect(c, entryNamed("Primor Atlético")!, 1));
    expect(
      calculate(c).skills.atletismo.total - before.skills.atletismo.total,
    ).toBe(10);
    expect(calculate(c).speed.total - before.speed.total).toBe(9);
  });
  it("Físico e Mente Divina alteram atributos e perícias sem PV ou PM adicionais", () => {
    const c = hero("clerigo", 5),
      before = calculate(c);
    c.effects.push(
      createEffect(
        c,
        entryNamed("Físico Divino")!,
        3,
        "clerigo",
        "",
        {},
        { attribute: "con" },
      ),
    );
    c.effects.push(
      createEffect(
        c,
        entryNamed("Mente Divina")!,
        3,
        "clerigo",
        "",
        {},
        { attribute: "sab" },
      ),
    );
    const after = calculate(c);
    expect(after.attributes.con.total).toBe(before.attributes.con.total + 2);
    expect(after.skills.vontade.total).toBe(before.skills.vontade.total + 2);
    expect(after.hp.total).toBe(before.hp.total);
    expect(after.mp.total).toBe(before.mp.total);
  });
  it("Armadura Arcana usa maior bônus de armadura e reação acumula", () => {
    const c = hero("arcanista", 5);
    const armor = equip(c, "armadura-de-couro");
    const before = calculate(c);
    const e = entryNamed("Armadura Arcana")!;
    c.effects.push(createEffect(c, e, 1));
    expect(calculate(c).defense.total).toBe(
      before.defense.total + 5 - armor.defense,
    );
    c.effects.push(
      createEffect(c, e, 2, "arcanista", "", { [e.enhancements![0].id]: 1 }),
    );
    expect(calculate(c).defense.total).toBe(
      before.defense.total + 10 - armor.defense,
    );
  });
  it("dois multiplicadores x2 resultam em x3", () => {
    const mods = ["a", "b"].map((id) => ({
      id,
      label: id,
      target: "damage",
      value: 2,
      operation: "multiply" as const,
      source: "habilidade" as const,
      sourceId: id,
    }));
    expect(
      value([{ label: "Base", value: 5, applied: true }], mods).total,
    ).toBe(15);
  });
  it("descanso de osteon exige estrelas ou subterrâneo e ignora luxo", () => {
    const c = hero("guerreiro", 3);
    c.raceId = "osteon";
    c.hp = 1;
    c.mp = 0;
    expect(() =>
      execute(c, { type: "rest", hours: 8, quality: "luxurious" }),
    ).toThrow("estrelas");
    const result = execute(c, {
      type: "rest",
      hours: 8,
      quality: "luxurious",
      specialConditions: true,
    }).character;
    expect(result.hp).toBe(4);
    expect(result.mp).toBe(3);
  });
  it("efeito de um dia preserva 16 horas após descanso de oito horas", () => {
    const c = hero();
    c.effects.push(conditionEffect(c, "abalado", "1 dia"));
    const next = execute(c, {
      type: "rest",
      hours: 8,
      quality: "normal",
    }).character;
    expect(next.effects[0].duration.remaining).toBeCloseTo(2 / 3);
  });
});

describe("ataques com custos vinculados", () => {
  it("Briga mantém crítico 20/x2 até o nível 20", () => {
    const a = calculate(hero("lutador", 20)).attacks.find(
      (a) => a.id === "unarmed",
    )!;
    expect(a.threat).toBe(20);
    expect(a.critical).toBe(2);
    expect(a.damageExpression).toContain("2d10");
  });
  it("Ataque Especial distribui +4 por PM em parcelas de +2", () => {
    const c = hero("guerreiro", 5);
    expect(
      attackPlan(c, "unarmed", { special: 2, specialHit: 6 }),
    ).toMatchObject({ cost: 2, hit: 6, damage: 2, errors: [] });
    expect(attackPlan(c, "unarmed", { special: 3 }).errors).not.toHaveLength(0);
  });
  it("Ataque Especial paga inclusive quando o ataque falha", () => {
    let c = begin(hero("guerreiro", 5));
    fixed(1);
    const result = execute(c, {
      type: "attack",
      attackId: "unarmed",
      target: "Inimigo",
      bonus: 0,
      extraDamage: "",
      abilities: { special: 2, specialHit: 8 },
    });
    expect(result.character.mp).toBe(c.mp - 2);
    expect(result.character.combat.standard).toBe(0);
    expect(result.event.rolls).toHaveLength(1);
  });
  it("Ataque Extra permite só outro ataque e apenas uma vez por rodada", () => {
    let c = begin(hero("guerreiro", 6));
    fixed(2);
    const command: Extract<Command, { type: "attack" }> = {
      type: "attack",
      attackId: "unarmed",
      target: "Inimigo",
      bonus: 0,
      extraDamage: "",
    };
    c = execute(c, command).character;
    expect(c.combat.standard).toBe(0);
    c = execute(c, {
      ...command,
      abilities: { extra: "ataque-extra" },
    }).character;
    expect(c.combat.standard).toBe(0);
    expect(() =>
      execute(c, { ...command, abilities: { extra: "ataque-extra" } }),
    ).toThrow();
  });
  it("dois d20 mantendo um preservam o resultado natural", () => {
    const values = [1, 20];
    expect(dice.roll("2d20kh1+3", () => values.shift()!).natural).toBe(20);
  });
});

describe("raças, formas selvagens e companheiros", () => {
  it("violação de código bloqueia PM até o próximo dia", () => {
    let c = hero("cavaleiro", 5);
    c = execute(c, { type: "event", event: "violation" }).character;
    expect(c.mp).toBe(0);
    expect(() =>
      execute(c, {
        type: "resource",
        kind: "mp",
        mode: "recover",
        amount: 1,
        reason: "Recuperar",
      }),
    ).toThrow("próximo dia");
    c = execute(c, { type: "rest", hours: 8, quality: "normal" }).character;
    expect(c.mp).toBe(5);
  });
  function gain(c: Character, name: string, group?: string) {
    const e = CATALOG.find(
      (e) => e.name === name && (!group || e.group === group),
    )!;
    const ac = acquisition(e.id, c.levels.length, c.levels[0].classId);
    c.acquisitions.push(ac);
    return { e, ac };
  }
  it("todas as opções de magias raciais existem no catálogo", () => {
    for (const id of [
      "dahllan",
      "suraggel",
      "silfide",
      "sereia-tritao",
      "qareen",
    ]) {
      const c = hero();
      c.raceId = id;
      for (const name of [...racialMagic(c).fixed, ...racialMagic(c).options])
        expect(
          CATALOG.some((e) => e.kind === "spell" && e.name === name),
          name,
        ).toBe(true);
    }
  });
  it("Sulfure recebe Escuridão com Inteligência e sem teste de armadura", () => {
    const c = hero();
    c.raceId = "suraggel";
    c.choices.suraggel = "Sulfure";
    equip(c, "armadura-de-couro");
    const e = characterEntries(c).find((e) => e.name === "Escuridão")!;
    expect(e).toBeDefined();
    const p = magicPlan(c, e, undefined, "Raça", {});
    expect(p.attribute).toBe("int");
    expect(p.checks).toEqual([]);
  });
  it("forma feroz aprimorada exige o poder e tem dano 2d6, sem duplicar o tamanho", () => {
    const c = hero("druida", 6);
    gain(c, "Forma Selvagem");
    const choices = { form: "feroz", tier: "aprimorada" };
    expect(formPlan(c, choices).errors).not.toHaveLength(0);
    gain(c, "Forma Selvagem Aprimorada");
    expect(formPlan(c, choices).errors).toEqual([]);
    const before = calculate(c);
    c.effects.push(
      createEffect(
        c,
        entryNamed("Forma Selvagem")!,
        6,
        "druida",
        "",
        {},
        choices,
      ),
    );
    const after = calculate(c);
    expect(after.size).toBe("Grande");
    expect(after.attributes.for.total).toBe(before.attributes.for.total + 5);
    expect(after.defense.total).toBe(before.defense.total + 4);
    expect(after.attacks).toHaveLength(1);
    expect(after.attacks[0].damageExpression).toMatch(/^2d6/);
  });
  it("forma mantém itens vestidos, oculta arma empunhada e reverte por inconsciência", () => {
    let c = hero("druida", 6);
    gain(c, "Forma Selvagem");
    equip(c, "armadura-de-couro");
    equip(c, "espada-longa");
    c.effects.push(
      createEffect(
        c,
        entryNamed("Forma Selvagem")!,
        3,
        "druida",
        "",
        {},
        { form: "feroz", tier: "base" },
      ),
    );
    expect(calculate(c).attacks.map((a) => a.name)).not.toContain(
      "Espada longa",
    );
    c = execute(c, {
      type: "resource",
      kind: "hp",
      mode: "set",
      amount: 0,
      reason: "Inconsciência",
    }).character;
    expect(c.effects.some((e) => e.name === "Forma Selvagem")).toBe(false);
    expect(
      calculate(c).attacks.some((a) => a.itemId === c.inventory[1].id),
    ).toBe(true);
  });
  it("formas sorrateira superior e veloz superior oferecem deslocamentos distintos", () => {
    const c = hero("druida", 12);
    gain(c, "Forma Selvagem Superior");
    c.effects.push(
      createEffect(
        c,
        entryNamed("Forma Selvagem")!,
        10,
        "druida",
        "",
        {},
        { form: "sorrateira", tier: "superior" },
      ),
    );
    expect(calculate(c).size).toBe("Minúsculo");
    expect(calculate(c).senses).toContain("Voo 18 m");
    expect(
      formPlan(c, { form: "veloz", tier: "superior", movement: "speed" })
        .errors,
    ).not.toHaveLength(0);
  });
  it("companheiro animal evolui pelo nível da classe e parceiros respeitam o limite", () => {
    const c = hero("druida", 7);
    const { ac } = gain(c, "Companheiro Animal", "Druida");
    ac.choices.partnerType = "Guardião";
    expect(partnerModifiers(c).find((m) => m.target === "defense")!.value).toBe(
      3,
    );
    expect(partnerLimit(c)).toBe(2);
    const base = hero();
    for (let i = 0; i < 2; i++) {
      const e = CATALOG.find(
        (e) => e.kind === "partner" && e.name === "Guardião",
      )!;
      const ac = acquisition(e.id, 1, "Parceiro");
      base.acquisitions.push(ac);
    }
    expect(partnerModifiers(base)).toHaveLength(1);
    expect(calculate(base).warnings.join(" ")).toContain("Limite de 1");
  });
  it("Rato substitui Constituição em Fortitude; Sapo soma atributo aos PV", () => {
    const c = hero("arcanista", 5);
    c.attributes.int = 4;
    const before = calculate(c),
      { ac } = gain(c, "Familiar");
    ac.choices.familiar = "Rato";
    expect(calculate(c).skills.fortitude.total).toBe(
      before.skills.fortitude.total -
        before.attributes.con.total +
        before.attributes.int.total,
    );
    ac.choices.familiar = "Sapo";
    expect(calculate(c).hp.total).toBe(
      before.hp.total + before.attributes.int.total,
    );
  });
  it("um disparo consome uma flecha, preservando as outras 19", () => {
    const c = hero();
    const arrows = itemFromTemplate("flechas-20");
    c.inventory.push(arrows);
    const bow = equip(c, "arco-curto");
    fixed(2);
    const next = execute(c, {
      type: "attack",
      attackId: bow.id,
      target: "Alvo",
      bonus: 0,
      extraDamage: "",
    }).character;
    expect(next.inventory[0].quantity).toBe(19);
    expect(arrows.spaces * arrows.quantity).toBe(1);
  });
});
