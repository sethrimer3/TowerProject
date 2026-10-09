import { test } from "node:test";
import assert from "node:assert/strict";
import { keepsKey, towerKeyKeep, towerKeySupply } from "../src/key-schedule.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { floorCounts, keysPerLock } from "../src/tower/census.ts";

test("the key supply falls 0.1 a tower and 0.005 every ten floors from 1.5, never below 0.4; half as fast on the way to the stairs", () => {
  const supply = (depth: number, tower: number, main = false) => towerKeySupply(depth, tower, main) / 10000;
  assert.deepEqual([supply(0, 1), supply(9, 1), supply(10, 1), supply(999, 1), supply(2199, 1), supply(2200, 1), supply(9999, 1)],
    [1.5, 1.5, 1.495, 1.005, 0.405, 0.4, 0.4]);
  assert.deepEqual([supply(0, 9), supply(599, 9), supply(600, 9)], [0.7, 0.405, 0.4]);
  assert.deepEqual([supply(999, 1, true), supply(0, 9, true)], [1.2525, 1.1]);
  assert.equal(towerKeyKeep(0, 1), 1);
  assert.equal(towerKeyKeep(9999, 1), 0.4 / 1.5);
  // Tower I's first ten floors keep every key without drawing.
  assert.equal(keepsKey(9, 1, () => { throw new Error("no draw"); }), true);
});

test("keys grow scarcer per lock as floors and towers rise", () => {
  const ratio = (tower: number, room: number) => {
    const sum: Record<string, number> = {};
    for (let seed = 1; seed <= 30; seed++)
      for (const [k, n] of Object.entries(floorCounts(generateTowerFloor(seed * 7919, room, tower)))) sum[k] = (sum[k] ?? 0) + n;
    return keysPerLock(sum).all;
  };
  const low = ratio(1, 30), high = ratio(1, 900), later = ratio(9, 900);
  assert.ok(low > high && high > later, `Tower I floor 31: ${low}, floor 901: ${high}; Tower IX floor 901: ${later}`);
});
