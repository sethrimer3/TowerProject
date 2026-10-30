import type { ThemedBoard } from "./boards/themed-board.ts";
import type { Enemy, EnemyStrength, Mode, Tile, Torch } from "../entities.ts";
import { potionShade } from "../entities.ts";
import { drawForestTile, type Roads } from "../outside.ts";
import { doorRule, drainsHp } from "../doors.ts";
import { RANK_CHEVRONS } from "./rank-chevrons.ts";
import { drawKit, kitEnemy, onSpritesLoaded } from "../sprites/kit.ts";
import { COMBAT_MARKS } from "../sprites/combat.ts";
import { drawDungeonGround, dungeonDiagonals, dungeonMaterial, towerTileset } from "../sprites/dungeon.ts";
import { dungeonWallProfile } from "./wall-depth.ts";
import { dungeonDetail } from "./dungeon-details.ts";
import { drawAnimatedTorch, drawSquareDoor } from "../sprites/options.ts";
import { drawPickupAnimation, drawSpriteFrame } from "../sprites/animations.ts";
import { drawPixelOutline } from "../sprites/pixel-outline.ts";

// Everything here paints in 24x24 tile space: the caller translates and
// scales the context to the tile first.

/** Thin outline colors that mark ground items/treasure as interactable,
 * independent of each sprite's own fill colors. Enemies have their own look
 * (ENEMY_LOOK). */
/** How the board looks: which art set applies, and the player's settings. */
export type BoardLook = {
  mode: Mode;
  tier?: number;
  height: number;
  seed: number;
  outside: boolean;
  /** The forest entrance column (outside only). */
  entranceX: number;
  /** The roads laid to the clearing's buildings (outside only). */
  roads?: Roads;
  styledSprites?: boolean;
  spriteAnimations?: boolean;
  squareDoors?: boolean;
  reduceMotion: boolean;
  /** How the Game theme worn draws the board, or null for the lit
   * Classic art (always outside: the forest keeps its art), so what rises
   * off it wears that art too. */
  themed: ThemedBoard | null;
  /** Whether the tile at (x, y) stands on a Golden Floor (`Game.goldenAt`);
   * none while the run can't have one. */
  golden?: (x: number, y: number) => boolean;
};
type TileWorld = { tile(x: number, y: number): Tile | undefined };
/** What a contents painter needs besides the tile: its position (for
 * per-tile variation), the time (for sparkles), and which art to use.
 * `lifted` items are off the ground (a reward rising from its tile), so they
 * cast no ground shadow. */
export type TileArt = { x: number; y: number; time: number; reduceMotion: boolean; lifted?: boolean; styledSprites?: boolean; squareDoors?: boolean; spriteAnimations?: boolean; seed?: number; outline?: boolean };

/** Paints one tile. Layer 0 is the ground (terrain), layer 1 whatever stands
 * on it (items, doors, enemies...). Returns false while ground art is still
 * loading, so cached layers know to repaint it. */
export function paintTile(c: CanvasRenderingContext2D, world: TileWorld, t: Tile, x: number, y: number, time: number, layer: 0 | 1, look: BoardLook) {
  if (look.outside) return layer !== 0 || drawForestTile(c, t, { x, y, seed: look.seed, center: look.entranceX, roads: look.roads });
  if (layer === 0) return paintGround(c, world, t, x, y, look);
  if (t.kind === "wall" || t.kind === "floor") return true;
  paintContents(c, t, { x, y, time, reduceMotion: look.reduceMotion, styledSprites: look.styledSprites, squareDoors: look.squareDoors, spriteAnimations: look.spriteAnimations, seed: look.seed });
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
  const terrain = { mode: look.mode, tier: look.tier, height: look.height, seed: look.seed, x, y, wall, empty: t.kind === "floor", neighbors };
  const profile = wall ? dungeonWallProfile(world, x, y) : undefined;
  const detail = wall && profile?.depth === 0 && !towerTileset(look.mode, look.tier) ? dungeonDetail(world, x, y, look.seed,
    (xx, yy) => dungeonMaterial(look.mode, xx, yy, look.seed)) : undefined;
  const drawn = drawDungeonGround(c, terrain, dungeonDiagonals(world, look.mode, x, y, look.seed), profile, detail);
  if (drawn && !wall && look.golden?.(x, y)) gild(c, GOLDEN_GROUND);
  return drawn;
}

/** How a Golden Floor wears its gold: on its open ground or its walls, in
 * which colour, blended how. Gold belongs to Golden Floors alone. */
export type GoldenLook = {
  on: "floor" | "wall"; color: string; blend: GlobalCompositeOperation; alpha: number;
  /** A second coat brightening the gold: `lift`, blended by `liftBlend` (a screen by default). */
  lift?: string; liftBlend?: GlobalCompositeOperation;
};
/** The Classic stone's own shading in gold, lifted a little so the dark
 * paving still reads as gold. */
export const GOLDEN_GROUND: GoldenLook = { on: "floor", color: "#ffc23a", blend: "color", alpha: 1, lift: "rgba(255, 196, 64, 0.42)" };
/** Gilds the tile in tile space (24x24) as `look` says. */
export function gild(c: CanvasRenderingContext2D, look: GoldenLook) {
  c.save();
  c.globalCompositeOperation = look.blend;
  c.globalAlpha = look.alpha;
  c.fillStyle = look.color;
  c.fillRect(0, 0, 24, 24);
  if (look.lift) {
    c.globalCompositeOperation = look.liftBlend ?? "screen";
    c.globalAlpha = 1;
    c.fillStyle = look.lift;
    c.fillRect(0, 0, 24, 24);
  }
  c.restore();
}

/** Classic contents always use the decoded PNG kit; themes paint their own contents. */
export function paintContents(c: CanvasRenderingContext2D, t: Tile, art: TileArt) {
  if (t.kind === "enemy") { paintEnemy(c, t); return; }
  if (art.squareDoors && t.kind === "door") { drawSquareDoor(c, t, art.outline !== false); return; }
  paintKitContents(c, t, art.outline !== false);
  if (art.spriteAnimations && !art.reduceMotion && !art.lifted) drawPickupAnimation(c, t, art.x, art.y, art.time, art.seed);
}

function paintKitContents(c: CanvasRenderingContext2D, t: Tile, outline: boolean) {
  const id = t.kind === "key" ? `key-${t.color ?? "yellow"}`
    : t.kind === "potion" ? `potion-${potionShade(t)}`
    : t.kind === "attack" ? "sword" : t.kind === "defense" ? "shield"
    : t.kind === "stairs" ? "stairs" : t.kind === "oneway" ? "arrow-up" : t.kind === "treasure" ? "chest-wood"
    : t.kind === "reward" ? `chest-${t.tier === "gold" ? "gold" : "silver"}`
    : t.kind === "openedChest" ? "chest-open" : null;
  if (id) {
    if (outline) drawPixelOutline(c, id, t.kind === "stairs" || t.kind === "oneway" ? "blue" : "gold");
    return drawKit(c, id);
  }
  if (t.kind !== "door") return false;
  const rule = doorRule(t);
  const door = rule.type === "keys" && rule.mode === "any" ? "door-steel" : "door-wood";
  if (outline) drawPixelOutline(c, door, "black");
  if (!drawKit(c, door)) return false;
  if (drainsHp(rule)) drawKit(c, "heart", 8, 7, 8);
  // Keep every colored-key requirement visible on mixed doors.
  if (rule.type !== "wood" && "keys" in rule) {
    const colors = rule.keys;
    colors.forEach((color, i) => drawKit(c, `key-${color}`, 3 + i * 6, 14, 7));
  }
  return true;
}

const RED = "#9c1f2e", BRIGHT_RED = "#ff3b2b", GOLD_RIM = "#f4c64e", VIOLET_RIM = "#b45cff";
/** How an enemy's strength shows: bands outside its black outline (the
 * outermost first), and rank chevrons over the sprite. Normal is a dark red
 * rim fading out, weak the same with one chevron pointing down,
 * strong a bright red one with one chevron, elite a bright
 * red band inside a gold rim with two, a boss the elite's bands with
 * three, and a Greater Boss a gold band inside a violet rim with four
 * (`RANK_CHEVRONS`, which every Game theme draws). Only opaque bands cast torch shadows
 * (see toShadow in render/entity-lighting.ts), so the faint outer glow never
 * fattens one. */
type Ring = { r: number; color: string; alpha: number };
const ENEMY_LOOK: Record<EnemyStrength, { rings: Ring[] }> = {
  weak: { rings: [{ r: 3, color: RED, alpha: 0.3 }, { r: 2, color: RED, alpha: 1 }] },
  normal: { rings: [{ r: 3, color: RED, alpha: 0.3 }, { r: 2, color: RED, alpha: 1 }] },
  strong: { rings: [{ r: 3, color: BRIGHT_RED, alpha: 0.45 }, { r: 2, color: BRIGHT_RED, alpha: 1 }] },
  elite: { rings: [{ r: 3, color: GOLD_RIM, alpha: 1 }, { r: 2, color: BRIGHT_RED, alpha: 1 }] },
  boss: { rings: [{ r: 3, color: GOLD_RIM, alpha: 1 }, { r: 2, color: BRIGHT_RED, alpha: 1 }] },
  greaterBoss: { rings: [{ r: 3, color: VIOLET_RIM, alpha: 1 }, { r: 2, color: GOLD_RIM, alpha: 1 }] },
};
/** The one-pixel black outline hugging every enemy, inside its glow.
 * Cardinal only, so the silhouette's outer corners stay crisp. */
const ENEMY_OUTLINE: Ring = { r: 1, color: "#0b0a0e", alpha: 1 };
/** Room round a baked enemy for its outermost ring. */
const ENEMY_MARGIN = 3;
/** Baked enemies by name, tier, strength, whether it is Fast, Ranged or Flying, and whether the sprite art drew. */
const bakedEnemies = new Map<string, HTMLCanvasElement>();
// A body may arrive before its small marks. Re-bake when either loads.
onSpritesLoaded(() => bakedEnemies.clear());

export function paintEnemy(c: CanvasRenderingContext2D, t: Tile) {
  const e = t.enemy!;
  groundShadow(c, 12, 21, 8, 2.6, 0.4);
  const key = `${e.name}|${e.tier}|${e.strength}|${e.fast}|${e.ranged}|${e.flying}|${e.armored}`;
  let baked = bakedEnemies.get(key);
  if (!baked) bakedEnemies.set(key, (baked = bakeEnemy(e)));
  c.drawImage(baked, -ENEMY_MARGIN, -ENEMY_MARGIN);
}

/** An enemy with its glow, outline, chevrons and a Fast enemy's mark, on a canvas ENEMY_MARGIN
 * wider than the tile on every side. The rings go on from the outside in,
 * each cutting out what lies inside it first, so every band keeps exactly
 * its own opacity; the sprite goes on last. */
function bakeEnemy(e: Enemy) {
  const m = ENEMY_MARGIN, body = square(24), bc = body.getContext("2d")!;
  drawKit(bc, kitEnemy(e.name));
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
  const rank = RANK_CHEVRONS[e.strength];
  const rankId = rank.down ? COMBAT_MARKS.rankDown : COMBAT_MARKS.rankUp;
  for (let i = 0; i < rank.count; i++) drawKit(oc, rankId, m, m + i * 4, 7, 6);
  if (e.flying) drawKit(oc, COMBAT_MARKS.flying, m + 15, m, 9, 8);
  if (e.ranged) drawKit(oc, COMBAT_MARKS.ranged, m + 15, m, 9, 8);
  if (e.fast) drawKit(oc, COMBAT_MARKS.fast, m + 12, m + (e.ranged ? 8 : 0), 12, 8);
  if (e.armored) drawKit(oc, COMBAT_MARKS.armored, m + 15, m + 16, 9, 8);
  return out;
}

function dilated(body: HTMLCanvasElement, ring: Ring, m: number) {
  const size = body.width + 2 * m, band = square(size), c = band.getContext("2d")!;
  for (let dy = -ring.r; dy <= ring.r; dy++)
    for (let dx = -ring.r; dx <= ring.r; dx++) if (dx * dx + dy * dy <= ring.r * ring.r) c.drawImage(body, m + dx, m + dy);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = ring.color;
  c.fillRect(0, 0, size, size);
  return band;
}

/** The procedural body, for when sprite art is off or missing: each Delve
 * kind has its own, and other enemies take the body for their tier. */
function square(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return canvas;
}

/** The hero with its grounding shadow and outline. */
export function paintHero(c: CanvasRenderingContext2D, facing = { dx: 0, dy: -1 }, idleFrame = 0, outline = true) {
  const direction = facing.dx > 0 ? "right" : facing.dx < 0 ? "left" : facing.dy > 0 ? "up" : "down";
  if (outline) drawPixelOutline(c, `hero-${direction}`, "blue");
  if (idleFrame) drawSpriteFrame(c, `ambient-hero-${direction}`, idleFrame);
  else drawKit(c, `hero-${direction}`);
}

export function paintTorch(c: CanvasRenderingContext2D, t: Torch, now: number, reduceMotion: boolean, animated = false) {
  if (animated) drawAnimatedTorch(c, t.x, t.y, now, reduceMotion);
  else drawKit(c, "torch");
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
