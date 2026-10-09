import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tile } from "../src/entities.ts";
import { ALL_KEY_COLORS, YELLOW_ONLY, onlyOpenKeys, towerKeyColorsOn } from "../src/key-schedule.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { generate } from "../src/delve/world.ts";
import { depthAt, ownerAt } from "../src/delve/labyrinth.ts";
import { TOWER_START_X } from "../src/config.ts";
import { reachable } from "../src/board.ts";
import { point } from "../src/entities.ts";
import { FULL } from "./test-size.ts";

/** The key colours a tile shows: a key's, or each a door takes. */
const colorsOf = (t: Tile) =>
  t.kind === "key" ? [t.color] : t.kind === "door" ? (t.door?.type === "keys" && t.door.mode === "all" ? t.door.keys : t.color ? [t.color] : []) : [];

test("a potion's colour is no key; a door of a closed colour is", () => {
  assert.equal(onlyOpenKeys([{ kind: "potion", color: "blue" }], YELLOW_ONLY), true);
  assert.equal(onlyOpenKeys({ lanes: [[{ kind: "door", color: "blue" }]] }, YELLOW_ONLY), false);
  assert.equal(onlyOpenKeys({ kind: "door", color: "yellow", also: ["red"] }, { yellow: true, blue: true, red: false }), false);
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

test("the Delve opens blue and red keys and doors on the equivalent floors the tower of its number does", () => {
  for (const tier of [1, 9]) {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 4; seed++)
      for (let chunk = 0; chunk < (tier === 1 ? 60 : 15); chunk++)
        for (const [k, t] of generate(seed, chunk, tier)) {
          // Each tile's depth as the area that owns it records it.
          const [x, y] = k.split(",").map(Number), floor = Math.floor(depthAt(seed, x, y, ownerAt(seed, x, y), tier) / 10);
          for (const c of colorsOf(t)) {
            assert.ok(towerKeyColorsOn(floor, tier)[c], `delve ${tier} seed ${seed} at ${k} (floor ${floor + 1}): a ${c} ${t.kind}`);
            seen.add(c);
          }
        }
    assert.ok(seen.has("blue"), `delve ${tier}: blue appears once open`);
    if (tier === 9) assert.ok(seen.has("red"), "the ninth delve opens red by floor 21");
  }
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
