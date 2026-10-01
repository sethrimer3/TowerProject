import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { xpForLevel } from "../src/config.ts";
import { loadout, trainingPoints } from "../src/loadout.ts";
import { trainingSeconds } from "../src/training-jobs.ts";

const game = (level = 10) => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(level);
  let now = 1_000_000;
  g.clock = () => now;
  return { g, wait: (s: number) => { now += s * 1000; } };
};

test("a rank takes 60 seconds, then 50% longer for every rank after", () => {
  assert.deepEqual([0, 1, 2, 3].map(trainingSeconds), [60, 90, 135, 203]);
});

test("training pays its points at once and counts when its time is up", () => {
  const { g, wait } = game();
  const before = loadout(g.save).maxHp, points = trainingPoints(g.save).left;
  assert.ok(g.train("hp"));
  assert.equal(trainingPoints(g.save).left, points - 1, "paid when started");
  assert.equal(g.save.training.hp, 0);
  assert.equal(loadout(g.save).maxHp, before, "no effect yet");
  wait(59);
  assert.equal(g.settleTraining(), 0);
  wait(1);
  assert.equal(g.settleTraining(), 1);
  assert.equal(g.save.training.hp, 1);
  assert.ok(loadout(g.save).maxHp > before);
  assert.equal(g.run.player.maxHp, loadout(g.save).maxHp, "a run in the forest takes it");
  // The second rank takes 90 seconds.
  assert.ok(g.train("hp"));
  assert.equal(g.save.trainingJobs[0].completesAt - g.save.trainingJobs[0].startedAt, 90_000);
});

test("two stats train at once, not a third or the same one twice", () => {
  const { g } = game();
  assert.ok(g.train("hp"));
  assert.equal(g.train("hp"), false, "already training");
  assert.ok(g.train("defense"));
  assert.equal(g.train("attack"), false, "both slots busy");
  assert.equal(g.save.trainingJobs.length, 2);
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
