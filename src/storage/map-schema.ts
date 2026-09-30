import { z } from "zod";
import { MAX_MAP_PIXELS, pyramidZoom } from "../domain/maps";

const id = z.string().min(1).max(200);
const name = z.string().trim().min(1, "Informe um nome.").max(200);
const notes = z
  .string()
  .max(50000, "As anotações podem ter até 50.000 caracteres.");
const revision = z.number().int().nonnegative();
const date = z.iso.datetime();
export const atlasMapSchema = z.strictObject({
  id,
  name,
  notes,
  assetId: id,
  sourceKey: id.optional(),
  revision,
  createdAt: date,
  updatedAt: date,
});
export const mapLocationSchema = z.strictObject({
  id,
  mapId: id,
  name,
  categoryId: id,
  iconId: id,
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  notes,
  revision,
  createdAt: date,
  updatedAt: date,
});
// Serializable metadata only; binary assets are validated separately.
export const mapAssetSchema = z
  .strictObject({
    id,
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    tileSize: z.literal(512),
    maxZoom: z.number().int().min(0).max(5),
  })
  .refine(
    (a) =>
      a.width * a.height <= MAX_MAP_PIXELS &&
      a.maxZoom === pyramidZoom(a.width, a.height),
    "Dimensões ou níveis da imagem inválidos.",
  );
