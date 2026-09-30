export interface AtlasMap {
  id: string;
  name: string;
  notes: string;
  assetId: string;
  sourceKey?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface MapLocation {
  id: string;
  mapId: string;
  name: string;
  categoryId: string;
  iconId: string;
  x: number;
  y: number;
  notes: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface MapAsset {
  id: string;
  kind: "bundled" | "local";
  width: number;
  height: number;
  tileSize: 512;
  maxZoom: number;
  baseUrl?: string;
  thumbnail?: Blob;
  original?: Blob;
}
export interface MapTile {
  assetId: string;
  z: number;
  x: number;
  y: number;
  blob: Blob;
}
export interface PreparedMapImage {
  asset: MapAsset;
  tiles: MapTile[];
}
export interface MapPoint {
  x: number;
  y: number;
}
export const TILE_SIZE = 512;
export const MAX_MAP_FILE = 50 * 1024 * 1024;
export const MAX_MAP_PIXELS = 64 * 1024 * 1024;
export const pyramidZoom = (width: number, height: number) =>
  Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / TILE_SIZE)));
export function tileCoordinates(
  asset: Pick<MapAsset, "width" | "height" | "maxZoom">,
) {
  const result: { z: number; x: number; y: number }[] = [];
  for (let z = 0; z <= asset.maxZoom; z++) {
    const scale = 2 ** (asset.maxZoom - z);
    for (let y = 0; y < Math.ceil(asset.height / scale / TILE_SIZE); y++)
      for (let x = 0; x < Math.ceil(asset.width / scale / TILE_SIZE); x++)
        result.push({ z, x, y });
  }
  return result;
}
// Leaflet CRS.Simple uses northing, easting. Domain coordinates stay independent
// of the viewer: normalized x/y, origin at the image's top-left corner.
export function pointToLatLng(
  point: MapPoint,
  asset: MapAsset,
): [number, number] {
  const scale = 2 ** asset.maxZoom;
  return [(-point.y * asset.height) / scale, (point.x * asset.width) / scale];
}
export function latLngToPoint(
  lat: number,
  lng: number,
  asset: MapAsset,
): MapPoint {
  const scale = 2 ** asset.maxZoom;
  return { x: (lng * scale) / asset.width, y: (-lat * scale) / asset.height };
}
export function insideMap(point: MapPoint) {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}
export function clampPoint(point: MapPoint): MapPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}
