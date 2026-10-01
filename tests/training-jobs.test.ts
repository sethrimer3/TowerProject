import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { xpForLevel } from "../src/config.ts";
import { loadout, trainingPoints } from "../src/loadout.ts";
import { finishGems, trainingSeconds } from "../src/training-jobs.ts";

const game = (level = 10) => {
  const g = new Game(defaults());
  g.save.upgrades.training = 1;
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(level);
  let now = 1_000_000;
  g.clock = () => now;
  return { g, wait: (s: number) => { now += s * 1000; } };
};

test("a stat's first ranks are quick, then each takes a quarter hour more", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 99].map(trainingSeconds), [15, 60, 300, 600, 900, 1800, 2700, 86400]);
});

test("training needs the Training skill", () => {
  const { g } = game();
  g.save.upgrades.training = 0;
  assert.equal(g.train("hp"), false);
  g.save.upgrades.training = 1;
  assert.ok(g.train("hp"));
});

test("training pays its points at once and counts when its time is up", () => {
  const { g, wait } = game();
  const before = loadout(g.save).maxHp, points = trainingPoints(g.save).left;
  assert.ok(g.train("hp"));
  assert.equal(trainingPoints(g.save).left, points - 1, "paid when started");
  assert.equal(g.save.training.hp, 0);
  assert.equal(loadout(g.save).maxHp, before, "no effect yet");
  wait(14);
  assert.equal(g.settleTraining(), 0);
  wait(1);
  assert.equal(g.settleTraining(), 1);
  assert.equal(g.save.training.hp, 1);
  assert.ok(loadout(g.save).maxHp > before);
  assert.equal(g.run.player.maxHp, loadout(g.save).maxHp, "a run in the forest takes it");
  // The second rank takes a minute.
  assert.ok(g.train("hp"));
  assert.equal(g.save.trainingJobs[0].completesAt - g.save.trainingJobs[0].startedAt, 60_000);
});

test("one stat trains at a time, and each trainer bought with Gems adds one", () => {
  const { g } = game();
  assert.ok(g.train("hp"));
  assert.equal(g.train("hp"), false, "already training");
  assert.equal(g.train("defense"), false, "the one slot is busy");
  assert.equal(g.buyTrainer(), false, "no Gems");
  g.save.gems = 400;
  assert.ok(g.buyTrainer());
  assert.equal(g.save.gems, 300);
  assert.ok(g.train("defense"));
  assert.equal(g.train("attack"), false, "both slots busy");
  assert.ok(g.buyTrainer(), "the next costs 300");
  assert.equal(g.save.gems, 0);
  assert.equal(decode(JSON.stringify(g.save)).trainers, 2, "trainers are saved");
  assert.equal(decode(JSON.stringify({ ...g.save, trainers: 9 })).trainers, 0, "no more than there are");
  g.save.gems = 1e6;
  for (const price of [700, 1200, 1800]) {
    const before = g.save.gems;
    assert.ok(g.buyTrainer());
    assert.equal(before - g.save.gems, price);
  }
  assert.equal(g.buyTrainer(), false, "every trainer bought");
});

test("Gems finish a rank at once: one per ten minutes left, rounded up", () => {
  assert.deepEqual([0, -5, 1, 600_000, 600_001, 1_800_000].map(finishGems), [0, 0, 1, 1, 2, 3]);
  const { g, wait } = game();
  g.save.training.hp = 5; // its next rank takes 30 minutes
  assert.ok(g.train("hp"));
  wait(60);
  assert.equal(g.finishTraining("hp"), false, "29 minutes left take 3 Gems");
  g.save.gems = 3;
  assert.ok(g.finishTraining("hp"));
  assert.equal(g.save.gems, 0);
  assert.equal(g.save.training.hp, 6);
  assert.deepEqual(g.save.trainingJobs, []);
  assert.equal(g.finishTraining("hp"), false, "nothing in training");
});

test("cancelling gives the points back, and jobs survive a save", () => {
  const { g } = game();
  const left = trainingPoints(g.save).left;
  assert.ok(g.train("attack"));
  assert.equal(trainingPoints(g.save).left, left - 3);
  const loaded = decode(JSON.stringify(g.save));
  assert.deepEqual(loaded.trainingJobs, g.save.trainingJobs);
  assert.ok(g.cancelTraining("attack"));
  assert.equal(trainingPoints(g.save).left, left);
  assert.equal(g.cancelTraining("attack"), false);
  const bad = decode(JSON.stringify({ ...g.save, trainingJobs: [{ id: "nope", startedAt: 1, completesAt: 2 }, { id: "hp", startedAt: "x" }] }));
  assert.deepEqual(bad.trainingJobs, []);
});
