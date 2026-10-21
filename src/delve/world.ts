import { region, depthAt, areasBetween, floorFor, ownerAt, type Region } from "./labyrinth.ts";
import { CHUNK, WIDTH, START_X } from "../config.ts";
import { point, type Enemy, type EnemyStrength, type Point, type Tile, type Torch } from "../entities.ts";
import type { DelveRun } from "../runs.ts";
import { withChest, withPotions, type Board } from "../board.ts";
import { breakTorch, placeTorches, torchesLeft } from "../torches.ts";
import { tierCells, tierTile } from "../tiers.ts";
import { fastCells } from "../fast-enemies.ts";
import { rangedCells, wounded, woundMore } from "../ranged.ts";
import { flyingCells } from "../flying.ts";
import { tournamentStatFactor, tournamentTile } from "../tournament/run.ts";
import { addEnemies, extraGround, extrasKey, extrasSeed, hasExtras, type ExtraEnemies } from "../more-enemies.ts";
import { guardedTile, holdsShield, placeShield, walkDistances, type Shield } from "../shielded.ts";
import { enemyStats } from "../enemy-curves.ts";
import { DELVE_ENEMY_NAMES, enemyTier } from "../scaling.ts";

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
// v26 deals every enemy a profile by the enemy schedule.
// v27 gives a share of the fourth delve's equivalent floors and up a
// Shielded enemy, and adds standard enemies in front of one alone in its bubble.
// v28 puts a corridor guard's reward in a nook beside it.
export const LAYOUT_VERSION = 28;

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
function areaTorches(seed: number, area: number, tier: number): readonly Torch[] {
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
  return placed;
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

const shieldCache = new Map<string, { placed: Map<string, Tile>; shields: Shield[] }>();
/** Area `area`'s Shielded enemies and their extras (shielded.ts), by tile,
 * with More Enemies' extras standing: each of its ten equivalent floors
 * rolls for its own, the enemy deepest on it (then farthest walked) being
 * the one nearest the way up, and extras standing on tiles walked to sooner
 * from the area's shallowest tile. No extra stands round the way in, near
 * the milestone gate and its boss, or on a torch. */
export function delveShields(seed: number, area: number, tier: number, extras?: ExtraEnemies) {
  if (tier < 4) return { placed: new Map<string, Tile>(), shields: [] };
  const key = `${seed}:${area}:${tier}:${hasExtras(extras) ? extrasKey(extras) : ""}`;
  const known = shieldCache.get(key);
  if (known) return known;
  const r = region(seed, area, tier), base = area * 100, cells = new Map(r.cells);
  if (hasExtras(extras)) for (const [k, t] of delveExtras(seed, area, tier, extras)) cells.set(k, t);
  const tiles = [...cells.keys()].map((k) => { const [x, y] = k.split(",").map(Number); return { x: x!, y: y!, depth: r.metadata.get(k)?.depth ?? base }; })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const open = tiles.filter((p) => cells.get(point(p.x, p.y))!.kind !== "wall");
  const root = open.reduce<(typeof open)[number] | undefined>((best, p) => (!best || p.depth < best.depth ? p : best), undefined);
  const placed = new Map<string, Tile>(), shields: Shield[] = [];
  if (root) {
    const boss = { x: r.gate.x, y: r.gate.y - 2 };
    const avoid = new Set<string>();
    for (const c of [r.gate, boss]) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) avoid.add(point(c.x + dx, c.y + dy));
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) avoid.add(point(root.x + dx!, root.y + dy!));
    for (const t of areaTorches(seed, area, tier)) avoid.add(point(t.x, t.y));
    const walked = walkDistances(cells, WIDTH, [root], true);
    const depth = (p: Point) => r.metadata.get(point(p.x, p.y))?.depth ?? base;
    const toEntrance = (p: Point) => walked.get(point(p.x, p.y)) ?? Infinity;
    for (let f = 0; f < 10; f++) {
      const band = tiles.filter((p) => p.depth >= base + f * 10 && p.depth < base + f * 10 + 10);
      const shield = placeShield({
        cells, width: WIDTH, wraps: true, band, avoid, seed, tier, floor: area * 10 + f + 1, toEntrance,
        toExit: (p) => (walked.has(point(p.x, p.y)) ? -(depth(p) * 100_000 + toEntrance(p)) : Infinity),
        normal: (at) => {
          const d = depth(at), name = (placed.get(point(at.x, at.y)) ?? cells.get(point(at.x, at.y)))!.enemy!.name;
          return { name, tier: enemyTier("normal"), strength: "normal", profile: "balanced", ...enemyStats("delve", tier, d, "normal", "balanced") };
        },
      }, placed);
      if (shield) shields.push(shield);
    }
  }
  const out = { placed, shields };
  shieldCache.set(key, out);
  if (shieldCache.size > 8) shieldCache.delete(shieldCache.keys().next().value!);
  return out;
}

/** A one-way gate only lets the player step up through it. */
const upward = (dx: number, dy: number) => dx === 0 && dy === 1;

/** What of a run the Delve board keeps: its map edits, the floor below
 * which the labyrinth is sealed, and the milestones crossed. */
type WorldRun = Pick<DelveRun, "seed" | "changes" | "floor" | "milestone" | "percentPotions" | "chestOdds" | "tier" | "tournament">;

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
  /** The Shielded enemies of every area generated so far (shielded.ts), by area. */
  private areaShields = new Map<number, Shield[]>();
  private shieldList: Shield[] = [];
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
    const chunk = this.chunk(Math.floor(y / CHUNK));
    const k = point(x, y), changed = this.changes[k];
    const generated = chunk.get(k) ?? { kind: "wall" }, odds = this.run.chestOdds;
    const t = changed ? wounded(withChest(changed, generated, x, y, this.seed, odds)) : withChest(withPotions(generated, x, y, this.seed, this.run.percentPotions ?? 0), generated, x, y, this.seed, odds);
    return this.shieldList.length ? guardedTile(t, x, y, this.shieldList, (s) => this.holds(s), this.width) : t;
  }
  /** Whether the Shielded enemy `s` still stands; `loaded`: judged only
   * in the chunks already built (else false), so drawing never builds one. */
  private holds(s: Shield, loaded = false) {
    if (!this.inside(s.x, s.y)) return false;
    const k = point(s.x, s.y), index = Math.floor(s.y / CHUNK);
    if (loaded && !this.chunks.has(index)) return false;
    return holdsShield(this.changes[k] ?? this.chunk(index).get(k));
  }
  shields(): readonly Shield[] {
    return this.shieldList.filter((s) => this.holds(s, true));
  }
  /** Chunk `index` as it stands in the run's tier, built once and kept. */
  private chunk(index: number) {
    let chunk = this.chunks.get(index);
    if (!chunk) {
      // Each enemy rolls Fast by its own equivalent floor.
      const floorAt = (x: number, y: number) => Math.floor(depthAt(this.seed, x, y, ownerAt(this.seed, x, y), this.tier) / 10) + 1;
      const lifted = flyingCells(tierCells(this.generated(index), this.tier), this.tier, this.seed, floorAt);
      const cells = rangedCells(fastCells(lifted, "delve", this.tier, this.seed, floorAt), this.tier, this.seed, floorAt);
      chunk = this.run.tournament ? new Map([...cells].map(([k, t]) => [k, this.inLeague(t)])) : cells;
      this.chunks.set(index, chunk);
    }
    return chunk;
  }
  /** `t` as the run's league makes it: in a tournament run, an enemy as
   * strong as the next cave's. */
  private inLeague(t: Tile) {
    const league = this.run.tournament?.league;
    return league ? tournamentTile(t, tournamentStatFactor(league)) : t;
  }
  /** The balanced enemy of `strength` at `depth`: the delve's curve, its
   * stat factor as the chunks take it, then the run's league. */
  typicalEnemy(depth: number, strength: EnemyStrength = "normal"): Enemy {
    const enemy: Enemy = { name: DELVE_ENEMY_NAMES[0]!, tier: enemyTier(strength), strength, profile: "balanced", ...enemyStats("delve", this.tier, depth, strength, "balanced") };
    return this.inLeague(tierTile({ kind: "enemy", enemy }, this.tier)).enemy!;
  }
  /** Chunk `index` as generated, with More Enemies' extras, then each
   * area's Shielded enemies and theirs. */
  private generated(index: number) {
    const cells = generate(this.seed, index, this.tier);
    const min = index * CHUNK, max = min + CHUNK;
    const within = (k: string) => { const y = Number(k.split(",")[1]); return y >= min && y < max; };
    for (const a of areasBetween(min, max)) {
      if (hasExtras(this.extras)) for (const [k, t] of delveExtras(this.seed, a, this.tier, this.extras)) if (within(k)) cells.set(k, t);
      const { placed, shields } = delveShields(this.seed, a, this.tier, this.extras);
      for (const [k, t] of placed) if (within(k)) cells.set(k, t);
      if (shields.length && !this.areaShields.has(a)) this.areaShields.set(a, shields), (this.shieldList = [...this.areaShields.values()].flat());
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
  /** The enemy as generated keeps its wound in the changes. */
  wound(x: number, y: number, damage: number) {
    const t = this.tile(x, y);
    if (t.kind !== "enemy" && !t.flyer) return;
    const k = point(x, y), raw = this.changes[k] ?? this.chunks.get(Math.floor(y / CHUNK))?.get(k);
    if (raw?.kind === "enemy" || raw?.flyer) this.changes[k] = woundMore(raw, damage);
  }
  private torchAreas = new Map<number, Torch[]>();
  /** The torch list and lit tiles last worked out: the list until the areas
   * it holds change, the lit tiles until a torch goes out too. */
  private torchList: Torch[] | null = null;
  private lit: Set<string> | null = null;
  /** The torches of the current area and the next, placed once each. */
  get torches(): Torch[] {
    for (let a = this.milestone; a <= this.milestone + 1; a++)
      if (!this.torchAreas.has(a)) this.torchAreas.set(a, this.areaTorches(a)), (this.torchList = null);
    for (const a of this.torchAreas.keys()) if (a < this.milestone) this.torchAreas.delete(a), (this.torchList = null);
    if (!this.torchList) this.lit = null;
    return (this.torchList ??= [...this.torchAreas.values()].flat());
  }
  litTorches(): ReadonlySet<string> {
    const torches = this.torches;
    return (this.lit ??= new Set(torches.filter((t) => t.active).map((t) => point(t.x, t.y))));
  }
  /** Area `a`'s torches: the board's own copies, out where the run put them out. */
  private areaTorches(a: number) {
    return torchesLeft(areaTorches(this.seed, a, this.tier), this.changes);
  }
  breakTorchAt(x: number, y: number): boolean {
    const broke = breakTorch(this.torches, this.changes, x, y);
    if (broke) this.lit = null;
    return broke;
  }
  /** Keeps the chunks near row `y` and every chunk of the current area
   * (which the hand searches whole), raises the floor to the current
   * milestone's, and forgets edits below it. */
  maintain(y: number) {
    const index = Math.floor(y / CHUNK), top = Math.floor(region(this.seed, this.milestone, this.tier).maxY / CHUNK);
    this.tile(START_X, (index + 2) * CHUNK);
    this.run.floor = Math.max(this.floor, floorFor(this.seed, this.milestone));
    for (const i of this.chunks.keys())
      if ((i + 1) * CHUNK <= this.floor || (Math.abs(i - index) > 3 && i > top)) this.chunks.delete(i);
    for (const k of Object.keys(this.changes))
      if (Number(k.split(",")[1]) < this.floor) delete this.changes[k];
  }
}
