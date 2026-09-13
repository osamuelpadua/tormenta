import Dexie, { type Table } from "dexie";
import { RULESET } from "../data/rules";
import { timestamp, uid, normalizeAmmunition } from "../domain/character";
import { execute, type Command } from "../domain/commands";
import type { Character, HistoryEvent } from "../domain/types";
import { BACKUP_SCHEMA, characterSchema, type Backup } from "./schema";

export class CharacterDatabase extends Dexie {
  characters!: Table<Character, string>;
  history!: Table<HistoryEvent, string>;
  commands!: Table<{ id: string; characterId: string; at: string }, string>;
  settings!: Table<{ key: string; value: string }, string>;
  recovery!: Table<
    {
      id: string;
      at: string;
      reason: string;
      characters: Character[];
      history: HistoryEvent[];
    },
    string
  >;
  constructor(name = "tormenta-personagens") {
    super(name);
    this.version(1).stores({
      characters: "id, name, updatedAt",
      history: "id, characterId, at",
      settings: "key",
    });
    this.version(2)
      .stores({
        characters: "id, name, updatedAt",
        history: "id, characterId, at",
        settings: "key",
        commands: "id, characterId",
        recovery: "id, at",
      })
      .upgrade(async (tx) => {
        const characters = await tx.table("characters").toArray();
        const history = await tx.table("history").toArray();
        if (characters.length)
          await tx.table("recovery").add({
            id: uid(),
            at: timestamp(),
            reason: "Antes da migração local para versão 2",
            characters,
            history,
          });
      });
    this.version(3)
      .stores({
        characters: "id, name, updatedAt",
        history: "id, characterId, at",
        settings: "key",
        commands: "id, characterId",
        recovery: "id, at",
      })
      .upgrade(async (tx) => {
        const characters = await tx.table("characters").toArray(),
          history = await tx.table("history").toArray();
        if (characters.length)
          await tx.table("recovery").add({
            id: uid(),
            at: timestamp(),
            reason: "Antes da migração de munição para unidades (versão 3)",
            characters,
            history,
          });
        await tx
          .table("characters")
          .toCollection()
          .modify((c: Character) => {
            c.inventory.forEach(normalizeAmmunition);
          });
        await tx
          .table("history")
          .toCollection()
          .modify((e: HistoryEvent) => {
            e.before?.inventory.forEach(normalizeAmmunition);
          });
      });
  }
  async create(character: Character) {
    const c = characterSchema.parse(character) as Character;
    await this.transaction("rw", this.characters, this.history, async () => {
      await this.characters.add(c);
      await this.history.add({
        id: uid(),
        characterId: c.id,
        at: timestamp(),
        title: "Personagem criado",
        detail: `Nível ${c.levels.length}`,
        kind: "create",
        round: 1,
      });
    });
    return c;
  }
  async dispatch(
    id: string,
    revision: number,
    command: Command,
    commandId = uid(),
  ) {
    return this.transaction(
      "rw",
      this.characters,
      this.history,
      this.commands,
      async () => {
        const key = `${id}:${commandId}`;
        const c = await this.characters.get(id);
        if (!c) throw new Error("Personagem não encontrado.");
        if (await this.commands.get(key)) return c;
        if (c.revision !== revision)
          throw new Error(
            "A ficha mudou em outra operação ou aba. Confira os dados atualizados e tente novamente.",
          );
        const result = execute(c, {
          ...command,
          physicalRolls: command.physicalRolls ?? [],
        });
        const next = characterSchema.parse(result.character) as Character;
        await this.characters.put(next);
        await this.history.add(result.event);
        await this.commands.add({ id: key, characterId: id, at: timestamp() });
        return next;
      },
    );
  }
  async undo(id: string, revision: number) {
    return this.transaction("rw", this.characters, this.history, async () => {
      const c = await this.characters.get(id);
      if (!c || c.revision !== revision)
        throw new Error("A ficha mudou; confira antes de desfazer.");
      const events = await this.history
        .where("characterId")
        .equals(id)
        .sortBy("at");
      const last = events
        .reverse()
        .find((e) => e.before && !e.undone && e.kind !== "undo");
      if (!last?.before) throw new Error("Não há operação para desfazer.");
      const restored = structuredClone(last.before);
      restored.revision = c.revision + 1;
      restored.updatedAt = timestamp();
      await this.characters.put(restored);
      await this.history.update(last.id, { undone: true });
      await this.history.add({
        id: uid(),
        characterId: id,
        at: timestamp(),
        title: `Desfeito: ${last.title}`,
        detail:
          "A operação completa foi revertida. O registro original foi mantido.",
        kind: "undo",
        round: c.combat.round,
      });
      return restored;
    });
  }
  async exportBackup(ids?: string[]): Promise<Backup> {
    return this.transaction("r", this.characters, this.history, async () => {
      const characters = ids
        ? (await this.characters.bulkGet(ids)).filter(
            (c): c is Character => !!c,
          )
        : await this.characters.toArray();
      if (!characters.length)
        throw new Error("Crie um personagem antes de exportar.");
      const history = await this.history
        .where("characterId")
        .anyOf(characters.map((c) => c.id))
        .toArray();
      return {
        format: "tormenta-personagens",
        schema: BACKUP_SCHEMA,
        catalog: RULESET,
        exportedAt: timestamp(),
        characters,
        history,
      };
    });
  }
  async importBackup(backup: Backup) {
    return this.transaction("rw", this.characters, this.history, async () => {
      const mapping = new Map<string, string>();
      const added: Character[] = [];
      for (const old of backup.characters) {
        const c = structuredClone(old);
        const exists = await this.characters.get(c.id);
        const nextId = uid();
        mapping.set(c.id, nextId);
        c.id = nextId;
        if (exists) c.name = `${c.name} (cópia)`;
        c.revision = 0;
        c.createdAt = timestamp();
        c.updatedAt = timestamp();
        await this.characters.add(c);
        added.push(c);
      }
      for (const old of backup.history) {
        const e = structuredClone(old);
        e.id = uid();
        e.characterId = mapping.get(e.characterId)!;
        if (e.before) {
          e.before.id = e.characterId;
          e.before.name = added.find((c) => c.id === e.characterId)!.name;
        }
        await this.history.add(e);
      }
      for (const c of added)
        await this.history.add({
          id: uid(),
          characterId: c.id,
          at: timestamp(),
          title: "Backup restaurado",
          detail:
            "Importado como novo personagem; dados anteriores preservados.",
          kind: "import",
          round: c.combat.round,
        });
      return added;
    });
  }
  async archive(id: string) {
    await this.transaction(
      "rw",
      this.characters,
      this.history,
      this.recovery,
      async () => {
        const c = await this.characters.get(id);
        if (!c) return;
        const history = await this.history
          .where("characterId")
          .equals(id)
          .toArray();
        await this.recovery.add({
          id: uid(),
          at: timestamp(),
          reason: `Personagem arquivado: ${c.name}`,
          characters: [c],
          history,
        });
        await this.characters.delete(id);
        await this.history.where("characterId").equals(id).delete();
      },
    );
  }
}
export const db = new CharacterDatabase();
export function downloadBackup(backup: Backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tormenta-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
