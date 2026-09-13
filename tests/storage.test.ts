import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { CharacterDatabase } from "../src/storage/database";
import { parseBackup } from "../src/storage/schema";
import { hero } from "./fixtures";
import Dexie from "dexie";
import { ITEM_TEMPLATES } from "../src/domain/character";
let db: CharacterDatabase;
beforeEach(() => {
  db = new CharacterDatabase(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});
describe("persistência transacional e backups", () => {
  it("abre uma base nova com Budrik antes da primeira consulta", async () => {
    db.on("ready", () => db.initializeExampleCharacter());
    const [c] = await db.characters.toArray();
    expect(c).toMatchObject({
      name: "Budrik",
      raceId: "anao",
      hp: 69,
      mp: 12,
    });
    expect(c.levels).toHaveLength(6);
    expect(c.inventory.some((item) => item.name === "Marreta certeira")).toBe(
      true,
    );
    expect((await db.exportBackup()).history.length).toBeGreaterThan(0);
  });
  it("duas abas adicionam apenas um exemplo e preservam edições ao reabrir", async () => {
    const other = new CharacterDatabase(db.name);
    try {
      await Promise.all([
        db.initializeExampleCharacter(),
        other.initializeExampleCharacter(),
      ]);
      expect(await db.characters.count()).toBe(1);
      const [c] = await db.characters.toArray();
      await db.dispatch(c.id, c.revision, {
        type: "resource",
        kind: "mp",
        amount: 1,
        mode: "spend",
        reason: "Habilidade",
      });
      const backup = await db.exportBackup();
      db.close();
      await db.open();
      await db.initializeExampleCharacter();
      expect((await db.exportBackup()).characters).toEqual(backup.characters);
      expect((await db.exportBackup()).history).toEqual(backup.history);
      expect((await db.characters.get(c.id))!.mp).toBe(11);
    } finally {
      other.close();
    }
  });
  it("preserva uma ficha existente e não cria o exemplo após arquivá-la", async () => {
    const c = hero();
    await db.create(c);
    const before = await db.exportBackup();
    await db.initializeExampleCharacter();
    const after = await db.exportBackup();
    expect(after.characters).toEqual(before.characters);
    expect(after.history).toEqual(before.history);
    await db.archive(c.id);
    await db.initializeExampleCharacter();
    expect(await db.characters.count()).toBe(0);
  });
  it("não recria Budrik depois que o exemplo é arquivado", async () => {
    await db.initializeExampleCharacter();
    const [c] = await db.characters.toArray();
    await db.archive(c.id);
    db.close();
    await db.open();
    await db.initializeExampleCharacter();
    expect(await db.characters.count()).toBe(0);
    expect((await db.recovery.toArray())[0].characters[0].id).toBe(c.id);
  });
  it("respeita fichas arquivadas antes da introdução do exemplo", async () => {
    const c = hero();
    await db.create(c);
    await db.archive(c.id);
    const recovery = await db.recovery.toArray();
    await db.initializeExampleCharacter();
    expect(await db.characters.count()).toBe(0);
    expect(await db.recovery.toArray()).toEqual(recovery);
  });
  it("migra pacotes de munição mantendo o estado anterior na recuperação", async () => {
    const legacy = new Dexie(db.name);
    legacy.version(2).stores({
      characters: "id, name, updatedAt",
      history: "id, characterId, at",
      settings: "key",
      commands: "id, characterId",
      recovery: "id, at",
    });
    const c = hero();
    c.inventory.push(
      structuredClone(ITEM_TEMPLATES.find((i) => i.id === "flechas-20")!),
    );
    await legacy.table("characters").add(c);
    legacy.close();
    await db.open();
    expect((await db.characters.get(c.id))!.inventory[0].quantity).toBe(20);
    expect(
      (await db.recovery.toArray())[0].characters[0].inventory[0].quantity,
    ).toBe(1);
  });
  it("prévia converte munição de backup antigo e não converte novamente", async () => {
    const c = hero();
    c.inventory.push(
      structuredClone(ITEM_TEMPLATES.find((i) => i.id === "flechas-20")!),
    );
    await db.create(c);
    const old = await db.exportBackup(),
      first = parseBackup(JSON.stringify(old));
    expect(first.warnings.join(" ")).toContain("pacotes");
    expect(first.backup.characters[0].inventory[0].quantity).toBe(20);
    const second = parseBackup(JSON.stringify(first.backup));
    expect(second.backup.characters[0].inventory[0].quantity).toBe(20);
  });
  it("grava recursos e histórico juntos, impedindo operação duplicada", async () => {
    const c = hero();
    await db.create(c);
    const command = {
      type: "resource",
      kind: "mp",
      amount: 1,
      mode: "spend",
      reason: "Habilidade",
    } as const;
    await Promise.all([
      db.dispatch(c.id, 0, command, "same"),
      db.dispatch(c.id, 0, command, "same"),
    ]);
    const saved = await db.characters.get(c.id);
    expect(saved!.mp).toBe(c.mp - 1);
    expect(saved!.revision).toBe(1);
    expect(await db.history.count()).toBe(2);
  });
  it("rejeita revisão antiga de outra aba", async () => {
    const c = hero();
    await db.create(c);
    const command = {
      type: "resource",
      kind: "mp",
      amount: 1,
      mode: "spend",
      reason: "Habilidade",
    } as const;
    await db.dispatch(c.id, 0, command);
    await expect(db.dispatch(c.id, 0, command)).rejects.toThrow("outra");
    expect((await db.characters.get(c.id))!.mp).toBe(c.mp - 1);
  });
  it("desfaz operação completa mantendo registro da correção", async () => {
    const c = hero();
    await db.create(c);
    await db.dispatch(c.id, 0, {
      type: "damage",
      input: { amount: 8, damageType: "corte" },
    });
    await db.undo(c.id, 1);
    const saved = await db.characters.get(c.id);
    expect(saved!.hp).toBe(c.hp);
    expect(saved!.revision).toBe(2);
    const events = await db.history.toArray();
    expect(events.some((e) => e.undone)).toBe(true);
    expect(events.some((e) => e.kind === "undo")).toBe(true);
  });
  it("restaura combate e efeitos como cópia sem alterar o original", async () => {
    const c = hero();
    await db.create(c);
    const next = await db.dispatch(c.id, 0, {
      type: "combatStart",
      initiative: 17,
    });
    await db.dispatch(c.id, next.revision, {
      type: "condition",
      condition: "abalado",
      duration: "3 rodadas",
      source: "Medo",
    });
    const backup = await db.exportBackup();
    const parsed = parseBackup(JSON.stringify(backup));
    const [copy] = await db.importBackup(parsed.backup);
    expect(copy.id).not.toBe(c.id);
    expect(copy.name).toBe("Aldren (cópia)");
    expect(copy.combat.active).toBe(true);
    expect(copy.effects[0].duration.remaining).toBe(3);
    expect(await db.characters.count()).toBe(2);
    const importedEvents = await db.history
      .where("characterId")
      .equals(copy.id)
      .toArray();
    for (const e of importedEvents)
      if (e.before) expect(e.before.id).toBe(copy.id);
  });
  it("backup inválido não altera o banco", async () => {
    await db.create(hero());
    const backup = await db.exportBackup();
    backup.characters[0].levels[0].classId = "classe-inventada";
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(
      "Classe desconhecida",
    );
    expect(await db.characters.count()).toBe(1);
  });
  it("rejeita NaN, estruturas ausentes e versão futura", async () => {
    await db.create(hero());
    const backup = await db.exportBackup();
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, schema: 999 })),
    ).toThrow("incompatível");
    expect(() => parseBackup('{"format":"tormenta-personagens"}')).toThrow(
      "incompatível",
    );
    backup.characters[0].mp = NaN;
    expect(() => parseBackup(JSON.stringify(backup))).toThrow("incompatível");
  });
  it("arquivamento mantém recuperação com histórico", async () => {
    const c = hero();
    await db.create(c);
    await db.archive(c.id);
    expect(await db.characters.count()).toBe(0);
    const [record] = await db.recovery.toArray();
    expect(record.characters[0].name).toBe(c.name);
    expect(record.history).toHaveLength(1);
  });
});
