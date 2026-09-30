import {
  MAX_MAP_FILE,
  MAX_MAP_PIXELS,
  pyramidZoom,
  tileCoordinates,
  type PreparedMapImage,
  type MapAsset,
} from "../../domain/maps";
import { mapImageInfo } from "../../domain/map-image-info";

function createCanvas(
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
async function encode(canvas: OffscreenCanvas | HTMLCanvasElement) {
  if ("convertToBlob" in canvas)
    return canvas.convertToBlob({ type: "image/webp", quality: 0.95 });
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Não foi possível preparar a imagem.")),
      "image/webp",
      0.95,
    ),
  );
}
export async function rasterizeImage(
  file: Blob,
  progress: (value: number) => void,
  cancelled: () => boolean = () => false,
): Promise<PreparedMapImage> {
  if (!file.size || file.size > MAX_MAP_FILE)
    throw new Error("Selecione uma imagem de até 50 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use uma imagem JPEG, PNG ou WebP.");
  const dimensions = mapImageInfo(new Uint8Array(await file.arrayBuffer()));
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width > 16384 ||
    dimensions.height > 16384 ||
    dimensions.width * dimensions.height > MAX_MAP_PIXELS
  )
    throw new Error(
      "A imagem pode ter até 64 megapixels e 16.384 pixels por lado.",
    );
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    if (width > 16384 || height > 16384 || width * height > MAX_MAP_PIXELS)
      throw new Error(
        "A imagem pode ter até 64 megapixels e 16.384 pixels por lado.",
      );
    const asset: MapAsset = {
      id: crypto.randomUUID(),
      kind: "local",
      width,
      height,
      tileSize: 512,
      maxZoom: pyramidZoom(width, height),
      original: file,
    };
    const tiles = [];
    const coordinates = tileCoordinates(asset);
    for (const [index, tile] of coordinates.entries()) {
      if (cancelled())
        throw new DOMException("Preparação cancelada.", "AbortError");
      const scale = 2 ** (asset.maxZoom - tile.z);
      const left = tile.x * 512 * scale,
        top = tile.y * 512 * scale;
      const sourceWidth = Math.min(512 * scale, width - left),
        sourceHeight = Math.min(512 * scale, height - top);
      const canvas = createCanvas(
        Math.ceil(sourceWidth / scale),
        Math.ceil(sourceHeight / scale),
      );
      const ctx = canvas.getContext("2d") as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        bitmap,
        left,
        top,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      tiles.push({ assetId: asset.id, ...tile, blob: await encode(canvas) });
      canvas.width = 1;
      canvas.height = 1;
      progress(Math.round(((index + 1) / coordinates.length) * 95));
      // Also yield when running the compatibility fallback on the main thread.
      if (typeof document !== "undefined")
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const thumb = createCanvas(
      Math.min(640, width),
      Math.max(1, Math.round((height * Math.min(640, width)) / width)),
    );
    (thumb.getContext("2d") as CanvasRenderingContext2D).drawImage(
      bitmap,
      0,
      0,
      thumb.width,
      thumb.height,
    );
    asset.thumbnail = await encode(thumb);
    thumb.width = 1;
    thumb.height = 1;
    progress(100);
    return { asset, tiles };
  } finally {
    bitmap.close();
  }
}
