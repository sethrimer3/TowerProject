// What the game saves or plays by must come out the same in every
// JavaScript engine, or a save made in one browser (or before a browser
// update) meets different terrain in the next. Two things the language
// leaves to each engine have bitten generation before:
//
// - which comparisons Array.prototype.sort makes, and how many (a random
//   draw inside a comparator shifts the whole random stream);
// - the last bit of Math.pow, exp, log, the trig functions and hypot (only
//   + - * / and sqrt are exact everywhere), which can tip a comparison,
//   a rounding or a weighted pick.
//
// So this test builds Tower floors, Delve regions, torch spots, enemy
// stats, upgrade prices and Defend cities twice, natively and with a
// different (correct, stable) sort, and requires identical output; and it
// requires that building them calls none of those Math functions at all.
// `**` can't be intercepted at run time, so the modules generation runs
// through are scanned for it instead: use intPow (src/exact.ts) or sqrt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { generateTowerFloor } from "../src/tower/index.ts";
import { region } from "../src/delve/labyrinth.ts";
import { generate as delveChunk } from "../src/delve/world.ts";
import { chooseTorchSpots } from "../src/torches.ts";
import { getTowerGateEnemy, type TowerEnemyProfile, type TowerEnemyStrength } from "../src/scaling.ts";
import { cost, UPGRADES } from "../src/config.ts";
import { WIDTH } from "../src/config.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Map ? [...x.entries()] : x instanceof Uint8Array || x instanceof Int32Array ? [...x] : x));
const digest = (v: unknown) => createHash("sha256").update(json(v)).digest("hex").slice(0, 16);

/** Everything under test, each as one fingerprint. */
function outputs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seed of [1, 2, 3, 4])
    for (const room of [0, 3, 7, 12, 25, 48, 95, 130]) {
      const f = generateTowerFloor(seed * 7919, room);
      out[`tower ${seed}/${room}`] = digest({ cells: f.cells, rects: f.embedding.rects, doorways: f.embedding.doorways, stairs: f.embedding.stairs });
      out[`tower torches ${seed}/${room}`] = digest(chooseTorchSpots(f.cells, { xMin: 1, xMax: 15, yMin: 1, yMax: 15, seed: seed + room }));
    }
  for (const seed of [11, 12])
    for (let area = 0; area < 5; area++) {
      const r = region(seed, area);
      out[`delve ${seed}/${area}`] = digest({ nodes: r.nodes, edges: r.edges, cells: r.cells });
    }
  const chunk = delveChunk(11, 2);
  out["delve torches"] = digest(chooseTorchSpots(chunk, { xMin: 1, xMax: WIDTH - 2, yMin: 40, yMax: 59, seed: 11 }));
  const strengths: TowerEnemyStrength[] = ["weak", "normal", "strong", "elite"];
  const profiles: TowerEnemyProfile[] = ["attackHeavy", "balanced", "defenseHeavy"];
  out.enemies = digest([0, 9, 55, 99, 100, 250, 480].flatMap((room) => strengths.flatMap((s) => profiles.map((p) => getTowerGateEnemy(room, s, p)))));
  out.prices = digest(UPGRADES.flatMap((u) => Array.from({ length: 40 }, (_, level) => cost(u.id, level))));
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  for (const seed of [1, 2, 3]) {
    const m = generateCity(fit, seed * 104729);
    out[`defend city ${seed}`] = digest([m.type, m.owner, m.buildings]);
  }
  return out;
}

/** A stable merge sort: correct, but comparing in its own order. */
function mergeSort<T>(this: T[], compare?: (a: T, b: T) => number) {
  if (!compare) return nativeSort.call(this);
  const merge = (items: T[]): T[] => {
    if (items.length < 2) return items;
    const mid = items.length >> 1, a = merge(items.slice(0, mid)), b = merge(items.slice(mid)), out: T[] = [];
    let i = 0, j = 0;
    while (i < a.length && j < b.length) out.push(compare(b[j], a[i]) < 0 ? b[j++] : a[i++]);
    return out.concat(a.slice(i), b.slice(j));
  };
  const sorted = merge([...this]);
  for (let k = 0; k < sorted.length; k++) this[k] = sorted[k];
  return this;
}
const nativeSort = Array.prototype.sort;

const INEXACT = ["pow", "exp", "expm1", "log", "log1p", "log2", "log10", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "hypot", "cbrt"] as const;

/** Runs `body` with the engine behaviour changed by `patch`, then restores it. */
function under(patch: () => () => void, body: () => Record<string, string>) {
  const restore = patch();
  try { return body(); } finally { restore(); }
}
const otherSort = () => {
  Array.prototype.sort = mergeSort as typeof nativeSort;
  return () => { Array.prototype.sort = nativeSort; };
};
/** Counts calls to the inexact Math functions, by name. */
const counting = (calls: Map<string, number>) => () => {
  const math = Math as unknown as Record<string, (...a: number[]) => number>;
  const saved = INEXACT.map((name) => [name, math[name]] as const);
  for (const [name, real] of saved) math[name] = (...a) => (calls.set(name, (calls.get(name) ?? 0) + 1), real(...a));
  return () => { for (const [name, real] of saved) math[name] = real; };
};

/** The keys whose fingerprint differs from the native run. */
function drift(native: Record<string, string>, varied: Record<string, string>) {
  return Object.keys(native).filter((k) => native[k] !== varied[k]);
}

test("saved and played-by generation doesn't depend on the engine's sort", () => {
  const native = outputs();
  assert.deepEqual(drift(native, under(otherSort, outputs)), []);
});

test("saved and played-by generation calls no inexact Math function", () => {
  const calls = new Map<string, number>();
  under(counting(calls), outputs);
  assert.deepEqual(Object.fromEntries(calls), {});
});

/** The modules Tower, Delve and Defend generation run through. */
const GENERATION = [
  ...readdirSync(new URL("../src/tower/", import.meta.url)).map((f) => `tower/${f}`),
  "delve/labyrinth.ts", "delve/patterns.ts", "delve/world.ts", "torches.ts", "board.ts", "random.ts", "exact.ts",
  "scaling.ts", "enemy-curves.ts", "config.ts", "defend/citygen.ts", "defend/layout.ts", "defend/grid.ts",
];

test("generation modules use no ** (intPow or sqrt instead)", () => {
  const found: string[] = [];
  for (const file of GENERATION) {
    const lines = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (!/^\s*(\/\*|\*)/.test(code) && /[^/*]\*\*[^/*]/.test(code)) found.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
