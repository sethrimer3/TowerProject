import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { TOWER_HEIGHT, TOWER_WIDTH, type KeyColor } from "../src/config.ts";
import { point, type Tile } from "../src/entities.ts";
import { random } from "../src/generation.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { analyzeFloor, asciiMap, formatFloorSummary, keyEconomy } from "../src/tower/analyzer.ts";
import { generateStrategicGraph } from "../src/tower/strategic-graph.ts";

// Characterization hashes of Tower floor planning: strategic graphs (with the
// resource planner's key sources and notes) over many seeds, depths and
// budget cuts; the analyzer's report and summary text for real floors; and
// the keys-only economy search and ASCII map on seeded synthetic boards.
// Regenerate (only when a planning or analysis change is intended) with
// UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/tower-planning.golden.json", import.meta.url);

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

const DEPTHS = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 20, 30, 45, 60, 90];

function graphs(depth: number) {
  const out: unknown[] = [];
  for (let seed = 1; seed <= 60; seed++)
    for (const cut of [0, 1, 2, 4]) out.push(generateStrategicGraph(seed * 7919 + depth, depth, cut));
  return digest(out);
}

function analyses(seed: number) {
  const out: unknown[] = [];
  for (let room = 0; room <= 60; room += 3) {
    const { cells, embedding } = generateTowerFloor(seed, room);
    const a = analyzeFloor(embedding);
    out.push(a, formatFloorSummary(a, cells), formatFloorSummary(a));
  }
  return digest(out);
}

const DOORS: Tile[] = [
  { kind: "door", color: "yellow" },
  { kind: "door", color: "blue" },
  { kind: "door", color: "red" },
  { kind: "door", color: "yellow", door: { type: "keys", keys: ["yellow", "blue"], mode: "all" } },
  { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "any" } },
  { kind: "door", door: { type: "keys", keys: ["blue", "red"], mode: "any" } },
  { kind: "door", color: "blue", door: { type: "fullHp" } },
];
const COLORS: KeyColor[] = ["yellow", "blue", "red"];
const OTHER: Tile["kind"][] = ["enemy", "potion", "attack", "defense", "treasure", "stairsDown", "oneway", "reward", "chest" as Tile["kind"]];

/** A seeded board: open floor with walls, keys, other items and `doors`
 * doors, some cells left out entirely. */
function board(seed: number, doors: number) {
  const rnd = random(seed);
  const cells = new Map<string, Tile>();
  const wallDensity = 0.1 + rnd() * 0.35;
  for (let y = 0; y < TOWER_HEIGHT; y++)
    for (let x = 0; x < TOWER_WIDTH; x++) {
      if (rnd() < 0.02) continue;
      const r = rnd();
      const t: Tile = r < wallDensity ? { kind: "wall" }
        : r < wallDensity + 0.06 ? { kind: "key", color: COLORS[Math.floor(rnd() * 3)] }
        : r < wallDensity + 0.1 ? { kind: OTHER[Math.floor(rnd() * OTHER.length)] }
        : { kind: "floor" };
      cells.set(point(x, y), t);
    }
  const open = () => {
    for (;;) {
      const k = point(Math.floor(rnd() * TOWER_WIDTH), Math.floor(rnd() * TOWER_HEIGHT));
      if (cells.has(k)) return k;
    }
  };
  for (let i = 0; i < doors; i++) cells.set(open(), { ...DOORS[Math.floor(rnd() * DOORS.length)] });
  const entrance = open(), stairs = open();
  cells.set(entrance, { kind: "floor" });
  cells.set(stairs, { kind: "stairs" });
  return { cells, entrance, stairs };
}

function economies(group: number) {
  const out: unknown[] = [];
  for (let i = 0; i < 12; i++) {
    const seed = group * 100 + i;
    const { cells, entrance, stairs } = board(seed, [0, 1, 2, 3, 5, 7, 9, 12, 14, 15, 18, 4][i]);
    out.push(keyEconomy(cells, entrance, stairs), keyEconomy(cells, stairs, entrance), asciiMap(cells));
  }
  return digest(out);
}

test("Tower graphs, floor analyses and key economies match the golden", () => {
  const actual: Record<string, unknown> = {};
  for (const depth of DEPTHS) actual[`graph ${depth}`] = graphs(depth);
  for (let seed = 1; seed <= 12; seed++) actual[`analysis ${seed}`] = analyses(seed);
  for (let g = 1; g <= 6; g++) actual[`economy ${g}`] = economies(g);
  actual["ascii empty"] = asciiMap(new Map());

  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + "\n");
  assert.ok(existsSync(GOLDEN), "golden missing; run with UPDATE_GOLDEN=1");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const key of Object.keys(golden)) assert.deepEqual(actual[key], golden[key], `${key} diverges`);
  assert.deepEqual(Object.keys(actual), Object.keys(golden));
});
