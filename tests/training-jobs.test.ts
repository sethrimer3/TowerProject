import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { xpForLevel } from "../src/config.ts";
import { loadout, trainingPoints, trainingStep } from "../src/loadout.ts";
import { BOOST_MAX_MS, claimBoost, doneAt, finishGems, trainingGold, trainingMs, trainingSeconds, workLeft } from "../src/training-jobs.ts";
import { RESEARCH } from "../src/archives.ts";

const HOUR = 3_600_000;
const game = (level = 10) => {
  const g = new Game(defaults());
  g.save.upgrades.training = 1;
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(level);
  g.save.gold = 10_000;
  // A real timestamp, so saving keeps times past 1e9 ms.
  let now = 1_790_000_000_000;
  g.clock = () => now;
  return { g, wait: (s: number) => { now += s * 1000; } };
};

test("a stat's first ranks are quick, then each takes a quarter hour more", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 99].map(trainingSeconds), [15, 60, 300, 600, 900, 1800, 2700, 86400]);
});

test("a trainer's Gold: 20 a point, times the rank's number", () => {
  assert.deepEqual([trainingGold(1, 0), trainingGold(1, 9), trainingGold(3, 0), trainingGold(2, 4)], [20, 200, 60, 200]);
  const { g } = game();
  assert.equal(trainingStep(g.save, "attack").gold, 60);
});

test("training needs the Training skill, or Dev mode", () => {
  const { g } = game();
  g.save.upgrades.training = 0;
  assert.equal(g.train("hp"), false);
  assert.equal(g.trainWithGold("hp"), false);
  g.save.settings.devMode = true;
  assert.ok(g.train("hp"));
  g.save.settings.devMode = false;
  g.save.upgrades.training = 1;
  assert.ok(g.trainWithGold("hp"));
});

test("training points buy a rank at once, without Gold, time or a trainer", () => {
  const { g } = game();
  const before = loadout(g.save).maxHp, points = trainingPoints(g.save).left, gold = g.save.gold;
  assert.ok(g.trainWithGold("defense"), "the one trainer is busy");
  assert.ok(g.train("hp"));
  assert.equal(g.save.training.hp, 1, "at once");
  assert.equal(trainingPoints(g.save).left, points - 1);
  assert.equal(g.save.gold, gold - 40, "only the trainer's Gold");
  assert.ok(loadout(g.save).maxHp > before);
  assert.equal(g.run.player.maxHp, loadout(g.save).maxHp, "a run in the forest takes it");
  // A stat in a trainer's hands can still be bought with points.
  assert.ok(g.train("defense"));
  assert.equal(g.save.training.defense, 1);
  g.save.xp = 0;
  assert.equal(g.train("hp"), false, "no points left");
});

test("a trainer takes Gold and time, not points, and the rank counts when its time is up", () => {
  const { g, wait } = game();
  const before = loadout(g.save).maxHp, points = trainingPoints(g.save).left;
  assert.ok(g.trainWithGold("hp"));
  assert.equal(g.save.gold, 10_000 - 20, "paid when started");
  assert.equal(trainingPoints(g.save).left, points, "no points");
  assert.equal(g.save.training.hp, 0);
  assert.equal(loadout(g.save).maxHp, before, "no effect yet");
  wait(14);
  assert.equal(g.settleTraining(), 0);
  wait(1);
  assert.equal(g.settleTraining(), 1);
  assert.equal(g.save.training.hp, 1);
  assert.deepEqual(g.save.trainingPaid.hp, { points: 0, gold: 20, ms: 15_000 });
  assert.deepEqual(g.trainingDone, [{ id: "hp", level: 1 }], "announced");
  assert.ok(loadout(g.save).maxHp > before);
  // The second rank takes a minute and costs 40.
  assert.ok(g.trainWithGold("hp"));
  assert.equal(g.save.trainingJobs[0].completesAt - g.save.trainingJobs[0].startedAt, 60_000);
  g.save.gold = 0;
  wait(60);
  g.settleTraining();
  assert.equal(g.trainWithGold("hp"), false, "no Gold");
});

test("one stat trains at a time, and each trainer bought with Gems adds one", () => {
  const { g } = game();
  assert.ok(g.trainWithGold("hp"));
  assert.equal(g.trainWithGold("hp"), false, "already training");
  assert.equal(g.trainWithGold("defense"), false, "the one slot is busy");
  assert.equal(g.buyTrainer(), false, "no Gems");
  g.save.gems = 400;
  assert.ok(g.buyTrainer());
  assert.equal(g.save.gems, 300);
  assert.ok(g.trainWithGold("defense"));
  assert.equal(g.trainWithGold("attack"), false, "both slots busy");
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
  assert.ok(g.trainWithGold("hp"));
  wait(60);
  assert.equal(g.finishTraining("hp"), false, "29 minutes left take 3 Gems");
  g.save.gems = 3;
  assert.ok(g.finishTraining("hp"));
  assert.equal(g.save.gems, 0);
  assert.equal(g.save.training.hp, 6);
  assert.deepEqual(g.save.trainingJobs, []);
  assert.equal(g.finishTraining("hp"), false, "nothing in training");
});

test("stopping a rank gives its Gold back and its time spent as credit, which the next rank uses up", () => {
  const { g, wait } = game();
  g.save.training.hp = 5; // 30 minutes
  assert.ok(g.trainWithGold("hp"));
  const loaded = decode(JSON.stringify(g.save));
  assert.deepEqual(loaded.trainingJobs, g.save.trainingJobs, "jobs survive a save");
  wait(600);
  assert.ok(g.cancelTraining("hp"));
  assert.equal(g.save.gold, 10_000);
  assert.equal(g.save.trainingCredit, 600_000, "ten minutes of credit");
  assert.equal(g.cancelTraining("hp"), false);
  // The next rank starts ten minutes in.
  assert.ok(g.trainWithGold("hp"));
  assert.equal(g.save.trainingCredit, 0);
  assert.equal(g.trainingLeft("hp"), 20 * 60_000);
  // Credit enough for a whole rank counts it at once.
  wait(1200);
  g.settleTraining();
  g.save.trainingCredit = 10 * HOUR;
  g.save.training.attack = 4; // 15 minutes
  assert.ok(g.trainWithGold("attack"));
  assert.equal(g.save.training.attack, 5);
  assert.equal(g.save.trainingCredit, 10 * HOUR - 15 * 60_000);
  const bad = decode(JSON.stringify({ ...g.save, trainingJobs: [{ id: "nope", startedAt: 1, completesAt: 2 }, { id: "hp", startedAt: "x" }] }));
  assert.deepEqual(bad.trainingJobs, []);
});

test("a Gem reset returns the points, the Gold and the trainers' time as credit", () => {
  const { g, wait } = game();
  g.save.gems = 2;
  assert.ok(g.train("hp"));
  assert.ok(g.trainWithGold("hp"));
  wait(60);
  g.settleTraining();
  assert.ok(g.trainWithGold("hp")); // the third rank: five minutes
  wait(100);
  const points = trainingPoints(g.save).left;
  assert.ok(g.resetTraining("hp"));
  assert.equal(g.save.training.hp, 0);
  assert.deepEqual(g.save.trainingJobs, [], "the rank in training stops");
  assert.equal(trainingPoints(g.save).left, points + 1);
  assert.equal(g.save.gold, 10_000);
  assert.equal(g.save.trainingCredit, 60_000 + 100_000, "the minute trained, and the 100 s of the stopped rank");
  assert.deepEqual(decode(JSON.stringify(g.save)).trainingCredit, g.save.trainingCredit);
});

test("the boost doubles training for up to four hours, banked an hour a claim", () => {
  const now = 10 * HOUR;
  assert.equal(claimBoost(0, now), now + HOUR);
  assert.equal(claimBoost(now + 3.5 * HOUR, now), now + BOOST_MAX_MS);
  assert.equal(claimBoost(now + BOOST_MAX_MS, now), null, "full");
  assert.equal(doneAt(HOUR, now + HOUR, now), now + HOUR / 2);
  assert.equal(doneAt(3 * HOUR, now + HOUR, now), now + 2 * HOUR);
  assert.equal(workLeft(now + 2 * HOUR, now + HOUR, now), 3 * HOUR);
  const { g, wait } = game();
  g.save.training.hp = 7; // an hour
  assert.ok(g.trainWithGold("hp"));
  wait(600);
  assert.ok(g.claimTrainingBoost());
  assert.equal(g.trainingLeft("hp"), 50 * 60_000);
  wait(60);
  assert.equal(g.trainingLeft("hp"), 48 * 60_000, "the timer counts down twice as fast");
  for (let i = 0; i < 4; i++) assert.ok(g.claimTrainingBoost(), "up to four hours, the last one capped");
  assert.equal(g.claimTrainingBoost(), false, "four hours at most");
  wait(24 * 60);
  assert.equal(g.settleTraining(), 1, "done in 25 minutes");
  assert.equal(decode(JSON.stringify(g.save)).trainingBoostUntil, g.save.trainingBoostUntil);
});

test("Faster Trainers research: +2% training speed a level, for 100 levels, about a year", () => {
  const levels = RESEARCH.fasterTrainers.levels;
  assert.equal(levels.length, 100);
  assert.deepEqual([levels[0].gold, levels[0].hours, levels[99].gold, levels[99].hours], [250, 1.75, 25_000, 175]);
  const hours = levels.reduce((sum, l) => sum + l.hours, 0);
  assert.ok(hours > 360 * 24 && hours < 370 * 24, `${hours} hours`);
  assert.ok(hours > 7 * RESEARCH.potionHp.levels.reduce((sum, l) => sum + l.hours, 0));
  assert.equal(trainingMs(4, 0.5), 600_000);
  const { g } = game();
  g.save.archives.levels.fasterTrainers = 50;
  g.save.training.hp = 4; // 15 minutes, at double speed
  assert.ok(g.trainWithGold("hp"));
  assert.equal(g.trainingLeft("hp"), 450_000);
});
