import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save/save.ts";
import { decodeSettings } from "../src/save/settings.ts";
import { Game } from "../src/state.ts";
import { canWarp, floorsCompleted } from "../src/goals.ts";
import { TIERS } from "../src/tiers.ts";
import { tiersReachable } from "../src/access.ts";
import { AreaLedger } from "../src/tower/area-ledger.ts";
import { startTrial } from "../src/proving-grounds/trial.ts";
import { saveTrialDamage, settleTrialVictory } from "../src/proving-grounds/progression.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { TowerRun } from "../src/runs.ts";

/** A new hero in the Tower's forest. */
function forest() {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  return g;
}

test("Unlimited currency fills the purse and unlocks nothing", () => {
  const g = forest(), before = defaults();
  g.setDevMode(true);
  assert.equal(g.save.gold, 999_999_999);
  assert.equal(g.save.gems, 999_999_999);
  assert.deepEqual(g.save.upgrades, before.upgrades, "no skill");
  assert.deepEqual([g.save.tower.reached, g.save.tower.tiersOpen], [0, 1], "no floor, no tower");
  assert.equal(g.save.equipment.unlocked, false);
  assert.deepEqual(g.save.badges.owned, before.badges.owned);
  assert.equal(g.tournament.unlocked, false);
});

test("Access to Everything sits in the dev section and grants nothing", () => {
  assert.equal(decodeSettings({ accessAll: true }).devTools, true, "it shows the dev section it lives in");
  const g = forest(), save = structuredClone(g.save);
  g.setAccessAll(true);
  assert.ok(g.tournament.unlocked && g.research.done !== undefined);
  g.setAccessAll(false);
  save.settings.accessAll = false;
  assert.deepEqual(g.save, save, "on and off again leaves the profile as it was");
});

test("Events and the Tournament show, but count, sell and grant nothing", () => {
  const g = forest();
  g.setAccessAll(true);
  assert.ok(g.events.unlocked && g.tournament.unlocked);
  assert.equal(g.events.earned, false);
  g.events.refresh();
  assert.ok(g.events.missions.length > 0, "the running event's missions show");
  assert.ok(g.events.missions.every((m) => m.progress === 0), "nothing counts, not even today's login");
  assert.equal(g.save.tournament.tickets, 0);
});

test("every tower is visited while it is on, as preview runs that record nothing", () => {
  const g = forest(), slice = g.save.tower;
  assert.equal(g.canTravelForest(1), false, "Tower II isn't open");
  g.setAccessAll(true);
  assert.equal(tiersReachable(g.save, "tower"), TIERS);
  assert.ok(g.canTravelForest(1));
  assert.ok(g.selectTier(TIERS));
  assert.equal(g.run.tier, TIERS);
  g.enterRun();
  assert.equal(g.run.preview, true, "a tier not opened is a preview");
  g.run.height = 12;
  assert.equal(g.recordProgress(), 0);
  assert.deepEqual([slice.best, slice.reached, slice.tiersOpen], [0, 0, 1]);
});

test("a saved locked tier stays selected only while it is on", () => {
  const g = forest();
  g.setAccessAll(true);
  g.selectTier(4);
  assert.equal(decode(JSON.stringify(g.save)).tower.tier, 4);
  g.save.settings.accessAll = false;
  assert.equal(decode(JSON.stringify(g.save)).tower.tier, 1);
});

test("turning it off takes the forest back to the highest tower opened", () => {
  const g = forest();
  g.setAccessAll(true);
  g.selectTier(5);
  g.setAccessAll(false);
  assert.equal(g.save.tower.tier, 1);
  assert.ok(g.run.outside);
  assert.equal(g.run.tier, undefined);
  assert.deepEqual(g.save.tower.tierRecords, {}, "the towers looked at leave no record");
});

test("Warp reaches any checkpoint while it is on, as a preview that masters and records nothing", () => {
  const g = forest();
  assert.equal(canWarp(g.save, 3, 500), false);
  g.setAccessAll(true);
  assert.ok(canWarp(g.save, 3, 500));
  assert.ok(g.warp(3, 500));
  assert.equal(g.run.height, 500);
  assert.equal(g.run.preview, true);
  g.run.height = 510;
  assert.equal(g.recordProgress(), 0);
  assert.equal(floorsCompleted(g.save, 3), 0, "no Goal opens");
  assert.deepEqual(new AreaLedger(g.save).enter(g.run as TowerRun, g.world as RoomWorld), [], "no area reward");
  assert.deepEqual(g.save.goals.mastered, {});
});

test("a Warp the player earned is no preview", () => {
  const g = forest();
  g.setAccessAll(true);
  g.save.tower.reached = 40;
  g.save.tower.tiersOpen = 2;
  g.save.tower.tierRecords["2"] = { best: 40, reached: 40 };
  g.claimGoal(2, 40, false);
  g.save.goals.mastered[1] = [10];
  assert.ok(g.warp(1, 10));
  assert.equal(g.run.preview, undefined);
});

test("a preview trial records no clear, points or damage", () => {
  const g = forest();
  const won = { ...startTrial({ maxHp: 100, attack: 10, defense: 0 }, "manual", [], 7, 1, "light-elemental"), status: "won" as const, bossHp: 0, preview: true as const };
  assert.deepEqual(settleTrialVictory(g.save, won), { changed: false, points: 0 });
  const obelisk = { ...startTrial({ maxHp: 100, attack: 10, defense: 0 }, "manual", [], 7, 1, "obelisk"), preview: true as const };
  obelisk.bossHp = obelisk.bossMaxHp - 5;
  assert.equal(saveTrialDamage(g.save, obelisk), false);
  assert.deepEqual(g.save.trialAccess, defaults().trialAccess);
});
