import { execute, type Command } from "../domain/commands";
import { timestamp } from "../domain/character";
import type { Character, HistoryEvent } from "../domain/types";
import type { CharacterDatabase } from "../storage/database";
import { characterSchema } from "../storage/schema";
import type {
  OutboxEntry,
  PartyCharacter,
  RemoteBackend,
  RemoteCharacter,
  Role,
  Session,
} from "./types";

export interface SyncStatus {
  session: Session | null;
  // "ready" before the first session check completes.
  state: "ready" | "signed-out" | "idle" | "syncing" | "offline" | "error";
  lastSync?: string;
  error?: string;
  notices: string[];
}
const eventIdsOf = (entry: OutboxEntry) =>
  entry.op.kind === "command"
    ? [entry.op.eventId]
    : entry.op.kind === "undo"
      ? entry.op.eventIds
      : [];
const describe = (entry: OutboxEntry) =>
  entry.op.kind === "undo"
    ? "Desfazer"
    : entry.op.kind === "command"
      ? entry.op.command.type
      : entry.op.kind;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

// Reapplies a whole-sheet edit made on `base` onto a newer `current` state,
// taking only the top-level fields the edit actually changed.
export function mergeEdit(
  base: Character,
  edited: Character,
  current: Character,
): Character {
  const merged = structuredClone(current) as unknown as Record<string, unknown>;
  const from = base as unknown as Record<string, unknown>;
  const to = edited as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (key === "revision" || key === "updatedAt") continue;
    if (same(from[key], to[key])) continue;
    if (key in to) merged[key] = structuredClone(to[key]);
    else delete merged[key];
  }
  return merged as unknown as Character;
}
const offline = (error: unknown) =>
  (typeof navigator !== "undefined" && navigator.onLine === false) ||
  /fetch|network|Failed to fetch|NetworkError/i.test(String(error));

// Keeps IndexedDB, which the interface reads, in step with the server.
// Local writes go to the outbox; pushes use optimistic revisions, and a
// conflict replays the pending commands on top of the server state.
export class SyncEngine {
  status: SyncStatus = { session: null, state: "ready", notices: [] };
  private listeners = new Set<() => void>();
  private running?: Promise<void>;
  private again = false;
  private timer?: ReturnType<typeof setTimeout>;
  private cleanup: (() => void)[] = [];
  constructor(
    readonly db: CharacterDatabase,
    readonly backend: RemoteBackend,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  getStatus = () => this.status;
  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener();
  }
  private notice(text: string) {
    this.set({ notices: [...this.status.notices, text] });
  }
  dismissNotices() {
    this.set({ notices: [] });
  }
  get accountId() {
    return this.status.session?.userId ?? null;
  }

  async start() {
    // The interface waits for this check; a failure must not leave it waiting.
    const session = await this.backend.getSession().catch(() => null);
    this.set({ session, state: session ? "idle" : "signed-out" });
    this.cleanup.push(
      this.backend.onSessionChange((next) => {
        const changed = next?.userId !== this.accountId;
        this.set({
          session: next,
          state: next ? "idle" : "signed-out",
          ...(changed ? { error: undefined, notices: [] } : {}),
        });
        if (next) this.schedule(0);
      }),
      this.backend.subscribe(() => this.schedule(300)),
    );
    // Local writes are picked up after their transaction commits.
    const onOutbox = () => void this.schedule(800);
    this.db.outbox.hook("creating", onOutbox);
    this.cleanup.push(() =>
      this.db.outbox.hook("creating").unsubscribe(onOutbox),
    );
    if (typeof window !== "undefined") {
      const wake = () => this.schedule(0);
      const visible = () => {
        if (document.visibilityState === "visible") wake();
      };
      window.addEventListener("online", wake);
      document.addEventListener("visibilitychange", visible);
      const interval = setInterval(wake, 60_000);
      this.cleanup.push(() => {
        window.removeEventListener("online", wake);
        document.removeEventListener("visibilitychange", visible);
        clearInterval(interval);
      });
    }
    if (session) await this.sync();
  }
  stop() {
    clearTimeout(this.timer);
    for (const fn of this.cleanup.splice(0)) fn();
  }
  schedule(delay = 400) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync().catch(() => {}), delay);
  }
  // Single flight: a request during a run triggers one more run afterwards.
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.run();
        } while (this.again);
      } finally {
        this.running = undefined;
      }
    })();
    return this.running;
  }
  private async run() {
    const accountId = this.accountId;
    if (!accountId) return;
    this.set({ state: "syncing" });
    try {
      await this.push(accountId);
      await this.refreshCampaigns(accountId);
      await this.pull(accountId);
      this.set({ state: "idle", lastSync: timestamp(), error: undefined });
    } catch (error) {
      this.set({
        state: offline(error) ? "offline" : "error",
        error: (error as Error).message,
      });
      throw error;
    }
  }

  private async push(accountId: string) {
    const linked = await this.db.characterSync
      .where("accountId")
      .equals(accountId)
      .primaryKeys();
    const pending = new Set(
      (await this.db.outbox.toArray()).map((e) => e.characterId),
    );
    for (const id of linked) if (pending.has(id)) await this.pushCharacter(id);
  }
  private async pushCharacter(id: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const sync = await this.db.characterSync.get(id);
      const entries = await this.db.outbox
        .where("characterId")
        .equals(id)
        .sortBy("seq");
      if (!sync || !entries.length) return;
      const seqs = entries.map((e) => e.seq!);
      if (entries.some((e) => e.op.kind === "delete")) {
        if (sync.syncedRevision !== null)
          await this.backend.deleteCharacter(id);
        await this.db.transaction(
          "rw",
          this.db.outbox,
          this.db.characterSync,
          async () => {
            await this.db.outbox.bulkDelete(seqs);
            await this.db.characterSync.delete(id);
          },
        );
        return;
      }
      const character = await this.db.characters.get(id);
      if (!character) {
        await this.db.outbox.bulkDelete(seqs);
        return;
      }
      const events = (
        sync.syncedRevision === null
          ? await this.db.history.where("characterId").equals(id).toArray()
          : await this.db.history.bulkGet(entries.flatMap(eventIdsOf))
      ).filter((e): e is HistoryEvent => !!e);
      const result = await this.backend.saveCharacter({
        character,
        expectedRevision: sync.syncedRevision,
        events,
      });
      if (result.status === "ok") {
        await this.db.transaction(
          "rw",
          this.db.outbox,
          this.db.characterSync,
          async () => {
            await this.db.outbox.bulkDelete(seqs);
            await this.db.characterSync.update(id, {
              syncedRevision: character.revision,
            });
          },
        );
        continue;
      }
      if (result.status === "deleted") {
        await this.removeLocal(id, "Ficha excluída em outro dispositivo");
        return;
      }
      await this.rebase(id, result.character, entries);
    }
  }
  private async rebase(
    id: string,
    server: RemoteCharacter,
    entries: OutboxEntry[],
  ) {
    const remoteEvents = await this.backend.characterEvents(id);
    const applied = new Set(remoteEvents.map((e) => e.id));
    let state = server.data;
    const kept: OutboxEntry[] = [];
    const rebased: HistoryEvent[] = [];
    const dropped: string[] = [];
    for (const entry of entries) {
      if (entry.op.kind !== "command") {
        if (entry.op.kind === "undo") dropped.push(describe(entry));
        continue;
      }
      // Already on the server: the previous upload succeeded but its
      // response was lost.
      if (applied.has(entry.op.eventId)) continue;
      try {
        let command = entry.op.command;
        if (
          (command.type === "edit" || command.type === "level") &&
          entry.op.base
        )
          command = {
            ...command,
            character: mergeEdit(entry.op.base, command.character, state),
          };
        const result = execute(state, command);
        result.event.id = entry.op.eventId;
        kept.push({
          characterId: id,
          at: entry.at,
          op: {
            kind: "command",
            command,
            eventId: entry.op.eventId,
            ...(entry.op.base ? { base: state } : {}),
          },
        });
        state = characterSchema.parse(result.character) as Character;
        rebased.push(result.event);
      } catch {
        dropped.push(describe(entry));
      }
    }
    const seqs = new Set(entries.map((e) => e.seq!));
    const unsynced = entries.flatMap(eventIdsOf);
    await this.db.transaction(
      "rw",
      [
        this.db.characters,
        this.db.history,
        this.db.outbox,
        this.db.characterSync,
        this.db.recovery,
      ],
      async () => {
        const current = await this.db.outbox
          .where("characterId")
          .equals(id)
          .toArray();
        // A new local change arrived meanwhile; the next attempt includes it.
        if (current.some((e) => !seqs.has(e.seq!))) return;
        const local = await this.db.characters.get(id);
        if (!local) return;
        if (dropped.length) {
          await this.db.recovery.add({
            id: crypto.randomUUID(),
            at: timestamp(),
            reason: `Conflito de sincronização: ${local.name}`,
            characters: [local],
            history: await this.db.history
              .where("characterId")
              .equals(id)
              .toArray(),
          });
        }
        await this.db.characters.put(state);
        await this.db.history.bulkDelete(unsynced);
        await this.db.history.bulkPut(remoteEvents.map((e) => e.data));
        await this.db.history.bulkPut(rebased);
        await this.db.outbox.bulkDelete([...seqs]);
        await this.db.outbox.bulkAdd(kept);
        await this.db.characterSync.update(id, {
          syncedRevision: server.revision,
          campaignId: server.campaignId,
        });
      },
    );
    if (dropped.length)
      this.notice(
        `${server.data.name} mudou em outro lugar enquanto você estava offline. ${dropped.length} alteração(ões) não puderam ser reaplicadas; uma cópia anterior está em Backups → Recuperação local.`,
      );
  }
  private async removeLocal(id: string, reason: string) {
    await this.db.transaction(
      "rw",
      [
        this.db.characters,
        this.db.history,
        this.db.outbox,
        this.db.characterSync,
        this.db.recovery,
      ],
      async () => {
        const local = await this.db.characters.get(id);
        if (local)
          await this.db.recovery.add({
            id: crypto.randomUUID(),
            at: timestamp(),
            reason: `${reason}: ${local.name}`,
            characters: [local],
            history: await this.db.history
              .where("characterId")
              .equals(id)
              .toArray(),
          });
        await this.db.characters.delete(id);
        await this.db.history.where("characterId").equals(id).delete();
        await this.db.outbox.where("characterId").equals(id).delete();
        await this.db.characterSync.delete(id);
      },
    );
  }

  private async pull(accountId: string) {
    const key = `sync-cursor:${accountId}`;
    const cursor = (await this.db.settings.get(key))?.value ?? null;
    // Overlap absorbs transactions that committed out of timestamp order.
    const since = cursor
      ? new Date(Date.parse(cursor) - 30_000).toISOString()
      : null;
    const result = await this.backend.pull(since);
    const deleted: string[] = [];
    await this.db.transaction(
      "rw",
      [
        this.db.characters,
        this.db.history,
        this.db.outbox,
        this.db.characterSync,
        this.db.party,
        this.db.settings,
      ],
      async () => {
        const incoming = new Map<string, HistoryEvent[]>();
        for (const e of result.events)
          incoming.set(e.characterId, [
            ...(incoming.get(e.characterId) ?? []),
            e.data,
          ]);
        for (const remote of result.characters) {
          if (remote.ownerId !== accountId) {
            if (remote.deleted || !remote.campaignId)
              await this.db.party.delete(remote.id);
            else await this.db.party.put({ ...remote, accountId });
            continue;
          }
          const sync = await this.db.characterSync.get(remote.id);
          if (sync && sync.accountId !== accountId) continue;
          if (remote.deleted) {
            if (sync) deleted.push(remote.id);
            continue;
          }
          const pending = await this.db.outbox
            .where("characterId")
            .equals(remote.id)
            .count();
          // The push reconciles characters with local changes.
          if (pending) {
            await this.db.characterSync.update(remote.id, {
              campaignId: remote.campaignId,
            });
            continue;
          }
          const local = await this.db.characters.get(remote.id);
          if (!local || local.revision !== remote.revision)
            await this.db.characters.put(
              characterSchema.parse(remote.data) as Character,
            );
          await this.db.characterSync.put({
            id: remote.id,
            accountId,
            campaignId: remote.campaignId,
            syncedRevision: remote.revision,
          });
          await this.db.history.bulkPut(incoming.get(remote.id) ?? []);
          incoming.delete(remote.id);
        }
        // Events changed without a character update (an undone flag, say).
        for (const [characterId, events] of incoming) {
          const sync = await this.db.characterSync.get(characterId);
          const pending = await this.db.outbox
            .where("characterId")
            .equals(characterId)
            .count();
          if (sync?.accountId === accountId && !pending)
            await this.db.history.bulkPut(events);
        }
        const visible = new Set(result.visibleIds);
        await this.db.party
          .where("accountId")
          .equals(accountId)
          .filter((p) => !visible.has(p.id))
          .delete();
        if (result.cursor && (!cursor || result.cursor > cursor))
          await this.db.settings.put({ key, value: result.cursor });
      },
    );
    for (const id of deleted)
      await this.removeLocal(id, "Ficha excluída em outro dispositivo");
  }
  private async refreshCampaigns(accountId: string) {
    const campaigns = await this.backend.listCampaigns();
    await this.db.transaction(
      "rw",
      this.db.campaigns,
      this.db.party,
      async () => {
        await this.db.campaigns.where("accountId").equals(accountId).delete();
        await this.db.campaigns.bulkPut(
          campaigns.map((c) => ({ ...c, accountId })),
        );
        const ids = new Set(campaigns.map((c) => c.id));
        await this.db.party
          .where("accountId")
          .equals(accountId)
          .filter((p) => !p.campaignId || !ids.has(p.campaignId))
          .delete();
      },
    );
  }

  // Links local-only characters to the signed-in account and uploads them.
  async linkCharacters(ids: string[]) {
    const accountId = this.accountId;
    if (!accountId) throw new Error("Entre na sua conta para continuar.");
    await this.db.transaction(
      "rw",
      this.db.characterSync,
      this.db.outbox,
      async () => {
        for (const id of ids) {
          if (await this.db.characterSync.get(id)) continue;
          await this.db.characterSync.put({
            id,
            accountId,
            campaignId: null,
            syncedRevision: null,
          });
          await this.db.outbox.add({
            characterId: id,
            at: timestamp(),
            op: { kind: "create" },
          });
        }
      },
    );
    await this.sync();
  }
  async setCharacterCampaign(id: string, campaignId: string | null) {
    const sync = await this.db.characterSync.get(id);
    if (!sync || sync.accountId !== this.accountId)
      throw new Error("Envie o personagem para a sua conta primeiro.");
    if (sync.syncedRevision === null) await this.pushCharacter(id);
    await this.backend.setCharacterCampaign(id, campaignId);
    await this.db.characterSync.update(id, { campaignId });
    await this.sync();
  }
  // A master's change to another member's sheet. Online only: the server
  // accepts it only on top of the revision the master is looking at.
  async applyToParty(characterId: string, command: Command) {
    const row = await this.db.party.get(characterId);
    const session = this.status.session;
    if (!row || !session) throw new Error("Ficha indisponível.");
    const result = execute(row.data, {
      ...command,
      physicalRolls: command.physicalRolls ?? [],
    });
    result.event.author = session.name;
    const next = characterSchema.parse(result.character) as Character;
    const saved = await this.backend.saveCharacter({
      character: next,
      expectedRevision: row.revision,
      events: [result.event],
    });
    if (saved.status === "deleted") {
      await this.db.party.delete(characterId);
      throw new Error("Esta ficha foi removida pelo jogador.");
    }
    if (saved.status === "conflict") {
      await this.db.party.put({ ...saved.character, accountId: row.accountId });
      throw new Error(
        "A ficha mudou enquanto você aplicava o efeito. Confira os valores atualizados e tente de novo.",
      );
    }
    const updated: PartyCharacter = {
      ...row,
      data: next,
      revision: next.revision,
      updatedAt: timestamp(),
    };
    await this.db.party.put(updated);
    return result.event;
  }

  // Campaign operations refresh the local cache right away.
  private async after<T>(task: Promise<T>) {
    const value = await task;
    await this.sync();
    return value;
  }
  createCampaign(name: string, description: string) {
    return this.after(this.backend.createCampaign(name, description));
  }
  updateCampaign(id: string, name: string, description: string) {
    return this.after(this.backend.updateCampaign(id, name, description));
  }
  joinCampaign(code: string) {
    return this.after(this.backend.joinCampaign(code));
  }
  leaveCampaign(id: string) {
    return this.after(this.backend.leaveCampaign(id));
  }
  removeMember(campaignId: string, userId: string) {
    return this.after(this.backend.removeMember(campaignId, userId));
  }
  setMemberRole(campaignId: string, userId: string, role: Role) {
    return this.after(this.backend.setMemberRole(campaignId, userId, role));
  }
  regenerateInvite(campaignId: string) {
    return this.after(this.backend.regenerateInvite(campaignId));
  }
  async signOut() {
    await this.backend.signOut();
  }
}
