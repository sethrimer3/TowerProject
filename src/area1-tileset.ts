import { tileRandom } from "./themes.ts";
import { doorId } from "./doors.ts";
import type { Tile } from "./entities.ts";

export const AREA1_TILE_SIZE = 24;
// Vite serves Pages builds beneath /TowerProject/. Root-absolute asset URLs
// work on localhost but escape that project path in production, causing the
// renderer to silently fall back to procedural tiles. BASE_URL is "./" in
// this project build and "/" in direct Node tests.
const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const assetUrl = (path: string) => `${ASSET_BASE}assets/tilesets/area1/${path}`;
export const AREA1_FLOOR_URLS = [1, 2, 3, 4].map((n) => assetUrl(`floor_0${n}.png`));
const WALL_ROLES = [
  "isolated", "cap_n", "cap_e", "corner_ne", "cap_s", "vertical", "corner_se", "tee_e",
  "cap_w", "corner_nw", "horizontal", "tee_n", "corner_sw", "tee_w", "tee_s", "cross",
] as const;
export const AREA1_WALL_URLS = WALL_ROLES.map((role) => assetUrl(`wall_${role}.png`));
export const AREA1_CENTER_URLS = [1, 2, 3].map((n) => assetUrl(`wall_center_0${n}.png`));
export const AREA1_DOOR_URLS = Object.fromEntries(
  ["a", "b", "c", "ab", "ac", "bc", "abc", "steel", "heart"].map((id) => [id, assetUrl(`doors/door_${id}.png`)]),
) as Record<ReturnType<typeof doorId>, string>;
export const AREA1_ITEM_URLS = {
  key_yellow: assetUrl("items/key_yellow.png"), key_blue: assetUrl("items/key_blue.png"), key_red: assetUrl("items/key_red.png"),
  potion_flat: assetUrl("items/potion_flat.png"), potion_percent: assetUrl("items/potion_percent.png"),
  upgrade_attack: assetUrl("items/upgrade_attack.png"), upgrade_defense: assetUrl("items/upgrade_defense.png"),
  chest_treasure: assetUrl("items/chest_treasure.png"), chest_silver: assetUrl("items/chest_silver.png"),
  chest_gold: assetUrl("items/chest_gold.png"), chest_platinum: assetUrl("items/chest_platinum.png"),
} as const;
export type Area1ItemId = keyof typeof AREA1_ITEM_URLS;
export function area1ItemId(tile: Tile): Area1ItemId | null {
  if (tile.kind === "key") return `key_${tile.color ?? "yellow"}` as Area1ItemId;
  if (tile.kind === "potion") return tile.color === "red" ? "potion_percent" : "potion_flat";
  if (tile.kind === "attack" || tile.kind === "defense") return `upgrade_${tile.kind}`;
  if (tile.kind === "treasure") return "chest_treasure";
  if (tile.kind === "reward") return `chest_${tile.tier ?? "silver"}`;
  return null;
}

type Neighbors = { northWall: boolean; eastWall: boolean; southWall: boolean; westWall: boolean };
export function wallAdjacencyMask(n: Neighbors) {
  return (n.northWall ? 1 : 0) | (n.eastWall ? 2 : 0) | (n.southWall ? 4 : 0) | (n.westWall ? 8 : 0);
}
export function floorVariant(x: number, y: number, seed: number) {
  return Math.floor(tileRandom(x, y, seed ^ 0x41ea) * AREA1_FLOOR_URLS.length);
}
export function wallVariant(mask: number, x: number, y: number, seed: number) {
  if (mask === 15) return Math.floor(tileRandom(x, y, seed ^ 0xa113) * AREA1_CENTER_URLS.length);
  return mask;
}

const cache = new Map<string, HTMLImageElement>();
function image(url: string) {
  if (typeof Image === "undefined") return null;
  let result = cache.get(url);
  if (!result) { result = new Image(); result.src = url; cache.set(url, result); }
  return result;
}
export function drawArea1Tile(c: CanvasRenderingContext2D, wall: boolean, x: number, y: number, seed: number, neighbors: Neighbors) {
  const mask = wallAdjacencyMask(neighbors);
  const url = wall
    ? (mask === 15 ? AREA1_CENTER_URLS[wallVariant(mask, x, y, seed)] : AREA1_WALL_URLS[mask])
    : AREA1_FLOOR_URLS[floorVariant(x, y, seed)];
  const sprite = image(url);
  if (!sprite?.complete || !sprite.naturalWidth) return false;
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(sprite, 0, 0, AREA1_TILE_SIZE, AREA1_TILE_SIZE); c.restore();
  return true;
}
/** The loaded floor sprite for a tile, or null while it's still loading. */
export function area1FloorSprite(x: number, y: number, seed: number) {
  const sprite = image(AREA1_FLOOR_URLS[floorVariant(x, y, seed)]);
  return sprite?.complete && sprite.naturalWidth ? sprite : null;
}
export function drawArea1Door(c: CanvasRenderingContext2D, tile: Tile) {
  const sprite = image(AREA1_DOOR_URLS[doorId(tile)]);
  if (!sprite?.complete || !sprite.naturalWidth) return false;
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(sprite, 0, 0, AREA1_TILE_SIZE, AREA1_TILE_SIZE); c.restore();
  return true;
}
export function drawArea1Item(c: CanvasRenderingContext2D, tile: Tile) {
  const id = area1ItemId(tile);
  if (!id) return false;
  const sprite = image(AREA1_ITEM_URLS[id]);
  if (!sprite?.complete || !sprite.naturalWidth) return false;
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(sprite, 0, 0, AREA1_TILE_SIZE, AREA1_TILE_SIZE); c.restore();
  return true;
}
