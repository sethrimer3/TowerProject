import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RoomWorld, World, type Board } from "../src/generation.ts";
import { clearDecorCache, decorSourceFor, tileDecor, type TileDecor } from "../src/decor.ts";

// Characterization hash of the decor planner: every tile of a spread of real
// Tower floors and Delve chunks is planned and hashed per board against a
// golden file, so a refactor that reorders the planner's random draws shows
// up here. Regenerate (only when a decor change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/decor-plan.golden.json", import.meta.url);

const TOWER = Array.from({ length: 8 }, (_, s) => Array.from({ length: 12 }, (_, room) => [s + 1, room * 7] as const)).flat();
const DELVE = [11, 12, 13, 14];

const plain = (d: TileDecor) => JSON.stringify(d, (_, v) => (v instanceof Uint8Array ? [...v].join("") : v));

function boards(): [string, Board, number, [number, number], [number, number]][] {
  return [
    ...TOWER.map(([seed, room]) => [`tower:${seed}:${room}`, new RoomWorld(seed, room, {}), seed, [-1, 17], [-1, 17]] as [string, Board, number, [number, number], [number, number]]),
    ...DELVE.map((seed) => [`delve:${seed}`, new World(seed, {}), seed, [-1, 30], [0, 80]] as [string, Board, number, [number, number], [number, number]]),
  ];
}

function plans(each: (d: TileDecor) => void = () => {}) {
  clearDecorCache();
  const out: Record<string, string> = {};
  for (const [name, board, seed, [x0, x1], [y0, y1]] of boards()) {
    const src = decorSourceFor(board, seed)!, hash = createHash("sha256");
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = tileDecor(src, x, y);
        each(d);
        hash.update(plain(d));
      }
    out[name] = hash.digest("hex").slice(0, 12);
  }
  return out;
}

test("decor plans match the recorded hashes", () => {
  const actual = plans();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(GOLDEN, "utf8")));
});

test("the decor corpus exercises every feature", () => {
  // Guards the corpus itself: the hashes above only protect features it plans.
  const seen = new Set<string>();
  plans((d) => {
    if (d.moss) seen.add("moss");
    if (d.water) seen.add("water");
    if (d.thicket) seen.add("thicket");
    if (d.drip) seen.add("drip");
    if (d.glints.length) seen.add("glints");
    if (d.flowers.length) seen.add("flowers");
    if (d.vines.length) seen.add("vines");
    for (const c of d.crates) seen.add(c.lift ? "stacked" : c.kind);
    for (const p of d.plants) seen.add(p.kind);
  });
  const want = ["moss", "water", "thicket", "drip", "glints", "flowers", "vines", "crate", "barrel", "stacked", "tuft", "fern", "sprout", "mushrooms", "pebbles", "web"];
  assert.deepEqual(want.filter((f) => !seen.has(f)), []);
});
