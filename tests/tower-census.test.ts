import test from "node:test";
import assert from "node:assert/strict";
import { census, censusSeed, floorCounts, keysPerLock, woodShare } from "../src/tower/census.ts";
import { generateTowerFloor } from "../src/tower/index.ts";

test("a floor's counts match its tiles, and forked doors are among its doors", () => {
  let combined = 0;
  for (const [floor, tower] of [[0, 1], [24, 1], [61, 2], [130, 9], [900, 1], [950, 5]]) {
    const generated = generateTowerFloor(censusSeed(3), floor, tower);
    const c = floorCounts(generated);
    const tiles = [...generated.cells.values()];
    const keyed = (color: string) => tiles.filter((t) => t.door?.type === "keys" && t.door.mode === "all" && t.door.keys.includes(color as "red")).length;
    for (const color of ["yellow", "blue", "red"]) assert.equal(c[`door:${color}`] ?? 0, keyed(color), `${color} doors on floor ${floor + 1}`);
    // Combined: more than one key, or a key and a Heart Door's drain.
    const many = tiles.filter((t) => t.door?.type === "keys" && t.door.mode === "all" && t.door.keys.length + (t.door.heart ? 1 : 0) > 1).length;
    assert.equal(c["door:combined"] ?? 0, many);
    combined += many;
    assert.equal(c.potion ?? 0, tiles.filter((t) => t.kind === "potion").length);
    for (const [k, n] of Object.entries(c))
      if (k.startsWith("forked:")) assert.ok(n <= (c[`door:${k.slice(7)}`] ?? 0), `${k} at floor ${floor + 1}`);
  }
  assert.ok(combined > 0, "high floors hold combined doors");
});

test("keys per lock count a wooden door as a yellow lock", () => {
  const c = { "door:yellow": 3, "door:wood": 1, "door:blue": 2, "key:yellow": 6, "key:blue": 1 };
  assert.deepEqual(keysPerLock(c), { yellow: 1.5, blue: 0.5, red: NaN, all: 7 / 6 });
  assert.equal(woodShare(c), 0.25);
});

test("the census averages each tower's bands of floors", () => {
  const bands = census({ towers: [1, 2], from: 1, to: 12, band: 5, seeds: 2 });
  assert.deepEqual(bands.map((b) => [b.tower, b.from, b.to, b.floors]),
    [[1, 1, 5, 10], [1, 6, 10, 10], [1, 11, 12, 4], [2, 1, 5, 10], [2, 6, 10, 10], [2, 11, 12, 4]]);
  // Each section's last floor has its boss.
  assert.equal(bands[1].avg["enemy:boss"], 0.2);
});
