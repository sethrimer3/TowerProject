/** Ranged enemies and the Archer (docs/agents/movement-and-combat.md).
 *
 * From the third tower and delve up, any enemy but a boss or Greater Boss
 * may be Ranged, as it may be Fast (fast-enemies.ts), on a roll of its own:
 * it shoots the hero from a distance, walls and doors no obstacle, once its
 * cooldown is ready, without beginning a fight. Once Tower III's floor 10
 * Goal is claimed the hero is an Archer and shoots back: each turn its
 * arrow is ready, at the closest enemy in its range.
 *
 * Every cooldown is kept as a whole number of charge units, so a fraction
 * of a turn left over carries exactly to the next shot: a shooter gains
 * `gain` units a turn and a shot costs `cost`, so it fires every
 * cost / gain turns on average (3 shots in 10 turns fire 4, 3 and 3 turns
 * apart). A shooter with no charge kept is ready; one that is ready and has
 * nothing to shoot waits, banking nothing more. The Archer's charge runs a
 * hundredth of a turn at a time (`archerTurn`), so Rapid Fire can start
 * and end mid-turn. Each tile's roll is a fixed number of the run seed, the
 * floor and the tile (`RANGED_SALT`). */
import type { Enemy, Player, Tile } from "./entities.ts";
import { attackAgainst, critMultiplier, defenseAgainst, guarded, parryCut, struckDamage } from "./combat.ts";
import { fastShare, mayBeFast } from "./fast-enemies.ts";
import { snap } from "./exact.ts";
import { tileRandom } from "./random.ts";

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

/** A tile as it stands once the hero's arrows have wounded its enemy: its
 * HP less the `wound` (kept on the tile, so its full HP is HP + wound). */
export const wounded = (t: Tile): Tile => (t.wound && t.enemy ? { ...t, enemy: { ...t.enemy, hp: snap(Math.max(0, t.enemy.hp - t.wound)) } } : t);
/** `raw` (a tile as generated) with `damage` more wound. */
export const woundMore = (raw: Tile, damage: number): Tile => ({ ...raw, wound: snap((raw.wound ?? 0) + damage) });

/** Charge a Ranged enemy gains a turn, and what a shot costs it on
 * equivalent floor `floor`: 10 turns, a 500th of a turn less each floor (a
 * turn less every 500), never under 1. */
export const FOE_GAIN = 500;
export const foeShotCost = (floor: number) => Math.max(FOE_GAIN, 10 * FOE_GAIN - Math.max(0, floor - 1));
/** What an arrow costs the Archer: its gain every hundredth of a turn
 * (`ARCHER_TICKS` a turn) is its Attack Speed (twentieths of a shot every
 * 10 turns), so 20 fires every 10 turns. */
export const ARROW_COST = 20_000;
export const ARCHER_TICKS = 100;
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
 * and the hundredths of a turn of Rapid Fire left (absent: none). */
export type ArcherClock = { charge?: number; rapid?: number };

/** A turn of the Archer's clock, a hundredth of a turn at a time: each
 * adds `speed` to the charge, `RAPID_FIRE_SPEED` times that while Rapid
 * Fire lasts, and the hundredth the charge reaches `ARROW_COST`, `shoot` is
 * asked to fire, told whether Rapid Fire is still going on (`rapid`) and how
 * far into the turn it is (`tick`). It returns false when nothing can be
 * shot (the arrow then waits ready, banking nothing more, while Rapid Fire
 * runs on), or else the hundredths of Rapid Fire the shot starts from that
 * moment, 0 for none. An arrow already waiting fires at the turn's end
 * (`tick` = `ARCHER_TICKS`), the charge left over carrying either way, so
 * without Rapid Fire it fires as a turn-by-turn charge would. Returns the
 * clock a turn later, and whether the arrow is waiting at its end with
 * nothing shot since it was last asked (`idle`). */
export function archerTurn(clock: ArcherClock, speed: number, shoot: (rapid: boolean, tick: number) => number | false) {
  let charge = clock.charge, rapid = clock.rapid ?? 0, idle = false;
  const fire = (tick: number) => {
    const starts = shoot(rapid > 0, tick);
    if (starts === false) return false;
    if (starts > 0) rapid = starts;
    return true;
  };
  for (let tick = 1; tick <= ARCHER_TICKS; tick++) {
    if (charge === undefined) {
      // Waiting: the board doesn't change within the turn, so Rapid Fire just runs on.
      rapid = Math.max(0, rapid - 1);
      continue;
    }
    charge += rapid > 0 ? RAPID_FIRE_SPEED * speed : speed;
    if (rapid > 0) rapid--;
    if (charge < ARROW_COST) continue;
    if (fire(tick)) charge -= ARROW_COST;
    else charge = undefined, idle = true;
  }
  if (charge === undefined && !idle) {
    if (fire(ARCHER_TICKS)) charge = 0;
    else idle = true;
  }
  return { clock: { ...(charge === undefined ? {} : { charge }), ...(rapid > 0 ? { rapid } : {}) } as ArcherClock, idle };
}

/** Whether a tile `dx`, `dy` away lies within `range` hundredths of a tile
 * (Euclidean: a knight's move is √5 ≈ 2.24 away). */
export const within = (dx: number, dy: number, range: number) => (dx * dx + dy * dy) * 10_000 <= range * range;
/** How far a Ranged enemy shoots, in hundredths of a tile: five sixths of
 * the hero's reach (`range`), 2.5 tiles to its 3, so the hero always gets
 * the first shot. */
export const foeRange = (range: number) => (range * 5) / 6;

/** What a Ranged enemy's shot does to `player`: its ATK less DEF, cut by
 * Parry % (every shot is parried), and the shroud (whole for every
 * shot) taking what it can of the rest. */
export function shotDamage(player: Player, enemy: Enemy) {
  const struck = struckDamage(enemy.attack, player.defense, parryCut(player));
  const shrouded = Math.min(player.shroud ?? 0, struck);
  return { damage: snap(struck - shrouded), shrouded };
}

/** What the Archer's arrow takes off `enemy`: one of its strikes, raised
 * against a boss, multiplied by its `boost` (`arrowBoost`) and by
 * `applications` of the critical `factor`, less the enemy's DEF (Piercing
 * ignoring some), cut by a Shielded enemy's bubble; 0 or less does nothing. */
export function arrowDamage(player: Player, enemy: Enemy, applications = 0, factor = 1, boost = 1) {
  const attack = boost === 1 ? attackAgainst(player, enemy) : snap(attackAgainst(player, enemy) * boost);
  const raised = applications ? snap(attack * critMultiplier(factor, applications)) : attack;
  return guarded(snap(raised - defenseAgainst(player, enemy)), enemy);
}

/** What an arrow's ATK is multiplied by before any critical hit: ATK / m
 * (`perTile`, hundred-thousandths of ×1 a tile) times the Euclidean distance
 * to its target (`d2`, squared), and Charged Shot (`percent` a turn for the
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

/** An enemy within reach: where it stands, its tile, and its squared distance. */
export type InReach = { x: number; y: number; tile: Tile & { enemy: Enemy }; d2: number };
/** The enemies on `board` within `range` hundredths of a tile of `at`,
 * closest first (then lowest row, then column), walls and doors no
 * obstacle; on a board that wraps (`wrap`, its width) distances go round. */
export function enemiesWithin(board: { tile(x: number, y: number): Tile }, at: { x: number; y: number }, range: number, wrap = 0): InReach[] {
  const reach = Math.floor(range / 100), seen = new Set<string>(), found: InReach[] = [];
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      if (!within(dx, dy, range)) continue;
      const x = wrap ? (((at.x + dx) % wrap) + wrap) % wrap : at.x + dx, y = at.y + dy, k = `${x},${y}`;
      if (seen.has(k) || (x === at.x && y === at.y)) continue;
      seen.add(k);
      const tile = board.tile(x, y);
      if (tile.kind === "enemy" && tile.enemy) found.push({ x, y, tile: tile as InReach["tile"], d2: dx * dx + dy * dy });
    }
  return found.sort((a, b) => a.d2 - b.d2 || a.y - b.y || a.x - b.x);
}
