import { region, depthAt, areasBetween, floorFor, ownerAt } from "./labyrinth.ts";
import { CHUNK, WIDTH, START_X } from "../config.ts";
import { point, type DelveRun, type Tile, type Torch } from "../entities.ts";
import { withPotions, type Board } from "../board.ts";
import { breakTorch, placeTorches } from "../torches.ts";
import { tierCells } from "../tiers.ts";

// v8 turns some pocket throats into forks: two parallel lanes of costs.
// v9 adds yellow-or-blue and blue-or-red door forks.
// v10 generates the same regions in every JavaScript engine.
// v11 prices a blue key at two yellow and a red at five.
// v12 makes each milestone gate's guard a boss.
// v13 scales strong enemies (and bosses) from 1.5 times a normal one, not 2.
// v14 grows enemy DEF 1% every 20 depth.
// v15 compounds enemy stats by equivalent floor and guards corridors.
// v16 makes half the guard potions percent potions.
// v17 keeps blue keys and doors off the first delve's floors below 20, and
// red below 50.
// v18 places no strong enemy below equivalent floor 11 and no elite below 41.
// v19 opens blue keys on equivalent floor 21 and red on 51.
// v20 places no Heart Door below equivalent floor 101 in the first delve.
// v21 takes every enemy's stats from the delve's enemy curve (enemy-curves.ts).
export const LAYOUT_VERSION = 21;

/** The one 20-row chunk `index` of tier `tier`'s labyrinth, as generated. */
export function generate(seed: number, index: number, tier = 1): Map<string, Tile> {
  const cells = new Map<string, Tile>();
  const min = index * CHUNK, max = min + CHUNK;
  for (const a of areasBetween(min, max))
    for (const [k, t] of region(seed, a, tier).cells) {
      const y = Number(k.split(',')[1]);
      if (y >= min && y < max) cells.set(k, t);
    }
  return cells;
}

/** A one-way gate only lets the player step up through it. */
const upward = (dx: number, dy: number) => dx === 0 && dy === 1;

/** What of a run the Delve board keeps: its map edits, the floor below
 * which the labyrinth is sealed, and the milestones crossed. */
type WorldRun = Pick<DelveRun, "seed" | "changes" | "floor" | "milestone" | "percentPotions" | "tier">;

/** The endless Delve labyrinth of a run, generated chunk by chunk around
 * the player. It reads and writes the run's own changes, floor and
 * milestone, so the run always holds where the board stands. */
export class World implements Board {
  width = WIDTH;
  chunks = new Map<number, Map<string, Tile>>();
  constructor(private run: WorldRun) {}
  get seed() {
    return this.run.seed;
  }
  get changes() {
    return this.run.changes;
  }
  get floor() {
    return this.run.floor;
  }
  get milestone() {
    return this.run.milestone;
  }
  get tier() {
    return this.run.tier ?? 1;
  }
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
    const index = Math.floor(y / CHUNK);
    if (!this.chunks.has(index))
      this.chunks.set(index, tierCells(generate(this.seed, index, this.tier), this.tier));
    return (
      this.changes[point(x, y)] ??
      withPotions(this.chunks.get(index)!.get(point(x, y)) ?? { kind: "wall" }, x, y, this.seed, this.run.percentPotions ?? 0)
    );
  }
  /** On the board and at or above the floor. */
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= this.floor;
  }
  step(x: number, y: number, dx: number, dy: number) {
    let nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= this.width) {
      if (!this.wraps(y)) return null;
      nx = (nx + this.width) % this.width;
    }
    if (this.tile(nx, ny).kind === "oneway" && !upward(dx, dy)) return null;
    return { x: nx, y: ny };
  }
  /** Row `y` opens on both edges, so walking off one side comes back on
   * the other. */
  private wraps(y: number) {
    return this.tile(0, y).kind !== "wall" && this.tile(this.width - 1, y).kind !== "wall";
  }
  /** Crosses the current area's milestone gate at (x, y), sealing it
   * behind; false when (x, y) isn't that gate. */
  cross(x: number, y: number) {
    const gate = region(this.seed, this.milestone, this.tier).gate;
    if (x !== gate.x || y !== gate.y) return false;
    this.changes[point(x, y - 1)] = { kind: 'wall' };
    this.run.milestone++;
    return true;
  }
  depth(x: number, y: number) { return depthAt(this.seed, x, y, this.milestone, this.tier); }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
  private torchAreas = new Map<number, Torch[]>();
  /** The torches of the current area and the next, placed once each. */
  get torches(): Torch[] {
    for (let a = this.milestone; a <= this.milestone + 1; a++)
      if (!this.torchAreas.has(a)) this.torchAreas.set(a, this.areaTorches(a));
    for (const a of this.torchAreas.keys()) if (a < this.milestone) this.torchAreas.delete(a);
    return [...this.torchAreas.values()].flat();
  }
  /** Wall checks see neighbouring areas too, so a torch never lands on a
   * foreign area's floor; each torch belongs to the area owning its spot. */
  private areaTorches(a: number) {
    const r = region(this.seed, a, this.tier), cells = new Map(r.cells);
    for (const b of [a - 1, a + 1]) if (b >= 0) for (const [k, t] of region(this.seed, b, this.tier).cells) cells.set(k, t);
    return placeTorches(cells, { xMin: 1, xMax: WIDTH - 2, yMin: r.minY - 2, yMax: r.maxY + 2, seed: this.seed ^ a })
      .filter((t) => ownerAt(this.seed, t.x, t.y) === a);
  }
  breakTorchAt(x: number, y: number): boolean {
    return breakTorch(this.torches, x, y);
  }
  /** Keeps the chunks near row `y`, raises the floor to the current
   * milestone's, and forgets edits below it. */
  maintain(y: number) {
    const index = Math.floor(y / CHUNK);
    this.tile(START_X, (index + 2) * CHUNK);
    this.run.floor = Math.max(this.floor, floorFor(this.seed, this.milestone));
    for (const i of this.chunks.keys())
      if ((i + 1) * CHUNK <= this.floor || Math.abs(i - index) > 3) this.chunks.delete(i);
    for (const k of Object.keys(this.changes))
      if (Number(k.split(",")[1]) < this.floor) delete this.changes[k];
  }
}
