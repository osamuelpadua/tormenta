import "fake-indexeddb/auto";
import { afterAll, describe, expect, it } from "vitest";
import { CharacterDatabase } from "../src/storage/database";
import { SupabaseBackend } from "../src/sync/supabase-backend";
import { SyncEngine } from "../src/sync/sync-engine";
import type { Command } from "../src/domain/commands";
import { hero } from "./fixtures";
import {
  ensureCampaignAsset,
  removeCampaignMap,
  saveCampaignPlace,
  shareMapToCampaign,
} from "../src/sync/campaign-maps";

const url = process.env.SB_URL;
const key = process.env.SB_KEY;
const password = process.env.TEST_USER_PASSWORD ?? "";
const opened: CharacterDatabase[] = [];
afterAll(async () => {
  for (const db of opened) await db.delete();
});
const spend = (amount: number): Command => ({
  type: "resource",
  kind: "hp",
  amount,
  mode: "spend",
  reason: "Teste real",
});
async function device(email: string) {
  const backend = new SupabaseBackend(url!, key!);
  const session = await backend.signIn(email, password);
  const db = new CharacterDatabase(`live-${crypto.randomUUID()}`);
  opened.push(db);
  const engine = new SyncEngine(db, backend);
  engine.status = { ...engine.status, session, state: "idle" };
  return { backend, db, engine, session };
}
async function until(condition: () => boolean, ms = 15000) {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end)
    await new Promise((r) => setTimeout(r, 200));
  return condition();
}

describe.skipIf(!url || !key)("Supabase real", () => {
  it("campanha, efeito do mestre em tempo real e conflito offline", async () => {
    const master = await device("tormenta-teste-mestre@example.com");
    const player = await device("tormenta-teste-jogador@example.com");
    expect(master.session.name).toBe("Mestre de Teste");

    let notified = 0;
    const stop = player.backend.subscribe(() => notified++);

    const campaignId = await master.engine.createCampaign("Mesa real", "");
    const code = (await master.db.campaigns.get(campaignId))!.inviteCode;
    await player.engine.joinCampaign(code.toLowerCase());
    const c = hero();
    await player.db.create(c);
    await player.engine.linkCharacters([c.id]);
    await player.engine.setCharacterCampaign(c.id, campaignId);
    expect(await player.db.outbox.count()).toBe(0);

    await master.engine.sync();
    const [campaign] = await master.db.campaigns.toArray();
    expect(campaign.members.map((m) => m.name).sort()).toEqual([
      "Jogadora de Teste",
      "Mestre de Teste",
    ]);
    const seat = await master.db.party.get(c.id);
    expect(seat?.ownerName).toBe("Jogadora de Teste");

    // Realtime: the player's client hears the master's change.
    await new Promise((r) => setTimeout(r, 2500));
    const before = notified;
    const event = await master.engine.applyToParty(c.id, spend(6));
    expect(await until(() => notified > before)).toBe(true);
    await player.engine.sync();
    expect((await player.db.characters.get(c.id))!.hp).toBe(c.hp - 6);
    expect((await player.db.history.get(event.id))?.author).toBe(
      "Mestre de Teste",
    );

    // Offline change on the player's side meets a newer master change.
    const current = (await player.db.characters.get(c.id))!;
    await player.db.dispatch(current.id, current.revision, spend(2));
    await master.engine.sync();
    await master.engine.applyToParty(c.id, spend(3));
    await player.engine.sync();
    expect((await player.db.characters.get(c.id))!.hp).toBe(c.hp - 11);
    await master.engine.sync();
    expect((await master.db.party.get(c.id))!.data.hp).toBe(c.hp - 11);

    // A second device of the player receives everything, history included.
    const laptop = await device("tormenta-teste-jogador@example.com");
    await laptop.engine.sync();
    expect((await laptop.db.characters.get(c.id))!.hp).toBe(c.hp - 11);
    expect(await laptop.db.history.count()).toBe(
      await player.db.history.count(),
    );

    // Notes: the journal is shared; secrets stay with the master.
    await master.backend.saveNote({
      campaignId,
      title: "Segredo",
      body: "x",
      visibility: "master",
    });
    await master.backend.saveNote({
      campaignId,
      title: "Sessão 1",
      body: "y",
      visibility: "all",
    });
    expect(
      (await player.backend.listNotes(campaignId)).map((n) => n.title),
    ).toEqual(["Sessão 1"]);

    // Campaign map: uploaded image, secret place, reveal, download, cleanup.
    const assetId = crypto.randomUUID();
    await master.db.mapAssets.add({
      id: assetId,
      kind: "local",
      width: 300,
      height: 200,
      tileSize: 512,
      maxZoom: 0,
      thumbnail: new Blob(["thumb"], { type: "image/webp" }),
    });
    await master.db.mapTiles.add({
      assetId,
      z: 0,
      x: 0,
      y: 0,
      blob: new Blob(["tile"], { type: "image/webp" }),
    });
    await master.db.atlasMaps.add({
      id: "masmorra",
      name: "Masmorra",
      notes: "",
      assetId,
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await master.db.mapLocations.add({
      id: crypto.randomUUID(),
      mapId: "masmorra",
      name: "Cripta",
      categoryId: "interest",
      iconId: "treasure-map",
      x: 0.4,
      y: 0.6,
      notes: "",
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const mapId = await shareMapToCampaign(
      master.db,
      master.backend,
      campaignId,
      (await master.db.atlasMaps.get("masmorra"))!,
      { places: true, secret: true },
    );
    await player.engine.sync();
    expect(await player.db.campaignLocations.count()).toBe(0);
    const cached = (await player.db.campaignMaps.get(mapId))!;
    await ensureCampaignAsset(player.db, player.backend, cached);
    const tile = await player.db.mapTiles.get([assetId, 0, 0, 0]);
    expect(await tile!.blob.text()).toBe("tile");
    await master.engine.sync();
    const [crypt] = await master.db.campaignLocations.toArray();
    await saveCampaignPlace(
      master.db,
      master.backend,
      master.session.userId,
      { ...crypt, secret: false },
      crypt,
    );
    const tavern = await saveCampaignPlace(
      player.db,
      player.backend,
      player.session.userId,
      {
        mapId,
        name: "Taverna",
        categoryId: "interest",
        iconId: "treasure-map",
        x: 0.5,
        y: 0.5,
        notes: "",
        secret: false,
      },
    );
    await player.engine.sync();
    expect(
      (await player.db.campaignLocations.toArray()).map((l) => l.name).sort(),
    ).toEqual(["Cripta", "Taverna"]);
    await master.engine.sync();
    expect(
      (await master.db.campaignLocations.get(tavern.id))?.createdByName,
    ).toBe("Jogadora de Teste");
    await removeCampaignMap(
      master.db,
      master.backend,
      (await master.db.campaignMaps.get(mapId))!,
    );
    // Removal is checked in storage.objects afterwards: the CDN may keep
    // serving a deleted file for a while, so a download proves nothing.

    // Experience from the master.
    await master.engine.sync();
    await master.engine.applyToParty(c.id, {
      type: "xp",
      amount: 300,
      reason: "Teste real",
    });
    await player.engine.sync();
    expect((await player.db.characters.get(c.id))!.xp).toBe(300);

    await player.engine.leaveCampaign(campaignId);
    await master.engine.sync();
    expect(await master.db.party.get(c.id)).toBeUndefined();
    stop();
    await master.backend.signOut();
    await player.backend.signOut();
    await laptop.backend.signOut();
  }, 90000);
});
