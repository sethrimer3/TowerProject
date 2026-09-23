import type { Mode } from "./entities.ts";
import { themeAt, tileRandom } from "./themes.ts";
import { wallAdjacencyMask } from "./area1-tileset.ts";

export const THEMED_TILESET_NAMES = [
  "area1",
  "mossbound-ruins",
  "amber-catacombs",
  "frozen-vault",
  "ember-forge",
  "violet-geode",
  "drowned-temple",
  "fungal-hollow",
  "obsidian-crypt",
  "astral-sanctuary",
] as const;

const WALL_ROLES = [
  "isolated", "cap_n", "cap_e", "corner_ne", "cap_s", "vertical", "corner_se", "tee_e",
  "cap_w", "corner_nw", "horizontal", "tee_n", "corner_sw", "tee_w", "tee_s", "cross",
] as const;
const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const url = (theme: string, file: string) => `${ASSET_BASE}assets/tilesets/${theme}/${file}.png`;

export const THEMED_TILESET_URLS = THEMED_TILESET_NAMES.map((theme) => ({
  floors: [1, 2, 3, 4].map((n) => url(theme, `floor_0${n}`)),
  walls: WALL_ROLES.map((role) => url(theme, `wall_${role}`)),
}));

type Neighbors = { northWall: boolean; eastWall: boolean; southWall: boolean; westWall: boolean };
const cache = new Map<string, HTMLImageElement>();
function image(assetUrl: string) {
  if (typeof Image === "undefined") return null;
  let result = cache.get(assetUrl);
  if (!result) { result = new Image(); result.src = assetUrl; cache.set(assetUrl, result); }
  return result;
}

export function themedTileUrl(mode: Mode, height: number, wall: boolean, x: number, y: number, seed: number, neighbors: Neighbors) {
  const theme = themeAt(mode, height, x, y, seed).decor;
  const set = THEMED_TILESET_URLS[theme];
  if (wall) return set.walls[wallAdjacencyMask(neighbors)];
  const variant = Math.floor(tileRandom(x, y, seed ^ (0x41ea + theme * 0x101)) * set.floors.length);
  return set.floors[variant];
}

export function drawThemedTile(c: CanvasRenderingContext2D, mode: Mode, height: number, wall: boolean, x: number, y: number, seed: number, neighbors: Neighbors) {
  const sprite = image(themedTileUrl(mode, height, wall, x, y, seed, neighbors));
  if (!sprite?.complete || !sprite.naturalWidth) return false;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, 0, 0, 24, 24);
  c.restore();
  return true;
}
