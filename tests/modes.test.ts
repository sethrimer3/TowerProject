import { test } from "node:test";
import assert from "node:assert/strict";
import { MODES, milestonePoints, milestones } from "../src/modes.ts";
import { defaults } from "../src/save/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { START_X, TOWER_START_X } from "../src/config.ts";
import { goldReward } from "../src/economy/kill-pay.ts";
import type { Run } from "../src/runs.ts";

const { tower, delve } = MODES;
const run = (over: Partial<Run> = {}) =>
  ({ seed: 7, height: 12, floor: 0, kills: 3, treasures: 2, changes: {}, player: { x: 0, y: 0 }, ...over }) as Run;

test("a Tower floor is its own equivalent floor; ten Delve depth make one", () => {
  assert.deepEqual([0, 9, 70].map(tower.equivalentFloor), [0, 9, 70]);
  assert.deepEqual([9, 10, 19, 20, 700, 705, 709].map(delve.equivalentFloor), [0, 1, 1, 2, 70, 70, 70]);
  assert.equal(tower.progressAt(run(), 5), 12, "Tower loot is measured at the floor");
  assert.equal(delve.progressAt(run(), 5), 5, "Delve loot is measured at the row");
});

test("each new Tower floor reached pays one Inspiration; the Delve's depth pays nothing", () => {
  for (const [from, to, t] of [[0, 9, 9], [9, 10, 1], [10, 19, 9], [19, 20, 1], [5, 5, 0]])
    assert.deepEqual([milestones(tower, from, to), milestones(delve, from * 10, to * 10)], [t, 0], `${from} → ${to}`);
  assert.equal(delve.pays, null, "the Delve's depth only scores a tournament");
  const save = defaults();
  tower.pays!.credit(save, 2);
  assert.deepEqual([save.tower.inspiration, tower.pays!.balance(save)], [2, 2]);
});

test("past floor 100 a point takes 10 floors, past 1,000 it takes 100, and past 10,000 none", () => {
  assert.deepEqual([0, 1, 99, 100, 109, 110, 199, 1000, 1099, 1100, 9999, 10000, 50000].map(milestonePoints),
    [0, 1, 99, 100, 100, 101, 109, 190, 190, 191, 279, 280, 280]);
  for (const [from, to, t] of [[99, 101, 1], [100, 120, 2], [105, 115, 1], [995, 1105, 2], [9999, 20000, 1], [1000, 11000, 90], [10000, 1000000, 0]])
    assert.equal(milestones(tower, from, to), t, `${from} → ${to}`);
});

test("each mode builds its own board from a run and enters it at its own column", () => {
  const t = tower.board(run());
  assert.ok(t instanceof RoomWorld && t.room === 12 && t.seed === 7);
  const d = delve.board(run({ floor: 20, milestone: 1 }));
  assert.ok(d instanceof World && d.floor === 20 && d.milestone === 1);
  assert.deepEqual([tower.entranceX, delve.entranceX], [TOWER_START_X, START_X]);
});

test("loot keys and end-of-run gold differ by mode", () => {
  assert.equal(tower.lootKey(run(), 3, 4), "7:12:3,4");
  assert.equal(delve.lootKey(run(), 3, 4), "7:3,4");
  assert.equal(tower.endGold(run()), 0);
  assert.equal(delve.endGold(run()), goldReward(2));
});
