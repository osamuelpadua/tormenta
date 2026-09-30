import type { CharacterDatabase } from "./database";
import type { AtlasMap, MapLocation, PreparedMapImage } from "../domain/maps";
import { tileCoordinates } from "../domain/maps";
import {
  atlasMapSchema,
  mapAssetSchema,
  mapLocationSchema,
} from "./map-schema";
import manifest from "../data/aethelgard-map.json";

export const DEFAULT_MAP_ID = "builtin-aethelgard";
const SEED_KEY = "map-aethelgard-initialized";
const now = () => new Date().toISOString();
const conflict = () =>
  new Error(
    "Este registro mudou em outra aba. Feche a edição e abra novamente para conferir a versão atual.",
  );

export async function initializeDefaultMap(db: CharacterDatabase) {
  await db.transaction(
    "rw",
    db.atlasMaps,
    db.mapAssets,
    db.settings,
    async () => {
      if (await db.settings.get(SEED_KEY)) return;
      const existing =
        (await db.atlasMaps.get(DEFAULT_MAP_ID)) ??
        (await db.atlasMaps
          .where("sourceKey")
          .equals("builtin:aethelgard")
          .first());
      if (!existing) {
        await db.mapAssets.put({
          id: manifest.id,
          kind: "bundled",
          width: manifest.width,
          height: manifest.height,
          tileSize: 512,
          maxZoom: manifest.maxZoom,
          baseUrl: manifest.baseUrl,
        });
        await db.atlasMaps.add({
          id: DEFAULT_MAP_ID,
          name: "Aethelgard",
          notes: "",
          assetId: manifest.id,
          sourceKey: "builtin:aethelgard",
          revision: 0,
          createdAt: now(),
          updatedAt: now(),
        });
      }
      await db.settings.put({ key: SEED_KEY, value: "1" });
    },
  );
}
export function validatePreparedImage(image: PreparedMapImage) {
  const { asset, tiles } = image;
  mapAssetSchema.parse({
    id: asset.id,
    width: asset.width,
    height: asset.height,
    tileSize: asset.tileSize,
    maxZoom: asset.maxZoom,
  });
  if (
    asset.kind !== "local" ||
    !(asset.thumbnail instanceof Blob) ||
    !asset.thumbnail.size
  )
    throw new Error("Imagem incompleta.");
  const expected = new Set(
    tileCoordinates(asset).map((t) => `${t.z}/${t.x}/${t.y}`),
  );
  if (tiles.length !== expected.size) throw new Error("Imagem incompleta.");
  for (const tile of tiles) {
    if (
      tile.assetId !== asset.id ||
      !expected.delete(`${tile.z}/${tile.x}/${tile.y}`) ||
      !(tile.blob instanceof Blob) ||
      !tile.blob.size
    )
      throw new Error("Bloco de imagem inválido.");
  }
}
// Campaign maps may reuse a local image (the master shared it) or keep a
// downloaded copy; an image goes only when no map of either kind uses it.
export async function removeUnusedAsset(
  db: CharacterDatabase,
  assetId: string,
) {
  if (await db.atlasMaps.where("assetId").equals(assetId).count()) return;
  if (await db.campaignMaps.where("asset.id").equals(assetId).count()) return;
  await db.mapTiles.where("assetId").equals(assetId).delete();
  await db.mapAssets.delete(assetId);
}
export async function saveMap(
  db: CharacterDatabase,
  input: { name: string; notes: string },
  image?: PreparedMapImage,
  previous?: AtlasMap,
) {
  if (image) validatePreparedImage(image);
  if (!previous && !image) throw new Error("Escolha uma imagem para o mapa.");
  const result = atlasMapSchema.parse({
    ...previous,
    ...input,
    id: previous?.id ?? crypto.randomUUID(),
    assetId: image?.asset.id ?? previous!.assetId,
    revision: (previous?.revision ?? -1) + 1,
    createdAt: previous?.createdAt ?? now(),
    updatedAt: now(),
  });
  return db.transaction(
    "rw",
    db.atlasMaps,
    db.mapAssets,
    db.mapTiles,
    db.campaignMaps,
    async () => {
      if (
        previous &&
        (await db.atlasMaps.get(previous.id))?.revision !== previous.revision
      )
        throw conflict();
      if (image) {
        if (await db.mapAssets.get(image.asset.id))
          throw new Error(
            "Imagem já utilizada. Selecione o arquivo novamente.",
          );
        await db.mapAssets.add(image.asset);
        await db.mapTiles.bulkAdd(image.tiles);
      }
      await db.atlasMaps.put(result);
      if (previous && previous.assetId !== result.assetId)
        await removeUnusedAsset(db, previous.assetId);
      return result;
    },
  );
}
export async function deleteMap(db: CharacterDatabase, map: AtlasMap) {
  await db.transaction(
    "rw",
    db.atlasMaps,
    db.mapLocations,
    db.mapAssets,
    db.mapTiles,
    db.campaignMaps,
    async () => {
      if ((await db.atlasMaps.get(map.id))?.revision !== map.revision)
        throw conflict();
      await db.mapLocations.where("mapId").equals(map.id).delete();
      await db.atlasMaps.delete(map.id);
      await removeUnusedAsset(db, map.assetId);
    },
  );
}
export async function saveLocation(
  db: CharacterDatabase,
  input: Pick<
    MapLocation,
    "mapId" | "name" | "categoryId" | "iconId" | "x" | "y" | "notes"
  >,
  previous?: MapLocation,
) {
  if (previous && previous.mapId !== input.mapId)
    throw new Error("O local pertence a outro mapa.");
  const result = mapLocationSchema.parse({
    ...input,
    id: previous?.id ?? crypto.randomUUID(),
    revision: (previous?.revision ?? -1) + 1,
    createdAt: previous?.createdAt ?? now(),
    updatedAt: now(),
  });
  return db.transaction("rw", db.atlasMaps, db.mapLocations, async () => {
    if (!(await db.atlasMaps.get(input.mapId)))
      throw new Error("Este mapa foi removido.");
    if (
      previous &&
      (await db.mapLocations.get(previous.id))?.revision !== previous.revision
    )
      throw conflict();
    await db.mapLocations.put(result);
    await db.atlasMaps.update(input.mapId, { updatedAt: now() });
    return result;
  });
}
export async function deleteLocation(
  db: CharacterDatabase,
  location: MapLocation,
) {
  await db.transaction("rw", db.atlasMaps, db.mapLocations, async () => {
    if (
      (await db.mapLocations.get(location.id))?.revision !== location.revision
    )
      throw conflict();
    await db.mapLocations.delete(location.id);
    await db.atlasMaps.update(location.mapId, { updatedAt: now() });
  });
}
