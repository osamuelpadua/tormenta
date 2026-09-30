import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { CharacterDatabase } from "../src/storage/database";
import { MemoryBackend, MemoryServer } from "../src/sync/memory-backend";
import { mergeEdit, SyncEngine } from "../src/sync/sync-engine";
import type { Command } from "../src/domain/commands";
import { hero } from "./fixtures";

const opened: CharacterDatabase[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete();
});
// One device: its own IndexedDB, backend client and engine.
async function device(server: MemoryServer, email: string, name = email) {
  const db = new CharacterDatabase(`sync-${crypto.randomUUID()}`);
  opened.push(db);
  const backend = new MemoryBackend(server);
  if (server.state.accounts.some((a) => a.email === email))
    await backend.signIn(email, "segredo");
  else await backend.signUp(email, "segredo", name);
  const engine = new SyncEngine(db, backend);
  engine.status = {
    ...engine.status,
    session: await backend.getSession(),
    state: "idle",
  };
  return { db, backend, engine };
}
const spend = (amount: number): Command => ({
  type: "resource",
  kind: "hp",
  amount,
  mode: "spend",
  reason: "Teste",
});
async function withCharacter(d: Awaited<ReturnType<typeof device>>) {
  const c = hero();
  await d.db.create(c);
  await d.engine.linkCharacters([c.id]);
  return (await d.db.characters.get(c.id))!;
}

describe("migração local", () => {
  it("abre uma base da versão 4 preservando fichas e sem vinculá-las", async () => {
    const name = `v4-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(4).stores({
      characters: "id, name, updatedAt",
      history: "id, characterId, at",
      settings: "key",
      commands: "id, characterId",
      recovery: "id, at",
      atlasMaps: "id, name, updatedAt, assetId, &sourceKey",
      mapLocations: "id, mapId, [mapId+categoryId]",
      mapAssets: "id",
      mapTiles: "[assetId+z+x+y], assetId",
    });
    const c = hero();
    await old.table("characters").add(c);
    old.close();
    const db = new CharacterDatabase(name);
    opened.push(db);
    expect(await db.characters.get(c.id)).toEqual(c);
    expect(await db.characterSync.count()).toBe(0);
    await db.dispatch(c.id, c.revision, spend(1));
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("sincronização da conta", () => {
  it("envia fichas locais e as recupera em outro dispositivo com histórico", async () => {
    const server = new MemoryServer();
    const phone = await device(server, "ana@mesa.dev", "Ana");
    const c = await withCharacter(phone);
    await phone.db.dispatch(c.id, c.revision, spend(3));
    await phone.engine.sync();
    expect(await phone.db.outbox.count()).toBe(0);
    expect(server.state.characters[0].data.hp).toBe(c.hp - 3);

    const laptop = await device(server, "ana@mesa.dev");
    await laptop.engine.sync();
    const copy = await laptop.db.characters.get(c.id);
    expect(copy?.hp).toBe(c.hp - 3);
    expect(await laptop.db.history.count()).toBe(
      await phone.db.history.count(),
    );
  });

  it("mantém a ficha local sem conta e não a envia sem vínculo", async () => {
    const server = new MemoryServer();
    const d = await device(server, "bia@mesa.dev");
    const c = hero();
    await d.db.create(c);
    await d.db.dispatch(c.id, c.revision, spend(1));
    await d.engine.sync();
    expect(await d.db.outbox.count()).toBe(0);
    expect(server.state.characters).toHaveLength(0);
  });

  it("reaplica alterações offline sobre a versão mais nova do servidor", async () => {
    const server = new MemoryServer();
    const phone = await device(server, "caio@mesa.dev");
    const c = await withCharacter(phone);
    const laptop = await device(server, "caio@mesa.dev");
    await laptop.engine.sync();

    // Both change the sheet; the laptop reaches the server first.
    await phone.db.dispatch(c.id, c.revision, spend(2));
    const other = (await laptop.db.characters.get(c.id))!;
    await laptop.db.dispatch(other.id, other.revision, spend(5));
    await laptop.engine.sync();
    await phone.engine.sync();

    const merged = (await phone.db.characters.get(c.id))!;
    expect(merged.hp).toBe(c.hp - 7);
    expect(server.state.characters[0].data.hp).toBe(c.hp - 7);
    expect(await phone.db.outbox.count()).toBe(0);
    await laptop.engine.sync();
    expect((await laptop.db.characters.get(c.id))!.hp).toBe(c.hp - 7);
    const titles = (await laptop.db.history.toArray()).length;
    expect(titles).toBe(await phone.db.history.count());
  });

  it("não aplica duas vezes um envio cuja resposta se perdeu", async () => {
    const server = new MemoryServer();
    const d = await device(server, "davi@mesa.dev");
    const c = await withCharacter(d);
    await d.db.dispatch(c.id, c.revision, spend(4));
    // The server stores the change, but the device never hears back.
    const [entry] = await d.db.outbox.toArray();
    const sync = (await d.db.characterSync.get(c.id))!;
    const events = await d.db.history.bulkGet([
      (entry.op as { eventId: string }).eventId,
    ]);
    await d.backend.saveCharacter({
      character: (await d.db.characters.get(c.id))!,
      expectedRevision: sync.syncedRevision,
      events: events.filter((e) => !!e),
    });
    await d.engine.sync();
    expect((await d.db.characters.get(c.id))!.hp).toBe(c.hp - 4);
    expect(server.state.characters[0].data.hp).toBe(c.hp - 4);
  });

  it("guarda na recuperação um desfazer que não pode ser reaplicado", async () => {
    const server = new MemoryServer();
    const phone = await device(server, "eva@mesa.dev");
    const c = await withCharacter(phone);
    await phone.db.dispatch(c.id, c.revision, spend(1));
    await phone.engine.sync();
    const laptop = await device(server, "eva@mesa.dev");
    await laptop.engine.sync();

    const after = (await phone.db.characters.get(c.id))!;
    await phone.db.undo(after.id, after.revision);
    const other = (await laptop.db.characters.get(c.id))!;
    await laptop.db.dispatch(other.id, other.revision, spend(2));
    await laptop.engine.sync();
    await phone.engine.sync();

    expect((await phone.db.characters.get(c.id))!.hp).toBe(c.hp - 3);
    expect(await phone.db.recovery.count()).toBe(1);
    expect(phone.engine.status.notices).toHaveLength(1);
  });

  it("mescla uma edição offline apenas nos campos alterados", () => {
    const base = hero();
    const edited = { ...structuredClone(base), name: "Aldren, o Firme" };
    const current = { ...structuredClone(base), hp: base.hp - 9 };
    const merged = mergeEdit(base, edited, current);
    expect(merged.name).toBe("Aldren, o Firme");
    expect(merged.hp).toBe(base.hp - 9);
  });
});

describe("campanhas", () => {
  async function table() {
    const server = new MemoryServer();
    const master = await device(
      server,
      "mestre@mesa.dev",
      "Mestre Kallyadranoch",
    );
    const player = await device(server, "ana@mesa.dev", "Ana");
    const outsider = await device(server, "zed@mesa.dev", "Zed");
    const campaignId = await master.engine.createCampaign(
      "A Flecha de Fogo",
      "",
    );
    const code = server.state.campaigns[0].inviteCode;
    await player.engine.joinCampaign(code.toLowerCase());
    const c = await withCharacter(player);
    await player.engine.setCharacterCampaign(c.id, campaignId);
    await master.engine.sync();
    return { server, master, player, outsider, campaignId, c };
  }

  it("o mestre vê o grupo sem ter ficha e quem está fora não vê nada", async () => {
    const { master, outsider, campaignId, c } = await table();
    expect(await master.db.characters.count()).toBe(0);
    const party = await master.db.party.toArray();
    expect(party.map((p) => [p.id, p.ownerName, p.campaignId])).toEqual([
      [c.id, "Ana", campaignId],
    ]);
    const [campaign] = await master.db.campaigns.toArray();
    expect(campaign.role).toBe("master");
    expect(campaign.members.map((m) => m.name).sort()).toEqual([
      "Ana",
      "Mestre Kallyadranoch",
    ]);
    await outsider.engine.sync();
    expect(await outsider.db.party.count()).toBe(0);
  });

  it("o mestre aplica dano, o jogador recebe com autor e pode desfazer", async () => {
    const { master, player, c } = await table();
    const event = await master.engine.applyToParty(c.id, spend(6));
    expect(event.author).toBe("Mestre Kallyadranoch");
    expect((await master.db.party.get(c.id))!.data.hp).toBe(c.hp - 6);

    await player.engine.sync();
    const updated = (await player.db.characters.get(c.id))!;
    expect(updated.hp).toBe(c.hp - 6);
    const received = await player.db.history.get(event.id);
    expect(received?.author).toBe("Mestre Kallyadranoch");

    await player.db.undo(updated.id, updated.revision);
    await player.engine.sync();
    await master.engine.sync();
    expect((await master.db.party.get(c.id))!.data.hp).toBe(c.hp);
  });

  it("recusa o efeito do mestre sobre uma revisão antiga", async () => {
    const { master, player, c } = await table();
    const current = (await player.db.characters.get(c.id))!;
    await player.db.dispatch(current.id, current.revision, spend(1));
    await player.engine.sync();
    await expect(master.engine.applyToParty(c.id, spend(6))).rejects.toThrow(
      /mudou/,
    );
    // The master now sees the latest sheet and can apply again.
    await master.engine.applyToParty(c.id, spend(6));
    await player.engine.sync();
    expect((await player.db.characters.get(c.id))!.hp).toBe(c.hp - 7);
  });

  it("jogadores veem o grupo, mas não alteram a ficha de outro jogador", async () => {
    const { server, player, campaignId, c } = await table();
    const bruno = await device(server, "bruno@mesa.dev", "Bruno");
    await bruno.engine.joinCampaign(server.state.campaigns[0].inviteCode);
    await bruno.engine.sync();
    const peer = (await bruno.db.party.get(c.id))!;
    expect(peer.campaignId).toBe(campaignId);
    await expect(bruno.engine.applyToParty(c.id, spend(1))).rejects.toThrow(
      /não pode alterar/,
    );
    await player.engine.sync();
    expect((await player.db.characters.get(c.id))!.hp).toBe(c.hp);
  });

  it("remove do cache as fichas de quem sai da campanha", async () => {
    const { master, player, campaignId, c } = await table();
    await player.engine.leaveCampaign(campaignId);
    await master.engine.sync();
    expect(await master.db.party.get(c.id)).toBeUndefined();
    expect(await player.db.campaigns.count()).toBe(0);
    expect((await player.db.characterSync.get(c.id))!.campaignId).toBeNull();
  });

  it("exige outro mestre antes de o único mestre sair", async () => {
    const { master, player, campaignId } = await table();
    await expect(master.engine.leaveCampaign(campaignId)).rejects.toThrow(
      /Promova/,
    );
    const ana = player.engine.accountId!;
    await master.engine.setMemberRole(campaignId, ana, "master");
    await master.engine.leaveCampaign(campaignId);
    await player.engine.sync();
    const [campaign] = await player.db.campaigns.toArray();
    expect(campaign.role).toBe("master");
    expect(campaign.members).toHaveLength(1);
  });

  it("notas privadas ficam só com o mestre; o diário é do grupo", async () => {
    const { master, player, campaignId } = await table();
    await master.backend.saveNote({
      campaignId,
      title: "Segredo",
      body: "O vilão é o taverneiro.",
      visibility: "master",
    });
    await master.backend.saveNote({
      campaignId,
      title: "Sessão 1",
      body: "Chegamos a Valkaria.",
      visibility: "all",
    });
    expect(await master.backend.listNotes(campaignId)).toHaveLength(2);
    const visible = await player.backend.listNotes(campaignId);
    expect(visible.map((n) => n.title)).toEqual(["Sessão 1"]);
    await expect(
      player.backend.saveNote({
        campaignId,
        title: "x",
        body: "",
        visibility: "all",
      }),
    ).rejects.toThrow(/mestre/);
  });
});
