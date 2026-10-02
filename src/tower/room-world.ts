import { TOWER_WIDTH, TOWER_HEIGHT } from "../config.ts";
import { point, type Tile, type Torch } from "../entities.ts";
import { withPotions, type Board } from "../board.ts";
import { breakTorch, placeTorches } from "../torches.ts";
import { generateTowerFloor } from "./index.ts";
import { tierCells } from "../tiers.ts";

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
export const TOWER_LAYOUT_VERSION = 14;

/** A self-contained 17x17 Tower floor. Generation is strategy-first (see
 * src/tower/index.ts): an abstract graph of gates, keys and rewards is
 * planned, then embedded as chambers joined by single-tile doorways or
 * forks of parallel lanes.
 * Geometry is always valid; the key/HP economy is deliberately allowed to
 * be harsh or occasionally unwinnable. Deterministic for (seed, room,
 * tier); the tier changes only which key colours appear. */
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
  ) {
    const cells = generateTowerRoom(seed, room, tier);
    this.torches = torchesForRoom(seed, room, tier, cells);
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
