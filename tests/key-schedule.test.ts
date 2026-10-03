import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tile } from "../src/entities.ts";
import { ALL_KEY_COLORS, keyColorsOn, onlyOpenKeys } from "../src/key-schedule.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { generate } from "../src/delve/world.ts";
import { depthAt, ownerAt } from "../src/delve/labyrinth.ts";
import { CHUNK, TOWER_START_X } from "../src/config.ts";
import { reachable } from "../src/board.ts";
import { point } from "../src/entities.ts";
import { FULL } from "./test-size.ts";

/** The key colours a tile shows: a key's, or each a door takes. */
const colorsOf = (t: Tile) =>
  t.kind === "key" ? [t.color] : t.kind === "door" ? (t.door?.type === "keys" && t.door.mode === "all" ? t.door.keys : t.color ? [t.color] : []) : [];

test("the first tier opens blue keys on floor 21 and red on floor 51; later tiers open every colour", () => {
  assert.deepEqual(keyColorsOn(0), { yellow: true, blue: false, red: false });
  assert.deepEqual(keyColorsOn(19), { yellow: true, blue: false, red: false }, "floor 20, a boss floor");
  assert.deepEqual(keyColorsOn(20), { yellow: true, blue: true, red: false }, "floor 21");
  assert.deepEqual(keyColorsOn(49), { yellow: true, blue: true, red: false }, "floor 50, a boss floor");
  assert.deepEqual(keyColorsOn(50), ALL_KEY_COLORS, "floor 51");
  assert.deepEqual(keyColorsOn(0, 2), ALL_KEY_COLORS);
  assert.equal(onlyOpenKeys([{ kind: "potion", color: "blue" }], keyColorsOn(0)), true, "a potion's colour is no key");
  assert.equal(onlyOpenKeys({ lanes: [[{ kind: "door", color: "blue" }]] }, keyColorsOn(0)), false);
});

test("first-tower floors hold no blue key or door below floor 21, nor red below 51", () => {
  const seen = { tier1: new Set<string>(), tier2: new Set<string>() };
  const seeds = FULL ? 40 : 12;
  for (let seed = 1; seed <= seeds; seed++)
    for (let room = 0; room < 60; room += seed % 3 + 1) {
      for (const [, t] of generateTowerFloor(seed, room).cells)
        for (const c of colorsOf(t)) {
          assert.ok(keyColorsOn(room)[c], `seed ${seed} floor ${room + 1}: a ${c} ${t.kind}`);
          seen.tier1.add(`${c}:${room < 20 ? "early" : room < 50 ? "middle" : "late"}`);
        }
      if (room < 19) for (const [, t] of generateTowerFloor(seed, room, 2).cells) for (const c of colorsOf(t)) seen.tier2.add(c);
    }
  assert.ok(seen.tier1.has("blue:middle") && seen.tier1.has("red:late"), "they appear once open");
  assert.ok(seen.tier2.has("blue") && seen.tier2.has("red"), "the second tower has them from its first floors");
});

test("the first delve holds no blue key or door below equivalent floor 21, nor red below 51", () => {
  let blueLater = false, blueEarlyTier2 = false;
  for (let seed = 1; seed <= 4; seed++)
    for (let chunk = 0; chunk < 30; chunk++) {
      for (const [k, t] of generate(seed, chunk)) {
        // Each tile's depth as the area that owns it records it.
        const [x, y] = k.split(",").map(Number), floor = Math.floor(depthAt(seed, x, y, ownerAt(seed, x, y)) / 10);
        for (const c of colorsOf(t)) {
          assert.ok(keyColorsOn(floor)[c], `seed ${seed} at ${k} (floor ${floor + 1}): a ${c} ${t.kind}`);
          if (c === "blue") blueLater = true;
        }
      }
      if (chunk * CHUNK < 200) for (const [, t] of generate(seed, chunk, 2)) if (colorsOf(t).includes("blue")) blueEarlyTier2 = true;
    }
  assert.ok(blueLater, "blue keys appear once open");
  assert.ok(blueEarlyTier2, "the second delve has them from its first floors");
});


/** Whether the stairs can be reached from the entrance with every door
 * taking a blue or red key shut. */
function stairsWithoutRareKeys(cells: Map<string, Tile>) {
  const rare = new Set([...cells].filter(([, t]) => t.kind === "door" && colorsOf(t).some((c) => c !== "yellow")).map(([k]) => k));
  const seen = reachable(cells, point(TOWER_START_X, 0), rare);
  return [...cells].some(([k, t]) => t.kind === "stairs" && seen.has(k));
}

test("in the first tower a blue or red door never stands alone on the way to the stairs; later towers may", () => {
  let rareDoors = 0, bottlenecks = 0;
  const seeds = FULL ? 30 : 10;
  for (let seed = 1; seed <= seeds; seed++)
    for (let room = 20; room < 100; room += seed % 4 + 1) {
      const { cells } = generateTowerFloor(seed, room);
      rareDoors += [...cells].filter(([, t]) => t.kind === "door" && colorsOf(t).some((c) => c !== "yellow")).length;
      assert.ok(stairsWithoutRareKeys(cells), `seed ${seed} floor ${room + 1}: the stairs need a blue or red key`);
      if (!stairsWithoutRareKeys(generateTowerFloor(seed, room, 2).cells)) bottlenecks++;
    }
  assert.ok(rareDoors > 0, "blue and red doors still appear, round the way or guarding a branch");
  assert.ok(bottlenecks > 0, "the second tower is left as it was");
});
