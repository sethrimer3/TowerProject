import { CHUNK, COLORS } from "./config.ts";
import { drawCornerBricks, drawTerrain, themeAt, type Corner } from "./themes.ts";
import { tileRandom } from "./random.ts";
import type { Enemy, EnemyStrength, Mode, Tile, Torch } from "./entities.ts";
import { drawForestTile, type Roads } from "./outside.ts";
import { getTorchFlicker, getTorchSway } from "./lighting.ts";
import { drawArea1Door, drawArea1Item, drawArea1Quoins, wallAdjacencyMask } from "./area1-tileset.ts";
import { drawThemedTile } from "./themed-tilesets.ts";
import { doorColor, doorRule, drainsHp } from "./doors.ts";
import { drawEnemySprite, enemySpriteReady } from "./enemy-sprites.ts";
import { DELVE_ENEMY_NAMES } from "./scaling.ts";
import { drawGameSprite, drawGameSpriteFrame, gameSprite, torchAnimationFrame, TORCH_FRAME_COUNT } from "./game-sprites.ts";

// Everything here paints in 24x24 tile space: the caller translates and
// scales the context to the tile first.

/** Thin outline colors that mark ground items/treasure as interactable,
 * independent of each sprite's own fill colors. Enemies have their own look
 * (ENEMY_LOOK). */
const DARK_GOLD = "#6e4c17";
const DARK_ORANGE = "#7d3f14";
const DARK_BLUE = "#1a3670";
/** Outline thickness in sprite pixels (24x24 sprite space) — chunky pixel-art
 * strokes rather than a thin 1px line. */
const OUTLINE_THICKNESS = 2;

/** How the board looks: which art set applies, and the player's settings. */
export type BoardLook = {
  mode: Mode;
  height: number;
  seed: number;
  outside: boolean;
  /** The forest entrance column (outside only). */
  entranceX: number;
  /** The roads laid to the clearing's buildings (outside only). */
  roads?: Roads;
  spritesOff: boolean;
  reduceMotion: boolean;
  /** Whether the first Tower section's hand-drawn art is showing: its own
   * doors, chests, floor, and the torch relief on that floor. Never with
   * sprites off, so shadows and relief always match what is drawn. */
  area1: boolean;
};
type TileWorld = { tile(x: number, y: number): Tile | undefined };
/** What a contents painter needs besides the tile: its position (for
 * per-tile variation), the time (for sparkles), and which art to use.
 * `lifted` items are off the ground (a reward rising from its tile), so they
 * cast no ground shadow. */
export type TileArt = { x: number; y: number; time: number; spritesOff: boolean; reduceMotion: boolean; area1: boolean; lifted?: boolean };

/** The first Tower section has its own hand-drawn doors, chests, and floor. */
export const isArea1 = (mode: Mode, height: number) => mode === "tower" && height >= 0 && height < 10;

/** Paints one tile. Layer 0 is the ground (terrain), layer 1 whatever stands
 * on it (items, doors, enemies...). Returns false while ground art is still
 * loading, so cached layers know to repaint it. */
export function paintTile(c: CanvasRenderingContext2D, world: TileWorld, t: Tile, x: number, y: number, time: number, layer: 0 | 1, look: BoardLook) {
  if (look.outside) return layer !== 0 || drawForestTile(c, t, { x, y, seed: look.seed, center: look.entranceX, roads: look.roads }, !look.spritesOff);
  if (layer === 0) return paintGround(c, world, t, x, y, look);
  if (t.kind === "wall" || t.kind === "floor") return true;
  paintContents(c, t, { x, y, time, spritesOff: look.spritesOff, reduceMotion: look.reduceMotion, area1: look.area1 });
  return true;
}

function paintGround(c: CanvasRenderingContext2D, world: TileWorld, t: Tile, x: number, y: number, look: BoardLook) {
  const wallAt = (dx: number, dy: number) => world.tile(x + dx, y + dy)?.kind === "wall";
  const neighbors = {
    northWall: wallAt(0, 1),
    southWall: wallAt(0, -1),
    westWall: wallAt(-1, 0),
    eastWall: wallAt(1, 0),
  };
  const wall = t.kind === "wall";
  const terrain = { mode: look.mode, height: look.height, seed: look.seed, x, y, wall, empty: t.kind === "floor", neighbors };
  // Every biome has a PNG floor/wall set. Images load asynchronously; until
  // ready (or if an asset fails), the procedural renderer remains a complete
  // fallback and the Sprites setting can still opt out of bitmap art.
  const drewSprite = !look.spritesOff && drawThemedTile(c, look.mode, look.height, wall, x, y, look.seed, neighbors);
  if (!drewSprite) drawTerrain(c, terrain);
  if (wall) {
    const decor = themeAt(look.mode, look.height, x, y, look.seed).decor;
    const area1Art = drewSprite && decor === 0;
    // Inner room corners: walls on both sides, the room's corner diagonally
    // across. The second biome's wall sprites run no mortar strip along their
    // edges for a corner brick to meet, so they go without.
    if (!(drewSprite && decor === 1)) drawCornerBricks(c, terrain, openCorners(world, x, y, (side) => side), area1Art);
    // Outer corners of a wall: open on both sides and diagonally, where two
    // exposed rims meet. Only the area1 art has rims to wrap a quoin round.
    if (area1Art) drawArea1Quoins(c, wallAdjacencyMask(neighbors), openCorners(world, x, y, (side) => !side));
  }
  return drewSprite || look.spritesOff;
}

/** The corners of a tile with an open tile diagonally across them whose two
 * side neighbours' wall-ness (true for a wall) passes `sides`. North is +y
 * in the world and the top of the tile. */
function openCorners(world: TileWorld, x: number, y: number, sides: (wall: boolean) => boolean) {
  const kindAt = (dx: number, dy: number) => world.tile(x + dx, y + dy)?.kind;
  const corners: Corner[] = [];
  for (const [corner, dx, dy] of [["nw", -1, 1], ["ne", 1, 1], ["sw", -1, -1], ["se", 1, -1]] as const) {
    const diagonal = kindAt(dx, dy);
    if (diagonal === undefined || diagonal === "wall") continue;
    if (sides(kindAt(0, dy) === "wall") && sides(kindAt(dx, 0) === "wall")) corners.push(corner);
  }
  return corners;
}

type Painter = (c: CanvasRenderingContext2D, t: Tile, art: TileArt) => void;
const PAINTERS: Partial<Record<Tile["kind"], Painter>> = {
  oneway: paintOneway,
  stairs: paintStairs,
  stairsDown: paintStairsDown,
  key: paintKey,
  door: paintDoor,
  potion: paintPotion,
  attack: paintAttack,
  defense: paintDefense,
  openedChest: paintOpenedChest,
  reward: paintReward,
  treasure: paintTreasure,
  enemy: paintEnemy,
};
/** Doors, stairs, items, chests, and enemies. */
export function paintContents(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  PAINTERS[t.kind]?.(c, t, art);
}

function paintOneway(c: CanvasRenderingContext2D) {
  c.fillStyle = "#8a7e93";
  c.fillRect(0, 10, 24, 5);
  c.fillStyle = "#a89fb3";
  c.beginPath(); c.moveTo(5, 14); c.lineTo(12, 5); c.lineTo(19, 14); c.fill();
}

function paintStairs(c: CanvasRenderingContext2D, _t: Tile, art: TileArt) {
  if (!art.spritesOff && drawGameSprite(c, "stairsUp")) return;
  const exit = art.y % CHUNK === CHUNK - 1;
  c.fillStyle = exit ? "#dec58c20" : "#8eacc520";
  c.fillRect(2, 1, 20, 22);
  // Restrained stone framing so stairways read as a deliberate architectural
  // feature rather than a plain floor tile with steps drawn on it.
  c.strokeStyle = exit ? "#e8c98a55" : "#9fb7cc45";
  c.lineWidth = 1;
  c.strokeRect(1.5, 0.5, 21, 23);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = exit ? "#bda67a" : "#65707b";
    c.fillRect(4, 11 + i * 3, 16, 2);
  }
  if (exit) {
    c.fillStyle = "#f1d396";
    c.beginPath();
    c.moveTo(12, 1);
    c.lineTo(6, 7);
    c.lineTo(10, 7);
    c.lineTo(10, 11);
    c.lineTo(14, 11);
    c.lineTo(14, 7);
    c.lineTo(18, 7);
    c.fill();
  }
}

function paintStairsDown(c: CanvasRenderingContext2D, _t: Tile, art: TileArt) {
  if (!art.spritesOff && drawGameSprite(c, "stairsDown")) return;
  c.fillStyle = "#7a9a9420";
  c.fillRect(2, 1, 20, 22);
  c.strokeStyle = "#a9d0c845";
  c.lineWidth = 1;
  c.strokeRect(1.5, 0.5, 21, 23);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = "#6f8a86";
    c.fillRect(4, 6 + i * 3, 16, 2);
  }
  c.fillStyle = "#bcd9d2";
  c.beginPath();
  c.moveTo(12, 22);
  c.lineTo(6, 16);
  c.lineTo(10, 16);
  c.lineTo(10, 12);
  c.lineTo(14, 12);
  c.lineTo(14, 16);
  c.lineTo(18, 16);
  c.fill();
}

function paintKey(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 11, 18, 5, 1.8, 0.3);
  withOutline(c, DARK_GOLD, (c) => {
    if (!art.spritesOff && drawArea1Item(c, t)) return;
    c.strokeStyle = COLORS[t.color!];
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(15, 7, 4, 0, Math.PI * 2);
    c.moveTo(12, 10);
    c.lineTo(5, 18);
    c.lineTo(3, 16);
    c.moveTo(8, 15);
    c.lineTo(6, 13);
    c.stroke();
  });
}

function paintDoor(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (art.area1 && drawArea1Door(c, t)) return;
  c.fillStyle = "#090d14";
  c.fillRect(4, 2, 16, 22);
  c.fillStyle = doorColor(t);
  c.fillRect(5, 4, 14, 19);
  const rule = doorRule(t);
  if (rule.type === "wood") return paintDoorPlanks(c);
  c.fillStyle = "#101b28bb";
  c.fillRect(7, 5, 10, 17);
  if (drainsHp(rule)) return paintDoorHeart(c);
  c.fillStyle = doorColor(t);
  c.fillRect(11, 10, 3, 7);
  c.fillRect(10, 9, 5, 4);
}

/** A Wooden Door: planks with dark seams and a crossbar, no keyhole. */
function paintDoorPlanks(c: CanvasRenderingContext2D) {
  c.fillStyle = "#5b3b20";
  for (const x of [9, 13]) c.fillRect(x, 4, 1, 19);
  c.fillRect(5, 12, 14, 2);
  c.fillStyle = "#c08a55";
  c.fillRect(6, 5, 2, 1);
  c.fillRect(10, 5, 2, 1);
  c.fillRect(14, 5, 2, 1);
}

/** A Heart Door's panel bears a heart in place of the keyhole (on a keyed
 * door that also drains HP, the door keeps its colour). */
function paintDoorHeart(c: CanvasRenderingContext2D) {
  c.fillStyle = "#e0445a";
  c.beginPath();
  c.moveTo(12, 19);
  c.lineTo(7.6, 14.2);
  c.arc(10, 12, 2.6, Math.PI * 0.82, Math.PI * 1.95);
  c.arc(14, 12, 2.6, Math.PI * 1.05, Math.PI * 0.18);
  c.closePath();
  c.fill();
  c.fillStyle = "#ffd0d6";
  c.fillRect(9, 11, 2, 1);
}

function paintPotion(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 12, 22, 6, 1.6, 0.3);
  withOutline(c, DARK_GOLD, (c) => {
    if (!art.spritesOff && drawArea1Item(c, t)) return;
    const isPercent = t.color === "red";
    c.fillStyle = "#bbc4ca";
    c.fillRect(9, 4, 6, 5);
    c.fillRect(6, 10, 12, 11);
    c.fillStyle = COLORS[t.color ?? "blue"];
    c.fillRect(8, 12, 8, 7);
    if (isPercent) {
      // Diagonal stripes distinguish the percent potion by shape, not just color.
      c.fillStyle = "#ffffffaa";
      c.fillRect(9, 12, 1, 7);
      c.fillRect(12, 12, 1, 7);
      c.fillRect(15, 12, 1, 7);
    } else {
      // Solid highlight plus a "+" mark identifies the flat-heal potion.
      c.fillStyle = "#ffffffcc";
      c.fillRect(11, 13, 2, 5);
      c.fillRect(9, 15, 6, 1);
    }
    c.fillStyle = "#ffd9d9";
    c.fillRect(8, 12, 2, 4);
    c.fillStyle = "#bd9661";
    c.fillRect(9, 3, 6, 3);
  });
}

function paintAttack(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 12, 22, 6, 1.6, 0.3);
  withOutline(c, DARK_GOLD, (c) => {
    if (!art.spritesOff && drawArea1Item(c, t)) return;
    c.save();
    c.translate(12, 12);
    c.rotate(-2.35);
    c.fillStyle = "#dbe3e7";
    c.fillRect(-2, -10, 4, 15);
    c.fillStyle = "#8194a2";
    c.fillRect(0, -8, 2, 12);
    c.fillStyle = "#d6ad60";
    c.fillRect(-6, 4, 12, 3);
    c.fillStyle = "#8f6545";
    c.fillRect(-2, 7, 4, 4);
    c.restore();
  });
}

function paintDefense(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 12, 22, 6, 1.6, 0.3);
  withOutline(c, DARK_GOLD, (c) => {
    if (!art.spritesOff && drawArea1Item(c, t)) return;
    c.fillStyle = "#9cb0c2";
    c.beginPath();
    c.moveTo(4, 4);
    c.lineTo(12, 2);
    c.lineTo(20, 4);
    c.lineTo(18, 16);
    c.lineTo(12, 22);
    c.lineTo(6, 16);
    c.fill();
    c.fillStyle = "#416391";
    c.fillRect(7, 6, 10, 9);
    c.fillRect(10, 13, 5, 5);
    c.fillStyle = "#b9d3e8";
    c.fillRect(10, 5, 2, 12);
  });
}

function paintOpenedChest(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 12, 22.5, 9, 1.8, 0.25);
  withOutline(c, DARK_GOLD, (c) => {
    if (art.area1 && drawArea1Item(c, t)) return;
    const metal = t.tier ? { silver: "#9aa8b8", gold: "#d5a943" }[t.tier] : "#b98a3e";
    c.fillStyle = "#151b22"; c.fillRect(4, 8, 16, 8);
    c.fillStyle = metal; c.fillRect(3, 5, 18, 3); c.fillRect(3, 17, 18, 4); c.fillRect(3, 8, 3, 11); c.fillRect(18, 8, 3, 11);
  });
}

function paintReward(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 12, 22.5, 8, 1.8, 0.32);
  withOutline(c, DARK_GOLD, (c) => {
    if (art.area1 && drawArea1Item(c, t)) return;
    const metal = { silver: "#c5d0df", gold: "#f5cd62" }[t.tier!];
    c.fillStyle = metal;
    c.shadowColor = metal;
    c.shadowBlur = 5;
    c.fillRect(3, 7, 18, 14);
    c.shadowBlur = 0;
    c.fillStyle = "#283040";
    c.fillRect(5, 9, 14, 10);
    c.fillStyle = metal;
    c.fillRect(3, 12, 18, 2);
    c.fillRect(10, 11, 4, 6);
  });
  for (let i = 0; i < 2; i++) {
    const phase = art.reduceMotion ? 0.6 : (Math.sin(art.time / 240 + i * 2 + art.x + art.y) + 1) / 2;
    c.globalAlpha = 0.25 + phase * 0.75;
    c.fillStyle = "#ffffff";
    const sx = 5 + i * 14, sy = i ? 4 : 7;
    c.fillRect(sx - 1, sy, 3, 1); c.fillRect(sx, sy - 1, 1, 3);
  }
  c.globalAlpha = 1;
}

function paintTreasure(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (!art.lifted) groundShadow(c, 12, 22.5, 8, 1.8, 0.32);
  withOutline(c, DARK_GOLD, (c) => {
    if (art.area1 && drawArea1Item(c, t)) return;
    c.fillStyle = "#d0a34d";
    c.fillRect(3, 7, 18, 14);
    c.fillStyle = "#714829";
    c.fillRect(5, 9, 14, 10);
    c.fillStyle = "#ebbd58";
    c.fillRect(3, 12, 18, 2);
    c.fillRect(10, 11, 4, 6);
  });
  for (let i = 0; i < 2; i++) {
    const phase = art.reduceMotion ? 0.55 : (Math.sin(art.time / 300 + i * 3 + art.x + art.y) + 1) / 2;
    c.globalAlpha = 0.2 + phase * 0.65; c.fillStyle = "#ffe6a0";
    const sx = i ? 19 : 5, sy = i ? 5 : 8;
    c.fillRect(sx - 1, sy, 3, 1); c.fillRect(sx, sy - 1, 1, 3);
  }
  c.globalAlpha = 1;
}

/** Procedural enemy bodies by tier, for when sprite art is off or missing. */
const ENEMY_BODIES: ((c: CanvasRenderingContext2D) => void)[] = [
  (c) => {
    c.fillStyle = "#568c45";
    c.fillRect(4, 12, 17, 8);
    c.fillRect(7, 7, 11, 7);
    c.fillStyle = "#8abc58";
    c.fillRect(8, 7, 7, 3);
  },
  (c) => {
    c.fillStyle = "#c6c3b0";
    c.fillRect(7, 3, 10, 9);
    c.fillRect(10, 12, 4, 7);
    c.fillRect(6, 13, 12, 2);
    c.fillRect(7, 18, 3, 5);
    c.fillRect(15, 18, 3, 5);
    c.fillStyle = "#686d77";
    c.fillRect(3, 12, 3, 8);
  },
  (c) => {
    c.fillStyle = "#934354";
    c.fillRect(9, 9, 8, 12);
    c.fillRect(2, 6, 6, 9);
    c.fillRect(18, 6, 5, 9);
    c.fillRect(6, 10, 14, 5);
  },
  (c) => {
    c.fillStyle = "#554985";
    c.fillRect(6, 8, 13, 14);
    c.fillRect(9, 3, 8, 10);
    c.fillStyle = "#222033";
    c.fillRect(8, 9, 10, 7);
  },
];

/** A band round an enemy's silhouette: every pixel within `r` sprite pixels
 * of it, in `color` at `alpha`. */
type Ring = { r: number; color: string; alpha: number };
const RED = "#9c1f2e", BRIGHT_RED = "#ff3b2b", GOLD_RIM = "#f4c64e", VIOLET_RIM = "#b45cff", CHEVRON = "#ffe6a8";
/** How an enemy's strength shows: bands outside its black outline (the
 * outermost first), and rank chevrons over the sprite. Normal is a dark red
 * rim fading out, weak the same with one chevron pointing down (`down`),
 * strong a bright red one with one chevron, elite a bright
 * red band inside a gold rim with two, a boss the elite's bands with
 * three, and a Greater Boss a gold band inside a violet rim with four. Only opaque bands cast torch shadows
 * (see toShadow in entity-lighting.ts), so the faint outer glow never
 * fattens one. */
const ENEMY_LOOK: Record<EnemyStrength, { rings: Ring[]; chevrons: number; down?: true }> = {
  weak: { rings: [{ r: 3, color: RED, alpha: 0.3 }, { r: 2, color: RED, alpha: 1 }], chevrons: 1, down: true },
  normal: { rings: [{ r: 3, color: RED, alpha: 0.3 }, { r: 2, color: RED, alpha: 1 }], chevrons: 0 },
  strong: { rings: [{ r: 3, color: BRIGHT_RED, alpha: 0.45 }, { r: 2, color: BRIGHT_RED, alpha: 1 }], chevrons: 1 },
  elite: { rings: [{ r: 3, color: GOLD_RIM, alpha: 1 }, { r: 2, color: BRIGHT_RED, alpha: 1 }], chevrons: 2 },
  boss: { rings: [{ r: 3, color: GOLD_RIM, alpha: 1 }, { r: 2, color: BRIGHT_RED, alpha: 1 }], chevrons: 3 },
  greaterBoss: { rings: [{ r: 3, color: VIOLET_RIM, alpha: 1 }, { r: 2, color: GOLD_RIM, alpha: 1 }], chevrons: 4 },
};
/** The one-pixel black outline hugging every enemy, inside its glow.
 * Cardinal only, so the silhouette's outer corners stay crisp. */
const ENEMY_OUTLINE: Ring = { r: 1, color: "#0b0a0e", alpha: 1 };
/** Room round a baked enemy for its outermost ring. */
const ENEMY_MARGIN = 3;
/** Baked enemies by name, tier, strength, and whether the sprite art drew. */
const bakedEnemies = new Map<string, HTMLCanvasElement>();

function paintEnemy(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  const e = t.enemy!;
  groundShadow(c, 12, 21, 8, 2.6, 0.4);
  const sprite = !art.spritesOff && enemySpriteReady(e.name);
  const key = `${e.name}|${e.tier}|${e.strength}|${sprite}`;
  let baked = bakedEnemies.get(key);
  if (!baked) bakedEnemies.set(key, (baked = bakeEnemy(e, sprite)));
  c.drawImage(baked, -ENEMY_MARGIN, -ENEMY_MARGIN);
}

/** An enemy with its glow, outline, and chevrons, on a canvas ENEMY_MARGIN
 * wider than the tile on every side. The rings go on from the outside in,
 * each cutting out what lies inside it first, so every band keeps exactly
 * its own opacity; the sprite goes on last. */
function bakeEnemy(e: Enemy, sprite: boolean) {
  const m = ENEMY_MARGIN, body = square(24), bc = body.getContext("2d")!;
  if (!(sprite && drawEnemySprite(bc, e.name))) paintEnemyBody(bc, e);
  const out = square(24 + 2 * m), oc = out.getContext("2d")!;
  const look = ENEMY_LOOK[e.strength];
  for (const ring of [...look.rings, ENEMY_OUTLINE]) {
    const band = dilated(body, ring, m);
    oc.globalAlpha = 1;
    oc.globalCompositeOperation = "destination-out";
    oc.drawImage(band, 0, 0);
    oc.globalCompositeOperation = "source-over";
    oc.globalAlpha = ring.alpha;
    oc.drawImage(band, 0, 0);
  }
  oc.globalAlpha = 1;
  oc.drawImage(body, m, m);
  for (let i = 0; i < look.chevrons; i++) chevron(oc, m + 1, m + 1 + i * 4, look.down);
  return out;
}

/** `body`'s silhouette grown by `ring.r` pixels (a round disc of shifts, or
 * the four cardinal ones at r = 1) in the ring's color, offset by margin `m`. */
function dilated(body: HTMLCanvasElement, ring: Ring, m: number) {
  const size = body.width + 2 * m, band = square(size), c = band.getContext("2d")!;
  for (let dy = -ring.r; dy <= ring.r; dy++)
    for (let dx = -ring.r; dx <= ring.r; dx++) if (dx * dx + dy * dy <= ring.r * ring.r) c.drawImage(body, m + dx, m + dy);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = ring.color;
  c.fillRect(0, 0, size, size);
  return band;
}

/** One rank chevron: a small upward wedge, 5x3, on a black backing, or a
 * downward one (`down`, a weak enemy's). */
function chevron(c: CanvasRenderingContext2D, x: number, y: number, down = false) {
  const up = [[2, 1], [1, 3], [0, 5]] as const;
  const rows = down ? [...up].reverse() : up;
  c.fillStyle = "#0b0a0e";
  rows.forEach(([dx, w], i) => c.fillRect(x + dx - 1, y + i - 1, w + 2, 3));
  c.fillStyle = CHEVRON;
  rows.forEach(([dx, w], i) => c.fillRect(x + dx, y + i, w, 1));
}

/** The procedural body, for when sprite art is off or missing: each Delve
 * kind has its own, and other enemies take the body for their tier. */
function paintEnemyBody(c: CanvasRenderingContext2D, e: Enemy) {
  const kind = DELVE_ENEMY_NAMES.indexOf(e.name), body = kind >= 0 ? kind : e.tier;
  (ENEMY_BODIES[body] ?? ENEMY_BODIES[3])(c);
  c.fillStyle = body === 1 ? "#17202a" : "#f5ca7d";
  c.fillRect(9, 11, 2, 2);
  c.fillRect(15, 11, 2, 2);
}

function square(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}

/** The hero with its grounding shadow and outline. */
export function paintHero(c: CanvasRenderingContext2D, spritesOff: boolean) {
  groundShadow(c, 12, 22, 8, 2.6, 0.4);
  withOutline(c, DARK_BLUE, (c) => {
    if (!spritesOff && drawGameSprite(c, "player")) return;
    paintHeroFallback(c);
  });
}
/** The procedural hero, used when sprite art is off or missing. */
export function paintHeroFallback(c: CanvasRenderingContext2D) {
  // Extremely subtle local contrast disc (not a light source) so the hero
  // silhouette stays easy to spot against both lit and unlit floor tiles.
  c.fillStyle = "#7bacdf22";
  c.beginPath();
  c.arc(12, 14, 13, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#070c16";
  c.fillRect(5, 20, 16, 3);
  c.fillStyle = "#337bbb";
  c.fillRect(5, 10, 13, 12);
  c.fillStyle = "#74b5e9";
  c.fillRect(7, 10, 3, 11);
  c.fillStyle = "#c3ccd1";
  c.fillRect(9, 10, 9, 7);
  c.fillStyle = "#c99771";
  c.fillRect(9, 4, 8, 7);
  c.fillStyle = "#624531";
  c.fillRect(8, 2, 10, 5);
  c.fillRect(7, 4, 3, 5);
  c.fillStyle = "#dce4e5";
  c.fillRect(20, 5, 2, 13);
  c.fillStyle = "#e0ba72";
  c.fillRect(18, 17, 6, 2);
  c.fillStyle = "#8d7564";
  c.fillRect(8, 21, 4, 3);
  c.fillRect(15, 21, 4, 3);
}

/** Torch + a living flame: the flame stretches, shrinks, and leans side
 * to side from its base (in step with the light's sway), and its core
 * pulses with the light's flicker. The handle stays put. */
export function paintTorch(c: CanvasRenderingContext2D, t: Torch, now: number, reduceMotion: boolean, spritesOff: boolean) {
  const sway = getTorchSway(t, now, reduceMotion);
  const flicker = getTorchFlicker(t, now, reduceMotion);
  // Small deterministic per-torch variation (flame height/width) so a room
  // full of torches doesn't read as one sprite stamped repeatedly.
  const jitter = tileRandom(t.x, t.y, 0x7a4c);
  const flameH = 8 + Math.round(jitter * 2); // 8-9px
  const flameTopY = 13 - flameH;
  const flameW = jitter > 0.5 ? 6 : 5;
  const flameX = 12 - flameW / 2;
  const spriteFrames = !spritesOff && !!gameSprite("torchFrames");
  const frame = torchAnimationFrame(t.x, t.y, now, reduceMotion);
  // Flame base in tile space (the PNG's flame meets its handle at row 36 of 96).
  const baseX = 12, baseY = spriteFrames ? 9 : 13, height = spriteFrames ? 9 : flameH;
  const leanPx = sway.x * 24 * 1.4;
  const bend = (c: CanvasRenderingContext2D) => {
    // Stretch vertically about the base and shear so the tip leans.
    c.translate(baseX, baseY);
    c.transform(1 / Math.sqrt(sway.stretch), 0, -leanPx / height, sway.stretch, 0, 0);
    c.translate(-baseX, -baseY);
  };
  withOutline(c, DARK_ORANGE, (c) => {
    c.imageSmoothingEnabled = false;
    if (spriteFrames && drawGameSpriteFrame(c, "torchFrames", frame, TORCH_FRAME_COUNT)) {
      return;
    }
    c.fillStyle = "#59412c";
    c.fillRect(10, 10, 4, 10);
    c.save();
    bend(c);
    c.fillStyle = "#df7b32";
    c.fillRect(flameX, flameTopY, flameW, flameH);
    c.fillStyle = "#ffe3a0";
    c.fillRect(11, flameTopY + 1, 3, flameH - 2);
    c.restore();
  });
  // Hot core glow that pulses with the flicker, following the lean.
  const coreX = baseX + leanPx * 0.45, coreY = baseY - height * 0.45 * sway.stretch;
  const pulse = Math.max(0, Math.min(1, 0.45 + (flicker - 1) * 5));
  const gr = c.createRadialGradient(coreX, coreY, 0, coreX, coreY, 6);
  gr.addColorStop(0, `rgba(255, 236, 170, ${0.55 * pulse})`);
  gr.addColorStop(1, "rgba(255, 160, 60, 0)");
  c.globalCompositeOperation = "lighter";
  c.fillStyle = gr;
  c.fillRect(coreX - 6, coreY - 6, 12, 12);
}

/** Cheap, restrained grounding shadow: a soft dark ellipse under a sprite's
 * feet. No blur filter — a two-stop radial gradient reads as soft at this
 * tile scale for near-zero cost. */
function groundShadow(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha: number) {
  const gr = c.createRadialGradient(cx, cy, 0, cx, cy, rx);
  gr.addColorStop(0, `rgba(0,0,0,${alpha})`);
  gr.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.55})`);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.fillStyle = gr;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

let outlineCanvas: HTMLCanvasElement | null = null;
let outlineSilCanvas: HTMLCanvasElement | null = null;
/** Draws a sprite into an offscreen 24x24 buffer, then stamps a solid-color
 * silhouette outward along the four cardinal directions before the real
 * sprite on top — a chunky pixel-art outline that hugs the sprite's actual
 * shape. Diagonal shifts are deliberately omitted, so outer corners of the
 * silhouette stay bare instead of rounding out into a diagonal fill. */
function withOutline(c: CanvasRenderingContext2D, color: string, draw: (c: CanvasRenderingContext2D) => void) {
  const s = 24;
  outlineCanvas ??= document.createElement("canvas");
  outlineSilCanvas ??= document.createElement("canvas");
  const off = outlineCanvas, sil = outlineSilCanvas;
  off.width = s; off.height = s; sil.width = s; sil.height = s;
  const offCtx = off.getContext("2d")!, silCtx = sil.getContext("2d")!;
  offCtx.clearRect(0, 0, s, s);
  draw(offCtx);
  silCtx.clearRect(0, 0, s, s);
  silCtx.drawImage(off, 0, 0);
  silCtx.globalCompositeOperation = "source-in";
  silCtx.fillStyle = color;
  silCtx.fillRect(0, 0, s, s);
  silCtx.globalCompositeOperation = "source-over";
  c.save();
  for (let n = 1; n <= OUTLINE_THICKNESS; n++) {
    for (const [dx, dy] of [[-n, 0], [n, 0], [0, -n], [0, n]]) c.drawImage(sil, dx, dy);
  }
  c.restore();
  c.drawImage(off, 0, 0);
}
