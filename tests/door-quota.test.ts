import { test } from "node:test";
import assert from "node:assert/strict";
import { QUOTA_DOORS, towerDoorFirstFloor, towerDoorRate, type QuotaDoor } from "../src/key-schedule.ts";
import { rollQuota } from "../src/tower/door-quota.ts";
import { generateTowerFloor } from "../src/tower/index.ts";
import { generateStrategicGraph } from "../src/tower/strategic-graph.ts";
import { floorCounts } from "../src/tower/census.ts";
import { FULL } from "./test-size.ts";

/** The rates at floor `f` (counting from 1) of tower `t`: blue, red, heart. */
const rates = (t: number, f: number) => QUOTA_DOORS.map((d) => towerDoorRate(d, f - 1, t));

test("each quota door's first floor comes earlier each tower", () => {
  assert.deepEqual([1, 5, 9].map((t) => towerDoorFirstFloor("blue", t)), [51, 31, 11]);
  assert.deepEqual([1, 5, 9].map((t) => towerDoorFirstFloor("red", t)), [101, 61, 21]);
  assert.deepEqual([1, 5, 9].map((t) => towerDoorFirstFloor("heart", t)), [201, 161, 121]);
});

test("quota doors grow a hundredth a floor every ten floors: blue and red to floor 1,000, hearts to one a floor", () => {
  // In QUOTA_DOORS order: red, blue, heart (docs/DOOR_AND_KEY_SCHEDULE.md's table).
  assert.deepEqual(rates(1, 50), [0, 0, 0]);
  assert.deepEqual(rates(1, 51), [0, 0.01, 0]);
  assert.deepEqual(rates(1, 101), [0.01, 0.06, 0]);
  assert.deepEqual(rates(1, 201), [0.11, 0.16, 0.01]);
  assert.deepEqual(rates(1, 1000), [0.9, 0.95, 0.8]);
  assert.deepEqual(rates(1, 5000), [0.9, 0.95, 1], "blue and red stop at floor 1,000; hearts at one a floor");
  assert.deepEqual(rates(1, 1191), [0.9, 0.95, 1]);
  assert.deepEqual(rates(5, 501), [0.45, 0.48, 0.35]);
  assert.deepEqual(rates(9, 1000), [0.98, 0.99, 0.88]);
});

test("a quota is the rate's whole doors, and one more with the rest as its chance", () => {
  assert.equal(rollQuota(0, () => 0), 0);
  assert.equal(rollQuota(200, () => { throw new Error("no draw for a whole number"); }), 2);
  assert.equal(rollQuota(250, () => 0.49), 3);
  assert.equal(rollQuota(250, () => 0.5), 2);
});

test("every quota door the stage places stands on the floor, and the quota tracks the schedule", () => {
  const seeds = FULL ? 120 : 40;
  for (const [tower, room] of [[1, 999], [5, 400], [9, 150]]) {
    const rolled = { blue: 0, red: 0, heart: 0 };
    for (let seed = 1; seed <= seeds; seed++) {
      const { cells, embedding } = generateTowerFloor(seed * 7919, room, tower);
      const counts = floorCounts({ cells, embedding });
      for (const door of QUOTA_DOORS) {
        const q = embedding.graph.doorQuota?.[door];
        assert.equal(counts[`door:${door}`] ?? 0, q ? q.rolled - q.dropped : 0, `Tower ${tower} seed ${seed}: ${door} doors`);
      }
      const plan = generateStrategicGraph(seed * 7919, room, 0, tower).doorQuota ?? {};
      for (const door of QUOTA_DOORS) rolled[door] += plan[door]?.rolled ?? 0;
    }
    for (const door of QUOTA_DOORS) {
      const want = towerDoorRate(door as QuotaDoor, room, tower), got = rolled[door] / seeds;
      assert.ok(Math.abs(got - want) < 0.2, `Tower ${tower} floor ${room + 1}: ${door} ${got} against ${want}`);
    }
  }
});

test("in the first tower the stage keeps blue and red doors off the way to the stairs, unless in a fork", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const graph = generateStrategicGraph(seed * 7919, 900, 0, 1);
    for (const n of graph.nodes)
      if (n.route === "main" && !n.forks) assert.ok(n.gate.kind !== "door" || n.gate.color === "yellow", `seed ${seed}: ${n.id}`);
  }
});
