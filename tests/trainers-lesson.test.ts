// The trainers lesson (game/training-desk.ts): the gift, the first trainer
// hired with it, the praise, and the Arcana tab it reveals.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { arcanaOpen, arcanaReached } from "../src/arcana/arcana.ts";
import { TRAINER_GEMS, TRAINER_GIFT, trainingSlots } from "../src/progression/training-jobs.ts";

/** A game in the Tower's forest, every lesson before the trainers' done. */
const game = () => {
  const g = new Game(defaults());
  for (const id of ["cardDoorKey", "cardEnemy", "autoClimb", "combatStance", "buildout", "trainers"] as const) g.save.upgrades[id] = 1;
  Object.assign(g.save.tutorials, { story: true, climb: true, keys: true, autoClimb: true, enter: true, training: true });
  g.newRun({ outside: true });
  return g;
};

test("the Trainers skill comes with no trainer: the lesson leads to a gift of 50 Gems and 100 Gold", () => {
  const g = game();
  assert.equal(trainingSlots(g.save), 0);
  g.save.gold = 1000;
  assert.equal(g.training.trainWithGold("hp"), false, "nobody to train");
  assert.equal(g.training.lesson, "gift");
  assert.equal(g.boardLesson, "trainers");
  assert.equal(g.notices.waiting("research"), true);
  assert.deepEqual(TRAINER_GIFT, { gems: 50, gold: 100 });

  const { gems, gold } = g.save, earned = { ...g.save.profile.earned };
  assert.ok(g.training.claimGift());
  assert.deepEqual([g.save.gems - gems, g.save.gold - gold], [50, 100]);
  assert.deepEqual([g.save.profile.earned.gems - earned.gems, g.save.profile.earned.gold - earned.gold], [50, 100]);
  assert.equal(g.training.claimGift(), false, "once");
  assert.equal(decode(JSON.stringify(g.save)).tutorials.trainerGift, true, "saved, so never again after a reload");
});

test("once claimed, only hiring the first trainer is left to press, for 50 Gems", () => {
  const g = game();
  assert.equal(g.training.mustHire, false, "not before the gift");
  g.training.claimGift();
  assert.equal(g.training.mustHire, true);
  assert.equal(g.boardLesson, "hire", "after a reload the forest leads straight back to it");
  assert.equal(TRAINER_GEMS[0], 50);
  assert.ok(g.training.buyTrainer());
  assert.deepEqual([g.save.gems, g.save.trainers, trainingSlots(g.save)], [0, 1, 1]);
  assert.equal(g.training.mustHire, false);
  assert.ok(g.training.trainWithGold("hp"), "the gift's Gold trains");
});

test("the hold never traps a player who can't pay", () => {
  const g = game();
  g.training.claimGift();
  g.save.gems = 49;
  assert.equal(g.training.lesson, "hire");
  assert.equal(g.training.mustHire, false);
  assert.notEqual(g.boardLesson, "hire");
});

test("the praise waits until dismissed, and is saved", () => {
  const g = game();
  assert.equal(g.training.finishLesson(), false);
  g.training.claimGift();
  g.training.buyTrainer();
  assert.equal(g.training.lesson, "praise");
  assert.equal(decode(JSON.stringify(g.save)).tutorials.trainers, false);
  assert.ok(g.training.finishLesson());
  assert.equal(g.training.lesson, null);
  assert.equal(decode(JSON.stringify(g.save)).tutorials.trainers, true);
});

test("hiring the first trainer reveals Arcana, without naming any spell in Settings", () => {
  const g = game();
  g.training.claimGift();
  assert.equal(arcanaOpen(g.save), false);
  g.training.buyTrainer();
  assert.equal(arcanaOpen(g.save), true);
  assert.equal(g.notices.waiting("gear"), true);
  assert.equal(g.boardLesson, "arcana");
  assert.equal(arcanaReached(g.save), false, "the spells' Settings rows still wait for Arcanite");
});

test("a save from before the gift keeps its free trainer, its jobs and those bought", () => {
  const g = game();
  g.save.trainers = 2;
  g.save.gold = 1000;
  g.clock = () => 1_790_000_000_000;
  assert.ok(g.training.trainWithGold("hp") && g.training.trainWithGold("attack"));
  const old = JSON.parse(JSON.stringify(g.save));
  // As that save had it: one trainer bought, the first free and uncounted.
  old.trainers = 1;
  delete old.tutorials.trainerGift;
  delete old.tutorials.trainers;
  const back = decode(JSON.stringify(old));
  assert.deepEqual([back.trainers, back.trainingJobs.length], [2, 2]);
  assert.deepEqual([back.tutorials.trainerGift, back.tutorials.trainers], [true, true], "no lesson for them");
  assert.equal(decode(JSON.stringify(back)).trainers, 2, "counted once");
  assert.equal(decode(JSON.stringify({ ...old, trainers: 6 })).trainers, TRAINER_GEMS.length);

  const without = JSON.parse(JSON.stringify(defaults()));
  delete without.tutorials.trainerGift;
  const fresh = decode(JSON.stringify(without));
  assert.deepEqual([fresh.trainers, fresh.tutorials.trainerGift], [0, false], "none without the skill");
});
