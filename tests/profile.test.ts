import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { xpForLevel } from "../src/config.ts";
import { cancelResearch, settleArchives, startResearch } from "../src/archives.ts";
import { CURRENCIES } from "../src/shop/currency.ts";
import { MODES } from "../src/modes.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { earn, stampProfile } from "../src/profile.ts";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 11, 12);

const game = () => {
  const g = new Game(defaults());
  g.save.upgrades.trainers = 1;
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(10);
  g.save.gold = 1e9;
  let now = T0;
  g.clock = () => now;
  return { g, wait: (ms: number) => { now += ms; } };
};

test("a new profile has no tallies and no date until stamped, which keeps the first date", () => {
  const save = defaults();
  assert.equal(save.profile.createdAt, 0);
  assert.ok(Object.values(save.profile.earned).every((n) => n === 0));
  stampProfile(save, T0);
  stampProfile(save, T0 + HOUR);
  assert.equal(save.profile.createdAt, T0);
});

test("the profile round-trips through the save, and an older save's tallies start from what it holds", () => {
  const save = defaults();
  stampProfile(save, T0);
  earn(save, "gold", 1234.5);
  earn(save, "cells", 3);
  save.profile.researchGold = 700;
  assert.deepEqual(decode(JSON.stringify(save)).profile, save.profile);

  const old: any = defaults();
  delete old.profile;
  old.gold = 50;
  old.gems = 7;
  old.cells = 2;
  old.training.attack = 4;
  old.trainingPaid.attack.gold = 300;
  old.archives.levels = { focusCount: 2 };
  const p = decode(JSON.stringify(old)).profile;
  assert.deepEqual([p.createdAt, p.earned.gold, p.earned.gems, p.earned.cells, p.trainingLevels, p.trainingGold, p.researchLevels], [0, 50, 7, 2, 4, 300, 2]);
});

test("currencies earned count toward the profile, and spending never takes them off", () => {
  const save = defaults();
  CURRENCIES.gems.credit(save, 10);
  CURRENCIES.gems.spend(save, 4);
  CURRENCIES.gold.credit(save, 100);
  CURRENCIES.shards.credit(save, 2);
  CURRENCIES.medals.credit(save, 5);
  MODES.tower.credit(save, 3);
  MODES.delve.credit(save, 6);
  const e = save.profile.earned;
  assert.deepEqual([e.gems, e.gold, e.ascensionShards, e.medals, e.inspiration, e.courage], [10, 100, 2, 5, 3, 6]);
});

test("Gold and Silver a run finds count toward the profile, and undo takes the Silver back", () => {
  const { g } = game();
  g.newRun({ seed: 7 });
  const before = g.snapshot(), purse = new RunPurse(g.save, g.mode, g.run, () => 0.5);
  const gold = purse.gold(40), silver = purse.silver(25);
  assert.equal(g.save.profile.earned.gold, gold);
  assert.equal(g.save.profile.earned.silver, silver);
  g.restore(before);
  assert.equal(g.save.profile.earned.silver, 0, "the Silver went with the run");
  assert.equal(g.save.profile.earned.gold, gold, "Gold is banked, so undo keeps it");
});

test("Training counts each rank gained and the trainers' Gold, less what comes back", () => {
  const { g, wait } = game();
  assert.ok(g.training.train("attack"));
  assert.equal(g.save.profile.trainingLevels, 1);
  assert.ok(g.training.trainWithGold("defense", 5));
  const paid = g.save.trainingJobs[0].gold;
  assert.equal(g.save.profile.trainingGold, paid);
  assert.ok(g.training.cancel("defense"));
  assert.equal(g.save.profile.trainingGold, 0, "a stopped rank's Gold came back");
  assert.ok(g.training.trainWithGold("defense", 1));
  wait(1000 * HOUR);
  g.training.settle();
  assert.equal(g.save.profile.trainingLevels, 2);
  assert.equal(g.save.profile.trainingGold, g.save.trainingPaid.defense.gold);
});

test("research counts each level completed and its Gold, less what a stop gives back", () => {
  const save = defaults();
  save.upgrades.archives = 1;
  save.upgrades.focus = 1;
  save.gold = 100_000;
  assert.ok(startResearch(save, 0, "focusCount", T0));
  assert.equal(save.profile.researchGold, 500);
  assert.ok(cancelResearch(save, 0, T0 + HOUR));
  assert.equal(save.profile.researchGold, 0);
  assert.ok(startResearch(save, 0, "focusCount", T0 + HOUR));
  settleArchives(save, T0 + 100 * HOUR);
  assert.deepEqual([save.profile.researchLevels, save.profile.researchGold], [1, 500]);
});
