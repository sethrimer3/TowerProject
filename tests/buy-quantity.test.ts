import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { xpForLevel } from "../src/config.ts";
import { RESEARCH } from "../src/archives.ts";
import { bulkBuy, openQuantities } from "../src/buy-quantity.ts";
import { trainingBulk, trainingPoints, trainingStep } from "../src/loadout.ts";
import { runTrainingBulk, silverPrice } from "../src/run-training.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

/** A game with Buy Quantity owned and `levels` levels of its research. */
function withQuantity(levels: number) {
  const g = new Game(defaults());
  g.save.upgrades.buyQuantity = 1;
  g.save.archives.levels = { ...g.save.archives.levels, buyQuantity: levels };
  return g;
}

test("bulkBuy: a fixed quantity buys all its ranks or none; Max buys what the budget covers", () => {
  const price = (k: number) => 3 + k;
  assert.deepEqual(bulkBuy(5, Infinity, price, 100), { count: 5, cost: 25, affordable: true });
  assert.deepEqual(bulkBuy(5, Infinity, price, 24), { count: 5, cost: 25, affordable: false });
  assert.deepEqual(bulkBuy(10, 3, price, 100), { count: 3, cost: 12, affordable: true }, "no further than the row's most");
  assert.deepEqual(bulkBuy("max", Infinity, price, 13), { count: 3, cost: 12, affordable: true });
  assert.deepEqual(bulkBuy("max", Infinity, price, 2), { count: 1, cost: 3, affordable: false }, "none affordable shows the next rank");
  assert.deepEqual(bulkBuy("max", 0, price, 100), { count: 0, cost: 0, affordable: false });
});

test("the skill shows x1; each research level opens the next quantity, x5, x10, x25, x100, then Max", () => {
  assert.deepEqual(new Game(defaults()).buyQuantities, [], "nothing before the skill");
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((n) => withQuantity(n).buyQuantities), [[1], [1, 5], [1, 5, 10], [1, 5, 10, 25], [1, 5, 10, 25, 100], [1, 5, 10, 25, 100, "max"]]);
  assert.deepEqual(openQuantities(5), [1, 5, 10, 25, 100, "max"]);
  assert.deepEqual(openQuantities(9), [1, 5, 10, 25, 100, "max"]);
  assert.deepEqual(RESEARCH.buyQuantity.levels.map((l) => [l.gold, l.hours]), [[1000, 4], [5000, 12], [25000, 24], [50000, 36], [100000, 48]]);
  assert.deepEqual(RESEARCH.buyQuantity.requires, [{ upgrade: "buyQuantity" }]);
  const g = withQuantity(1);
  assert.equal(g.setBuyQuantity(10), false, "a closed quantity is refused");
  assert.ok(g.setBuyQuantity(5));
  assert.equal(g.buyQuantity, 5);
  assert.equal(decode(JSON.stringify(g.save)).settings.buyQuantity, 5, "the choice is saved");
  g.save.upgrades.buyQuantity = 0;
  assert.equal(g.buyQuantity, 1, "without the skill a press buys one");
});

test("training points buy the chosen quantity at once, showing the value they reach", () => {
  const g = withQuantity(4);
  g.save.xp = xpForLevel(5);
  const points = trainingPoints(g.save).left;
  assert.ok(points >= 10);
  assert.deepEqual(trainingBulk(g.save, "attack", 5), { count: 5, cost: 5, affordable: true });
  const after = trainingStep(g.save, "attack", 5).next;
  assert.ok(g.training.train("attack", 5));
  assert.equal(g.save.training.attack, 5);
  assert.equal(trainingStep(g.save, "attack").now, after);
  assert.equal(g.training.train("hp", 100), false, "refused without the points for every rank");
  assert.deepEqual(trainingBulk(g.save, "hp", "max"), { count: points - 5, cost: points - 5, affordable: true });
  assert.ok(g.training.train("hp", "max"));
  assert.equal(trainingPoints(g.save).left, 0);
});

test("Silver buys the chosen quantity for the run, its prices summed, as one undo", () => {
  const g = withQuantity(4);
  g.save.upgrades.onTheJob = 1;
  g.save.upgrades.inspirationUndos = 1;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  g.run.silver = 100;
  const five = [0, 1, 2, 3, 4].reduce((sum, k) => sum + silverPrice("hp", k), 0);
  assert.deepEqual(runTrainingBulk(g.save, g.run, "hp", 5, g.silver), { count: 5, cost: five, affordable: true });
  const hp = g.run.player.maxHp;
  assert.ok(g.trainInRun("hp", 5));
  assert.equal(g.run.training?.hp, 5);
  assert.equal(g.silver, 100 - five);
  assert.ok(g.run.player.maxHp > hp);
  const max = runTrainingBulk(g.save, g.run, "hp", "max", g.silver);
  assert.ok(max.count >= 1 && max.cost <= g.silver && max.cost + silverPrice("hp", 5 + max.count) > g.silver);
  assert.ok(g.undo());
  assert.deepEqual([g.run.training?.hp ?? 0, g.silver, g.run.player.maxHp], [0, 100, hp], "one undo takes all five back");
  assert.equal(g.trainInRun("hp", 100), false, "refused without the Silver for them all");
});
