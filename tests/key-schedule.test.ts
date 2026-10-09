import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tile } from "../src/entities.ts";
import { ALL_KEY_COLORS, keyColorsOn, onlyOpenKeys, towerKeyColorsOn } from "../src/key-schedule.ts";
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

test("the first delve opens blue keys on floor 21 and red on floor 51; later delves open every colour", () => {
  assert.deepEqual(keyColorsOn(0), { yellow: true, blue: false, red: false });
  assert.deepEqual(keyColorsOn(19), { yellow: true, blue: false, red: false }, "floor 20, a boss floor");
  assert.deepEqual(keyColorsOn(20), { yellow: true, blue: true, red: false }, "floor 21");
  assert.deepEqual(keyColorsOn(49), { yellow: true, blue: true, red: false }, "floor 50, a boss floor");
  assert.deepEqual(keyColorsOn(50), ALL_KEY_COLORS, "floor 51");
  assert.deepEqual(keyColorsOn(0, 2), ALL_KEY_COLORS);
  assert.equal(onlyOpenKeys([{ kind: "potion", color: "blue" }], keyColorsOn(0)), true, "a potion's colour is no key");
  assert.equal(onlyOpenKeys({ lanes: [[{ kind: "door", color: "blue" }]] }, keyColorsOn(0)), false);
});

test("the Tower opens blue keys and doors on floor 51 less 5 a tower, and red on 101 less 10", () => {
  assert.deepEqual(towerKeyColorsOn(49, 1), { yellow: true, blue: false, red: false }, "floor 50");
  assert.deepEqual(towerKeyColorsOn(50, 1), { yellow: true, blue: true, red: false }, "floor 51");
  assert.deepEqual(towerKeyColorsOn(100, 1), ALL_KEY_COLORS, "floor 101");
  assert.deepEqual(towerKeyColorsOn(9, 9), { yellow: true, blue: false, red: false }, "Tower IX's floor 10");
  assert.deepEqual(towerKeyColorsOn(10, 9), { yellow: true, blue: true, red: false }, "its floor 11");
  assert.deepEqual(towerKeyColorsOn(20, 9), ALL_KEY_COLORS, "its floor 21");
  const seen = new Set<string>();
  const seeds = FULL ? 40 : 12;
  for (const tower of [1, 9])
    for (let seed = 1; seed <= seeds; seed++)
      for (let room = 0; room < 160; room += seed % 3 + 2)
        for (const [, t] of generateTowerFloor(seed, room, tower).cells)
          for (const c of colorsOf(t)) {
            assert.ok(towerKeyColorsOn(room, tower)[c], `Tower ${tower} seed ${seed} floor ${room + 1}: a ${c} ${t.kind}`);
            seen.add(`${tower}:${c}`);
          }
  for (const k of ["1:blue", "1:red", "9:blue", "9:red"]) assert.ok(seen.has(k), `${k} appears once open`);
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
    for (let room = 600; room < 700; room += seed % 4 + 1) {
      const { cells } = generateTowerFloor(seed, room);
      rareDoors += [...cells].filter(([, t]) => t.kind === "door" && colorsOf(t).some((c) => c !== "yellow")).length;
      assert.ok(stairsWithoutRareKeys(cells), `seed ${seed} floor ${room + 1}: the stairs need a blue or red key`);
      if (!stairsWithoutRareKeys(generateTowerFloor(seed, room, 2).cells)) bottlenecks++;
    }
  assert.ok(rareDoors > 0, "blue and red doors still appear, round the way or guarding a branch");
  assert.ok(bottlenecks > 0, "the second tower is left as it was");
});
