import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { arrive, decodeOffline, OFFLINE_MIN_MS, RECENT_CLIMBS, recentGoldPerHour, recordClimb } from "../src/offline-gold.ts";
import { missing, research, researched } from "../src/progression/archives.ts";
import { statsRows } from "../src/ui/stats-dialog.ts";
import { skillAvailable } from "../src/progression/skill-trees.ts";
import { cost } from "../src/progression/upgrades.ts";
import { intPow } from "../src/exact.ts";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 30, 12);

test("Recent Gold per Hour is the last ten climbs' Gold over their real time", () => {
  const o = defaults().offline;
  assert.equal(recentGoldPerHour(o), 0, "none before any climb");
  recordClimb(o, 1000, HOUR);
  recordClimb(o, 0, 3 * HOUR);
  assert.equal(recentGoldPerHour(o), 250, "weighted by time: 1,000 Gold over 4 hours");
  for (let i = 0; i < RECENT_CLIMBS; i++) recordClimb(o, 600, HOUR / 2);
  assert.equal(o.climbs.length, RECENT_CLIMBS, "the oldest drop off");
  assert.equal(recentGoldPerHour(o), 1200);
});

test("a Tower climb that ends keeps its Gold and real time, less the time offline; a Delve doesn't", () => {
  const g = new Game(defaults());
  let now = T0;
  g.clock = () => now;
  g.newRun({ seed: 3 });
  g.save.tower.runGold = 500;
  now += HOUR;
  g.save.offline.seenAt = now;
  now += 2 * HOUR;
  g.arriveOffline();
  assert.equal(g.save.offline.climbAway, 2 * HOUR);
  now += HOUR;
  g.finish("Ended");
  assert.equal(g.save.offline.climbs.length, 1);
  assert.equal(g.save.offline.climbs[0]!.ms, 2 * HOUR, "the two hours away are left out");
  assert.ok(g.save.offline.climbs[0]!.gold >= 500);
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.newRun({ seed: 3 });
  now += HOUR;
  g.finish("Ended");
  assert.equal(g.save.offline.climbs.length, 1, "a Delve run doesn't count");
});

test("time away under a minute is no time offline; Offline Gold is owed only with the skill", () => {
  const save = defaults();
  recordClimb(save.offline, 10_000, HOUR);
  save.offline.seenAt = T0;
  assert.equal(arrive(save, T0 + OFFLINE_MIN_MS - 1, true), null);
  assert.equal(save.offline.climbAway, 0, "under a minute isn't offline");
  assert.equal(save.offline.seenAt, T0 + OFFLINE_MIN_MS - 1);
  assert.equal(arrive(save, save.offline.seenAt + HOUR, false), null, "nothing owed without the skill");
  save.upgrades.offlineGold = 1;
  assert.deepEqual(arrive(save, save.offline.seenAt + HOUR, false), { awayMs: HOUR, capMs: 2 * HOUR, rgph: 10_000, multiplier: 0, gold: 0 }, "0% at first");
  save.offline.grant = null;
  save.archives.levels.offlineGoldMultiplier = 100;
  save.archives.levels.offlineGoldDuration = 60;
  const grant = arrive(save, save.offline.seenAt + 20 * HOUR, false)!;
  assert.equal(grant.capMs, 12 * HOUR);
  assert.equal(grant.multiplier, 500);
  assert.equal(grant.gold, 60_000, "12 hours at half of 10,000 an hour");
  assert.equal(arrive(save, save.offline.seenAt + HOUR, false), grant, "a grant owed stays until claimed");
});

test("claiming Offline Gold banks it once, and it survives a reload unclaimed", () => {
  const save = defaults();
  save.upgrades.offlineGold = 1;
  save.archives.levels.offlineGoldMultiplier = 20;
  recordClimb(save.offline, 5000, HOUR);
  save.offline.seenAt = T0;
  const g = new Game(decode(JSON.stringify(save)));
  g.clock = () => T0 + 3 * HOUR;
  assert.equal(g.arriveOffline()?.gold, 1000, "2 hours at 10% of 5,000 an hour");
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  const gold = reloaded.save.gold;
  assert.equal(reloaded.claimOfflineGold(), 1000);
  assert.equal(reloaded.save.gold, gold + 1000);
  assert.equal(reloaded.claimOfflineGold(), 0);
  assert.equal(reloaded.save.gold, gold + 1000);
});

test("the offline save decodes defensively", () => {
  assert.deepEqual(decodeOffline("nope"), defaults().offline);
  const d = decodeOffline({ seenAt: -5, climbs: [{ gold: 5, ms: 0 }, { gold: -1, ms: 5 }, { gold: 2, ms: 9 }, "x"], climbAway: 7, grant: { gold: 1 } });
  assert.deepEqual(d, { seenAt: 0, climbs: [{ gold: 2, ms: 9 }], climbAway: 7, grant: null });
});

test("the Stats table shows Recent Gold per Hour, shortened, after the Gold earned", () => {
  const save = defaults();
  recordClimb(save.offline, 123_456, HOUR);
  const rows = statsRows(save.profile, save.offline);
  const at = rows.findIndex(([label]) => label === "Gold earned");
  assert.deepEqual(rows[at + 1], ["Recent Gold per Hour", "123K"]);
});

test("Offline Gold follows Golden Floors for 2 Breakthrough and opens its two research projects", () => {
  const save = defaults();
  // Every other skill owned, Golden Floors and Offline Gold aside.
  for (const id of Object.keys(save.upgrades) as (keyof typeof save.upgrades)[]) save.upgrades[id] = 1;
  save.upgrades.goldenFloors = save.upgrades.offlineGold = 0;
  assert.equal(cost("offlineGold", 0), 2);
  assert.equal(skillAvailable("offlineGold", save.upgrades), false);
  save.upgrades.goldenFloors = 1;
  assert.ok(skillAvailable("offlineGold", save.upgrades));
  for (const id of ["offlineGoldMultiplier", "offlineGoldDuration"] as const) {
    save.upgrades.offlineGold = 0;
    assert.equal(missing(save, id).length, 1, id);
    save.upgrades.offlineGold = 1;
    assert.equal(missing(save, id).length, 0, id);
  }
});

test("Offline Gold Multiplier runs 0% to 50% on Critical Chance's prices; Duration 2 to 12 hours, 1.02 times dearer a level", () => {
  const multiplier = research("offlineGoldMultiplier").levels, duration = research("offlineGoldDuration").levels, crit = research("critChance").levels;
  assert.equal(multiplier.length, 100);
  assert.deepEqual(multiplier.map((l) => [l.gold, l.hours]), crit.map((l) => [l.gold, l.hours]));
  assert.equal(duration.length, 60);
  duration.forEach((l, i) => {
    assert.equal(l.gold, Math.round(multiplier[i]!.gold * intPow(1.02, i)));
    assert.equal(l.hours, multiplier[i]!.hours * intPow(1.02, i));
  });
  const a = defaults().archives;
  assert.equal(researched(a, "offlineGoldMultiplier"), 0);
  assert.equal(researched(a, "offlineGoldMinutes"), 120);
  a.levels.offlineGoldMultiplier = 100;
  a.levels.offlineGoldDuration = 60;
  assert.equal(researched(a, "offlineGoldMultiplier"), 500);
  assert.equal(researched(a, "offlineGoldMinutes"), 720);
});
