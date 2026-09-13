import { describe, it, expect } from "vitest";
import {
  CATALOG,
  CLASSES,
  CONDITIONS,
  RACES,
  SKILLS,
  entryNamed,
  knownSpellCount,
} from "../src/data/rules";
import { calculate, conditionNames, value } from "../src/domain/calculate";
import { acquisition, ITEM_TEMPLATES, uid } from "../src/domain/character";
import {
  conditionEffect,
  execute,
  previewDamage,
} from "../src/domain/commands";
import { createEffect, castingCost } from "../src/domain/effects";
import { criticalExpression, roll, stepDamage } from "../src/domain/dice";
import type { Modifier } from "../src/domain/types";
import { equip, hero } from "./fixtures";

describe("integridade das fontes", () => {
  it("cada registro informa versão da fonte e páginas válidas", () => {
    for (const e of CATALOG) {
      expect(e.sourceVersion).toBe("t20-jda-2023-11-17");
      expect(e.pdfPage).toBe(e.page + 6);
      expect(e.endPage).toBeGreaterThanOrEqual(e.page);
      expect(e.endPage).toBeLessThanOrEqual(401);
    }
  });
  it("mantém as raças, perícias, condições e 280 linhas de progressão", () => {
    expect(RACES).toHaveLength(17);
    expect(SKILLS).toHaveLength(29);
    expect(CONDITIONS).toHaveLength(35);
    expect(CLASSES).toHaveLength(14);
    for (const c of CLASSES) {
      expect(Object.keys(c.progression)).toHaveLength(20);
      expect(c.initialHp).toBeGreaterThan(0);
      expect(c.hpPerLevel).toBeGreaterThan(0);
      expect(c.mpPerLevel).toBeGreaterThan(0);
      expect(c.mandatory.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeGreaterThanOrEqual(c.choices);
    }
  });
  it("referências apontam para páginas físicas e IDs únicos", () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    for (const e of CATALOG) {
      expect(e.page).toBe(e.pdfPage - 6);
      expect(e.endPage).toBeGreaterThanOrEqual(e.page);
      expect(e.pdfPage).toBeLessThanOrEqual(407);
      expect(e.description.length).toBeGreaterThan(10);
    }
  });
  it("tabela de armaduras tem cinco leves, cinco pesadas e dois escudos", () => {
    expect(
      ITEM_TEMPLATES.filter((i) => i.category === "Armadura leve"),
    ).toHaveLength(5);
    expect(
      ITEM_TEMPLATES.filter((i) => i.category === "Armadura pesada"),
    ).toHaveLength(5);
    expect(ITEM_TEMPLATES.filter((i) => i.category === "Escudo")).toHaveLength(
      2,
    );
    expect(
      ITEM_TEMPLATES.find((i) => i.id === "armadura-completa"),
    ).toMatchObject({ defense: 10, heavy: true, penalty: -5 });
  });
});
describe("ficha e progressão", () => {
  it.each(
    CLASSES.map(
      (c) => [c.id, c.initialHp, c.hpPerLevel, c.mpPerLevel] as const,
    ),
  )("%s progride até 20 com ganhos próprios", (id, hp, gain, mp) => {
    for (let n = 1; n <= 20; n++) {
      const c = hero(id, n);
      const d = calculate(c);
      expect(d.hp.total).toBe(hp + 3 + (n - 1) * (gain + 3));
      expect(d.mp.total).toBeGreaterThanOrEqual(n * mp);
      expect(d.level).toBe(n);
    }
  });
  it("treinamento muda nos níveis 7 e 15", () => {
    expect(calculate(hero("guerreiro", 6)).skills.luta.total).toBe(8);
    expect(calculate(hero("guerreiro", 7)).skills.luta.total).toBe(10);
    expect(calculate(hero("guerreiro", 14)).skills.luta.total).toBe(14);
    expect(calculate(hero("guerreiro", 15)).skills.luta.total).toBe(16);
  });
  it("Constituição modifica retroativamente todos os níveis", () => {
    const c = hero("guerreiro", 7),
      old = calculate(c);
    c.attributes.con += 2;
    expect(calculate(c).hp.total - old.hp.total).toBe(14);
  });
  it("multiclasse não repete PV iniciais ou novas proficiências", () => {
    const c = hero("arcanista");
    c.levels.push({ classId: "guerreiro", powers: [], notes: "" });
    const d = calculate(c);
    expect(d.hp.total).toBe(8 + 3 + 5 + 3);
    expect(d.proficiencies).not.toContain("pesadas");
  });
  it("Ofícios têm cálculos e treinamentos independentes", () => {
    const c = hero("inventor", 7);
    c.crafts = ["Alquimista", "Engenhoqueiro"];
    c.trained.push({ id: "oficio-alquimista", level: 1, source: "Classe" });
    const d = calculate(c);
    expect(
      d.skills["oficio-alquimista"].total -
        d.skills["oficio-engenhoqueiro"].total,
    ).toBe(4);
  });
  it("armadura pesada retira Des, reduz velocidade e soma escudo", () => {
    const c = hero();
    equip(c, "brunea");
    equip(c, "escudo-leve");
    const d = calculate(c);
    expect(d.defense.total).toBe(16);
    expect(d.speed.total).toBe(6);
    expect(d.skills.acrobacia.total).toBe(-2);
  });
  it("não proficiência com armadura afeta perícias de For e Des", () => {
    const c = hero("arcanista");
    equip(c, "brunea");
    expect(calculate(c).skills.luta.total).toBe(3);
  });
  it("meio espaço não é descartado; guardar retira da carga", () => {
    const c = hero();
    const item = equip(c, "balsamo-restaurador");
    expect(item.spaces).toBe(0.5);
    expect(calculate(c).load.total).toBe(0.5);
    item.state = "stored";
    expect(calculate(c).load.total).toBe(0);
  });
  it("evolução preserva recursos atuais por padrão", () => {
    const c = hero();
    c.hp = 5;
    c.mp = 1;
    const next = structuredClone(c);
    next.levels.push({ classId: "guerreiro", powers: [], notes: "" });
    const r = execute(c, {
      type: "level",
      character: next,
      resourceMode: "keep",
    });
    expect(r.character.hp).toBe(5);
    expect(r.character.mp).toBe(1);
    expect(c.levels).toHaveLength(1);
  });
  it("mago e feiticeiro têm progressões distintas de magias", () => {
    const c = hero("arcanista", 5);
    c.choices.path = "Mago";
    expect(knownSpellCount(c, "arcanista")).toBe(9);
    c.choices.path = "Feiticeiro";
    expect(knownSpellCount(c, "arcanista")).toBe(5);
  });
});
describe("acúmulo e contexto", () => {
  const mod = (
    source: Modifier["source"],
    sourceId: string,
    n: number,
  ): Modifier => ({
    id: uid(),
    label: sourceId,
    target: "defense",
    value: n,
    source,
    sourceId,
  });
  it("magias não somam entre si; habilidades diferentes somam", () => {
    const result = value(
      [],
      [
        mod("magia", "a", 2),
        mod("magia", "b", 5),
        mod("habilidade", "c", 2),
        mod("habilidade", "d", 3),
      ],
    );
    expect(result.total).toBe(10);
    expect(result.components.filter((c) => !c.applied)).toHaveLength(1);
  });
  it("aplica apenas a maior penalidade entre condições", () => {
    const c = hero();
    c.effects = [conditionEffect(c, "abalado"), conditionEffect(c, "fraco")];
    expect(calculate(c).skills.luta.total).toBe(3);
  });
  it("Fúria altera apenas ataques corpo a corpo", () => {
    const c = hero("barbaro", 6);
    const sword = equip(c, "espada-longa");
    const bow = equip(c, "arco-curto");
    const old = calculate(c);
    c.effects.push(createEffect(c, entryNamed("Fúria")!, 3, "barbaro"));
    const d = calculate(c);
    expect(
      d.attacks.find((a) => a.id === sword.id)!.toHit.total -
        old.attacks.find((a) => a.id === sword.id)!.toHit.total,
    ).toBe(3);
    expect(d.attacks.find((a) => a.id === bow.id)!.toHit.total).toBe(
      old.attacks.find((a) => a.id === bow.id)!.toHit.total,
    );
  });
  it("modificador condicionado a alvo não vaza para outro alvo", () => {
    const c = hero("cavaleiro", 2);
    c.effects.push(
      createEffect(c, entryNamed("Duelo")!, 2, "cavaleiro", "ogro"),
    );
    expect(
      calculate(c, { target: "ogro" }).attacks[0].toHit.total -
        calculate(c, { target: "goblin" }).attacks[0].toHit.total,
    ).toBe(2);
  });
});
describe("recursos, dano e tempo", () => {
  it("resistência vem antes da metade de Durão e RD", () => {
    const c = hero();
    const p = previewDamage(c, {
      amount: 26,
      damageType: "fogo",
      save: "half",
      halfAgain: true,
      extraRD: 10,
    });
    expect(p.hpDamage).toBe(0);
    expect(p.steps.map((x) => x.amount)).toEqual([26, 13, 6, 0]);
  });
  it("PV temporários absorvem primeiro, perda de vida ignora temporários", () => {
    const c = hero();
    c.temporary.push({
      id: uid(),
      source: "magia",
      kind: "hp",
      value: 5,
      duration: "scene",
    });
    const r = execute(c, {
      type: "damage",
      input: { amount: 8, damageType: "corte" },
    }).character;
    expect(r.hp).toBe(c.hp - 3);
    expect(r.temporary).toHaveLength(0);
    const loss = execute(c, {
      type: "damage",
      input: { amount: 8, damageType: "corte", loss: true },
    }).character;
    expect(loss.hp).toBe(c.hp - 8);
    expect(loss.temporary[0].value).toBe(5);
  });
  it("dano não letal preserva PV e causa inconsciência no limite", () => {
    const c = hero();
    const next = execute(c, {
      type: "damage",
      input: { amount: c.hp, damageType: "impacto", nonlethal: true },
    }).character;
    expect(next.hp).toBe(c.hp);
    expect(next.nonlethal).toBe(c.hp);
    expect(calculate(next).conditions).toContain("inconsciente");
    expect(calculate(next).conditions).not.toContain("sangrando");
  });
  it("descanso recupera pelo nível, sem completar recursos", () => {
    const c = hero("guerreiro", 5);
    c.hp = 1;
    c.mp = 0;
    const next = execute(c, {
      type: "rest",
      hours: 8,
      quality: "normal",
    }).character;
    expect(next.hp).toBe(6);
    expect(next.mp).toBe(5);
  });
  it("padrão pode virar movimento e completa exige ambas", () => {
    let c = execute(hero(), { type: "combatStart", initiative: 15 }).character;
    c = execute(c, { type: "turnStart", sustain: [] }).character;
    c = execute(c, {
      type: "action",
      action: "movimento",
      label: "mover",
    }).character;
    c = execute(c, {
      type: "action",
      action: "movimento",
      label: "mover",
    }).character;
    expect(c.combat.standard).toBe(0);
    expect(() =>
      execute(c, { type: "action", action: "completa", label: "completa" }),
    ).toThrow();
  });
  it("reação não usa contador e funciona fora do turno", () => {
    let c = execute(hero(), { type: "combatStart", initiative: 15 }).character;
    for (let i = 0; i < 4; i++)
      c = execute(c, {
        type: "action",
        action: "reacao",
        label: "reagir",
      }).character;
    expect(c.combat.standard).toBe(1);
    expect(c.combat.movement).toBe(1);
  });
  it("uma rodada expira antes da iniciativa de origem, sem usar relógio real", () => {
    let c = execute(hero(), { type: "combatStart", initiative: 15 }).character;
    c.effects.push({
      ...conditionEffect(c, "abalado", "1 rodada"),
      duration: {
        ...conditionEffect(c, "abalado", "1 rodada").duration,
        anchor: 10,
      },
    });
    c = execute(c, { type: "turnStart", sustain: [] }).character;
    c = execute(c, { type: "turnEnd" }).character;
    c = execute(c, { type: "roundNext" }).character;
    expect(c.effects).toHaveLength(1);
    c = execute(c, {
      type: "initiative",
      initiative: 11,
      edge: "before",
    }).character;
    expect(c.effects).toHaveLength(1);
    c = execute(c, {
      type: "initiative",
      initiative: 10,
      edge: "before",
    }).character;
    expect(c.effects).toHaveLength(0);
  });
  it("Fúria acaba na rodada sem ataque ou hostilidade", () => {
    let c = execute(hero("barbaro"), {
      type: "combatStart",
      initiative: 12,
    }).character;
    c.effects.push(createEffect(c, entryNamed("Fúria")!, 2, "barbaro"));
    c = execute(c, { type: "turnStart", sustain: [] }).character;
    c = execute(c, { type: "turnEnd" }).character;
    c = execute(c, { type: "roundNext" }).character;
    expect(c.effects).toHaveLength(0);
  });
  it("falha em custo não consome ação parcialmente", () => {
    let c = execute(hero(), { type: "combatStart", initiative: 10 }).character;
    c = execute(c, { type: "turnStart", sustain: [] }).character;
    c.mp = 0;
    const state = structuredClone(c);
    expect(() =>
      execute(c, {
        type: "attack",
        attackId: "unarmed",
        abilities: { special: 1 },
        target: "alvo",
        bonus: 0,
        extraDamage: "",
      }),
    ).toThrow("insuficientes");
    expect(c).toEqual(state);
  });
  it("magia limita PM e rejeita aprimoramentos sem círculo", () => {
    const c = hero("clerigo");
    const e = entryNamed("Curar Ferimentos")!;
    const h = e.enhancements!.find((h) => h.cost === 5)!;
    expect(
      castingCost(c, e, "clerigo", { [h.id]: 1 }).errors.length,
    ).toBeGreaterThan(0);
  });
});
describe("dados seguros", () => {
  it("guarda dados individuais e descarta menor", () => {
    const values = [1, 6, 4, 3];
    const result = roll("4d6kh3", () => values.shift()!);
    expect(result.total).toBe(13);
    expect(result.dice[0].values).toEqual([1, 6, 4, 3]);
    expect(result.dice[0].kept).toEqual([1, 2, 3]);
  });
  it.each([
    "alert(1)",
    "1d20;fetch(1)",
    "10001d6",
    "1d1",
    "1d20+",
    "+",
    "-",
    "2**9",
  ])("rejeita %s", (expr) => expect(() => roll(expr)).toThrow());
  it("crítico multiplica dados básicos, preservando constante", () => {
    expect(criticalExpression("2d6+5", 3)).toBe("6d6+5");
  });
  it("passos usam a tabela e equivalências do livro", () => {
    expect(stepDamage("1d8", 1)).toBe("1d10");
    expect(stepDamage("2d6", 1)).toBe("3d6");
    expect(stepDamage("2d10", 3)).toBe("4d12");
  });
});
