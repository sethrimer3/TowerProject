import { test } from "node:test";
import assert from "node:assert/strict";
import { QUOTA_DOORS, doorKeys, towerDoorFirstFloor, towerWoodPercent, towerDoorRate, type QuotaDoor } from "../src/key-schedule.ts";
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

test("each quota door starts at a tenth a floor; blue grows a hundredth every five floors and red every ten to floor 1,000, hearts every ten to one a floor", () => {
  // In QUOTA_DOORS order: red, blue, heart (docs/DOOR_AND_KEY_SCHEDULE.md's table).
  assert.deepEqual(rates(1, 50), [0, 0, 0]);
  assert.deepEqual(rates(1, 51), [0, 0.1, 0]);
  assert.deepEqual(rates(1, 101), [0.1, 0.2, 0]);
  assert.deepEqual(rates(1, 201), [0.2, 0.4, 0.1]);
  assert.deepEqual(rates(1, 501), [0.5, 1, 0.4]);
  assert.deepEqual(rates(1, 1000), [0.99, 1.99, 0.89]);
  assert.deepEqual(rates(1, 5000), [0.99, 1.99, 1], "blue and red stop at floor 1,000; hearts at one a floor");
  assert.deepEqual(rates(1, 1100), [0.99, 1.99, 0.99]);
  assert.deepEqual(rates(1, 1101), [0.99, 1.99, 1]);
  assert.deepEqual(rates(9, 1000), [1.07, 2.07, 0.97]);
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
      if (n.route === "main" && !n.forks) assert.ok(n.gate.kind !== "door" || doorKeys(n.gate).every((c) => c === "yellow"), `seed ${seed}: ${n.id}`);
  }
});

test("a share of yellow locks are Wooden Doors: all on Tower I's first floors, 10 points fewer a tower and one fewer every ten floors", () => {
  assert.deepEqual([[0, 1], [9, 1], [10, 1], [990, 1], [1000, 1], [0, 9], [199, 9], [200, 9]].map(([d, t]) => towerWoodPercent(d, t)),
    [100, 100, 99, 1, 0, 20, 1, 0]);
  const locks = (tower: number, room: number) => {
    const out = { wood: 0, yellow: 0 };
    for (let seed = 1; seed <= 20; seed++)
      for (const [, t] of generateTowerFloor(seed * 7919, room, tower).cells) {
        if (t.door?.type === "wood") out.wood++;
        else if (t.kind === "door" && t.door?.type === "keys" && t.door.keys.length === 1 && t.door.keys[0] === "yellow" && !t.door.heart) out.yellow++;
      }
    return out;
  };
  const first = locks(1, 7);
  assert.ok(first.wood > 0 && first.yellow === 0, `Tower I floor 8: ${JSON.stringify(first)}`);
  const gone = locks(9, 300);
  assert.ok(gone.wood === 0 && gone.yellow > 0, `Tower IX floor 301: ${JSON.stringify(gone)}`);
});
