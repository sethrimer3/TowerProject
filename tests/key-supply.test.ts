import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsKey, towerKeyRatio } from "../src/key-schedule.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { generateStrategicGraph } from "../src/tower/strategic-graph.ts";
import { floorCounts, keysPerLock } from "../src/tower/census.ts";

const ratio = (color: "yellow" | "blue" | "red", floor: number, tower: number, main = false) => towerKeyRatio(color, floor - 1, tower, main) / 10000;

test("each key colour aims for its own keys per lock: a surplus on its first floor, 0.005 less every ten floors after and 0.1 less a tower, never below its least", () => {
  assert.deepEqual([ratio("yellow", 1, 1), ratio("yellow", 11, 1), ratio("yellow", 1001, 1), ratio("yellow", 9999, 1)], [1.6, 1.595, 1.1, 0.5]);
  assert.deepEqual([ratio("blue", 51, 1), ratio("blue", 61, 1), ratio("blue", 11, 9), ratio("blue", 9999, 9)], [1.5, 1.495, 0.7, 0.4]);
  assert.deepEqual([ratio("red", 101, 1), ratio("red", 21, 9), ratio("red", 9999, 1)], [1.3, 0.5, 0.3]);
  assert.equal(ratio("yellow", 1001, 1, true), 1.35, "half as fast on the way to the stairs");
  // Tower I's first floors keep every yellow key without drawing.
  assert.equal(keepsKey("yellow", 0, 1, () => { throw new Error("no draw"); }), true);
});

test("the first floor blue and red keys appear on lays one in the start hall", () => {
  const start = (depth: number, tower: number) => generateStrategicGraph(7919, depth, 0, tower).nodes[0].rewards;
  const has = (depth: number, tower: number, color: string) => start(depth, tower).some((r) => r.kind === "key" && r.color === color);
  assert.ok(has(50, 1, "blue") && has(100, 1, "red") && has(10, 9, "blue") && has(20, 9, "red"));
  assert.ok(!has(49, 1, "blue") && !has(51, 1, "blue") && !has(99, 1, "red"));
});

test("keys grow scarcer per lock as floors and towers rise", () => {
  const all = (tower: number, room: number) => {
    const sum: Record<string, number> = {};
    for (let seed = 1; seed <= 30; seed++)
      for (const [k, n] of Object.entries(floorCounts(generateTowerFloor(seed * 7919, room, tower)))) sum[k] = (sum[k] ?? 0) + n;
    return keysPerLock(sum).all;
  };
  const low = all(1, 30), high = all(1, 900), later = all(9, 900);
  assert.ok(low > high && high > later, `Tower I floor 31: ${low}, floor 901: ${high}; Tower IX floor 901: ${later}`);
});
