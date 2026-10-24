import { test } from "node:test";
import assert from "node:assert/strict";
import { RESEARCH, researched, status } from "../src/progression/archives.ts";
import { checkpoint } from "../src/goals.ts";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { enemiesOnFloor, floorKillSilver, skippedSilver, warpLootSilver } from "../src/warp-loot.ts";

/** A Game in Tower III's forest, Warp claimed and its first 150 floors' areas mastered. */
function warper() {
  const save = defaults();
  save.upgrades.archives = 1;
  save.tower.tiersOpen = 3;
  save.tower.tierRecords["3"] = { best: 150, reached: 150 };
  save.goals.claimed[2] = [40];
  save.goals.mastered[3] = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150];
  const g = new Game(save);
  g.newRun({ outside: true });
  return g;
}

test("Warp Loot opens with Tower III's floor 150 Goal: 50 levels of +2%, Dash's time and its Gold, gentler past 25", () => {
  assert.deepEqual(checkpoint(3, 150)!.reward, { kind: "unlock", unlock: "warpLoot" });
  const def = RESEARCH.warpLoot, save = defaults();
  save.upgrades.archives = 1;
  assert.deepEqual(def.requires, [{ upgrade: "archives" }, { goalUnlock: "warpLoot" }]);
  assert.deepEqual(def.categories, ["economy"]);
  assert.equal(status(save, "warpLoot"), "locked");
  save.goals.claimed[3] = [150];
  assert.equal(status(save, "warpLoot"), "available");
  assert.equal(def.levels.length, 50);
  assert.ok(def.levels.every((l) => l.effect.target === "warpLoot" && l.effect.op === "add" && l.effect.value === 2));
  const dash = RESEARCH.dash.levels, gold = (n: number) => def.levels[n - 1]!.gold;
  assert.deepEqual(def.levels.slice(0, 25).map((l) => l.gold), dash.map((l) => l.gold), "Dash's Gold for the first 25 levels");
  assert.equal(gold(26), Math.round(gold(25) * 1.4), "then 40% more a level");
  assert.ok(gold(50) > 4e14 && gold(50) < 5e14, "about 470 trillion at 50");
  const hours = (levels: readonly { hours: number }[]) => levels.reduce((a, l) => a + l.hours, 0);
  assert.ok(Math.abs(hours(def.levels) - hours(dash)) < 1e-6, "Dash's time in all");
  assert.equal(Math.round(def.levels[0]!.hours * 60), 26, "26 minutes at level 1");
  assert.ok(def.levels.every((l, i) => i === 0 || (l.gold > def.levels[i - 1]!.gold && l.hours > def.levels[i - 1]!.hours)), "each level dearer and longer");
  save.archives.levels.warpLoot = 50;
  assert.equal(researched(save.archives, "warpLoot"), 100);
});

test("the skipped floors' Silver: kills by the enemy schedule, the Wishing Well, Silver found and Interest up to its cap", () => {
  const save = defaults();
  assert.equal(enemiesOnFloor(0), 7.5);
  assert.equal(enemiesOnFloor(100), 10.8);
  assert.ok(enemiesOnFloor(4000) > 18, "more enemies as the schedule's count rises");
  assert.ok(floorKillSilver(9, 3) > floorKillSilver(8, 3) + 10, "a boss on every tenth floor");
  const plain = skippedSilver(save, 3, 150);
  assert.ok(plain > 50_000 && plain < 60_000, `about 54,600 Silver below Tower III's floor 151 (${plain})`);
  assert.equal(skippedSilver(save, 3, 0), 0);
  assert.ok(skippedSilver(save, 3, 100) < plain);
  // Silver / Floor's Wishing Well pays on every skipped floor, times Silver found.
  save.upgrades.wishingWell = 1;
  save.training.floorSilver = 10;
  const well = skippedSilver(save, 3, 150);
  assert.ok(well > plain, "the Wishing Well adds");
  // Interest compounds on the Silver held, Pocket Money included, a floor at most Max Interest.
  save.archives.levels.interest = 10;
  const interest = skippedSilver(save, 3, 150, 100);
  assert.ok(interest > well);
  assert.ok(interest - well <= 150 * researched(save.archives, "interestCap") + 1e-6, "never more than Max Interest a floor");
  // The research's percent of it, in whole Silver; none without it or on floor 1.
  assert.equal(warpLootSilver(save, 3, 150), 0);
  save.archives.levels.warpLoot = 5;
  assert.equal(warpLootSilver(save, 3, 150, 100), Math.floor(interest * 0.1));
  assert.equal(warpLootSilver(save, 3, 0, 100), 0);
});

test("a Warp run goes inside with Warp Loot's Silver beside Pocket Money, and the board's burst; a run from floor 1 gets none", () => {
  const g = warper();
  g.save.archives.levels.warpLoot = 5;
  g.save.goals.claimed[3] = [150];
  const pocket = g.startingSilver, loot = warpLootSilver(g.save, 3, 150, pocket);
  assert.ok(loot >= 1);
  assert.ok(g.warp(3, 150));
  assert.equal(g.run.height, 150);
  assert.equal(g.silver, pocket + loot);
  assert.equal(g.warpLooted?.silver, loot);
  // Retry starts on the warped floor again, with its loot again.
  assert.ok(g.retry("Run ended"));
  assert.equal(g.run.height, 150);
  assert.equal(g.silver, pocket + warpLootSilver(g.save, 3, 150, pocket));
  g.newRun({ outside: true });
  assert.equal(g.warpLooted, null, "a new run clears the burst");
  g.enterRun();
  assert.equal(g.run.height, 0);
  assert.equal(g.silver, pocket);
  assert.equal(g.warpLooted, null);
});
