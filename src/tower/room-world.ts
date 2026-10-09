import { TOWER_WIDTH, TOWER_HEIGHT } from "../config.ts";
import { point, type Tile, type Torch } from "../entities.ts";
import { withPotions, type Board } from "../board.ts";
import { breakTorch, placeTorches } from "../torches.ts";
import { generateTowerFloor } from "./index.ts";
import { tierCells } from "../tiers.ts";
import { addEnemies, extrasSeed, hasExtras, type ExtraEnemies } from "../more-enemies.ts";
import { ENTRY } from "./embedder.ts";

// v3 adds declarative multi-key/condition doors and places their prerequisite
// keys differently; old per-room coordinate mutations must not overlay it.
// v4 replaces the maze generator with strategic chamber layouts.
// v5 adds forks: parallel lanes of gates between chambers.
// v6 adds yellow-or-blue and blue-or-red door forks.
// v7 generates the same floors in every JavaScript engine.
// v8 trades a blue door for fewer yellow keys (mostly two).
// v9 prices a blue key at two yellow and a red at five.
// v10 puts a boss beside the stairs of every section's last floor.
// v11 softens weak enemies and grows enemy DEF 1% every five floors.
// v13 keeps blue keys and doors off the first tower's floors below 20, and
// red below 50.
// v14 places no strong enemy below floor 11 and no elite below 41.
// v15 opens blue keys on floor 21 and red on 51, and in the first tower
// keeps every blue and red door off the single way to the stairs.
// v16 lays a potion in about 35% of the doorways on the way to the stairs of
// the first tower's first ten floors, in place of enemies.
// v17 places no Heart Door below floor 101 in the first tower.
// v18 takes every enemy's stats from the tower's enemy curve (enemy-curves.ts).
// v19 places blue, red and Heart Doors by the door stage's quota (door-quota.ts),
// combines colours in one door, and makes a share of yellow locks Wooden Doors.
// v20 adds door runs (two or three of the same door in a row), counts a
// fork's lane doors 1/k toward the door quota and keys, and caps key
// coverage at the floor's aim.
export const TOWER_LAYOUT_VERSION = 22;

/** A self-contained 17x17 Tower floor. Generation is strategy-first (see
 * src/tower/index.ts): an abstract graph of gates, keys and rewards is
 * planned, then embedded as chambers joined by single-tile doorways or
 * forks of parallel lanes.
 * Geometry is always valid; the key/HP economy is deliberately allowed to
 * be harsh or occasionally unwinnable. Deterministic for (seed, room,
 * tier); the tier changes which key colours appear and the enemy curve its
 * enemies come from, never where anything stands. */
export function generateTowerRoom(
  seed: number,
  room: number,
  tier = 1,
): Map<string, Tile> {
  return generateTowerFloor(seed, room, tier).cells;
}
const towerTorchCaches = new Map<string, Torch[]>();
/** Torches for one tower room, computed once when that room is first
 * entered this session and cached by seed, room number and whether it is
 * the first tier's (whose floors may differ in their keys). */
function torchesForRoom(seed: number, room: number, tier: number, cells: Map<string, Tile>): Torch[] {
  const key = `${seed}:${room}:${tier > 1}`;
  let t = towerTorchCaches.get(key);
  if (!t) {
    t = placeTorches(cells, { xMin: 1, xMax: TOWER_WIDTH - 2, yMin: 1, yMax: TOWER_HEIGHT - 2, seed: seed ^ Math.imul(room + 1, 0x9e3779b1) });
    towerTorchCaches.set(key, t);
  }
  return t;
}
/** `cells` with More Enemies' extras added (more-enemies.ts): the way in is
 * the tile just inside, the target the stairs; neither the tiles round the
 * way in, those beside the stairs, nor a torch's take one. */
export function withExtraEnemies(cells: Map<string, Tile>, seed: number, room: number, torches: readonly Torch[], extras: ExtraEnemies) {
  const band: { x: number; y: number }[] = [];
  for (let y = 0; y < TOWER_HEIGHT; y++) for (let x = 0; x < TOWER_WIDTH; x++) band.push({ x, y });
  const stairs = band.find((p) => cells.get(point(p.x, p.y))?.kind === "stairs") ?? null;
  const [ex, ey] = ENTRY;
  const avoid = new Set([[ex, ey], [ex, ey + 1], [ex - 1, ey], [ex + 1, ey]].map(([x, y]) => point(x!, y!)));
  if (stairs) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) avoid.add(point(stairs.x + dx!, stairs.y + dy!));
  for (const t of torches) avoid.add(point(t.x, t.y));
  const placed = new Map<string, Tile>();
  addEnemies({ cells, width: TOWER_WIDTH, wraps: false, root: { x: ex, y: ey }, target: stairs, band, avoid }, extras, extrasSeed(seed, room), placed);
  if (!placed.size) return cells;
  const out = new Map(cells);
  for (const [k, t] of placed) out.set(k, t);
  return out;
}
export class RoomWorld implements Board {
  width = TOWER_WIDTH;
  height = TOWER_HEIGHT;
  floor = 0;
  cells: Map<string, Tile>;
  torches: Torch[];
  constructor(
    public seed: number,
    public room: number,
    public changes: Record<string, Tile>,
    /** The chance each potion is a percent potion, in hundredths of a
     * percent (a run's `percentPotions`); none without. */
    public percentPotions = 0,
    /** The numbered tower the floor stands in, whose enemies it scales. */
    public tier = 1,
    /** The run's More Enemies badges' extras (more-enemies.ts); none without. */
    extras?: ExtraEnemies,
  ) {
    let cells = generateTowerRoom(seed, room, tier);
    this.torches = torchesForRoom(seed, room, tier, cells);
    if (hasExtras(extras)) cells = withExtraEnemies(cells, seed, room, this.torches, extras);
    this.cells = tierCells(cells, tier);
  }
  breakTorchAt(x: number, y: number): boolean {
    return breakTorch(this.torches, x, y);
  }
  /** On the 17x17 board. */
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
    const changed = this.changes[point(x, y)];
    if (changed) return changed;
    return withPotions(this.cells.get(point(x, y)) ?? { kind: "wall" }, x, y, this.seed ^ Math.imul(this.room + 1, 0x9e3779b1), this.percentPotions);
  }
  step(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx,
      ny = y + dy;
    return this.inside(nx, ny) ? { x: nx, y: ny } : null;
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
}
