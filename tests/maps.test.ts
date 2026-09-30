import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import { CharacterDatabase } from "../src/storage/database";
import {
  DEFAULT_MAP_ID,
  initializeDefaultMap,
  saveMap,
  saveLocation,
  deleteMap,
  deleteLocation,
} from "../src/storage/maps";
import {
  exportMapBackup,
  parseMapBackup,
  importMapBackup,
} from "../src/storage/map-backup";
import {
  pointToLatLng,
  latLngToPoint,
  pyramidZoom,
  tileCoordinates,
  type PreparedMapImage,
} from "../src/domain/maps";
import { mapImageInfo } from "../src/domain/map-image-info";
import { readRoute, routeHash } from "../src/ui/reference-navigation";
import categories from "../src/data/map-categories.json";
import manifest from "../src/data/aethelgard-map.json";
import { readFileSync, existsSync } from "node:fs";
import { hero } from "./fixtures";

let db: CharacterDatabase;
beforeEach(() => {
  db = new CharacterDatabase(`maps-${crypto.randomUUID()}`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});
const png = () =>
  new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
        "base64",
      ),
    ],
    { type: "image/png" },
  );
function image(): PreparedMapImage {
  const id = crypto.randomUUID();
  return {
    asset: {
      id,
      kind: "local",
      width: 1,
      height: 1,
      tileSize: 512,
      maxZoom: 0,
      thumbnail: png(),
      original: png(),
    },
    tiles: [{ assetId: id, z: 0, x: 0, y: 0, blob: png() }],
  };
}
const locationInput = (mapId: string) => ({
  mapId,
  name: "Valdris",
  notes: "NPCs e segredos",
  categoryId: "city",
  iconId: "medieval-gate",
  x: 0.33,
  y: 0.72,
});
async function customMap(name = "Meu reino") {
  return saveMap(db, { name, notes: "História da campanha" }, image());
}

describe("atlas: migração e mapa padrão", () => {
  it("migra v3 preservando personagens, histórico, configurações e recuperação", async () => {
    const old = new Dexie(db.name);
    old
      .version(3)
      .stores({
        characters: "id, name, updatedAt",
        history: "id, characterId, at",
        settings: "key",
        commands: "id, characterId",
        recovery: "id, at",
      });
    const character = hero();
    const history = {
      id: "event",
      characterId: character.id,
      at: character.createdAt,
      title: "Minha sessão",
    };
    const recovery = {
      id: "recovery",
      at: character.createdAt,
      characters: [character],
      history: [history],
    };
    await old.table("characters").put(character);
    await old.table("history").put(history);
    await old.table("recovery").put(recovery);
    await old.table("settings").put({ key: "preference", value: "preserve" });
    old.close();
    await db.open();
    await initializeDefaultMap(db);
    expect(await db.characters.get(character.id)).toEqual(character);
    expect(await db.history.get("event")).toEqual(history);
    expect(await db.recovery.get("recovery")).toEqual(recovery);
    expect(await db.settings.get("preference")).toEqual({
      key: "preference",
      value: "preserve",
    });
    expect((await db.atlasMaps.get(DEFAULT_MAP_ID))?.name).toBe("Aethelgard");
  });
  it("inclui Aethelgard com mapas existentes e apenas uma vez entre duas abas", async () => {
    const custom = await customMap();
    const location = await saveLocation(db, locationInput(custom.id));
    const before = await db.atlasMaps.get(custom.id);
    const other = new CharacterDatabase(db.name);
    try {
      await Promise.all([
        initializeDefaultMap(db),
        initializeDefaultMap(other),
      ]);
    } finally {
      other.close();
    }
    expect(await db.atlasMaps.count()).toBe(2);
    expect(await db.atlasMaps.get(custom.id)).toEqual(before);
    expect(await db.mapLocations.get(location.id)).toEqual(location);
    const initial = (await db.atlasMaps.get(DEFAULT_MAP_ID))!;
    const updated = await saveMap(
      db,
      { name: "Meu Aethelgard", notes: "Minhas alterações" },
      undefined,
      initial,
    );
    db.close();
    await db.open();
    await initializeDefaultMap(db);
    expect(await db.atlasMaps.get(DEFAULT_MAP_ID)).toEqual(updated);
    await deleteMap(db, updated);
    await initializeDefaultMap(db);
    expect(await db.atlasMaps.get(DEFAULT_MAP_ID)).toBeUndefined();
    expect(await db.atlasMaps.count()).toBe(1);
  });
  it("reconhece a identidade estável se o registro de inicialização ainda não existir", async () => {
    await initializeDefaultMap(db);
    await db.settings.delete("map-aethelgard-initialized");
    await initializeDefaultMap(db);
    expect(await db.atlasMaps.count()).toBe(1);
  });
});

describe("atlas: operações transacionais", () => {
  it("salva, edita, move, reabre e mantém locais separados por mapa", async () => {
    const first = await customMap(),
      second = await customMap("Masmorra");
    const location = await saveLocation(db, locationInput(first.id));
    const updated = await saveLocation(
      db,
      {
        ...location,
        name: "Valdris Nova",
        x: 0.9,
        y: 0.1,
        categoryId: "ruins",
        iconId: "ancient-ruins",
      },
      location,
    );
    db.close();
    await db.open();
    expect(await db.mapLocations.get(location.id)).toEqual(updated);
    expect(await db.mapLocations.where("mapId").equals(second.id).count()).toBe(
      0,
    );
    expect((await db.mapAssets.get(first.assetId))?.original?.size).toBe(
      png().size,
    );
    await deleteLocation(db, updated);
    expect(await db.mapLocations.count()).toBe(0);
  });
  it("recusa alterações concorrentes e não perde notas ao mover", async () => {
    const map = await customMap();
    const location = await saveLocation(db, locationInput(map.id));
    const changed = await saveLocation(
      db,
      { ...location, notes: "Segredo novo" },
      location,
    );
    await expect(
      saveLocation(db, { ...location, x: 0.8 }, location),
    ).rejects.toThrow("outra aba");
    expect(await db.mapLocations.get(location.id)).toEqual(changed);
    await expect(deleteLocation(db, location)).rejects.toThrow("outra aba");
    await saveMap(db, { name: "Outro nome", notes: "Novo" }, undefined, map);
    await expect(
      saveMap(db, { name: "Nome antigo", notes: "" }, undefined, map),
    ).rejects.toThrow("outra aba");
    await expect(deleteMap(db, map)).rejects.toThrow("outra aba");
  });
  it("substitui imagem mantendo posições e remove os blocos antigos", async () => {
    const map = await customMap();
    const location = await saveLocation(db, locationInput(map.id));
    const replacement = image();
    const updated = await saveMap(
      db,
      { name: map.name, notes: map.notes },
      replacement,
      map,
    );
    expect(updated.assetId).toBe(replacement.asset.id);
    expect(await db.mapAssets.get(map.assetId)).toBeUndefined();
    expect(await db.mapTiles.where("assetId").equals(map.assetId).count()).toBe(
      0,
    );
    expect(await db.mapLocations.get(location.id)).toEqual(location);
  });
  it("exclui somente recursos exclusivos do mapa escolhido", async () => {
    const first = await customMap(),
      second = await customMap();
    await saveLocation(db, locationInput(first.id));
    const retained = await saveLocation(db, locationInput(second.id));
    await deleteMap(db, first);
    expect(await db.mapLocations.count()).toBe(1);
    expect(await db.mapLocations.get(retained.id)).toBeDefined();
    expect(await db.mapAssets.count()).toBe(1);
    expect(await db.mapTiles.count()).toBe(1);
    await expect(saveLocation(db, locationInput(first.id))).rejects.toThrow(
      "removido",
    );
  });
  it("não deixa imagem parcial quando a gravação dos blocos falha", async () => {
    vi.spyOn(db.mapTiles, "bulkAdd").mockRejectedValueOnce(
      new Error("Falha de armazenamento"),
    );
    await expect(customMap()).rejects.toThrow("Falha de armazenamento");
    expect(await db.atlasMaps.count()).toBe(0);
    expect(await db.mapAssets.count()).toBe(0);
    expect(await db.mapTiles.count()).toBe(0);
  });
  it("rejeita coordenadas inválidas, nomes vazios e imagens incompletas", async () => {
    const map = await customMap();
    for (const point of [
      { x: NaN, y: 0 },
      { x: -0.1, y: 0.3 },
      { x: 0.5, y: 1.1 },
    ])
      await expect(
        saveLocation(db, { ...locationInput(map.id), ...point }),
      ).rejects.toThrow();
    await expect(
      saveLocation(db, { ...locationInput(map.id), name: " " }),
    ).rejects.toThrow();
    const incomplete = image();
    incomplete.tiles = [];
    await expect(
      saveMap(db, { name: "Mapa", notes: "" }, incomplete),
    ).rejects.toThrow("incompleta");
    expect(await db.mapLocations.count()).toBe(0);
    expect(await db.atlasMaps.count()).toBe(1);
  });
});

describe("atlas: backup portátil", () => {
  it("restaura imagens, notas e locais como cópias independentes", async () => {
    const map = await customMap();
    const location = await saveLocation(db, locationInput(map.id));
    const preview = await parseMapBackup(await exportMapBackup(db));
    expect(preview.maps).toHaveLength(1);
    expect(preview.locations).toEqual([location]);
    const [copy] = await importMapBackup(db, preview);
    expect(copy.id).not.toBe(map.id);
    expect(copy.assetId).not.toBe(map.assetId);
    expect(copy.name).toBe("Meu reino (cópia)");
    expect(copy.notes).toBe(map.notes);
    expect(copy.sourceKey).toBeUndefined();
    const [copiedLocation] = await db.mapLocations
      .where("mapId")
      .equals(copy.id)
      .toArray();
    expect(copiedLocation).toMatchObject({
      name: location.name,
      notes: location.notes,
      x: location.x,
      y: location.y,
    });
    expect(copiedLocation.id).not.toBe(location.id);
    expect((await db.mapAssets.get(copy.assetId))?.thumbnail?.size).toBe(
      png().size,
    );
    await deleteMap(db, map);
    expect(
      await db.mapTiles.where("assetId").equals(copy.assetId).count(),
    ).toBe(1);
  });
  it("exporta um único mapa quando solicitado", async () => {
    const map = await customMap();
    await customMap("Segundo");
    const preview = await parseMapBackup(
      await exportMapBackup(db, undefined, [map.id]),
    );
    expect(preview.maps.map((value) => value.id)).toEqual([map.id]);
  });
  it("rejeita falta de imagens e referências inválidas sem alterar dados", async () => {
    const map = await customMap();
    await saveLocation(db, locationInput(map.id));
    const original = await exportMapBackup(db);
    const files = unzipSync(new Uint8Array(await original.arrayBuffer()));
    const invalid = { ...files };
    delete invalid[Object.keys(invalid).find((key) => key.endsWith("/0/0/0"))!];
    await expect(parseMapBackup(new Blob([zipSync(invalid)]))).rejects.toThrow(
      "Falta uma imagem",
    );
    const metadata = JSON.parse(strFromU8(files["manifest.json"]));
    metadata.locations[0].mapId = "missing";
    files["manifest.json"] = strToU8(JSON.stringify(metadata));
    await expect(parseMapBackup(new Blob([zipSync(files)]))).rejects.toThrow(
      "referências",
    );
    expect(await db.atlasMaps.count()).toBe(1);
    expect(await db.mapLocations.count()).toBe(1);
  });
  it("recusa arquivos inesperados e dados corrompidos", async () => {
    await customMap();
    const files = unzipSync(
      new Uint8Array(await (await exportMapBackup(db)).arrayBuffer()),
    );
    files["../unexpected"] = strToU8("invalid");
    await expect(parseMapBackup(new Blob([zipSync(files)]))).rejects.toThrow();
    await expect(parseMapBackup(new Blob(["invalid"]))).rejects.toThrow();
  });
});

describe("atlas: coordenadas, assets e navegação", () => {
  it("faz round-trip exato independente da resolução", () => {
    for (const [width, height] of [
      [6144, 4096],
      [1231, 4129],
      [100, 100],
    ]) {
      const asset = {
        ...image().asset,
        width,
        height,
        maxZoom: pyramidZoom(width, height),
      };
      for (const point of [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0.12345, y: 0.87654 },
      ]) {
        const [lat, lng] = pointToLatLng(point, asset);
        const actual = latLngToPoint(lat, lng, asset);
        expect(actual.x).toBeCloseTo(point.x, 10);
        expect(actual.y).toBeCloseTo(point.y, 10);
      }
    }
  });
  it("distribui todos os tiles de Aethelgard e os símbolos das 33 categorias", () => {
    expect(manifest.width).toBe(6144);
    expect(manifest.height).toBe(4096);
    expect(tileCoordinates(manifest)).toEqual(manifest.tiles);
    for (const tile of manifest.tiles)
      expect(
        existsSync(
          `public${manifest.baseUrl}/${tile.z}/${tile.x}/${tile.y}.webp`,
        ),
      ).toBe(true);
    const sprite = readFileSync("public/art/entity-icons.svg", "utf8");
    expect(categories).toHaveLength(33);
    expect(new Set(categories.map((category) => category.id)).size).toBe(33);
    for (const category of categories)
      expect(sprite).toContain(`<symbol id="${category.iconId}"`);
  });
  it("valida dimensões de JPEG, PNG e WebP antes da decodificação", async () => {
    expect(mapImageInfo(new Uint8Array(await png().arrayBuffer()))).toEqual({
      width: 1,
      height: 1,
      mime: "image/png",
    });
    expect(mapImageInfo(readFileSync("assets/maps/aethelgard.jpeg"))).toEqual({
      width: 6144,
      height: 4096,
      mime: "image/jpeg",
    });
    expect(
      mapImageInfo(readFileSync(`public${manifest.baseUrl}/4/5/4.webp`)),
    ).toEqual({ width: 512, height: 512, mime: "image/webp" });
    expect(() => mapImageInfo(strToU8("not an image"))).toThrow();
  });
  it("preserva mapa na rota e mantém compatibilidade das outras abas", () => {
    expect(readRoute("#maps?map=abc")).toEqual({ tab: "maps", mapId: "abc" });
    expect(routeHash({ tab: "maps", mapId: "abc", bookPage: 17 })).toBe(
      "#maps?map=abc&book=17",
    );
    expect(readRoute("#inventory?map=abc")).toEqual({ tab: "inventory" });
    expect(readRoute("#maps")).toEqual({ tab: "maps" });
  });
});
