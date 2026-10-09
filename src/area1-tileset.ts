import { tileRandom } from "./random.ts";
import { doorId } from "./doors.ts";
import type { Tile } from "./entities.ts";

const AREA1_TILE_SIZE = 24;
// Vite serves Pages builds beneath /TowerProject/. Root-absolute asset URLs
// work on localhost but escape that project path in production, causing the
// renderer to silently fall back to procedural tiles. BASE_URL is "./" in
// this project build and "/" in direct Node tests.
const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const assetUrl = (path: string) => `${ASSET_BASE}assets/tilesets/area1/${path}`;
export const AREA1_FLOOR_URLS = [1, 2, 3, 4].map((n) => assetUrl(`floor_0${n}.png`));
export const AREA1_DOOR_URLS = Object.fromEntries(
  ["a", "b", "c", "ab", "ac", "bc", "abc", "ah", "bh", "ch", "abh", "ach", "bch", "abch", "steel", "heart", "wood"].map((id) => [id, assetUrl(`doors/door_${id}.png`)]),
) as Record<ReturnType<typeof doorId>, string>;
export const AREA1_ITEM_URLS = {
  key_yellow: assetUrl("items/key_yellow.png"), key_blue: assetUrl("items/key_blue.png"), key_red: assetUrl("items/key_red.png"),
  potion_flat: assetUrl("items/potion_flat.png"), potion_percent: assetUrl("items/potion_percent.png"),
  upgrade_attack: assetUrl("items/upgrade_attack.png"), upgrade_defense: assetUrl("items/upgrade_defense.png"),
  chest_treasure: assetUrl("items/chest_treasure.png"), chest_silver: assetUrl("items/chest_silver.png"),
  chest_gold: assetUrl("items/chest_gold.png"),
  chest_treasure_open: assetUrl("items/chest_treasure_open.png"), chest_silver_open: assetUrl("items/chest_silver_open.png"),
  chest_gold_open: assetUrl("items/chest_gold_open.png"),
} as const;
export type Area1ItemId = keyof typeof AREA1_ITEM_URLS;
/** The sprite for each kind of pickup or chest. */
const ITEM_IDS: Partial<Record<Tile["kind"], (tile: Tile) => Area1ItemId>> = {
  key: (t) => `key_${t.color ?? "yellow"}`,
  potion: (t) => (t.color === "red" ? "potion_percent" : "potion_flat"),
  attack: () => "upgrade_attack",
  defense: () => "upgrade_defense",
  treasure: () => "chest_treasure",
  reward: (t) => `chest_${t.tier ?? "silver"}`,
  openedChest: (t) => `chest_${t.tier ?? "treasure"}_open`,
};
export function area1ItemId(tile: Tile): Area1ItemId | null {
  return ITEM_IDS[tile.kind]?.(tile) ?? null;
}

type Neighbors = { northWall: boolean; eastWall: boolean; southWall: boolean; westWall: boolean };
export function wallAdjacencyMask(n: Neighbors) {
  return (n.northWall ? 1 : 0) | (n.eastWall ? 2 : 0) | (n.southWall ? 4 : 0) | (n.westWall ? 8 : 0);
}

/** The colours of the exposed stone rim the wall sprites run along every
 * edge that faces open floor (tools/generate-area1-tiles.mjs). */
export const AREA1_RIM = { face: "#8fa0ad", light: "#c1c2b5", joint: "#607283", dark: "#344354" };
/** The rim's thickness in tile pixels. */
const RIM = 6;
/** How far each arm of an outer-corner quoin runs along its rim. */
const QUOIN_ARM = 10;
/** A rim joint this close past a quoin's end is dropped, so no sliver of
 * stone is left between the two. */
const QUOIN_MERGE = 3;

/** Where the wall sprite for `mask` puts the joints across each exposed
 * rim, as positions along that rim (x for north/south, y for east/west). */
function rimJoints(mask: number) {
  const v = mask % 3;
  return { north: [8 + v * 3, 17], east: [8 + v * 2, 17], south: [7, 16 - v * 2], west: [7, 16 + v] };
}

/** Paints an L-shaped quoin over each given outer corner of a wall sprite:
 * the corners where the rims of two exposed sides meet. Each arm is as
 * thick as the rim and ends in a joint like the rim's own; rim joints
 * under an arm or just past its end are painted out. The stone is lit like
 * the rim, bright on its top and left edges and dark on its bottom and
 * right. `mask` is the tile's wall-adjacency mask. */
export function drawArea1Quoins(c: CanvasRenderingContext2D, mask: number, corners: readonly ("nw" | "ne" | "sw" | "se")[]) {
  if (!corners.length) return;
  const S = AREA1_TILE_SIZE;
  const open = { north: !(mask & 1), east: !(mask & 2), south: !(mask & 4), west: !(mask & 8) };
  const inRim = (x: number, y: number) =>
    (open.north && y < RIM) || (open.east && x >= S - RIM) || (open.south && y >= S - RIM) || (open.west && x < RIM);
  const joints = rimJoints(mask);
  const pixels = new Map<number, string>();
  const set = (x: number, y: number, color: string) => pixels.set(y * S + x, color);
  /** Paints out the joint at `at` across a rim, leaving plain rim stone. */
  const clearJoint = (side: "north" | "east" | "south" | "west", at: number) => {
    const inner = side === "north" || side === "west" ? 0 : S - RIM;
    for (let i = 0; i < RIM; i++) {
      const color = i === 0 ? AREA1_RIM.light : i === RIM - 1 ? AREA1_RIM.dark : AREA1_RIM.face;
      if (side === "north" || side === "south") set(at, inner + i, color);
      else set(inner + i, at, color);
    }
  };
  for (const corner of corners) {
    const south = corner.startsWith("s"), east = corner.endsWith("e");
    const across = south ? "south" : "north", down = east ? "east" : "west";
    // Distance from the corner along a rim, measured in from its end.
    const fromCorner = (at: number, far: boolean) => (far ? S - 1 - at : at);
    for (const at of joints[across]) if (fromCorner(at, east) < QUOIN_ARM + QUOIN_MERGE) clearJoint(across, at);
    for (const at of joints[down]) if (fromCorner(at, south) < QUOIN_ARM + QUOIN_MERGE) clearJoint(down, at);
    const inL = (x: number, y: number) => {
      const along = fromCorner(x, east), deep = fromCorner(y, south);
      return (deep < RIM && along < QUOIN_ARM) || (along < RIM && deep < QUOIN_ARM);
    };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!inL(x, y)) continue;
      // An edge that meets the rim is a joint; any other edge is lit by
      // the direction it faces.
      const out = ([dx, dy]: number[]) => !inL(x + dx, y + dy);
      const meetsRim = ([dx, dy]: number[]) => out([dx, dy]) && x + dx >= 0 && x + dx < S && y + dy >= 0 && y + dy < S && inRim(x + dx, y + dy);
      const sides = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const color = sides.some(meetsRim) ? AREA1_RIM.joint
        : out([1, 0]) || out([0, 1]) ? AREA1_RIM.dark
        : out([-1, 0]) || out([0, -1]) ? AREA1_RIM.light
        : AREA1_RIM.face;
      set(x, y, color);
    }
  }
  // Emit each row as runs of one colour.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S;) {
      const color = pixels.get(y * S + x);
      let end = x + 1;
      while (end < S && color && pixels.get(y * S + end) === color) end++;
      if (color) { c.fillStyle = color; c.fillRect(x, y, end - x, 1); }
      x = end;
    }
  }
}
export function floorVariant(x: number, y: number, seed: number) {
  return Math.floor(tileRandom(x, y, seed ^ 0x41ea) * AREA1_FLOOR_URLS.length);
}

const cache = new Map<string, HTMLImageElement>();
function image(url: string) {
  if (typeof Image === "undefined") return null;
  let result = cache.get(url);
  if (!result) { result = new Image(); result.src = url; cache.set(url, result); }
  return result;
}
/** The sprite at `url` once it has loaded, or null. */
function loaded(url: string) {
  const sprite = image(url);
  return sprite?.complete && sprite.naturalWidth ? sprite : null;
}
/** Draws the sprite at `url` over the tile; false while it's still loading. */
function drawSprite(c: CanvasRenderingContext2D, url: string) {
  const sprite = loaded(url);
  if (!sprite) return false;
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(sprite, 0, 0, AREA1_TILE_SIZE, AREA1_TILE_SIZE); c.restore();
  return true;
}
/** The loaded floor sprite for a tile, or null while it's still loading. */
export function area1FloorSprite(x: number, y: number, seed: number) {
  return loaded(AREA1_FLOOR_URLS[floorVariant(x, y, seed)]);
}
export function drawArea1Door(c: CanvasRenderingContext2D, tile: Tile) {
  return drawSprite(c, AREA1_DOOR_URLS[doorId(tile)]);
}
export function drawArea1Item(c: CanvasRenderingContext2D, tile: Tile) {
  const id = area1ItemId(tile);
  return !!id && drawSprite(c, AREA1_ITEM_URLS[id]);
}
