/** Ranged enemies and the Archer (docs/agents/movement-and-combat.md).
 *
 * From the third tower and delve up, any enemy but a boss or Greater Boss
 * may be Ranged, as it may be Fast (enemies/fast.ts), on a roll of its own:
 * it shoots the hero from a distance, walls and doors no obstacle, once its
 * cooldown is ready, without beginning a fight. Once Tower III's floor 10
 * Goal is claimed the hero is an Archer and shoots back: each turn its
 * arrow is ready, at the closest enemy in its range.
 *
 * Every cooldown is kept as a whole number of charge units, so a fraction
 * of a turn left over carries exactly to the next shot: a shooter gains
 * `gain` units a turn and a shot costs `cost`, so it fires every
 * cost / gain turns on average (3 shots in 10 turns fire 4, 3 and 3 turns
 * apart); a Fast enemy gains twice as much, so shoots twice as often.
 * A shooter with no charge kept is ready; one that is ready and has
 * nothing to shoot waits, banking nothing more. Every charge runs a tick
 * (a hundredth of a turn, `TURN_TICKS`) at a time, so a shot fires the tick
 * its shooter is ready and its target in reach (`reachTicks`), and its
 * cooldown starts over from that tick; Rapid Fire too starts and ends
 * mid-turn. Each tile's roll is a fixed number of the run seed, the floor
 * and the tile (`RANGED_SALT`). */
import type { Enemy, Player, Tile } from "../entities.ts";
import { attackAgainst, brokenAfter, critMultiplier, defenseAgainst, facing, guarded, parryCut, struckDamage } from "../combat.ts";
import { fastShare, mayBeFast } from "./fast.ts";
import { snap } from "../exact.ts";
import { tileRandom } from "../random.ts";

const RANGED_SALT = 0x4a2c3;

/** The share of enemies that are Ranged on equivalent floor `floor` (from
 * 1) of tier `tier`, in thousandths of a percent: a point and a half under
 * the Fast share, growing as it does (11.25% on the third tier's floor 1).
 * None in the first two tiers. */
export const rangedShare = (tier: number, floor: number) => (tier < 3 ? 0 : fastShare(tier, floor) - 1_500);

/** Whether `enemy` may be Ranged: anything but a boss or Greater Boss. */
export const mayBeRanged = mayBeFast;

/** Whether the enemy at (x, y) on equivalent floor `floor` of tier `tier`
 * is Ranged, for a run of seed `seed`. */
export function rollsRanged(seed: number, tier: number, floor: number, x: number, y: number) {
  const share = rangedShare(tier, floor);
  return share > 0 && tileRandom(x, y, (seed ^ RANGED_SALT ^ Math.imul(floor, 0x9e3779b1)) | 0) * 100_000 < share;
}

/** `cells` with each enemy that rolls Ranged made Ranged; `floorAt` gives
 * each tile's equivalent floor. The same map below the third tier. */
export function rangedCells(cells: Map<string, Tile>, tier: number, seed: number, floorAt: (x: number, y: number) => number) {
  if (tier < 3) return cells;
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) {
    const e = t.kind === "enemy" ? t.enemy : undefined;
    if (e && mayBeRanged(e)) {
      const [x, y] = k.split(",").map(Number) as [number, number];
      if (rollsRanged(seed, tier, floorAt(x, y), x, y)) {
        out.set(k, { ...t, enemy: { ...e, ranged: true } });
        continue;
      }
    }
    out.set(k, t);
  }
  return out;
}

/** The enemy a tile holds: one standing on it, or a Flying one hovering
 * over it (`Tile.flyer`). */
export const foeOn = (t: Tile): Enemy | undefined => (t.kind === "enemy" ? t.enemy : t.flyer);
/** Whether `enemy` shoots the hero: a Ranged or Flying one. */
export const shoots = (enemy: Enemy) => !!(enemy.ranged || enemy.flying);

/** A tile as it stands once the hero's arrows have wounded its enemy: its
 * HP less the `wound` (kept on the tile, so its full HP is HP + wound),
 * its full HP kept as `fullHp`, and what they have broken of its DEF
 * (Armor Break) as `broken`. */
export const wounded = (t: Tile): Tile => {
  if (!t.wound && !t.broken) return t;
  const less = (e: Enemy) => ({ ...e, ...(t.wound ? { hp: snap(Math.max(0, e.hp - t.wound)), fullHp: e.fullHp ?? e.hp } : {}), ...(t.broken ? { broken: t.broken } : {}) });
  return t.enemy ? { ...t, enemy: less(t.enemy) } : t.flyer ? { ...t, flyer: less(t.flyer) } : t;
};
/** `raw` (a tile as generated) with `damage` more wound (an arrow that only
 * wears down DEF adds none) and `broke` percent more of its DEF broken. A
 * Flying enemy struck becomes Aggroed (enemies/flying.ts). */
export const woundMore = (raw: Tile, damage: number, broke = 0): Tile => ({
  ...raw,
  ...(raw.flyer && !raw.flyer.aggro ? { flyer: { ...raw.flyer, aggro: true as const } } : {}),
  ...(damage || raw.wound ? { wound: snap((raw.wound ?? 0) + damage) } : {}),
  ...(broke ? { broken: snap((raw.broken ?? 0) + broke) } : {}),
});

/** The ticks a turn is played in: every shot of a turn fires on one of
 * them, 1 to `TURN_TICKS`, the last at the turn's end. */
export const TURN_TICKS = 100;
/** Charge a Ranged enemy gains a turn, and what a shot costs it on
 * equivalent floor `floor`: 10 turns, a 500th of a turn less each floor (a
 * turn less every 500), never under 1. */
export const FOE_GAIN = 500;
/** The charge `enemy` gains a turn: a Fast one twice `FOE_GAIN`, so it
 * shoots twice as often, the cost shrinking by floor as anyone's. */
export const foeGain = (enemy: Enemy) => (enemy.fast ? 2 * FOE_GAIN : FOE_GAIN);
/** The charge `enemy` gains a tick: a hundredth of its turn's, a whole number. */
export const foeTickGain = (enemy: Enemy) => foeGain(enemy) / TURN_TICKS;
export const foeShotCost = (floor: number) => Math.max(FOE_GAIN, 10 * FOE_GAIN - Math.max(0, floor - 1));
/** What an arrow costs the Archer: its gain every tick is its Attack Speed
 * (twentieths of a shot every 10 turns), so 20 fires every 10 turns. */
export const ARROW_COST = 20_000;
/** How many times as fast the Archer's arrows charge during Rapid Fire. */
export const RAPID_FIRE_SPEED = 4;

/** A shooter's charge (undefined: ready, full) a turn later. */
export const charged = (charge: number | undefined, gain: number) => (charge === undefined ? undefined : charge + gain);
/** Whether a shooter with `charge` can shoot. */
export const ready = (charge: number | undefined, cost: number) => charge === undefined || charge >= cost;
/** A shooter's charge once it shoots: what was over the cost carries. */
export const spent = (charge: number | undefined, cost: number) => (charge === undefined ? 0 : charge - cost);
/** A shooter that didn't shoot: once ready it waits full, banking nothing. */
export const held = (charge: number | undefined, cost: number) => (charge === undefined || charge >= cost ? undefined : charge);

/** The Archer's clock: its charge (absent: ready, waiting for a target)
 * and the ticks of Rapid Fire left (absent: none). */
export type ArcherClock = { charge?: number; rapid?: number };
/** The Archer's clock as a turn runs it, a tick at a time. */
export type ArcherState = { charge: number | undefined; rapid: number };
/** The clock a turn runs from, and the one it keeps once it has. */
export const archerState = (clock: ArcherClock): ArcherState => ({ charge: clock.charge, rapid: clock.rapid ?? 0 });
export const archerClock = ({ charge, rapid }: ArcherState) => ({ ...(charge === undefined ? {} : { charge }), ...(rapid > 0 ? { rapid } : {}) }) as ArcherClock;

/** Tick `tick` of the Archer's clock: a charging arrow gains `speed`,
 * `RAPID_FIRE_SPEED` times that while Rapid Fire lasts, and once it holds
 * `ARROW_COST`, or every tick it waits ready, `shoot` is asked to fire,
 * told whether Rapid Fire is still going on (`rapid`). It returns false
 * when nothing can be shot (the arrow then waits ready, banking nothing
 * more, while Rapid Fire runs on), or else the ticks of Rapid Fire the shot
 * starts from that moment, 0 for none. A shot keeps the charge over its
 * cost, so the next arrow charges from the tick it fired. */
export function archerTick(clock: ArcherState, speed: number, tick: number, shoot: (rapid: boolean, tick: number) => number | false) {
  if (clock.charge === undefined) clock.rapid = Math.max(0, clock.rapid - 1);
  else {
    clock.charge += clock.rapid > 0 ? RAPID_FIRE_SPEED * speed : speed;
    if (clock.rapid > 0) clock.rapid--;
    if (clock.charge < ARROW_COST) return;
  }
  const starts = shoot(clock.rapid > 0, tick);
  if (starts === false) {
    clock.charge = undefined;
    return;
  }
  clock.charge = spent(clock.charge, ARROW_COST);
  if (starts > 0) clock.rapid = starts;
}
/** A whole turn of the Archer's clock (`archerTick`, every tick). Returns
 * the clock a turn later, and whether the arrow waits ready at its end
 * (`idle`). */
export function archerTurn(clock: ArcherClock, speed: number, shoot: (rapid: boolean, tick: number) => number | false) {
  const state = archerState(clock);
  for (let tick = 1; tick <= TURN_TICKS; tick++) archerTick(state, speed, tick, shoot);
  return { clock: archerClock(state), idle: state.charge === undefined };
}

/** The ticks of a turn (1 to `TURN_TICKS`) at which a hero walking from
 * `dx`, `dy` tiles off a target by `ux`, `uy` over the turn (a step, or
 * none) is within reach of it: its squared distance in hundredths of a
 * tile, times `scale`, at most `limit` (`range`² for reach `range`).
 * Closed form: at tick k the hero is X(k) = 100·(dx, dy) + k·(ux, uy)
 * hundredths off, and |X(k)|² = A·k² + 2B·k + C is at most the limit
 * between the roots (−B ± √(B² − A·(C − limit / scale))) / A; each end is
 * then settled on whole ticks by the exact test, so the square root's
 * rounding never matters. Undefined when it is out of reach all turn. */
export function reachTicks(dx: number, dy: number, ux: number, uy: number, limit: number, scale = 1): { first: number; last: number } | undefined {
  const fits = (k: number) => {
    const x = 100 * dx + ux * k, y = 100 * dy + uy * k;
    return (x * x + y * y) * scale <= limit;
  };
  const a = ux * ux + uy * uy;
  if (!a) return fits(0) ? { first: 1, last: TURN_TICKS } : undefined;
  const b = 100 * (dx * ux + dy * uy), c = 10_000 * (dx * dx + dy * dy);
  // The discriminant times `scale`, in whole numbers.
  const disc = b * b * scale - a * (c * scale - limit);
  if (disc < 0) return undefined;
  const root = Math.sqrt(disc / scale);
  let first = Math.max(1, Math.ceil((-b - root) / a)), last = Math.min(TURN_TICKS, Math.floor((-b + root) / a));
  while (first > 1 && fits(first - 1)) first--;
  while (first <= last && !fits(first)) first++;
  while (last < TURN_TICKS && fits(last + 1)) last++;
  while (last >= first && !fits(last)) last--;
  return first <= last ? { first, last } : undefined;
}

/** Whether a tile `dx`, `dy` away lies within `range` hundredths of a tile
 * (Euclidean: a knight's move is √5 ≈ 2.24 away). */
export const within = (dx: number, dy: number, range: number) => (dx * dx + dy * dy) * 10_000 <= range * range;
/** How far a Ranged enemy shoots, in hundredths of a tile: five sixths of
 * the hero's reach (`range`), 2.5 tiles to its 3, so the hero always gets
 * the first shot. `reachTicks` takes it as `FOE_REACH`, in whole numbers:
 * 36 times the squared distance against 25 times `range`². */
/** The Archer's reach with the card trees' Range, `percent` more of
 * Attack Range's (in hundredths of a tile, whole): a Ranged enemy's reach
 * stays `foeRange` of Attack Range's own. */
export const arrowRange = (range: number, percent = 0) => (percent ? Math.floor((range * (100 + percent)) / 100) : range);
export const foeRange = (range: number) => (range * 5) / 6;
export const FOE_REACH = { scale: 36, limit: (range: number) => 25 * range * range };

/** What a Ranged enemy's shot does to `player`: its ATK less DEF, cut by
 * Parry % (every shot is parried), and the shroud (whole for every
 * shot) taking what it can of the rest; the card trees' DEF and shroud
 * against it count (`facing`). */
export function shotDamage(player: Player, enemy: Enemy) {
  player = facing(player, enemy);
  const struck = struckDamage(enemy.attack, player.defense, parryCut(player));
  const shrouded = Math.min(player.shroud ?? 0, struck);
  return { damage: snap(struck - shrouded), shrouded };
}

/** What the Archer's arrow takes off `enemy`: one of its strikes, raised
 * against a boss and by the hand's cards (`cards`, the Shot ATK percent
 * added to the enemy cards'), multiplied by its `boost` (`arrowBoost`) and by
 * `applications` of the critical `factor` and a Super Critical's `superFactor`, less the enemy's DEF (Piercing
 * ignoring some, and Armor Break, this arrow's first, taking more off), cut by
 * a Shielded enemy's bubble; 0 or less does nothing. */
export function arrowDamage(player: Player, enemy: Enemy, applications = 0, factor = 1, boost = 1, cards = 0, superFactor = 1) {
  const attack = boost === 1 ? attackAgainst(player, enemy, cards) : snap(attackAgainst(player, enemy, cards) * boost);
  const raised = applications ? snap(attack * critMultiplier(factor, applications) * superFactor) : attack;
  return guarded(snap(raised - defenseAgainst(player, enemy, brokenAfter(player, enemy))), enemy);
}

/** What an arrow's ATK is multiplied by before any critical hit: ATK / m
 * (`perTile`, hundred-thousandths of ×1 a tile) times the Euclidean distance
 * to its target (`d2`, squared, in tiles, as it is the tick the arrow
 * fires), and Charged Shot (`percent` a turn for the
 * `waited` turns the ready arrow held), each multiplying the other. */
export const arrowBoost = (perTile: number, d2: number, percent: number, waited: number) =>
  snap((1 + (perTile * Math.sqrt(d2)) / 100_000) * (1 + (percent * waited) / 100));

/** The Ranged and Archer state a run keeps, so undo takes it back with the
 * run: the turns taken inside (each shot's rolls are fixed by it), the
 * Archer's charge, the turns its ready arrow has waited unfired (`waited`,
 * counted once Charged Shot is researched), the hundredths of a turn of
 * Rapid Fire left (`rapid`), and each Ranged enemy's charge that has shot
 * on this floor, by its tile. Absent charge is full. */
export type Volleys = { turn: number; hero?: number; waited?: number; rapid?: number; foes?: Record<string, number> };

/** An enemy within reach: where it stands, its tile (a Flying enemy's as
 * `enemy`, the tile still open floor), and its squared distance. */
export type InReach = { x: number; y: number; tile: Tile & { enemy: Enemy }; d2: number };
/** The enemies on `board` within `range` hundredths of a tile of `at`,
 * closest first (then lowest row, then column), walls and doors no
 * obstacle, a Flying enemy over `at` itself counted first; on a board that
 * wraps (`wrap`, its width) distances go round. */
export function enemiesWithin(board: { tile(x: number, y: number): Tile }, at: { x: number; y: number }, range: number, wrap = 0): InReach[] {
  const reach = Math.floor(range / 100), seen = new Set<string>(), found: InReach[] = [];
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      if (!within(dx, dy, range)) continue;
      const x = wrap ? (((at.x + dx) % wrap) + wrap) % wrap : at.x + dx, y = at.y + dy, k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const tile = board.tile(x, y);
      if (tile.kind === "enemy" && tile.enemy && (x !== at.x || y !== at.y)) found.push({ x, y, tile: tile as InReach["tile"], d2: dx * dx + dy * dy });
      else if (tile.flyer) found.push({ x, y, tile: { ...tile, enemy: tile.flyer }, d2: dx * dx + dy * dy });
    }
  return found.sort((a, b) => a.d2 - b.d2 || a.y - b.y || a.x - b.x);
}
