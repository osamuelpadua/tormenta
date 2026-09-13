import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  diceSides,
  physicalRoll,
  PhysicalRollRequired,
} from "../src/domain/dice";
import { execute, type Command } from "../src/domain/commands";
import { calculate } from "../src/domain/calculate";
import { CharacterDatabase } from "../src/storage/database";
import { parseBackup } from "../src/storage/schema";
import { hero, equip } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("dados físicos", () => {
  it("soma os dados informados, mantém o natural e descarta o menor sem sortear", () => {
    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation(() => {
        throw new Error("Sorteio inesperado");
      });
    expect(diceSides("4d6kh3+2")).toEqual([6, 6, 6, 6]);
    const result = physicalRoll("4d6kh3+2", [1, 6, 4, 3]);
    expect(result.total).toBe(15);
    expect(result.dice[0].kept).toEqual([1, 2, 3]);
    expect(physicalRoll("1d20-3", [20])).toMatchObject({
      total: 17,
      natural: 20,
    });
    expect(random).not.toHaveBeenCalled();
  });

  it.each([[], [0], [21], [1.5], [NaN], [4, 5]])(
    "rejeita dados de d20 inválidos: %j",
    (values) => {
      expect(() => physicalRoll("1d20+2", values)).toThrow();
    },
  );

  it.each([
    { die: 1, dc: 0, outcome: "falha" },
    { die: 20, dc: 100, outcome: "sucesso" },
    { die: 12, dc: 14, outcome: "sucesso" },
  ])(
    "respeita o dado físico $die no teste contra CD $dc",
    ({ die, dc, outcome }) => {
      const result = execute(hero(), {
        type: "roll",
        label: "Acrobacia",
        expression: "1d20+2",
        dc,
        physicalRolls: [{ expression: "1d20+2", values: [die] }],
      });
      expect(result.event.rolls?.[0].total).toBe(die + 2);
      expect(result.event.detail).toContain(`CD ${dc}: ${outcome}`);
      expect(result.event.detail).toContain("Dados físicos");
    },
  );

  it("solicita ataque e dano em sequência, sem modificar o original; aceita dano adicional fixo", () => {
    const c = hero();
    equip(c, "espada-longa");
    const attack = calculate(c).attacks.find((a) => a.name === "Espada longa")!;
    const original = structuredClone(c);
    const expression = `1d20+${attack.toHit.total}`;
    const command: Command = {
      type: "attack",
      attackId: attack.id,
      target: "Orc",
      defense: 10,
      bonus: 0,
      extraDamage: "3",
      physicalRolls: [],
    };
    expect(() => execute(c, command)).toThrow(PhysicalRollRequired);
    command.physicalRolls!.push({ expression, values: [12] });
    expect(() => execute(c, command)).toThrow(PhysicalRollRequired);
    expect(c).toEqual(original);
    command.physicalRolls!.push({
      expression: attack.damageExpression,
      values: [5],
    });
    const result = execute(c, command);
    expect(attack.damageExpression).toBe("1d8+3");
    expect(result.event.rolls?.map((r) => r.total)).toEqual([17, 8, 3]);
    expect(result.event.detail).toContain("dano 11");
  });

  it("um ataque que falha não pede dano nem aceita dados excedentes", () => {
    const c = hero();
    equip(c, "espada-longa");
    const attack = calculate(c).attacks.find((a) => a.name === "Espada longa")!;
    const command: Command = {
      type: "attack",
      attackId: attack.id,
      target: "Orc",
      defense: 10,
      bonus: 0,
      extraDamage: "",
      physicalRolls: [
        { expression: `1d20+${attack.toHit.total}`, values: [1] },
      ],
    };
    expect(execute(c, command).event.rolls).toHaveLength(1);
    command.physicalRolls!.push({
      expression: attack.damageExpression,
      values: [5],
    });
    expect(() => execute(c, command)).toThrow("não pertencem");
  });

  it("só persiste após receber os dados e preserva os resultados no backup", async () => {
    const db = new CharacterDatabase(`physical-${crypto.randomUUID()}`);
    try {
      const c = await db.create(hero());
      const command: Command = {
        type: "roll",
        expression: "1d20+2",
        label: "Acrobacia",
      };
      await expect(db.dispatch(c.id, c.revision, command)).rejects.toThrow(
        PhysicalRollRequired,
      );
      expect(await db.characters.get(c.id)).toEqual(c);
      expect(await db.history.count()).toBe(1);
      await db.dispatch(c.id, c.revision, {
        ...command,
        physicalRolls: [{ expression: "1d20+2", values: [12] }],
      });
      const backup = parseBackup(
        JSON.stringify(await db.exportBackup()),
      ).backup;
      expect(
        backup.history.find((e) => e.title === "Acrobacia")?.rolls?.[0],
      ).toMatchObject({ total: 14, natural: 12 });
    } finally {
      await db.delete();
    }
  });
});
