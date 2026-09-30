import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

// The approved master is committed: builds never depend on a developer's Downloads.
const master = await readFile("assets/maps/aethelgard.jpeg");
const version = createHash("sha256")
  .update(master)
  .update("tiles-v1-q95")
  .digest("hex")
  .slice(0, 12);
const root = `public/maps/aethelgard-${version}`;
const { width, height } = await sharp(master).metadata();
if (!width || !height) throw new Error("Mapa sem dimensões válidas.");
const tileSize = 512;
const maxZoom = Math.max(
  0,
  Math.ceil(Math.log2(Math.max(width, height) / tileSize)),
);
await mkdir(root, { recursive: true });
const tiles = [];
for (let z = 0; z <= maxZoom; z++) {
  const scale = 2 ** (maxZoom - z);
  const w = Math.ceil(width / scale),
    h = Math.ceil(height / scale);
  const { data, info } = await sharp(master)
    .resize(w, h)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let y = 0; y < Math.ceil(h / tileSize); y++) {
    for (let x = 0; x < Math.ceil(w / tileSize); x++) {
      const file = `${z}/${x}/${y}.webp`;
      await mkdir(`${root}/${z}/${x}`, { recursive: true });
      await sharp(data, { raw: info })
        .extract({
          left: x * tileSize,
          top: y * tileSize,
          width: Math.min(tileSize, w - x * tileSize),
          height: Math.min(tileSize, h - y * tileSize),
        })
        .webp({ quality: 95 })
        .toFile(`${root}/${file}`);
      tiles.push({ z, x, y });
    }
  }
}
await sharp(master)
  .resize({ width: 640 })
  .webp({ quality: 90 })
  .toFile(`${root}/thumbnail.webp`);
const manifest = {
  id: `aethelgard-${version}`,
  width,
  height,
  tileSize,
  maxZoom,
  baseUrl: root.replace(/^public/, ""),
  tiles,
};
await writeFile(
  `${root}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "src/data/aethelgard-map.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Aethelgard: ${width} × ${height}, ${tiles.length} tiles, ${root}`);
