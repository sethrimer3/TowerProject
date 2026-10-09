import type { KeyColor } from "../config.ts";
import { QUOTA_DOORS, towerDoorRate } from "../key-schedule.ts";
import { doorRule } from "../doors.ts";
import type { Tile } from "../entities.ts";
import { generateTowerFloor, type TowerFloor } from "./index.ts";
import type { LaneStep } from "./types.ts";

/** The door and key census: what Tower floors hold on average, by tower and
 * band of floors, for tuning the door and key schedule
 * (docs/DOOR_AND_KEY_SCHEDULE.md). `npm run tower:report -- --census`. */

/** One floor's counts, keyed `door:<kind>` (a combined door counting once
 * for each colour it takes, and once as `door:combined`), `forked:<kind>` (the doors of
 * that kind standing in a built fork's lanes), `key:<colour>`,
 * `enemy:<strength>`, an item's kind, or `dropped:<door>` (quota doors the
 * door stage found no place for); the census adds `target:<door>`, the
 * schedule's rate. */
export type Counts = Record<string, number>;

const ITEMS = new Set(["potion", "attack", "defense", "treasure"]);

/** A door tile's kinds: `steel`, `heart`, or each key colour it takes, and
 * `combined` when it takes more than one. */
function doorKinds(t: Tile): string[] {
  const rule = doorRule(t);
  if (rule.type === "fullHp") return ["heart"];
  if (rule.mode === "any") return ["steel"];
  return rule.keys.length > 1 ? [...rule.keys, "combined"] : rule.keys;
}

function laneDoorKind(s: LaneStep): string | null {
  if (s.kind === "door") return s.color;
  return s.kind === "steel" || s.kind === "heart" ? s.kind : null;
}

const add = (c: Counts, k: string, n = 1) => { c[k] = (c[k] ?? 0) + n; };

/** What floor `floor` holds: every tile counted, and the doors in the forks
 * the embedder built. */
export function floorCounts({ cells, embedding }: TowerFloor): Counts {
  const c: Counts = {};
  for (const t of cells.values()) {
    if (t.kind === "door") for (const kind of doorKinds(t)) add(c, `door:${kind}`);
    else if (t.kind === "key") add(c, `key:${t.color ?? "yellow"}`);
    else if (t.kind === "enemy") add(c, `enemy:${t.enemy?.strength ?? "normal"}`);
    else if (ITEMS.has(t.kind)) add(c, t.kind);
  }
  for (const node of embedding.graph.nodes)
    for (const lane of node.forks?.[0]?.lanes ?? [])
      for (const step of lane) {
        const kind = laneDoorKind(step);
        if (kind) add(c, `forked:${kind}`);
      }
  for (const [door, q] of Object.entries(embedding.graph.doorQuota ?? {})) add(c, `dropped:${door}`, q.dropped);
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
          for (const door of QUOTA_DOORS) add(sum, `target:${door}`, towerDoorRate(door, f - 1, tower));
        }
      const avg: Counts = {};
      for (const [k, n] of Object.entries(sum)) avg[k] = n / floors;
      bands.push({ tower, from, to, floors, avg });
    }
  return bands;
}

const COLORS: KeyColor[] = ["yellow", "blue", "red"];

/** Keys found per lock of each colour, and overall. A steel door counts as
 * a yellow lock, since it eats the cheapest key first. */
export function keysPerLock(c: Counts): Record<KeyColor | "all", number> {
  const locks = (color: KeyColor) => (c[`door:${color}`] ?? 0) + (color === "yellow" ? c["door:steel"] ?? 0 : 0);
  const ratio = (keys: number, n: number) => (n ? keys / n : NaN);
  const out = {} as Record<KeyColor | "all", number>;
  for (const color of COLORS) out[color] = ratio(c[`key:${color}`] ?? 0, locks(color));
  out.all = ratio(COLORS.reduce((s, k) => s + (c[`key:${k}`] ?? 0), 0), COLORS.reduce((s, k) => s + locks(k), 0));
  return out;
}

/** The share of yellow locks that are steel. */
export const steelShare = (c: Counts) => {
  const steel = c["door:steel"] ?? 0, locks = steel + (c["door:yellow"] ?? 0);
  return locks ? steel / locks : NaN;
};

type Column = [heading: string, value: (c: Counts) => number, digits?: number];
const count = (k: string): Column[1] => (c) => c[k] ?? 0;
const alone = (kind: string): Column[1] => (c) => (c[`door:${kind}`] ?? 0) - (c[`forked:${kind}`] ?? 0);

const DOOR_COLUMNS: Column[] = [
  ["Y door", count("door:yellow")], ["steel", count("door:steel")], ["steel%", (c) => steelShare(c) * 100, 0], ["combined", count("door:combined")],
  ["B want", count("target:blue")], ["B alone", alone("blue")], ["B fork", count("forked:blue")],
  ["R want", count("target:red")], ["R alone", alone("red")], ["R fork", count("forked:red")],
  ["H want", count("target:heart")], ["H alone", alone("heart")], ["H fork", count("forked:heart")],
  ["dropped", (c) => QUOTA_DOORS.reduce((s, d) => s + (c[`dropped:${d}`] ?? 0), 0)],
  ["Y key", count("key:yellow")], ["B key", count("key:blue")], ["R key", count("key:red")],
  ["Y/lock", (c) => keysPerLock(c).yellow], ["B/lock", (c) => keysPerLock(c).blue],
  ["R/lock", (c) => keysPerLock(c).red], ["all/lock", (c) => keysPerLock(c).all],
];
const CONTENT_COLUMNS: Column[] = [
  ["weak", count("enemy:weak")], ["normal", count("enemy:normal")], ["strong", count("enemy:strong")],
  ["elite", count("enemy:elite")], ["boss", count("enemy:boss")],
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

/** The census as text: per tower, doors and keys, then enemies and items,
 * each an average per floor by band. */
export function formatCensus(bands: CensusBand[]): string {
  const out: string[] = [];
  for (const tower of [...new Set(bands.map((b) => b.tower))]) {
    const mine = bands.filter((b) => b.tower === tower);
    const floors = mine.reduce((s, b) => s + b.floors, 0);
    out.push(`=== Tower ${tower} · ${floors} floors · average per floor ===`, "Doors and keys", table(mine, DOOR_COLUMNS),
      "", "Enemies and items", table(mine, CONTENT_COLUMNS), "");
  }
  return out.join("\n");
}
