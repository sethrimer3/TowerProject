import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { random } from "../src/generation.ts";
import { defaultLayout, fitLayout, placeCityTile, placeStructure, type Layout, type PlacedKind } from "../src/defend/layout.ts";
import { generateCity, type CityMap } from "../src/defend/citygen.ts";
import { Fences, parkFences } from "../src/defend/fences.ts";
import { decodeDefendSave } from "../src/defend/progress.ts";
import { PALETTE_ITEMS, UPGRADES } from "../src/defend/catalog.ts";

// Characterization hashes of Defend's park fences and save decoding. Fences:
// the sections parkFences() lays around seeded cities, then seeded runs of
// Fences through map changes, trampling enemies (flying ones too), repeated
// and fresh blasts, uneven time steps, and draws on a recording canvas.
// Saves: decodeDefendSave() over a corpus of real layouts and their mutations
// (bad fields, out-of-range values, illegal or unowned layouts). Regenerate
// (only when a fence or decode change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/defend-fences-save.golden.json", import.meta.url);
const KINDS: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower"];
const ENEMY_KINDS = ["roach", "orc", "ogre", "warlord", "bat"];

const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v)))
    .digest("hex")
    .slice(0, 12);

/** A stand-in 2D context that feeds every call and property write to `h`. */
function recorder(h: Hash): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get: (_, key: string) =>
      key in state ? state[key] : (...args: unknown[]) => h.update(`${key}(${args.join(",")})\n`),
    set: (_, key: string, value) => {
      state[key] = value;
      h.update(`${key}=${value}\n`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** A city grown by seeded random tile and structure placements. */
function grow(rnd: () => number, edits: number): Layout {
  let l = defaultLayout();
  for (let i = 0; i < edits; i++) {
    const [bx, by] = l.cityTiles.length && rnd() < 0.8
      ? l.cityTiles[Math.floor(rnd() * l.cityTiles.length)].split(",").map(Number)
      : [l.keep.tx, l.keep.ty];
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
    if (rnd() < 0.75) l = placeCityTile(l, bx + dx, by + dy) ?? l;
    else l = placeStructure(l, KINDS[Math.floor(rnd() * KINDS.length)], bx, by) ?? l;
  }
  return l;
}

const cityOf = (l: Layout, seed: number): CityMap => {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, seed);
};

/** A seeded run of the fences over a few maps. */
function fenceRun(maps: CityMap[], rnd: () => number): string {
  const h = createHash("sha256");
  const c = recorder(h);
  const fences = new Fences();
  let map = maps[0], time = 0, blast = 0;
  fences.sync(map);
  for (let step = 0; step < 400; step++) {
    const roll = rnd();
    if (roll < 0.02) map = maps[Math.floor(rnd() * maps.length)];
    if (roll < 0.04) fences.sync(map);
    const intact = fences.sections.filter((s) => !s.broken);
    const near = () => {
      const s = intact[Math.floor(rnd() * intact.length)];
      return s ? [s.x1 + (s.x2 - s.x1) * rnd() + (rnd() - 0.5) * 0.8, s.y1 + (s.y2 - s.y1) * rnd() + (rnd() - 0.5) * 0.8] : [rnd() * 63, rnd() * 91];
    };
    const enemies = [];
    for (let n = Math.floor(rnd() * 4); n > 0; n--) {
      const [x, y] = rnd() < 0.7 ? near() : [rnd() * 70 - 3, rnd() * 98 - 3];
      enemies.push({ kind: ENEMY_KINDS[Math.floor(rnd() * ENEMY_KINDS.length)], x, y });
    }
    const effects = [];
    for (let n = rnd() < 0.15 ? 1 + Math.floor(rnd() * 3) : 0; n > 0; n--) {
      const [x, y] = near();
      const r = rnd();
      const seed = r < 0.1 ? undefined : r < 0.3 ? Math.floor(rnd() * Math.max(1, blast)) : blast++;
      effects.push({ kind: rnd() < 0.85 ? "boom" : rnd() < 0.5 ? "dust" : "spark", x, y, t: 0, r: 0.3 + rnd() * 2.5, seed });
    }
    // A burst of fresh blasts past the remembered-blast limit, far away.
    if (roll > 0.98) for (let i = 0; i < 205; i++) effects.push({ kind: "boom", x: -50, y: -50, t: 0, r: 0.1, seed: blast++ });
    const dt = rnd();
    time += dt < 0.05 ? -0.3 : dt < 0.1 ? 1.2 : dt * 0.2;
    fences.update({ time, enemies, effects } as any);
    h.update(`# ${step} ${digest(fences.sections.map((s) => s.broken))} ${digest(fences.splinters)}\n`);
    if (step % 7 === 0) fences.draw(c, [4, 9, 16, 33][step % 4]);
  }
  return h.digest("hex").slice(0, 16);
}

function fenceTraces() {
  const out: Record<string, string> = {};
  for (let seed = 1; seed <= 8; seed++) {
    const rnd = random(seed * 7919);
    const layouts = [grow(rnd, 20 + seed * 6), grow(rnd, 60), grow(rnd, 8)];
    const maps = layouts.flatMap((l, i) => [cityOf(l, seed + i), cityOf(l, seed * 13 + i)]);
    out[`sections ${seed}`] = digest(maps.map(parkFences));
    out[`run ${seed}`] = fenceRun(maps, rnd);
  }
  return out;
}

/** A plausible saved Defend state holding `layout`, owning enough for it. */
function saved(l: Layout, rnd: () => number): any {
  const owned: any = {};
  for (const item of PALETTE_ITEMS) owned[item] = 40 + Math.floor(rnd() * 5);
  return {
    layout: JSON.parse(JSON.stringify(l)),
    owned,
    levels: Object.fromEntries(UPGRADES.map((u) => [u.id, Math.floor(rnd() * (u.maxLevel + 1))])),
    bombs: Math.floor(rnd() * 50),
    bestWave: Math.floor(rnd() * 40),
    paletteSide: rnd() < 0.5 ? "left" : "right",
    speed3: rnd() < 0.5,
    seed: Math.floor(rnd() * 1e9),
  };
}

type Mutation = [string, (s: any, rnd: () => number) => void];
const MUTATIONS: Mutation[] = [
  ["none", () => {}],
  ["null", (s) => Object.keys(s).forEach((k) => delete s[k])],
  ["owned low", (s) => (s.owned.cityTile = 1)],
  ["owned high", (s) => (s.owned.barracks = 1000)],
  ["owned float", (s) => (s.owned.archerTower = 2.5)],
  ["owned missing", (s) => delete s.owned],
  ["unowned structures", (s) => KINDS.forEach((k) => (s.owned[k] = 0))],
  ["too few tiles", (s) => (s.owned.cityTile = Math.max(8, s.layout.cityTiles.length - 1))],
  ["level high", (s) => (s.levels[UPGRADES[0].id] = 99)],
  ["level negative", (s) => (s.levels[UPGRADES[1].id] = -1)],
  ["levels junk", (s) => (s.levels = "x")],
  ["bombs", (s) => (s.bombs = 10000)],
  ["bombs string", (s) => (s.bombs = "5")],
  ["best wave", (s) => (s.bestWave = 2e6)],
  ["palette side", (s) => (s.paletteSide = "up")],
  ["speed3 truthy", (s) => (s.speed3 = 1)],
  ["seed big", (s) => (s.seed = 2 ** 33)],
  ["seed edge", (s) => (s.seed = 2 ** 32)],
  ["no layout", (s) => delete s.layout],
  ["layout string", (s) => (s.layout = "layout")],
  ["keep missing", (s) => delete s.layout.keep],
  ["keep off board", (s) => (s.layout.keep.tx = 9)],
  ["keep negative", (s) => (s.layout.keep.ty = -1)],
  ["keep on spawn row", (s) => (s.layout.keep.ty = 0)],
  ["keep moved", (s) => (s.layout.keep.tx = (s.layout.keep.tx + 3) % 9)],
  ["tiles missing", (s) => delete s.layout.cityTiles],
  ["structures missing", (s) => (s.layout.structures = {})],
  ["next uid zero", (s) => (s.layout.nextUid = 0)],
  ["next uid low", (s) => (s.layout.nextUid = Math.max(1, s.layout.nextUid - 1))],
  ["next uid float", (s) => (s.layout.nextUid = 3.5)],
  ["tile number", (s) => s.layout.cityTiles.push(5)],
  ["tile junk", (s) => s.layout.cityTiles.push("4,x")],
  ["tile spaced", (s) => s.layout.cityTiles.push("4, 5")],
  ["tile padded", (s) => s.layout.cityTiles.length && (s.layout.cityTiles[0] = " " + s.layout.cityTiles[0])],
  ["tile suffixed", (s) => s.layout.cityTiles.length && (s.layout.cityTiles[0] += "x")],
  ["tile off board", (s) => s.layout.cityTiles.push("12,3")],
  ["tile on spawn row", (s) => s.layout.cityTiles.push("4,0")],
  ["tile on keep", (s) => s.layout.cityTiles.push(`${s.layout.keep.tx},${s.layout.keep.ty}`)],
  ["tile twice", (s) => s.layout.cityTiles.length && s.layout.cityTiles.push(s.layout.cityTiles[0])],
  ["tile adrift", (s) => s.layout.cityTiles.push("0,1")],
  ["tile dropped", (s, rnd) => s.layout.cityTiles.splice(Math.floor(rnd() * s.layout.cityTiles.length), 1)],
  ["structure kind", (s) => s.layout.structures.length && (s.layout.structures[0].kind = "keep")],
  ["structure null", (s) => s.layout.structures.push(null)],
  ["structure off board", (s) => s.layout.structures.length && (s.layout.structures[0].tx = -1)],
  ["structure on spawn row", (s) => s.layout.structures.length && (s.layout.structures[0].ty = 0)],
  ["structure uid zero", (s) => s.layout.structures.length && (s.layout.structures[0].uid = 0)],
  ["structure uid unissued", (s) => s.layout.structures.length && (s.layout.structures[0].uid = s.layout.nextUid)],
  ["structure uid twice", (s) => s.layout.structures.length > 1 && (s.layout.structures[1].uid = s.layout.structures[0].uid)],
  ["structure extra field", (s) => s.layout.structures.forEach((p: any) => (p.extra = 1))],
  ["structure moved", (s, rnd) => s.layout.structures.length && (s.layout.structures[0].tx = Math.floor(rnd() * 9))],
  ["structure crowded", (s) => s.layout.structures.forEach((p: any) => ((p.tx = s.layout.keep.tx), (p.ty = s.layout.keep.ty)))],
];

function decodeCases() {
  const out: Record<string, string> = {};
  const realRandom = Math.random;
  try {
    for (let seed = 1; seed <= 6; seed++) {
      const rnd = random(seed * 104729);
      Math.random = rnd;
      const layouts = [defaultLayout(), grow(rnd, 10), grow(rnd, 40), grow(rnd, 90)];
      const results = [];
      for (const l of layouts)
        for (const [name, mutate] of MUTATIONS) {
          const s = saved(l, rnd);
          mutate(s, rnd);
          results.push([name, decodeDefendSave(s)]);
        }
      results.push(["undefined", decodeDefendSave(undefined)], ["number", decodeDefendSave(4)]);
      out[`decode ${seed}`] = digest(results);
    }
  } finally {
    Math.random = realRandom;
  }
  return out;
}

test("Defend park fences and save decoding match the recorded golden", () => {
  const realRandom = Math.random;
  let actual: Record<string, string>;
  try {
    Math.random = random(4242);
    actual = { ...fenceTraces(), ...decodeCases() };
  } finally {
    Math.random = realRandom;
  }
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const [name, hash] of Object.entries(actual)) assert.equal(hash, expected[name], `${name} changed`);
});
