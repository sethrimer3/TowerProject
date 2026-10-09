import { region, depthAt, areasBetween, floorFor, ownerAt, type Region } from "./labyrinth.ts";
import { CHUNK, WIDTH, START_X } from "../config.ts";
import { point, type DelveRun, type Tile, type Torch } from "../entities.ts";
import { withPotions, type Board } from "../board.ts";
import { breakTorch, placeTorches } from "../torches.ts";
import { tierCells } from "../tiers.ts";
import { tournamentCells } from "../tournament/run.ts";
import { addEnemies, extraGround, extrasKey, extrasSeed, hasExtras, type ExtraEnemies } from "../more-enemies.ts";

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
// v22 makes steel doors Wooden Doors, which a hero without a key breaks down.
// v23 follows the Tower's door and key schedules by equivalent floor: blue,
// red and Heart Door quotas, the wooden share and keys per lock.
// v24 adds door runs, and counts a fork's lane doors 1/k toward the door
// quota and keys.
// v25 adds the enemy stage: each equivalent floor's enemy count and
// strength shares from the enemy schedule.
export const LAYOUT_VERSION = 25;

/** The one 20-row chunk `index` of tier `tier`'s labyrinth, as generated. */
export function generate(seed: number, index: number, tier = 1): Map<string, Tile> {
  const cells = new Map<string, Tile>();
  const min = index * CHUNK, max = min + CHUNK;
  for (const a of areasBetween(min, max))
    for (const [k, t] of chunksOf(region(seed, a, tier)).get(index) ?? []) cells.set(k, t);
  return cells;
}

const regionChunks = new WeakMap<Region, Map<number, [string, Tile][]>>();
/** A region's cells by the chunk holding their row, each chunk's in the
 * region's own order, sorted out once per region rather than once per chunk. */
function chunksOf(r: Region) {
  let chunks = regionChunks.get(r);
  if (!chunks) {
    chunks = new Map();
    for (const [k, t] of r.cells) {
      const index = Math.floor(Number(k.slice(k.indexOf(",") + 1)) / CHUNK);
      (chunks.get(index) ?? chunks.set(index, []).get(index)!).push([k, t]);
    }
    regionChunks.set(r, chunks);
  }
  return chunks;
}

/** Area `area`'s torches: wall checks see the neighbouring areas too, so a
 * torch never lands on a foreign area's floor; each torch belongs to the
 * area owning its spot. */
function areaTorches(seed: number, area: number, tier: number): Torch[] {
  const key = `${seed}:${area}:${tier}`;
  let placed = torchCache.get(key);
  if (!placed) {
    const r = region(seed, area, tier), cells = new Map(r.cells);
    for (const b of [area - 1, area + 1]) if (b >= 0) for (const [k, t] of region(seed, b, tier).cells) cells.set(k, t);
    placed = placeTorches(cells, { xMin: 1, xMax: WIDTH - 2, yMin: r.minY - 2, yMax: r.maxY + 2, seed: seed ^ area })
      .filter((t) => ownerAt(seed, t.x, t.y) === area);
    torchCache.set(key, placed);
    if (torchCache.size > 8) torchCache.delete(torchCache.keys().next().value!);
  }
  // Fresh torches each time: a board puts its own out (`breakTorch`).
  return placed.map((t) => ({ ...t }));
}
/** Each area's torches as placed, all lit: the World and More Enemies both
 * ask for them, and placing them (with every light's polygon) is slow. */
const torchCache = new Map<string, Torch[]>();

const extraCache = new Map<string, Map<string, Tile>>();
/** More Enemies' extras in area `area` (more-enemies.ts), by tile: each of
 * its ten equivalent floors (ten depths each) counts its own enemies and
 * takes its extras among its own tiles, bottom one first, those placed
 * below already standing. The way in is the area's shallowest tile, the
 * target its boss; neither the tiles round the way in, those near the
 * milestone gate and its boss, nor a torch's take one. */
export function delveExtras(seed: number, area: number, tier: number, extras: ExtraEnemies) {
  const key = `${seed}:${area}:${tier}:${extrasKey(extras)}`;
  const known = extraCache.get(key);
  if (known) return known;
  const r = region(seed, area, tier), base = area * 100;
  const tiles = [...r.cells.keys()].map((k) => { const [x, y] = k.split(",").map(Number); return { x: x!, y: y!, depth: r.metadata.get(k)?.depth ?? base }; })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const open = tiles.filter((p) => r.cells.get(point(p.x, p.y))!.kind !== "wall");
  const root = open.reduce<(typeof open)[number] | undefined>((best, p) => (!best || p.depth < best.depth ? p : best), undefined);
  const placed = new Map<string, Tile>();
  if (root) {
    const boss = { x: r.gate.x, y: r.gate.y - 2 };
    const avoid = new Set<string>();
    for (const c of [r.gate, boss]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) avoid.add(point(c.x + dx, c.y + dy));
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) avoid.add(point(root.x + dx!, root.y + dy!));
    for (const t of areaTorches(seed, area, tier)) avoid.add(point(t.x, t.y));
    const target = r.cells.get(point(boss.x, boss.y))?.kind === "enemy" ? boss : null;
    const floor = { cells: r.cells, width: WIDTH, wraps: true, root, target, avoid }, ground = extraGround(floor);
    for (let f = 0; f < 10; f++) {
      const band = tiles.filter((p) => p.depth >= base + f * 10 && p.depth < base + f * 10 + 10);
      addEnemies({ ...floor, band }, extras, extrasSeed(seed, area * 10 + f), placed, ground);
    }
  }
  extraCache.set(key, placed);
  if (extraCache.size > 8) extraCache.delete(extraCache.keys().next().value!);
  return placed;
}

/** A one-way gate only lets the player step up through it. */
const upward = (dx: number, dy: number) => dx === 0 && dy === 1;

/** What of a run the Delve board keeps: its map edits, the floor below
 * which the labyrinth is sealed, and the milestones crossed. */
type WorldRun = Pick<DelveRun, "seed" | "changes" | "floor" | "milestone" | "percentPotions" | "tier" | "tournament">;

/** The endless Delve labyrinth of a run, generated chunk by chunk around
 * the player. It reads and writes the run's own changes, floor and
 * milestone, so the run always holds where the board stands. */
export class World implements Board {
  width = WIDTH;
  chunks = new Map<number, Map<string, Tile>>();
  constructor(
    private run: WorldRun,
    /** The run's More Enemies badges' extras (more-enemies.ts); none without. */
    private extras?: ExtraEnemies,
  ) {}
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
    let chunk = this.chunks.get(index);
    if (!chunk) {
      const cells = tierCells(this.generated(index), this.tier);
      // A tournament run's enemies stand stronger than the cave's own.
      chunk = this.run.tournament ? tournamentCells(cells) : cells;
      this.chunks.set(index, chunk);
    }
    const k = point(x, y);
    return this.changes[k] ?? withPotions(chunk.get(k) ?? { kind: "wall" }, x, y, this.seed, this.run.percentPotions ?? 0);
  }
  /** Chunk `index` as generated, with More Enemies' extras. */
  private generated(index: number) {
    const cells = generate(this.seed, index, this.tier);
    if (!hasExtras(this.extras)) return cells;
    const min = index * CHUNK, max = min + CHUNK;
    for (const a of areasBetween(min, max))
      for (const [k, t] of delveExtras(this.seed, a, this.tier, this.extras)) {
        const y = Number(k.split(",")[1]);
        if (y >= min && y < max) cells.set(k, t);
      }
    return cells;
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
  private areaTorches(a: number) {
    return areaTorches(this.seed, a, this.tier);
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
