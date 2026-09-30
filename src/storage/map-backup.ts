import { strFromU8, strToU8, unzip, zip, type Unzipped } from "fflate";
import { z } from "zod";
import type { CharacterDatabase } from "./database";
import type { AtlasMap, MapLocation, PreparedMapImage } from "../domain/maps";
import { tileCoordinates, MAX_MAP_FILE } from "../domain/maps";
import { mapImageInfo } from "../domain/map-image-info";
import {
  atlasMapSchema,
  mapAssetSchema,
  mapLocationSchema,
} from "./map-schema";
import { validatePreparedImage } from "./maps";

const MAX_BACKUP = 256 * 1024 * 1024;
const backupSchema = z.strictObject({
  format: z.literal("tormenta-mapas"),
  schema: z.literal(1),
  exportedAt: z.iso.datetime(),
  maps: z.array(atlasMapSchema).min(1).max(100),
  locations: z.array(mapLocationSchema).max(100000),
  assets: z.array(mapAssetSchema).min(1).max(100),
});
export interface MapBackupPreview {
  maps: AtlasMap[];
  locations: MapLocation[];
  images: PreparedMapImage[];
  exportedAt: string;
}
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const filePath = (id: string) => `assets/${encodeURIComponent(id)}`;
async function responseBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      "Não foi possível ler a imagem de Aethelgard. Aguarde o preparo offline ou tente novamente com conexão.",
    );
  return response.blob();
}
export async function exportMapBackup(
  db: CharacterDatabase,
  progress: (text: string) => void = () => {},
  ids?: string[],
): Promise<Blob> {
  const snapshot = await db.transaction(
    "r",
    db.atlasMaps,
    db.mapLocations,
    db.mapAssets,
    db.mapTiles,
    async () => {
      const maps = ids
        ? (await db.atlasMaps.bulkGet(ids)).filter(
            (map): map is AtlasMap => !!map,
          )
        : await db.atlasMaps.toArray();
      if (!maps.length) throw new Error("Adicione um mapa antes de exportar.");
      const assetIds = [...new Set(maps.map((map) => map.assetId))];
      const assets = await db.mapAssets.bulkGet(assetIds);
      if (assets.some((asset) => !asset))
        throw new Error(
          "Um mapa está sem sua imagem. O backup não foi criado.",
        );
      return {
        maps,
        assets: assets.map((asset) => asset!),
        locations: await db.mapLocations
          .where("mapId")
          .anyOf(maps.map((map) => map.id))
          .toArray(),
        tiles: await db.mapTiles.where("assetId").anyOf(assetIds).toArray(),
      };
    },
  );
  const files: Unzipped = {};
  let bytes = 0;
  const add = async (path: string, blob: Blob) => {
    bytes += blob.size;
    if (bytes > MAX_BACKUP)
      throw new Error(
        "O backup excede 256 MB. Exporte os mapas individualmente pela lista de backups.",
      );
    files[path] = await bytesOf(blob);
  };
  const localTiles = new Map(
    snapshot.tiles.map((tile) => [
      `${tile.assetId}/${tile.z}/${tile.x}/${tile.y}`,
      tile.blob,
    ]),
  );
  for (const [index, asset] of snapshot.assets.entries()) {
    progress(`Preparando imagens… ${index + 1}/${snapshot.assets.length}`);
    const root = filePath(asset.id);
    const thumbnail =
      asset.kind === "bundled"
        ? await responseBlob(`${asset.baseUrl}/thumbnail.webp`)
        : asset.thumbnail;
    if (!thumbnail) throw new Error("Miniatura ausente.");
    await add(`${root}/thumbnail`, thumbnail);
    if (asset.original) await add(`${root}/original`, asset.original);
    for (const tile of tileCoordinates(asset)) {
      const suffix = `${tile.z}/${tile.x}/${tile.y}`;
      const blob =
        asset.kind === "bundled"
          ? await responseBlob(`${asset.baseUrl}/${suffix}.webp`)
          : localTiles.get(`${asset.id}/${suffix}`);
      if (!blob)
        throw new Error("A imagem está incompleta. O backup não foi criado.");
      await add(`${root}/${suffix}`, blob);
    }
  }
  files["manifest.json"] = strToU8(
    JSON.stringify({
      format: "tormenta-mapas",
      schema: 1,
      exportedAt: new Date().toISOString(),
      maps: snapshot.maps,
      locations: snapshot.locations,
      assets: snapshot.assets.map(
        ({ id, width, height, tileSize, maxZoom }) => ({
          id,
          width,
          height,
          tileSize,
          maxZoom,
        }),
      ),
    }),
  );
  if (bytes + files["manifest.json"].length > MAX_BACKUP)
    throw new Error("O backup excede 256 MB. Exporte menos mapas por vez.");
  progress("Finalizando backup…");
  return new Promise((resolve, reject) =>
    zip(files, { level: 0 }, (error, result) =>
      error
        ? reject(error)
        : resolve(
            new Blob([Uint8Array.from(result).buffer], {
              type: "application/zip",
            }),
          ),
    ),
  );
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length)
    throw new Error("O backup contém identificadores duplicados.");
}
export async function parseMapBackup(
  file: Blob,
  progress: (text: string) => void = () => {},
): Promise<MapBackupPreview> {
  if (!file.size || file.size > MAX_BACKUP + 1024 * 1024)
    throw new Error("Selecione um backup de mapas de até 256 MB.");
  progress("Validando backup…");
  const input = await bytesOf(file);
  const files = await new Promise<Unzipped>((resolve, reject) => {
    let total = 0,
      count = 0;
    const names = new Set<string>();
    let failure: Error | undefined;
    unzip(
      input,
      {
        filter: (entry) => {
          total += entry.originalSize;
          count++;
          if (
            total > MAX_BACKUP ||
            entry.originalSize > MAX_MAP_FILE ||
            count > 10000 ||
            names.has(entry.name) ||
            entry.name.includes("..") ||
            entry.name.includes("\\") ||
            entry.name.startsWith("/")
          )
            failure = new Error(
              "Backup inválido ou maior que os limites permitidos.",
            );
          names.add(entry.name);
          return !failure;
        },
      },
      (error, result) =>
        error || failure ? reject(failure ?? error) : resolve(result),
    );
  });
  if (
    !files["manifest.json"] ||
    files["manifest.json"].length > 20 * 1024 * 1024
  )
    throw new Error("Manifesto do backup ausente ou inválido.");
  const parsed = backupSchema.safeParse(
    JSON.parse(strFromU8(files["manifest.json"])),
  );
  if (!parsed.success)
    throw new Error(
      "Este backup de mapas é inválido ou usa uma versão não compatível.",
    );
  const data = parsed.data;
  unique(data.maps.map((map) => map.id));
  unique(data.locations.map((location) => location.id));
  unique(data.assets.map((asset) => asset.id));
  const mapIds = new Set(data.maps.map((map) => map.id)),
    assetIds = new Set(data.assets.map((asset) => asset.id));
  if (
    data.maps.some((map) => !assetIds.has(map.assetId)) ||
    data.locations.some((location) => !mapIds.has(location.mapId))
  )
    throw new Error("O backup contém referências incompletas.");
  const usedFiles = new Set(["manifest.json"]);
  const readImage = async (path: string, width?: number, height?: number) => {
    const bytes = files[path];
    if (!bytes) throw new Error("Falta uma imagem no backup.");
    usedFiles.add(path);
    const info = mapImageInfo(bytes);
    if (
      !info.width ||
      !info.height ||
      (width !== undefined && info.width !== width) ||
      (height !== undefined && info.height !== height)
    )
      throw new Error("As dimensões de uma imagem do backup são inválidas.");
    const blob = new Blob([Uint8Array.from(bytes).buffer], { type: info.mime });
    if (typeof createImageBitmap !== "undefined") {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
    }
    return blob;
  };
  const images: PreparedMapImage[] = [];
  for (const [index, asset] of data.assets.entries()) {
    progress(`Conferindo imagens… ${index + 1}/${data.assets.length}`);
    const root = filePath(asset.id);
    const thumbnail = await readImage(
      `${root}/thumbnail`,
      Math.min(640, asset.width),
      Math.max(
        1,
        Math.round((asset.height * Math.min(640, asset.width)) / asset.width),
      ),
    );
    // Source JPEGs may have EXIF orientation; the normalized tiles are canonical.
    const originalBytes = files[`${root}/original`];
    let original: Blob | undefined;
    if (originalBytes) {
      usedFiles.add(`${root}/original`);
      const info = mapImageInfo(originalBytes);
      if (info.width * info.height > 64 * 1024 * 1024)
        throw new Error("Imagem original inválida.");
      original = new Blob([Uint8Array.from(originalBytes).buffer], {
        type: info.mime,
      });
    }
    const tiles = [];
    for (const tile of tileCoordinates(asset)) {
      const scale = 2 ** (asset.maxZoom - tile.z);
      tiles.push({
        ...tile,
        assetId: asset.id,
        blob: await readImage(
          `${root}/${tile.z}/${tile.x}/${tile.y}`,
          Math.min(512, Math.ceil(asset.width / scale) - tile.x * 512),
          Math.min(512, Math.ceil(asset.height / scale) - tile.y * 512),
        ),
      });
    }
    const image: PreparedMapImage = {
      asset: { ...asset, kind: "local", thumbnail, original },
      tiles,
    };
    validatePreparedImage(image);
    images.push(image);
  }
  if (Object.keys(files).some((path) => !usedFiles.has(path)))
    throw new Error("O backup contém arquivos não reconhecidos.");
  return {
    maps: data.maps,
    locations: data.locations,
    images,
    exportedAt: data.exportedAt,
  };
}
export async function importMapBackup(
  db: CharacterDatabase,
  preview: MapBackupPreview,
) {
  // Revalidate the preview before publishing all records in one transaction.
  const parsed = backupSchema.parse({
    format: "tormenta-mapas",
    schema: 1,
    exportedAt: preview.exportedAt,
    maps: preview.maps,
    locations: preview.locations,
    assets: preview.images.map(
      ({ asset: { id, width, height, tileSize, maxZoom } }) => ({
        id,
        width,
        height,
        tileSize,
        maxZoom,
      }),
    ),
  });
  preview.images.forEach(validatePreparedImage);
  unique(parsed.maps.map((map) => map.id));
  unique(parsed.assets.map((asset) => asset.id));
  unique(parsed.locations.map((location) => location.id));
  const assetMapping = new Map(
    preview.images.map((image) => [image.asset.id, crypto.randomUUID()]),
  );
  const mapMapping = new Map(
    preview.maps.map((map) => [map.id, crypto.randomUUID()]),
  );
  if (
    preview.maps.some((map) => !assetMapping.has(map.assetId)) ||
    preview.locations.some((location) => !mapMapping.has(location.mapId))
  )
    throw new Error("Referências incompletas no backup.");
  return db.transaction(
    "rw",
    db.atlasMaps,
    db.mapLocations,
    db.mapAssets,
    db.mapTiles,
    async () => {
      const time = new Date().toISOString();
      for (const image of preview.images) {
        const id = assetMapping.get(image.asset.id)!;
        await db.mapAssets.add({ ...image.asset, id });
        await db.mapTiles.bulkAdd(
          image.tiles.map((tile) => ({ ...tile, assetId: id })),
        );
      }
      const maps = preview.maps.map(({ sourceKey: _sourceKey, ...map }) => ({
        ...map,
        id: mapMapping.get(map.id)!,
        name: `${map.name.slice(0, 192)} (cópia)`,
        assetId: assetMapping.get(map.assetId)!,
        revision: 0,
        createdAt: time,
        updatedAt: time,
      }));
      await db.atlasMaps.bulkAdd(maps);
      await db.mapLocations.bulkAdd(
        preview.locations.map((location) => ({
          ...location,
          id: crypto.randomUUID(),
          mapId: mapMapping.get(location.mapId)!,
          revision: 0,
          createdAt: time,
          updatedAt: time,
        })),
      );
      return maps;
    },
  );
}
export function downloadMapBackup(blob: Blob) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `tormenta-mapas-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
