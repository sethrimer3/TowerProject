import type { KeyColor } from "../config.ts";
import { QUOTA_DOORS, keyFirstFloor, towerDoorRate, towerKeyRatio, towerWoodPercent } from "../key-schedule.ts";
import { RANKED_STRENGTHS, enemyCountPercent, enemyShare } from "../enemy-schedule.ts";
import { GATE_VALUE } from "./forks.ts";
import { doorRule } from "../doors.ts";
import type { Tile } from "../entities.ts";
import { generateTowerFloor, type TowerFloor } from "./index.ts";
import type { LaneStep } from "./types.ts";

/** The census: what Tower floors hold on average, by tower and band of
 * floors, for tuning the door and key schedule (docs/DOOR_AND_KEY_SCHEDULE.md)
 * and the enemy schedule (docs/ENEMY_SCHEDULE.md). `npm run tower:report --
 * --census`. */

/** One floor's counts, keyed `door:<kind>` (a combined door counting once
 * for each colour it takes, and once as `door:combined`), `forkTile:<kind>`
 * (the doors of that kind standing in a built fork's lanes) and
 * `forked:<kind>` (the same counting 1/k in a fork of k lanes, as the hero
 * opens one lane), `key:<colour>`,
 * `enemy:<strength>`, an item's kind, or `dropped:<door>` (quota doors the
 * door stage found no place for); the census adds `target:<door>`, the
 * schedule's rate, `share:<strength>`, the enemy schedule's share, and
 * `target:count`, its count in percent of the baseline. */
export type Counts = Record<string, number>;

const ITEMS = new Set(["potion", "attack", "defense", "treasure"]);

/** A door tile's kinds: `wood`, `steel`, `heart`, or each key colour it
 * takes, and `combined` when it takes more than one thing (colours, or a
 * colour and the heart's drain, which counts as `heart` too). */
function doorKinds(t: Tile): string[] {
  const rule = doorRule(t);
  if (rule.type === "fullHp") return ["heart"];
  if (rule.type === "wood") return ["wood"];
  if (rule.mode === "any") return ["steel"];
  const kinds: string[] = [...rule.keys, ...(rule.heart ? ["heart"] : [])];
  return kinds.length > 1 ? [...kinds, "combined"] : kinds;
}

function laneDoorKind(s: LaneStep): string | null {
  if (s.kind === "door") return s.color;
  return s.kind === "wood" || s.kind === "heart" ? s.kind : null;
}

export const add = (c: Counts, k: string, n = 1) => { c[k] = (c[k] ?? 0) + n; };

/** What floor `floor` holds: every tile counted, and the doors in the forks
 * the embedder built. */
export const floorCounts = ({ cells, embedding }: TowerFloor): Counts =>
  tileCounts(cells.values(), embedding.graph.nodes.flatMap((n) => (n.forks?.[0] ? [n.forks[0].lanes] : [])), embedding.graph.doorQuota);

/** What `tiles` hold, the doors standing in built forks (each its lanes),
 * and the quota doors still owed (`quota`'s `dropped`). */
export function tileCounts(tiles: Iterable<Tile>, forks: LaneStep[][][], quota: Partial<Record<string, { dropped: number }>> = {}): Counts {
  const c: Counts = {};
  for (const t of tiles) {
    if (t.kind === "door") for (const kind of doorKinds(t)) add(c, `door:${kind}`);
    else if (t.kind === "key") add(c, `key:${t.color ?? "yellow"}`);
    else if (t.kind === "enemy") add(c, `enemy:${t.enemy?.strength ?? "normal"}`);
    else if (ITEMS.has(t.kind)) add(c, t.kind);
  }
  for (const lanes of forks)
    for (const step of lanes.flat()) {
      const kind = laneDoorKind(step);
      if (!kind) continue;
      add(c, `forkTile:${kind}`);
      add(c, `forked:${kind}`, 1 / lanes.length);
    }
  for (const [door, q] of Object.entries(quota)) add(c, `dropped:${door}`, q?.dropped ?? 0);
  return c;
}

export type CensusOptions = {
  towers: number[];
  /** Floors counted from 1, inclusive. */
  from: number;
  to: number;
  /** Floors in each band. */
  band: number;
  seeds: number;
  /** Count every `stride`th floor of the range (1: all of them). */
  stride?: number;
};

/** One tower's band of floors: the floors counted and their average counts. */
export type CensusBand = { tower: number; from: number; to: number; floors: number; avg: Counts };

const COLORS: KeyColor[] = ["yellow", "blue", "red"];

/** The seeds the census (and the rest of the report) samples. */
export const censusSeed = (i: number) => i * 7919 + 13;

export function census(o: CensusOptions): CensusBand[] {
  const bands: CensusBand[] = [];
  const stride = Math.max(1, o.stride ?? 1);
  for (const tower of o.towers)
    for (let from = o.from; from <= o.to; from += o.band) {
      const to = Math.min(o.to, from + o.band - 1);
      const sum: Counts = {};
      let floors = 0;
      for (let f = from; f <= to; f += stride)
        for (let s = 0; s < o.seeds; s++) {
          floors++;
          for (const [k, n] of Object.entries(floorCounts(generateTowerFloor(censusSeed(s), f - 1, tower)))) add(sum, k, n);
          addSchedule(sum, f - 1, tower);
        }
      bands.push({ tower, from, to, floors, avg: averaged(sum, floors) });
    }
  return bands;
}

/** Adds to `sum` what the schedules want on floor `depth` (0 is the first)
 * of tower `tower`: each quota door's rate, the wooden share, each open
 * key colour's aimed keys per lock (off the way to the stairs), which
 * `averaged` averages over the floors it is open on, and the enemy
 * schedule's shares and count. */
export function addSchedule(sum: Counts, depth: number, tower: number) {
  for (const strength of RANKED_STRENGTHS) add(sum, `share:${strength}`, enemyShare(strength, depth, tower));
  add(sum, "target:count", enemyCountPercent(depth));
  for (const door of QUOTA_DOORS) add(sum, `target:${door}`, towerDoorRate(door, depth, tower));
  add(sum, "target:wood", towerWoodPercent(depth, tower));
  for (const color of COLORS)
    if (depth + 1 >= keyFirstFloor(color, tower)) {
      add(sum, `aim:${color}`, towerKeyRatio(color, depth, tower) / 10000);
      add(sum, `open:${color}`);
    }
}

/** `sum` per floor, over `floors` floors. */
export function averaged(sum: Counts, floors: number): Counts {
  const avg: Counts = {};
  for (const [k, n] of Object.entries(sum)) avg[k] = n / floors;
  for (const color of COLORS) if (sum[`open:${color}`]) avg[`aim:${color}`] = sum[`aim:${color}`]! / sum[`open:${color}`]!;
  return avg;
}

/** Keys found per lock of each colour, and overall. A wooden or steel door
 * counts as a yellow lock, since it eats the cheapest key first. */
export function keysPerLock(c: Counts): Record<KeyColor | "all", number> {
  // A fork's lane doors count 1/k, as the hero opens one lane of k.
  const doors = (kind: string) => (c[`door:${kind}`] ?? 0) - (c[`forkTile:${kind}`] ?? 0) + (c[`forked:${kind}`] ?? 0);
  const locks = (color: KeyColor) => doors(color) + (color === "yellow" ? doors("wood") + doors("steel") : 0);
  const ratio = (keys: number, n: number) => (n ? keys / n : NaN);
  const out = {} as Record<KeyColor | "all", number>;
  for (const color of COLORS) out[color] = ratio(c[`key:${color}`] ?? 0, locks(color));
  out.all = ratio(COLORS.reduce((s, k) => s + (c[`key:${k}`] ?? 0), 0), COLORS.reduce((s, k) => s + locks(k), 0));
  return out;
}

/** The share of yellow locks that are wooden. */
export const woodShare = (c: Counts) => {
  const wood = c["door:wood"] ?? 0, locks = wood + (c["door:yellow"] ?? 0);
  return locks ? wood / locks : NaN;
};

/** The enemies the schedule shares out: all but the bosses. */
export const rankedEnemies = (c: Counts) => RANKED_STRENGTHS.reduce((s, k) => s + (c[`enemy:${k}`] ?? 0), 0);
/** The percent of those enemies that are of `strength`. */
export const strengthShare = (c: Counts, strength: string) => {
  const all = rankedEnemies(c);
  return all ? ((c[`enemy:${strength}`] ?? 0) / all) * 100 : NaN;
};
/** The enemies' weight: each priced on the forks' scale (`GATE_VALUE`:
 * weak 0.75, normal 1.5, strong 2.5, elite 4, boss 6), a rough measure of
 * the fighting a floor holds. */
export const enemyWeight = (c: Counts) =>
  Object.entries(GATE_VALUE.enemy).reduce((s, [k, w]) => s + w * (c[`enemy:${k}`] ?? 0), 0);

type Column = [heading: string, value: (c: Counts) => number, digits?: number];
const count = (k: string): Column[1] => (c) => c[k] ?? 0;
/** A colour's aimed keys per lock, or `-` while it isn't open. */
const aim = (color: KeyColor): Column[1] => (c) => c[`aim:${color}`] ?? NaN;
const alone = (kind: string): Column[1] => (c) => (c[`door:${kind}`] ?? 0) - (c[`forkTile:${kind}`] ?? 0);

const DOOR_COLUMNS: Column[] = [
  ["Y door", count("door:yellow")], ["wood", count("door:wood")], ["wood%", (c) => woodShare(c) * 100, 0], ["W want", count("target:wood"), 0], ["combined", count("door:combined")],
  ["B want", count("target:blue")], ["B alone", alone("blue")], ["B fork", count("forked:blue")],
  ["R want", count("target:red")], ["R alone", alone("red")], ["R fork", count("forked:red")],
  ["H want", count("target:heart")], ["H alone", alone("heart")], ["H fork", count("forked:heart")],
  ["dropped", (c) => QUOTA_DOORS.reduce((s, d) => s + (c[`dropped:${d}`] ?? 0), 0)],
  ["Y key", count("key:yellow")], ["B key", count("key:blue")], ["R key", count("key:red")],
  ["Y/lock", (c) => keysPerLock(c).yellow], ["Y aim", aim("yellow")], ["B/lock", (c) => keysPerLock(c).blue], ["B aim", aim("blue")],
  ["R/lock", (c) => keysPerLock(c).red], ["R aim", aim("red")], ["all/lock", (c) => keysPerLock(c).all],
];
const ENEMY_COLUMNS: Column[] = [
  ["enemies", rankedEnemies], ["count want%", count("target:count"), 0],
  ...RANKED_STRENGTHS.flatMap((k): Column[] => [[k, count(`enemy:${k}`)], [`${k}%`, (c) => strengthShare(c, k), 0], [`${k} want%`, count(`share:${k}`), 0]]),
  ["boss", count("enemy:boss")], ["weight", enemyWeight],
];
const ITEM_COLUMNS: Column[] = [
  ["potion", count("potion")], ["ATK", count("attack")], ["DEF", count("defense")], ["treasure", count("treasure")],
];

function table(bands: CensusBand[], columns: Column[]) {
  const rows = [["floors", ...columns.map(([h]) => h)]];
  for (const b of bands)
    rows.push([`${b.from}-${b.to}`, ...columns.map(([, value, digits = 2]) => {
      const v = value(b.avg);
      return Number.isNaN(v) ? "-" : v.toFixed(digits);
    })]);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((cell, i) => cell.padStart(widths[i])).join("  ")).join("\n");
}

/** The census as text: per tower (or delve, `place`), doors and keys,
 * enemies, then items, each an average per floor by band. */
export function formatCensus(bands: CensusBand[], place = "Tower"): string {
  const out: string[] = [];
  for (const tower of [...new Set(bands.map((b) => b.tower))]) {
    const mine = bands.filter((b) => b.tower === tower);
    const floors = mine.reduce((s, b) => s + b.floors, 0);
    out.push(`=== ${place} ${tower} · ${floors} floors · average per floor ===`, "Doors and keys", table(mine, DOOR_COLUMNS),
      "", "Enemies", table(mine, ENEMY_COLUMNS), "", "Items", table(mine, ITEM_COLUMNS), "");
  }
  return out.join("\n");
}
