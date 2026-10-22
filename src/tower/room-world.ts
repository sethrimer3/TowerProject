import { TOWER_WIDTH, TOWER_HEIGHT } from "../config.ts";
import { point, type ChestOdds, type DoorOdds, type Enemy, type EnemyStrength, type Tile, type Torch } from "../entities.ts";
import { withRunDoors } from "../doors.ts";
import { woodDurability } from "../enemy-curves.ts";
import { withChest, withPotions, withTreasureFloors, type Board } from "../board.ts";
import { breakTorch, placeTorches, torchesLeft } from "../torches.ts";
import { generateTowerFloor } from "./index.ts";
import { tierCells, tierTile } from "../tiers.ts";
import { foeTile, type FoeRule } from "../shrines.ts";
import { fastCells } from "../fast-enemies.ts";
import { rangedCells, wounded, woundMore } from "../ranged.ts";
import { flyingCells } from "../flying.ts";
import { addEnemies, extrasSeed, hasExtras, type ExtraEnemies } from "../more-enemies.ts";
import { ENTRY } from "./embedder.ts";
import { getTowerGateEnemy } from "../scaling.ts";
import { guardedTile, holdsShield, placeShield, walkDistances, type Shield } from "../shielded.ts";

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
// v23 deals every enemy a profile by the enemy schedule, any strength any
// profile, and starts each tower's zone rosters one zone further along.
// v24 leaves every floor's entrance open floor: no stairs lead back down.
// v25 gives a share of the fourth tower's floors and up a Shielded enemy,
// and adds standard enemies in front of one alone in its bubble.
export const TOWER_LAYOUT_VERSION = 25;

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
/** Torches for one tower room as placed, all lit, computed once when that
 * room is first entered this session and cached by seed, room number and
 * whether it is the first tier's (whose floors may differ in their keys). */
function torchesForRoom(seed: number, room: number, tier: number, cells: Map<string, Tile>): readonly Torch[] {
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
/** `cells` with the floor's Shielded enemy marked and its extras added
 * (shielded.ts), and its shield (null for none): the way in is the tile
 * just inside, the way up the stairs; no extra stands round the way in,
 * beside the stairs or on a torch. */
export function withShield(cells: Map<string, Tile>, seed: number, room: number, tier: number, torches: readonly Torch[]) {
  if (tier < 4) return { cells, shield: null };
  const band: { x: number; y: number }[] = [];
  for (let y = 0; y < TOWER_HEIGHT; y++) for (let x = 0; x < TOWER_WIDTH; x++) band.push({ x, y });
  const stairs = band.find((p) => cells.get(point(p.x, p.y))?.kind === "stairs");
  if (!stairs) return { cells, shield: null };
  const [ex, ey] = ENTRY;
  const avoid = new Set([[ex, ey], [ex, ey + 1], [ex - 1, ey], [ex + 1, ey]].map(([x, y]) => point(x!, y!)));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) avoid.add(point(stairs.x + dx!, stairs.y + dy!));
  for (const t of torches) avoid.add(point(t.x, t.y));
  const toExit = walkDistances(cells, TOWER_WIDTH, [stairs]), toEntrance = walkDistances(cells, TOWER_WIDTH, [{ x: ex, y: ey }]);
  const placed = new Map<string, Tile>();
  const shield = placeShield({
    cells, width: TOWER_WIDTH, wraps: false, band, avoid, seed, tier, floor: room + 1,
    toExit: (p) => toExit.get(point(p.x, p.y)) ?? Infinity,
    toEntrance: (p) => toEntrance.get(point(p.x, p.y)) ?? Infinity,
    normal: () => getTowerGateEnemy(room, "normal", "balanced", tier),
  }, placed);
  if (!placed.size) return { cells, shield };
  const out = new Map(cells);
  for (const [k, t] of placed) out.set(k, t);
  return { cells: out, shield };
}
export class RoomWorld implements Board {
  width = TOWER_WIDTH;
  height = TOWER_HEIGHT;
  floor = 0;
  cells: Map<string, Tile>;
  torches: Torch[];
  /** The floor's Shielded enemy as generated (shielded.ts), if any. */
  private shield: Shield | null;
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
    /** What the run's boons change about its enemies (shrines.ts), every
     * enemy tile read through it, a Greater Boss summoned too; none without.
     * `Game` sets it afresh when a boon changes it. */
    public foes?: FoeRule,
    /** The run's chances of Supply and Equipment Chests (`chestOdds`); none without. */
    public chestOdds?: ChestOdds,
    /** DOOR's tree's chances of remaking the floor's doors (`doorOdds`); none without. */
    doorOdds?: DoorOdds,
    /** CHEST's tree's percent chance the floor is a Treasure Floor (`treasureFloor`); none without. */
    treasureFloor = 0,
  ) {
    const doors = withRunDoors(generateTowerRoom(seed, room, tier), seed ^ Math.imul(room + 1, 0x9e3779b1), doorOdds, () => woodDurability("tower", tier, room));
    let cells = withTreasureFloors(doors, seed, treasureFloor, () => room + 1);
    const torches = torchesForRoom(seed, room, tier, cells);
    this.torches = torchesLeft(torches, changes);
    if (hasExtras(extras)) cells = withExtraEnemies(cells, seed, room, this.torches, extras);
    const shielded = withShield(cells, seed, room, tier, torches);
    this.shield = shielded.shield;
    cells = shielded.cells;
    const floorAt = () => room + 1;
    this.cells = rangedCells(fastCells(flyingCells(tierCells(cells, tier), tier, seed, floorAt), "tower", tier, seed, floorAt), tier, seed, floorAt);
  }
  breakTorchAt(x: number, y: number): boolean {
    return breakTorch(this.torches, this.changes, x, y);
  }
  /** On the 17x17 board. */
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  tile(x: number, y: number): Tile {
    if (!this.inside(x, y)) return { kind: "wall" };
    const k = point(x, y), changed = this.changes[k], generated = this.cells.get(k) ?? { kind: "wall" };
    const seed = this.seed ^ Math.imul(this.room + 1, 0x9e3779b1);
    const t = changed
      ? wounded(this.withBoons(withChest(changed, generated, x, y, seed, this.chestOdds)))
      : this.withBoons(withChest(withPotions(generated, x, y, seed, this.percentPotions), generated, x, y, seed, this.chestOdds));
    return this.shield ? guardedTile(t, x, y, [this.shield], (s) => this.holds(s)) : t;
  }
  /** `t` as the run's boons make it now, read afresh since a boon can
   * change mid-run. */
  private withBoons(t: Tile) {
    return foeTile(t, this.foes);
  }
  /** The floor's balanced enemy of `strength`: the tower's curve, its stat
   * factor as the cells take it, then the run's boons. */
  typicalEnemy(_depth = 0, strength: EnemyStrength = "normal"): Enemy {
    return this.withBoons(tierTile({ kind: "enemy", enemy: getTowerGateEnemy(this.room, strength, "balanced", this.tier) }, this.tier)).enemy!;
  }
  /** Whether the Shielded enemy `s` still stands. */
  private holds(s: Shield) {
    const k = point(s.x, s.y);
    return holdsShield(this.changes[k] ?? this.cells.get(k));
  }
  shields(): readonly Shield[] {
    return this.shield && this.holds(this.shield) ? [this.shield] : [];
  }
  step(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx,
      ny = y + dy;
    return this.inside(nx, ny) ? { x: nx, y: ny } : null;
  }
  clear(x: number, y: number) {
    this.changes[point(x, y)] = { kind: "floor" };
  }
  /** Every door still standing on the floor. */
  floorDoors() {
    const doors: { x: number; y: number }[] = [];
    for (const k of this.cells.keys()) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      if (this.tile(x, y).kind === "door") doors.push({ x, y });
    }
    return doors;
  }
  /** The enemy as generated (or summoned), before the run's boons, keeps
   * its wound in the changes; `tile` scales it, then takes the wound off. */
  wound(x: number, y: number, damage: number) {
    const k = point(x, y), raw = this.changes[k] ?? this.cells.get(k);
    if (raw?.kind === "enemy" || raw?.flyer) this.changes[k] = woundMore(raw, damage);
  }
}
