import {
  tileCoordinates,
  type AtlasMap,
  type MapAsset,
  type MapTile,
} from "../domain/maps";
import type { CharacterDatabase } from "../storage/database";
import { removeUnusedAsset } from "../storage/maps";
import {
  mapFilePath,
  type CachedCampaignLocation,
  type CachedCampaignMap,
  type CampaignLocation,
  type CampaignLocationInput,
  type RemoteBackend,
  type RemoteMapAsset,
} from "./types";

// Replaces the cached maps and places of the account's campaigns.
export async function refreshCampaignMaps(
  db: CharacterDatabase,
  backend: RemoteBackend,
  accountId: string,
) {
  const { maps, locations } = await backend.listCampaignMaps();
  const stale = await db.transaction(
    "rw",
    [db.campaignMaps, db.campaignLocations, db.mapAssets],
    async () => {
      const before = await db.campaignMaps
        .where("accountId")
        .equals(accountId)
        .toArray();
      await db.campaignMaps.where("accountId").equals(accountId).delete();
      await db.campaignLocations.where("accountId").equals(accountId).delete();
      await db.campaignMaps.bulkPut(maps.map((m) => ({ ...m, accountId })));
      await db.campaignLocations.bulkPut(
        locations.map((l) => ({ ...l, accountId })),
      );
      // Images shipped with the app need no download.
      for (const map of maps)
        if (
          map.asset.kind === "bundled" &&
          !(await db.mapAssets.get(map.asset.id))
        )
          await db.mapAssets.put(localAsset(map.asset));
      const kept = new Set(maps.map((m) => m.asset.id));
      return before.filter((m) => !kept.has(m.asset.id)).map((m) => m.asset.id);
    },
  );
  for (const assetId of stale)
    await db.transaction(
      "rw",
      [db.atlasMaps, db.campaignMaps, db.mapAssets, db.mapTiles],
      () => removeUnusedAsset(db, assetId),
    );
}
const localAsset = (asset: RemoteMapAsset): MapAsset => ({
  id: asset.id,
  kind: asset.kind === "bundled" ? "bundled" : "local",
  width: asset.width,
  height: asset.height,
  tileSize: 512,
  maxZoom: asset.maxZoom,
  ...(asset.baseUrl ? { baseUrl: asset.baseUrl } : {}),
});

// Makes a campaign map's image available offline, downloading it once.
export async function ensureCampaignAsset(
  db: CharacterDatabase,
  backend: RemoteBackend,
  map: CachedCampaignMap,
  onProgress?: (done: number, total: number) => void,
): Promise<MapAsset> {
  const existing = await db.mapAssets.get(map.asset.id);
  const coordinates = tileCoordinates(map.asset);
  if (existing?.kind === "bundled") return existing;
  if (
    existing &&
    (await db.mapTiles.where("assetId").equals(map.asset.id).count()) ===
      coordinates.length
  )
    return existing;
  if (map.asset.kind === "bundled") {
    const asset = localAsset(map.asset);
    await db.mapAssets.put(asset);
    return asset;
  }
  const path = (file: string) =>
    mapFilePath(map.campaignId, map.asset.id, file);
  const thumbnail = await backend.downloadMapFile(path("thumbnail.webp"));
  const tiles: MapTile[] = [];
  let done = 0;
  onProgress?.(0, coordinates.length);
  // A few parallel requests keep large maps quick without flooding mobile data.
  for (let i = 0; i < coordinates.length; i += 6) {
    const batch = coordinates.slice(i, i + 6);
    const blobs = await Promise.all(
      batch.map((t) =>
        backend.downloadMapFile(path(`${t.z}/${t.x}/${t.y}.webp`)),
      ),
    );
    batch.forEach((t, index) =>
      tiles.push({ assetId: map.asset.id, ...t, blob: blobs[index] }),
    );
    done += batch.length;
    onProgress?.(done, coordinates.length);
  }
  const asset: MapAsset = { ...localAsset(map.asset), thumbnail };
  await db.transaction("rw", db.mapAssets, db.mapTiles, async () => {
    await db.mapAssets.put(asset);
    await db.mapTiles.bulkPut(tiles);
  });
  return asset;
}

// The master brings one of their maps to a campaign: the image is uploaded
// (unless it ships with the app) and places may come along, even as secrets.
export async function shareMapToCampaign(
  db: CharacterDatabase,
  backend: RemoteBackend,
  campaignId: string,
  map: AtlasMap,
  options: { places: boolean; secret: boolean },
  onProgress?: (done: number, total: number) => void,
) {
  const asset = await db.mapAssets.get(map.assetId);
  if (!asset) throw new Error("A imagem deste mapa não está neste aparelho.");
  const remote: RemoteMapAsset = {
    id: asset.id,
    kind: asset.kind === "bundled" ? "bundled" : "storage",
    width: asset.width,
    height: asset.height,
    tileSize: 512,
    maxZoom: asset.maxZoom,
    ...(asset.baseUrl ? { baseUrl: asset.baseUrl } : {}),
  };
  if (remote.kind === "storage") {
    if (!asset.thumbnail) throw new Error("Imagem incompleta.");
    const coordinates = tileCoordinates(asset);
    const path = (file: string) => mapFilePath(campaignId, asset.id, file);
    await backend.uploadMapFile(path("thumbnail.webp"), asset.thumbnail);
    let done = 0;
    onProgress?.(0, coordinates.length);
    for (let i = 0; i < coordinates.length; i += 4) {
      const batch = coordinates.slice(i, i + 4);
      await Promise.all(
        batch.map(async (t) => {
          const tile = await db.mapTiles.get([asset.id, t.z, t.x, t.y]);
          if (!tile) throw new Error("Imagem incompleta.");
          await backend.uploadMapFile(
            path(`${t.z}/${t.x}/${t.y}.webp`),
            tile.blob,
          );
        }),
      );
      done += batch.length;
      onProgress?.(done, coordinates.length);
    }
  }
  const mapId = await backend.addCampaignMap(
    campaignId,
    map.name,
    map.notes,
    remote,
    map.sourceKey ?? null,
  );
  if (options.places) {
    const places = await db.mapLocations
      .where("mapId")
      .equals(map.id)
      .toArray();
    for (const place of places)
      await backend.saveMapLocation(
        {
          id: crypto.randomUUID(),
          mapId,
          name: place.name,
          categoryId: place.categoryId,
          iconId: place.iconId,
          x: place.x,
          y: place.y,
          notes: place.notes,
          secret: options.secret,
        },
        null,
      );
  }
  return mapId;
}

// Writes go to the server first; the cache follows so the map updates at once.
export async function saveCampaignPlace(
  db: CharacterDatabase,
  backend: RemoteBackend,
  accountId: string,
  input: Omit<CampaignLocationInput, "id"> & { id?: string },
  previous?: CampaignLocation,
): Promise<CachedCampaignLocation> {
  const saved = await backend.saveMapLocation(
    { ...input, id: previous?.id ?? input.id ?? crypto.randomUUID() },
    previous ? previous.revision : null,
  );
  const cached = {
    ...saved,
    createdByName: saved.createdByName ?? previous?.createdByName ?? null,
    accountId,
  };
  await db.campaignLocations.put(cached);
  return cached;
}
export async function deleteCampaignPlace(
  db: CharacterDatabase,
  backend: RemoteBackend,
  place: CampaignLocation,
) {
  await backend.deleteMapLocation(place.id, place.revision);
  await db.campaignLocations.delete(place.id);
}
export async function updateCampaignMapInfo(
  db: CharacterDatabase,
  backend: RemoteBackend,
  map: CachedCampaignMap,
  name: string,
  notes: string,
) {
  if (!name.trim()) throw new Error("Dê um nome ao mapa.");
  await backend.updateCampaignMap(map.id, map.revision, name, notes);
  await db.campaignMaps.update(map.id, {
    name: name.trim(),
    notes,
    revision: map.revision + 1,
  });
}
export async function removeCampaignMap(
  db: CharacterDatabase,
  backend: RemoteBackend,
  map: CachedCampaignMap,
) {
  await backend.deleteCampaignMap(map.id);
  if (map.asset.kind === "storage")
    await backend.removeMapFiles(map.campaignId, map.asset.id).catch(() => {});
  await db.transaction(
    "rw",
    [
      db.atlasMaps,
      db.campaignMaps,
      db.campaignLocations,
      db.mapAssets,
      db.mapTiles,
    ],
    async () => {
      await db.campaignLocations.where("mapId").equals(map.id).delete();
      await db.campaignMaps.delete(map.id);
      await removeUnusedAsset(db, map.asset.id);
    },
  );
}
