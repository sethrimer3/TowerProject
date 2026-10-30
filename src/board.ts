import { point, type ChestKind, type ChestOdds, type Enemy, type EnemyStrength, type Kind, type Tile, type Torch } from "./entities.ts";
import type { Run } from "./runs.ts";
import { tileRandom } from "./random.ts";
import { environmentOn } from "./environments.ts";
import type { Shield } from "./enemies/shielded.ts";

/** A board the player walks: the Delve labyrinth, a Tower floor, or the
 * forest outside. */
export type Board = {
  width: number;
  floor: number;
  tile(x: number, y: number): Tile;
  step(
    x: number,
    y: number,
    dx: number,
    dy: number,
  ): { x: number; y: number } | null;
  clear(x: number, y: number): void;
  /** Wounds the enemy on (x, y) by `damage` more HP (the Archer's arrows,
   * enemies/ranged.ts), on boards that hold enemies. */
  wound?(x: number, y: number, damage: number, broke?: number): void;
  /** Present on boards that carry torches (dungeon boards; the forest
   * exterior has none). */
  torches?: Torch[];
  /** Deactivates the torch standing on (x, y), if any, and reports whether
   * one was destroyed. Used for player-torch collision. */
  breakTorchAt?(x: number, y: number): boolean;
  /** The tiles holding a lit torch, by `point`, on boards that keep them
   * (`litTorches` works them out otherwise). */
  litTorches?(): ReadonlySet<string>;
  /** The doors still standing on the floor (x, y) stands on (a Tower
   * floor's, or in the Delve the tiles of its area at the same equivalent
   * floor), on boards that hold doors: KEY's Master Key opens them. */
  floorDoors?(x: number, y: number): { x: number; y: number }[];
  /** The enemies still standing on the same floor, by the tile each stands
   * on or (a Flying one) hovers over, on boards that hold enemies: Avenging
   * Angel smites them. */
  floorEnemies?(x: number, y: number): { x: number; y: number }[];
  /** The Shielded enemies still standing (enemies/shielded.ts), whose bubbles the
   * board draws, on boards that hold them. */
  shields?(): readonly Shield[];
  /** The balanced enemy of `strength` (normal unless given) `depth` makes
   * on boards that hold enemies, with every stat step the board applies to
   * its real enemies: the HUD and the enemy stats box show it.
   * A Tower floor has one floor, so it ignores `depth`. */
  typicalEnemy?(depth: number, strength?: EnemyStrength): Enemy;
};

/** Tiles the hero takes something from by stepping on them: every pickup
 * and treasure chest. An area reward chest isn't one: it is meant to be
 * opened on the way past. */
const OBTAINABLE = new Set<Kind>(["key", "potion", "attack", "defense", "treasure"]);
/** The tiles of `board` holding a lit torch, which a step onto puts out. */
export const litTorches = (board: Board): ReadonlySet<string> =>
  board.litTorches?.() ?? new Set((board.torches ?? []).filter((t) => t.active).map((t) => point(t.x, t.y)));
/** Whether a step onto `tile` at (x, y) takes something: an item, a chest
 * or a lit torch (`lit`, from `litTorches`). Paths go round such tiles
 * whenever an equally short way avoids them, leaving them to the cards that
 * aim at them. */
export const takesSomething = (tile: Tile, x: number, y: number, lit: ReadonlySet<string>) =>
  OBTAINABLE.has(tile.kind) || lit.has(point(x, y));

/** Where the planners (routes and Automove) start from: a board and the
 * run standing on it. A Game is one; so is any hand-built pair. */
export type Position = { world: Board; run: Run };

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Flood fill used for structural checks. Enemies are traversable here:
 * combat difficulty is separate from topology and key solvability. With a
 * `wrap` width, walking off one side comes back on the other. */
export function reachable(
  cells: Map<string, Tile>,
  start: string,
  blocked: Set<string> = new Set(),
  wrap?: number,
) {
  const seen = new Set<string>(),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i],
      t = cells.get(k);
    if (seen.has(k) || !t || t.kind === "wall" || blocked.has(k)) continue;
    seen.add(k);
    const [x, y] = k.split(",").map(Number);
    for (const [dx, dy] of directions) {
      const xx = x + dx;
      queue.push(point(wrap === undefined ? xx : xx < 0 ? wrap - 1 : xx >= wrap ? 0 : xx, y + dy));
    }
  }
  return seen;
}

const PERCENT_POTION_SALT = 0x5eed7;
const CHEST_KIND_SALT = 0xc4e57;
/** Whether equivalent floor `floor` of a run seeded `seed` is a Treasure
 * Floor (CHEST's tree, at `chance` percent; environments.ts). */
export const isTreasureFloor = (seed: number, floor: number, chance: number) => environmentOn("treasure", seed, floor, chance);
/** `cells` with every ATK and DEF shard and potion on a Treasure Floor
 * (each tile's equivalent floor by `floorAt`) made a treasure chest;
 * `cells` itself at no chance. */
export function withTreasureFloors(cells: Map<string, Tile>, seed: number, chance: number, floorAt: (x: number, y: number) => number) {
  if (!(chance > 0)) return cells;
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) {
    const [x, y] = k.split(",").map(Number);
    const turns = (t.kind === "attack" || t.kind === "defense" || t.kind === "potion") && isTreasureFloor(seed, floorAt(x, y), chance);
    out.set(k, turns ? { kind: "treasure" } : t);
  }
  return out;
}
/** The kind of the treasure chest generated at (x, y) on a board generated
 * from `seed`, under a run's `odds`: its tile's fixed number, in percent,
 * under the Equipment Chest's chance makes one, then under both chances a
 * Supply Chest; plain without odds. So a floor's chests are what they are
 * from the moment it is generated, and higher odds only ever add more. */
export function chestKindAt(t: Tile, x: number, y: number, seed: number, odds?: ChestOdds): ChestKind {
  if (t.kind !== "treasure" || !odds) return "plain";
  const roll = tileRandom(x, y, seed ^ CHEST_KIND_SALT) * 100;
  return roll < odds.equipment ? "equipment" : roll < odds.equipment + odds.supply ? "supply" : "plain";
}
/** Tile `t` marked with the kind of the chest `generated` there (`chestKindAt`):
 * a Supply or Equipment Chest, or the floor left once it opened, keeps its
 * kind, which the board shows. */
export function withChest(t: Tile, generated: Tile, x: number, y: number, seed: number, odds?: ChestOdds): Tile {
  if (!odds || (t.kind !== "treasure" && t.kind !== "floor")) return t;
  const kind = chestKindAt(generated, x, y, seed, odds);
  return kind === "plain" ? t : { ...t, chest: kind };
}
/** A generated tile at (x, y) on a board generated from `seed`, as a run
 * with `chance` (hundredths of a percent) of percent potions sees it: each
 * potion that may be one (generated blue) is a percent (red) potion when its
 * tile's fixed number falls under the chance, so a higher chance only ever
 * adds percent potions. */
export const withPotions = (t: Tile, x: number, y: number, seed: number, chance: number): Tile =>
  t.kind === "potion" && t.color && tileRandom(x, y, seed ^ PERCENT_POTION_SALT) * 10000 < chance ? { ...t, color: "red" } : t;
