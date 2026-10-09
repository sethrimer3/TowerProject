import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { TRAINING, xpForLevel } from "../src/config.ts";
import { batchSpeedup } from "../src/buy-quantity.ts";
import { trainerBatch, trainingMs } from "../src/training-jobs.ts";

const atk = TRAINING.find((t) => t.id === "attack")!;
const game = () => {
  const g = new Game(defaults());
  g.save.upgrades.trainers = 1;
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(10);
  g.save.gold = 1e9;
  let now = 1_790_000_000_000;
  g.clock = () => now;
  return { g, wait: (s: number) => { now += s * 1000; } };
};

test("a batch of 5, 10, 25 or 100 ranks speeds trainers up ×2, ×3, ×5 or ×10; fewer than 5 not at all", () => {
  assert.deepEqual([1, 4, 5, 9, 10, 24, 25, 99, 100, 1000].map(batchSpeedup), [1, 1, 2, 2, 3, 3, 5, 5, 10, 10]);
});

test("a batch costs the ranks' Gold and takes their time one after another, divided by the speedup", () => {
  const { g } = game();
  const one = trainerBatch(atk, 0, 1, 0), five = trainerBatch(atk, 0, 5, 0);
  assert.equal(one.ms, trainingMs(0, 0));
  assert.equal(five.ms, [0, 1, 2, 3, 4].reduce((sum, r) => sum + trainingMs(r, 0), 0));
  const b = g.training.batch("attack", 5);
  assert.deepEqual([b.count, b.gold, b.ms, b.speedup, b.affordable], [5, five.gold, five.ms, 2, true]);
  assert.ok(g.training.trainWithGold("attack", 5));
  const [job] = g.save.trainingJobs;
  assert.deepEqual([job.ranks, job.speed, job.gold], [5, 2, five.gold]);
  assert.equal(g.training.left("attack"), Math.round(five.ms / 2), "×2 on the whole batch");
  assert.equal(g.save.gold, 1e9 - five.gold);
  assert.deepEqual(decode(JSON.stringify(g.save)).trainingJobs, g.save.trainingJobs, "saved with its ranks and speed");
});

test("a finished batch counts all its ranks", () => {
  const { g, wait } = game();
  assert.ok(g.training.trainWithGold("attack", 5));
  wait(trainerBatch(atk, 0, 5, 0).ms / 2000 + 1);
  assert.equal(g.training.settle(), 1);
  assert.equal(g.save.training.attack, 5);
  assert.equal(g.save.trainerRanks.attack, 5);
  assert.deepEqual(g.training.done.at(-1), { id: "attack", level: 5 });
});

test("stopping a batch early refunds only the time worked, not the speedup's worth", () => {
  const { g, wait } = game();
  assert.ok(g.training.trainWithGold("attack", 10));
  const gold = g.save.gold;
  wait(60);
  assert.ok(g.training.cancel("attack"));
  assert.equal(g.save.trainingCredit.attack, 60_000, "60 s worked is 60 s of credit, not 180 s");
  assert.equal(g.save.gold, gold + trainerBatch(atk, 0, 10, 0).gold);
});

test("credit comes off the base time before the speedup, and covering it all shows no time left", () => {
  const { g } = game();
  const base = trainerBatch(atk, 0, 5, 0).ms;
  g.save.trainingCredit.attack = 100_000;
  const next = g.training.nextWork("attack", 5);
  assert.deepEqual([next.remaining, next.work, next.speedup, next.banked], [base - 100_000, Math.round((base - 100_000) / 2), 2, true]);
  g.save.trainingCredit.attack = base * 3;
  assert.equal(g.training.toNextRank("attack", 5), 0);
  assert.ok(g.training.trainWithGold("attack", 5));
  assert.equal(g.save.training.attack, 5, "counted at once");
  assert.equal(g.save.trainingCredit.attack, base * 3 - base, "only the base time was used up");
});

test("a batch stops at the stat's most and Max buys what the Gold pays for", () => {
  const { g } = game();
  g.save.training.attack = g.save.trainerRanks.attack = atk.max - 3;
  assert.equal(g.training.batch("attack", 5).count, 3);
  const g2 = game().g;
  g2.save.gold = trainerBatch(atk, 0, 12, 0).gold;
  const max = g2.training.batch("attack", "max");
  assert.deepEqual([max.count, max.speedup], [12, 3], "the speedup of the 12 ranks bought");
  g2.save.gold = trainerBatch(atk, 0, 10, 0).gold - 1;
  assert.equal(g2.training.batch("attack", 10).affordable, false);
  assert.equal(g2.training.trainWithGold("attack", 10), false);
});

test("auto-continue starts the next batch of the same size", () => {
  const { g, wait } = game();
  g.training.setAutoContinue("attack", true);
  assert.ok(g.training.trainWithGold("attack", 5));
  wait(trainerBatch(atk, 0, 5, 0).ms / 2000 + 1);
  g.training.settle();
  assert.equal(g.save.training.attack, 5);
  assert.equal(g.save.trainingJobs[0]?.ranks, 5);
  assert.equal(g.save.trainingJobs[0]?.speed, 2);
});
