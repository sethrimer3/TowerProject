import type { Mode, Tile } from "./entities.ts";
import type { Board } from "./board.ts";
import { tileRandom } from "./random.ts";
import { MODES } from "./modes.ts";

export const OUTSIDE_SIZE = 20;
export const ENTRANCE_Y = 12;
/** The row a run's hero starts the forest on: the crossroads partway up
 * the path, where it widens (`onPath`). */
export const OUTSIDE_START_Y = 7;
export type Weather = "cloudy" | "sunny" | "rain" | "storm";
export function weatherForRoll(roll: number): Weather {
  return roll < 0.4 ? "cloudy" : roll < 0.7 ? "sunny" : roll < 0.9 ? "rain" : "storm";
}
export const outsideWeather = (seed: number) => weatherForRoll(tileRandom(81, 37, seed));
const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const outsideUrl = (name: string) => `${ASSET_BASE}assets/tilesets/outside/${name}`;
export const OUTSIDE_SPRITE_URLS = {
  grass: [1,2,3,4].map(n=>outsideUrl(`grass_0${n}.png`)), path: [1,2,3].map(n=>outsideUrl(`path_0${n}.png`)),
  trees: [1,2,3].map(n=>outsideUrl(`tree_0${n}.png`)), boulders: [1,2].map(n=>outsideUrl(`boulder_0${n}.png`)),
};

/** A tile of the forest clearing: its cell, the run seed, and the entrance
 * column the dirt path runs along. */
export type ForestSpot = { x: number; y: number; seed: number; center: number; roads?: Roads };

/** The buildings in the clearing whose road is laid: each is built once
 * what opens it is (Equipment's Blacksmith, the Tournament's Hall). */
export type Roads = { blacksmith: boolean; hall: boolean };

/** The dirt path up to the entrance, widening every fifth row; its
 * crossroads (the row the hero starts on) goes on to a building's door
 * once the building stands (`roads`). */
const onPath = ({ x, y, center, roads }: ForestSpot) => {
  if (Math.abs(x - center) <= (y % 5 === 2 ? 1 : 0)) return true;
  if (!roads || y !== OUTSIDE_START_Y) return false;
  // Each door is in the middle column of its building, on the row in front.
  return (roads.blacksmith && x < center && x >= center + BLACKSMITH.dx + 1) || (roads.hall && x > center && x <= center + TOURNAMENT_HALL.dx + 1);
};

export function outsideSpriteKind(t: Tile, s: ForestSpot) {
  const { x, y, seed } = s;
  if (t.kind === "wall") {
    const tree = tileRandom(x, y, seed) > 0.2;
    return { family: tree ? "trees" : "boulders", variant: Math.floor(tileRandom(x + 17, y - 9, seed) * (tree ? 3 : 2)) } as const;
  }
  const path = onPath(s);
  return { family: path ? "path" : "grass", variant: Math.floor(tileRandom(x - 11, y + 23, seed) * (path ? 3 : 4)) } as const;
}

const outsideCache = new Map<string, HTMLImageElement>();
function outsideImage(url: string) {
  if (typeof Image === "undefined") return null;
  let img = outsideCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    outsideCache.set(url, img);
  }
  return img;
}

function drawOutsideSprite(c: CanvasRenderingContext2D, t: Tile, s: ForestSpot) {
  const id = outsideSpriteKind(t, s);
  const img = outsideImage(OUTSIDE_SPRITE_URLS[id.family][id.variant]);
  if (!img?.complete || !img.naturalWidth) return false;
  c.save(); c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, 24, 24); c.restore();
  return true;
}

/** Where the Blacksmith stands once Equipment is open: up and to the left
 * of the path, by the entrance column `center`. It takes `BLACKSMITH`'s
 * tiles (walls under its walls and roof), and the trees around them make
 * way for a small yard (`yard`). */
export const BLACKSMITH = { dx: -6, width: 3, y: 8, height: 3 } as const;
const YARD = { dx: BLACKSMITH.dx - 1, width: BLACKSMITH.width + 2, y: BLACKSMITH.y - 1, height: BLACKSMITH.height + 1 };
const within = (r: { dx: number; width: number; y: number; height: number }, center: number, x: number, y: number) =>
  x >= center + r.dx && x < center + r.dx + r.width && y >= r.y && y < r.y + r.height;
/** Whether (x, y) is one of the Blacksmith's tiles, by the entrance column. */
export const onBlacksmith = (center: number, x: number, y: number) => within(BLACKSMITH, center, x, y);
/** Where the Tournament Hall stands once the Tournament is open: the
 * Blacksmith's mirror across the path, up and to the right, in a yard of
 * its own (`HALL_YARD`). */
export const TOURNAMENT_HALL = { dx: 4, width: 3, y: 8, height: 3 } as const;
const HALL_YARD = { dx: TOURNAMENT_HALL.dx - 1, width: TOURNAMENT_HALL.width + 2, y: TOURNAMENT_HALL.y - 1, height: TOURNAMENT_HALL.height + 1 };
/** Whether (x, y) is one of the Tournament Hall's tiles, by the entrance column. */
export const onTournamentHall = (center: number, x: number, y: number) => within(TOURNAMENT_HALL, center, x, y);

/** The roads `world` has laid (none unless it is the clearing). */
export const roadsOf = (world: unknown): Roads | undefined =>
  world instanceof OutsideWorld ? { blacksmith: world.blacksmith, hall: world.hall } : undefined;

export class OutsideWorld implements Board {
  width: number;
  floor = 0;
  entranceX: number;
  /** `blacksmith`: Equipment is open, so its Blacksmith stands in the
   * clearing; `hall`: the Tournament is, so its Hall does. */
  constructor(public seed: number, public mode: Mode, public blacksmith = false, public hall = false) {
    this.width = MODES[mode].width;
    this.entranceX = MODES[mode].entranceX;
  }
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
    if (x === this.entranceX && y === ENTRANCE_Y) return { kind: "stairs" };
    if (this.blacksmith && within(YARD, this.entranceX, x, y)) return { kind: onBlacksmith(this.entranceX, x, y) ? "wall" : "floor" };
    if (this.hall && within(HALL_YARD, this.entranceX, x, y)) return { kind: onTournamentHall(this.entranceX, x, y) ? "wall" : "floor" };
    return this.wooded(x, y) ? { kind: "wall" } : { kind: "floor" };
  }
  /** Whether (x, y) is the Blacksmith, which a tap opens. */
  isBlacksmith(x: number, y: number) {
    return this.blacksmith && onBlacksmith(this.entranceX, x, y);
  }
  /** Whether (x, y) is the Tournament Hall, which a tap opens. */
  isTournamentHall(x: number, y: number) {
    return this.hall && onTournamentHall(this.entranceX, x, y);
  }
  /** Whether (x, y) is the foot of the path, under the sign to the other
   * mode's forest: stepping onto it goes there (`Game.swapForest`). */
  atExit(x: number, y: number) {
    return x === this.entranceX && y === 0;
  }
  step(x: number, y: number, dx: number, dy: number) {
    const xx = x + dx, yy = y + dy;
    return this.inside(xx, yy) ? { x: xx, y: yy } : null;
  }
  clear() {}
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < OUTSIDE_SIZE;
  }
  /** Trees and rocks: everything from the entrance row down, the far sides,
   * and a scattering beyond the clear strip around the path. */
  private wooded(x: number, y: number) {
    const d = Math.abs(x - this.entranceX);
    return y >= ENTRANCE_Y || d >= 9 || (d > 2 && tileRandom(x, y, this.seed) < 0.26);
  }
}

/** Returns false when it drew the plain fallback because the sprite art
 * hasn't loaded yet. */
export function drawForestTile(c: CanvasRenderingContext2D, t: Tile, s: ForestSpot, useSprites = true) {
  if (useSprites && drawOutsideSprite(c, t, s)) return true;
  drawForestFallback(c, t, s);
  return !useSprites;
}

function drawForestFallback(c: CanvasRenderingContext2D, t: Tile, s: ForestSpot) {
  const r = tileRandom(s.x, s.y, s.seed), path = onPath(s);
  paintForestGround(c, s, path, r < 0.5);
  if (t.kind === "wall") (r > 0.2 ? paintTree : paintBoulder)(c);
  else if (t.kind !== "stairs" && !path && r > 0.8) paintPebbles(c);
}

/** Dirt or grass, flecked with specks or tufts. */
function paintForestGround(c: CanvasRenderingContext2D, { x, y, seed }: ForestSpot, path: boolean, dark: boolean) {
  c.fillStyle = path ? "#625d42" : dark ? "#294d35" : "#30543a";
  c.fillRect(0, 0, 24, 24);
  c.fillStyle = path ? "#8d856033" : "#69985555";
  for (let i = 0; i < 4; i++) {
    const xx = tileRandom(x * 5 + i, y, seed) * 21;
    const yy = tileRandom(x, y * 5 + i, seed) * 21;
    c.fillRect(xx, yy, 1, path ? 1 : 3);
    if (!path) c.fillRect(xx - 1, yy - 1, 1, 2);
  }
}

function paintTree(c: CanvasRenderingContext2D) {
  c.fillStyle = "#162c2566"; c.beginPath(); c.ellipse(12, 18, 11, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#64513b"; c.fillRect(10, 11, 4, 12);
  for (let i = 0; i < 3; i++) {
    c.fillStyle = ["#1b392b", "#24503a", "#356548"][i];
    c.beginPath(); c.moveTo(12, i * 4); c.lineTo(2 + i, 14 + i * 3); c.lineTo(22 - i, 14 + i * 3); c.closePath(); c.fill();
  }
}

function paintBoulder(c: CanvasRenderingContext2D) {
  c.fillStyle = "#606e65"; c.beginPath(); c.moveTo(3, 17); c.lineTo(5, 8); c.lineTo(15, 5); c.lineTo(21, 13); c.lineTo(18, 21); c.lineTo(7, 21); c.fill();
  c.fillStyle = "#94a08a"; c.fillRect(7, 8, 8, 2);
  c.fillStyle = "#55724b"; c.fillRect(4, 18, 9, 3);
}

function paintPebbles(c: CanvasRenderingContext2D) {
  c.fillStyle = "#82927b"; c.fillRect(5, 17, 4, 2); c.fillRect(14, 8, 3, 2);
}

// World-space landmark: its doorway meets the actual interactive stairs tile.
// `numeral` (once a second tier is open) glows over the doorway: the tier
// the path leads into.
// `bonus` (the tier's Gold multiplier, "×3.1", and the Gold coin once loaded)
// stands in a line under the numeral, which rises to make room for it.
export function drawEntrance(c: CanvasRenderingContext2D, mode: Mode, center: number, numeral = "", bonus?: { text: string; coin: CanvasImageSource | null }) {
  const x = center * 24 + 12, base = (OUTSIDE_SIZE - 1 - ENTRANCE_Y) * 24;
  c.save();
  if (mode === "tower") drawTowerGate(c, x, base);
  else drawCaveMouth(c, x, base);
  const y = base - (mode === "tower" ? 66 : 76);
  if (numeral) {
    drawTierNumeral(c, numeral, x, bonus ? y - 24 : y);
    if (bonus) drawGoldBonus(c, bonus.text, bonus.coin, x, y);
  }
  c.restore();
}

/** The Gold coin, ×, and the multiplier, centred on (x, y), in gold. */
function drawGoldBonus(c: CanvasRenderingContext2D, text: string, coin: CanvasImageSource | null, x: number, y: number) {
  const size = 14, gap = 3, width = size + gap + text.length * 8, left = x - width / 2;
  if (coin) { c.save(); c.imageSmoothingEnabled = false; c.drawImage(coin, left, y - size / 2, size, size); c.restore(); }
  c.font = "700 14px Cinzel";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.shadowColor = "#ffc94a";
  c.shadowBlur = 8;
  c.fillStyle = "#ffe9a8";
  c.fillText(text, left + size + gap, y + 1);
}

/** The tier's number, glowing gold. */
function drawTierNumeral(c: CanvasRenderingContext2D, numeral: string, x: number, y: number) {
  c.font = "700 22px Cinzel";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = "#ffc94a";
  c.shadowBlur = 14;
  c.fillStyle = "#ffe9a8";
  c.fillText(numeral, x, y);
  c.shadowBlur = 4;
  c.fillStyle = "#fff6d8";
  c.fillText(numeral, x, y);
}

/** The tower's stone foot, its arched doorway and steps. */
function drawTowerGate(c: CanvasRenderingContext2D, x: number, base: number) {
  c.fillStyle = "#263333"; c.fillRect(x - 100, 0, 200, base + 6);
  c.fillStyle = "#66716c"; c.fillRect(x - 83, 0, 166, base);
  for (let row = 0; row < 9; row++) for (let col = -4; col < 4; col++) {
    c.fillStyle = (row + col) % 3 ? "#748078" : "#818b7e";
    c.fillRect(x + col * 24 + (row % 2) * 12, row * 19, 22, 17);
  }
  c.fillStyle = "#3e4c49"; c.fillRect(x - 100, 0, 20, base + 2); c.fillRect(x + 80, 0, 20, base + 2);
  c.fillStyle = "#9ba38c"; c.fillRect(x - 102, 0, 24, 8); c.fillRect(x + 78, 0, 24, 8);
  for (const dx of [-55, 55]) { c.fillStyle = "#243333"; c.fillRect(x + dx - 5, 35, 10, 30); c.fillStyle = "#a3a184"; c.fillRect(x + dx - 7, 65, 14, 3); }
  c.fillStyle = "#b1b49a"; c.beginPath(); c.arc(x, base - 22, 28, Math.PI, 0); c.lineTo(x + 28, base + 3); c.lineTo(x - 28, base + 3); c.fill();
  c.fillStyle = "#131f20"; c.beginPath(); c.arc(x, base - 22, 20, Math.PI, 0); c.lineTo(x + 20, base + 3); c.lineTo(x - 20, base + 3); c.fill();
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? "#909888" : "#717d72"; c.fillRect(x - 22 - i * 2, base + i * 6, 44 + i * 4, 5); }
  c.fillStyle = "#416648"; c.fillRect(x - 78, 80, 3, 53); c.fillRect(x + 72, 13, 3, 68);
}

/** The Delve cave: a craggy rock face around a dark opening. */
function drawCaveMouth(c: CanvasRenderingContext2D, x: number, base: number) {
  c.fillStyle = "#59665f";
  c.beginPath(); c.moveTo(x - 160, base + 5); c.lineTo(x - 146, 70); c.lineTo(x - 103, 19); c.lineTo(x - 74, 33); c.lineTo(x - 25, -16); c.lineTo(x + 48, 8); c.lineTo(x + 89, 3); c.lineTo(x + 139, 69); c.lineTo(x + 161, base + 9); c.closePath(); c.fill();
  c.fillStyle = "#758278"; c.beginPath(); c.moveTo(x - 103, 19); c.lineTo(x - 74, 33); c.lineTo(x - 48, 116); c.lineTo(x - 133, 93); c.fill();
  c.fillStyle = "#414f4c"; c.beginPath(); c.moveTo(x + 48, 8); c.lineTo(x + 26, 101); c.lineTo(x + 151, base); c.lineTo(x + 89, 3); c.fill();
  c.fillStyle = "#314d39"; c.beginPath(); c.moveTo(x - 146, 70); c.lineTo(x - 107, 90); c.lineTo(x - 111, 140); c.lineTo(x - 159, base); c.fill();
  c.fillStyle = "#182725"; c.beginPath(); c.moveTo(x - 35, base + 9); c.lineTo(x - 29, base - 34); c.lineTo(x - 9, base - 57); c.lineTo(x + 21, base - 46); c.lineTo(x + 38, base + 9); c.closePath(); c.fill();
  c.fillStyle = "#0e191a"; c.beginPath(); c.moveTo(x - 22, base + 8); c.lineTo(x - 16, base - 26); c.lineTo(x + 10, base - 36); c.lineTo(x + 23, base + 8); c.fill();
  c.fillStyle = "#828c75"; c.fillRect(x - 14, base + 6, 28, 4); c.fillRect(x - 18, base + 15, 36, 4);
}

/** The Blacksmith, in the same world space as the entrance: a small stone
 * forge under a slate roof, its door facing the path's side of the
 * clearing, a forge-lit window, a chimney, and on the roof's gable a banner
 * with a breastplate, so its purpose reads even when small. */
export function drawBlacksmith(c: CanvasRenderingContext2D, center: number) {
  const left = (center + BLACKSMITH.dx) * 24, w = BLACKSMITH.width * 24;
  const top = (OUTSIDE_SIZE - BLACKSMITH.y - BLACKSMITH.height) * 24, base = (OUTSIDE_SIZE - BLACKSMITH.y) * 24;
  const wallTop = top + 26;
  c.save();
  // Shadow on the grass, then the stone walls.
  c.fillStyle = "#16291f88"; c.fillRect(left - 2, base - 4, w + 6, 7);
  c.fillStyle = "#4d5550"; c.fillRect(left + 3, wallTop, w - 6, base - wallTop);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
    c.fillStyle = (row + col) % 3 ? "#6c746c" : "#79817a";
    c.fillRect(left + 4 + col * 13 + (row % 2) * 6, wallTop + 2 + row * 11, 12, 10);
  }
  c.fillStyle = "#3a403c"; c.fillRect(left + 3, base - 3, w - 6, 3);
  // The forge-lit window on the left, the chimney on the right.
  c.fillStyle = "#2a1a12"; c.fillRect(left + 9, wallTop + 9, 14, 12);
  c.fillStyle = "#ff9a3a"; c.fillRect(left + 11, wallTop + 11, 10, 8);
  c.fillStyle = "#ffd27a"; c.fillRect(left + 13, wallTop + 14, 6, 5);
  c.fillStyle = "#5b5f5a"; c.fillRect(left + w - 18, top - 4, 9, 20);
  c.fillStyle = "#3d403c"; c.fillRect(left + w - 19, top - 6, 11, 3);
  c.fillStyle = "#ff8a30"; c.fillRect(left + w - 16, top - 5, 5, 2);
  // The slate roof, overhanging the walls.
  c.fillStyle = "#2e3640";
  c.beginPath(); c.moveTo(left - 3, wallTop + 2); c.lineTo(left + 10, top + 2); c.lineTo(left + w - 10, top + 2); c.lineTo(left + w + 3, wallTop + 2); c.closePath(); c.fill();
  c.fillStyle = "#47525e";
  for (let i = 0; i < 3; i++) c.fillRect(left + 4 + i * 3, top + 7 + i * 6, w - 8 - i * 6, 2);
  c.fillStyle = "#1d232a"; c.fillRect(left - 3, wallTop + 1, w + 6, 3);
  // The door, toward the path.
  const door = left + w / 2 + 4;
  c.fillStyle = "#2b1d14"; c.fillRect(door - 8, base - 22, 16, 22);
  c.fillStyle = "#6b4a2c"; c.fillRect(door - 6, base - 20, 12, 20);
  c.fillStyle = "#4e3520"; c.fillRect(door - 1, base - 20, 2, 20);
  c.fillStyle = "#e0c070"; c.fillRect(door + 3, base - 11, 2, 2);
  // The banner on the gable: a breastplate on red cloth.
  drawBreastplateBanner(c, left + w / 2, top - 2);
  c.restore();
}

/** The Tournament Hall, in the same world space as the entrance: a pale
 * stone hall under a blue roof with gilded edges, columns either side of
 * its open doorway, toward the path, lit from inside, and on the gable a
 * blue pennant bearing a golden trophy. */
export function drawTournamentHall(c: CanvasRenderingContext2D, center: number) {
  const left = (center + TOURNAMENT_HALL.dx) * 24, w = TOURNAMENT_HALL.width * 24;
  const top = (OUTSIDE_SIZE - TOURNAMENT_HALL.y - TOURNAMENT_HALL.height) * 24, base = (OUTSIDE_SIZE - TOURNAMENT_HALL.y) * 24;
  const wallTop = top + 26;
  c.save();
  // Shadow on the grass, then the pale stone walls.
  c.fillStyle = "#16291f88"; c.fillRect(left - 4, base - 4, w + 6, 7);
  c.fillStyle = "#8f8a7c"; c.fillRect(left + 3, wallTop, w - 6, base - wallTop);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
    c.fillStyle = (row + col) % 3 ? "#b4ad9a" : "#c2bba6";
    c.fillRect(left + 4 + col * 13 + (row % 2) * 6, wallTop + 2 + row * 11, 12, 10);
  }
  c.fillStyle = "#6c6758"; c.fillRect(left + 3, base - 3, w - 6, 3);
  // The open doorway, toward the path (left), lit from inside, between columns.
  const door = left + w / 2 - 4;
  c.fillStyle = "#3a2a14"; c.fillRect(door - 9, base - 26, 18, 26);
  c.fillStyle = "#ffcf6a"; c.fillRect(door - 7, base - 24, 14, 24);
  c.fillStyle = "#fff0b8"; c.fillRect(door - 3, base - 18, 6, 18);
  for (const x of [door - 13, door + 9]) {
    c.fillStyle = "#e4dfcf"; c.fillRect(x, base - 30, 4, 30);
    c.fillStyle = "#9c9686"; c.fillRect(x + 3, base - 30, 1, 30);
  }
  c.fillStyle = "#e4dfcf"; c.fillRect(door - 14, base - 33, 28, 4);
  // A lit window on the right.
  c.fillStyle = "#3a2a14"; c.fillRect(left + w - 21, wallTop + 9, 12, 12);
  c.fillStyle = "#ffcf6a"; c.fillRect(left + w - 19, wallTop + 11, 8, 8);
  // The blue roof, gilded along its eaves.
  c.fillStyle = "#24407a";
  c.beginPath(); c.moveTo(left - 3, wallTop + 2); c.lineTo(left + 10, top + 2); c.lineTo(left + w - 10, top + 2); c.lineTo(left + w + 3, wallTop + 2); c.closePath(); c.fill();
  c.fillStyle = "#3a5ca0";
  for (let i = 0; i < 3; i++) c.fillRect(left + 4 + i * 3, top + 7 + i * 6, w - 8 - i * 6, 2);
  c.fillStyle = "#d9a632"; c.fillRect(left - 3, wallTop + 1, w + 6, 3);
  // The pennant on the gable: a golden trophy on blue cloth.
  drawTrophyBanner(c, left + w / 2, top - 2);
  c.restore();
}

/** A hanging blue pennant, 18 wide, with a golden trophy on it, its top
 * centred on (x, y). */
function drawTrophyBanner(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = "#3a2414"; c.fillRect(x - 11, y, 22, 3);
  c.fillStyle = "#1f3f8e";
  c.beginPath(); c.moveTo(x - 9, y + 3); c.lineTo(x + 9, y + 3); c.lineTo(x + 9, y + 24); c.lineTo(x, y + 20); c.lineTo(x - 9, y + 24); c.closePath(); c.fill();
  c.fillStyle = "#3a62c0"; c.fillRect(x - 9, y + 3, 18, 2);
  // The trophy: a cup with handles on a stem and base.
  c.fillStyle = "#ffd34d";
  c.beginPath(); c.moveTo(x - 5, y + 6); c.lineTo(x + 5, y + 6); c.lineTo(x + 4, y + 11); c.lineTo(x + 1, y + 13); c.lineTo(x - 1, y + 13); c.lineTo(x - 4, y + 11); c.closePath(); c.fill();
  c.fillRect(x - 7, y + 7, 2, 3); c.fillRect(x + 5, y + 7, 2, 3);
  c.fillRect(x - 1, y + 13, 2, 3); c.fillRect(x - 4, y + 16, 8, 2);
  c.fillStyle = "#a8781a"; c.fillRect(x + 2, y + 7, 1, 4);
}

/** A hanging red banner, 18 wide, with a pale breastplate on it, its top
 * centred on (x, y). */
function drawBreastplateBanner(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = "#3a2414"; c.fillRect(x - 11, y, 22, 3);
  c.fillStyle = "#8e2a22";
  c.beginPath(); c.moveTo(x - 9, y + 3); c.lineTo(x + 9, y + 3); c.lineTo(x + 9, y + 24); c.lineTo(x, y + 20); c.lineTo(x - 9, y + 24); c.closePath(); c.fill();
  c.fillStyle = "#b8442f"; c.fillRect(x - 9, y + 3, 18, 2);
  // The breastplate: shoulders, a chest narrowing to the waist, and its ridge.
  c.fillStyle = "#e3e6e8";
  c.beginPath();
  c.moveTo(x - 6, y + 6); c.lineTo(x - 2, y + 7); c.lineTo(x + 2, y + 7); c.lineTo(x + 6, y + 6);
  c.lineTo(x + 5, y + 11); c.lineTo(x + 4, y + 16); c.lineTo(x - 4, y + 16); c.lineTo(x - 5, y + 11);
  c.closePath(); c.fill();
  c.fillStyle = "#9aa3ab"; c.fillRect(x - 0.5, y + 8, 1, 8); c.fillRect(x - 4, y + 15, 8, 1);
}
