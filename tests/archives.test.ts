import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVISTS, HISTORY_LIMIT, RESEARCH, RESEARCH_CATEGORIES, RESEARCH_IDS, RESEARCH_TARGETS, cancelResearch, cannotStart, decodeArchives,
  cannotSwitch, defaultArchives, duration, price, hireArchivist, jobProgress, maxLevel, researchCompleted, researchLevel, researched, settleArchives, startResearch, status, switchResearch, withNextLevel,
  type ResearchId,
} from "../src/progression/archives.ts";
import { loadout } from "../src/progression/loadout.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { formatDuration } from "../src/ui/archives-page.ts";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 8, 29, 15);

/** A profile with the Heart Door Resilience skill and `gold` Gold. */
function owner(gold = 100_000) {
  const save = defaults();
  save.upgrades.archives = 1;
  save.upgrades.heartDoorResilience = 1;
  save.goals.claimed[1] = [150]; // Tower I's floor 150 Goal opens Research Speed
  save.gold = gold;
  return save;
}

test("every research is well formed: known categories, targets and requirements", () => {
  for (const id of RESEARCH_IDS) {
    const def = RESEARCH[id];
    assert.ok(def.levels.length > 0, id);
    assert.ok(def.categories.length > 0 && def.categories.every((c) => c in RESEARCH_CATEGORIES), id);
    for (const l of def.levels) {
      assert.ok(l.gold > 0 && l.hours > 0 && l.effect.target in RESEARCH_TARGETS, id);
    }
    for (const r of def.requires as any[]) {
      if ("upgrade" in r) assert.ok(UPGRADES.some((u) => u.id === r.upgrade), id);
      if ("research" in r) assert.ok(r.research in RESEARCH && r.level <= RESEARCH[r.research as "heartDoorResilience"].levels.length, id);
    }
  }
  assert.equal(ARCHIVISTS.prices.length, ARCHIVISTS.maximum - ARCHIVISTS.start);
});

test("Heart Door Resilience: ten levels of 8 more hours each and 500 × n more Gold each", () => {
  const levels = RESEARCH.heartDoorResilience.levels;
  assert.deepEqual(levels.map((l) => l.hours), [8, 16, 24, 32, 40, 48, 56, 64, 72, 80]);
  assert.deepEqual(levels.map((l) => l.gold), [500, 1000, 2000, 3500, 5500, 8000, 11000, 14500, 18500, 23000]);
  assert.ok(levels.every((l) => l.effect.target === "heartToll" && l.effect.op === "add" && l.effect.value === -5));
});

test("research waits on its requirements, and is paid for when it starts", () => {
  const save = owner(600);
  save.upgrades.heartDoorResilience = 0;
  assert.equal(status(save, "heartDoorResilience"), "locked");
  assert.equal(startResearch(save, 0, "heartDoorResilience", T0), false);
  save.upgrades.heartDoorResilience = 1;
  assert.equal(status(save, "heartDoorResilience"), "available");
  assert.ok(startResearch(save, 0, "heartDoorResilience", T0));
  assert.equal(save.gold, 100);
  assert.equal(status(save, "heartDoorResilience"), "active");
  assert.equal(save.archives.slots[0].job!.completesAt, T0 + 8 * HOUR);
  assert.equal(startResearch(save, 0, "heartDoorResilience", T0), false, "the archivist is busy");
});

test("research completes on the wall clock, however long the game was closed", () => {
  const save = owner();
  startResearch(save, 0, "heartDoorResilience", T0);
  assert.deepEqual(settleArchives(save, T0 + 8 * HOUR - 1), []);
  assert.equal(jobProgress(save.archives.slots[0].job!, T0 + 2 * HOUR), 0.25);
  assert.equal(jobProgress(save.archives.slots[0].job!, T0 - HOUR), 0, "a clock set back reads as no progress");
  const done = settleArchives(save, T0 + 100 * HOUR);
  assert.deepEqual(done, [{ at: T0 + 8 * HOUR, research: "heartDoorResilience", level: 1 }]);
  assert.equal(save.archives.levels.heartDoorResilience, 1);
  assert.equal(save.archives.slots[0].job, undefined, "without auto-continue the archivist waits");
  assert.equal(researched(save.archives, "heartToll"), 95);
});

test("auto-continue starts each next level the moment the last completes, while the Gold lasts", () => {
  const save = owner(500 + 1000 + 2000 + 100);
  save.archives.slots[0].autoContinue = true;
  startResearch(save, 0, "heartDoorResilience", T0);
  // Levels 1–3 take 8 + 16 + 24 hours; the fourth costs more than is left.
  const done = settleArchives(save, T0 + 1000 * HOUR);
  assert.deepEqual(done.map((r) => [r.level, r.at]), [[1, T0 + 8 * HOUR], [2, T0 + 24 * HOUR], [3, T0 + 48 * HOUR]]);
  assert.equal(save.gold, 100);
  assert.equal(save.archives.slots[0].job, undefined);
  assert.deepEqual(save.archives.history, done);
});

test("auto-continue stops at the last level", () => {
  const save = owner(1e6);
  save.archives.slots[0].autoContinue = true;
  startResearch(save, 0, "heartDoorResilience", T0);
  settleArchives(save, T0 + 10_000 * HOUR);
  assert.equal(save.archives.levels.heartDoorResilience, 10);
  assert.equal(status(save, "heartDoorResilience"), "completed");
  assert.equal(researched(save.archives, "heartToll"), 50);
});

test("stopping research refunds it and keeps its time for later", () => {
  const save = owner(1000);
  startResearch(save, 0, "heartDoorResilience", T0);
  assert.ok(cancelResearch(save, 0, T0 + 6 * HOUR));
  assert.equal(save.gold, 1000, "the Gold comes back");
  assert.equal(save.archives.progress.heartDoorResilience, 0.75);
  assert.ok(startResearch(save, 0, "heartDoorResilience", T0 + 50 * HOUR));
  assert.equal(save.gold, 500, "starting again pays again");
  const job = save.archives.slots[0].job!;
  assert.equal(job.completesAt, T0 + 52 * HOUR, "2 of the 8 hours were left");
  assert.equal(save.archives.progress.heartDoorResilience, undefined);
});

test("research speed shortens the time a level takes, not the definition", () => {
  const a = defaultArchives();
  assert.equal(duration(a, { gold: 1, hours: 10, effect: { target: "researchSpeed", op: "add", value: 0.3 } }), 10 * HOUR);
  assert.equal(researched(a, "researchSpeed", 0.3), 0.3, "with nothing researched a target keeps its base");
  assert.equal(formatDuration(Math.round(10 * HOUR / 1.3)), "7h 41m");
});

test("Research Speed and Research Cost Discount: open with the Archives, linear benefit, quadratic time, cubic Gold", () => {
  for (const id of ["researchSpeed", "researchCostDiscount"] as const) {
    const levels = RESEARCH[id].levels;
    assert.deepEqual(RESEARCH[id].requires, id === "researchSpeed" ? [{ upgrade: "archives" }, { goalUnlock: "researchSpeed" }] : [{ upgrade: "archives" }]);
    assert.equal(levels.length, 100);
    assert.deepEqual(levels.slice(0, 10).map((l) => l.gold), [40, 83, 211, 522, 1120, 2100, 3580, 5670, 8470, 12120]);
    assert.deepEqual(levels.slice(0, 10).map((l) => Math.round(l.hours * 60)), [1, 9, 23, 44, 73, 112, 162, 225, 301, 391]);
    assert.equal(levels[99].gold, 20_000_000);
    assert.equal(levels[99].hours, 2400, "100 days");
    for (let i = 1; i < 100; i++) {
      assert.ok(levels[i].gold > levels[i - 1].gold && levels[i].hours > levels[i - 1].hours, `${id} ${i + 1}`);
      // The coefficients C × n³ (Gold) and C × n² (minutes) only rise from level 3.
      if (i >= 3) assert.ok(levels[i].gold / (i + 1) ** 3 >= levels[i - 1].gold / i ** 3 * 0.99, `${id} Gold ${i + 1}`);
      if (i >= 3) assert.ok(levels[i].hours / (i + 1) ** 2 >= levels[i - 1].hours / i ** 2 * 0.99, `${id} time ${i + 1}`);
    }
  }
  const a = defaultArchives();
  a.levels.researchSpeed = 50;
  assert.equal(RESEARCH_TARGETS.researchSpeed.shown(researched(a, "researchSpeed")), "200%");
  assert.equal(duration(a, { gold: 1, hours: 48, effect: { target: "heartToll", op: "add", value: 1 } }), 24 * HOUR, "48 hours at 200% take 24");
  a.levels.researchCostDiscount = 100;
  assert.equal(RESEARCH_TARGETS.researchCost.shown(researched(a, "researchCost")), "70%");
  assert.equal(price(a, { gold: 1000, hours: 1, effect: { target: "heartToll", op: "add", value: 1 } }), 700);
});

test("Research Cost Discount takes its share off every research's Gold as it starts", () => {
  const save = owner(10_000);
  save.archives.levels.researchCostDiscount = 10;
  assert.ok(startResearch(save, 0, "heartDoorResilience", T0));
  assert.equal(save.gold, 10_000 - 485, "3% off 500");
  assert.equal(save.archives.slots[0].job!.paid, 485);
  cancelResearch(save, 0, T0);
  assert.equal(save.gold, 10_000, "a stop gives back what was paid");
  save.gold = 499;
  assert.equal(cannotStart(save, 0, "heartDoorResilience"), null, "485 Gold is enough");
});

test("a Research Speed level completed hastens the research under way, keeping its share done", () => {
  const save = owner(1e6);
  save.gems = ARCHIVISTS.prices[0];
  hireArchivist(save);
  startResearch(save, 0, "heartDoorResilience", T0); // 8 hours
  startResearch(save, 1, "researchSpeed", T0); // 1 minute
  const at = T0 + 60_000;
  settleArchives(save, at);
  assert.equal(save.archives.levels.researchSpeed, 1);
  const job = save.archives.slots[0].job!, whole = Math.round((8 * HOUR) / 1.02);
  assert.equal(job.completesAt - job.startedAt, whole, "the whole level now takes 8 hours at 102%");
  assert.ok(Math.abs(jobProgress(job, at) - 60_000 / (8 * HOUR)) < 1e-6, "its share done is kept");
  assert.equal(job.completesAt, job.startedAt + whole);
  assert.ok(Math.abs(job.completesAt - at - (8 * HOUR - 60_000) / 1.02) <= 1, "the time left is prorated");
});

test("archivists are hired one at a time for Gems, not Gold, up to the maximum", () => {
  assert.deepEqual(ARCHIVISTS.prices, [100, 400, 1400, 3000]);
  const save = owner(1e9);
  save.gems = 99;
  assert.equal(hireArchivist(save), false, "Gold doesn't hire");
  save.gems = ARCHIVISTS.prices.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ARCHIVISTS.prices.length; i++) assert.ok(hireArchivist(save));
  assert.equal(save.archives.slots.length, ARCHIVISTS.maximum);
  assert.equal(save.gems, 0);
  assert.equal(save.gold, 1e9);
  save.gems = 1e9;
  assert.equal(hireArchivist(save), false);
});

test("a project's next level reads as the total before and after it", () => {
  const a = owner().archives, show = (archives: typeof a, t: "heartToll" | "potionHeal" | "trainingSpeed") =>
    RESEARCH_TARGETS[t].shown(researched(archives, t));
  assert.deepEqual([show(a, "heartToll"), show(withNextLevel(a, "heartDoorResilience"), "heartToll")], ["100%", "95%"]);
  assert.deepEqual([show(a, "potionHeal"), show(withNextLevel(a, "potionHp"), "potionHeal")], ["100%", "103%"]);
  assert.equal(show(a, "trainingSpeed"), "100%");
  assert.equal(RESEARCH_TARGETS.trainingSpeed.name, "Training Speed");
  assert.equal(researchLevel(a, "heartDoorResilience"), 0, "the Archives themselves are left alone");
});

test("the Archives save and load, dropping anything malformed", () => {
  const save = owner();
  save.gems = ARCHIVISTS.prices[0];
  assert.ok(hireArchivist(save));
  save.archives.slots[1].autoContinue = true;
  startResearch(save, 1, "heartDoorResilience", T0);
  settleArchives(save, T0 + 8 * HOUR);
  startResearch(save, 0, "heartDoorResilience", T0 + 9 * HOUR);
  const loaded = decode(JSON.stringify(save));
  assert.deepEqual(loaded.archives, save.archives);
  assert.deepEqual(decodeArchives(null), defaultArchives());
  const bad = decodeArchives({
    slots: [{ job: { research: "heartDoorResilience", level: 3, startedAt: 0, completesAt: 1, paid: 5 } }, { job: { research: "nope" } }],
    levels: { heartDoorResilience: 99 },
    progress: { heartDoorResilience: 1.5 },
    history: [{ at: 1, research: "heartDoorResilience", level: 1 }, { at: -1, research: "heartDoorResilience", level: 1 }, "x"],
  });
  assert.deepEqual(bad.slots, [{ autoContinue: false }, { autoContinue: false }]);
  assert.deepEqual(bad.levels, {});
  assert.deepEqual(bad.progress, {});
  assert.deepEqual(bad.history, [{ at: 1, research: "heartDoorResilience", level: 1 }]);
  const twice = decodeArchives({ slots: [0, 1].map(() => ({ job: { research: "heartDoorResilience", level: 1, startedAt: 0, completesAt: 1, paid: 5 } })) });
  assert.equal(twice.slots.filter((s) => s.job).length, 1, "no project in two slots");
  assert.equal(decodeArchives({ history: Array.from({ length: 300 }, (_, i) => ({ at: i, research: "heartDoorResilience", level: 1 })) }).history.length, HISTORY_LIMIT);
});

test("Potion HP: +3% a level for 100 levels; quick first levels, then 100m + m³ Gold and m/4 + m²/100 hours from level 5", () => {
  const levels = RESEARCH.potionHp.levels;
  assert.equal(levels.length, 100);
  assert.deepEqual(levels.slice(0, 6).map((l) => l.gold), [10, 25, 50, 75, 101, 208]);
  assert.deepEqual(levels.slice(0, 6).map((l) => Math.round(l.hours * 3600)), [15, 60, 300, 600, 936, 1944]);
  assert.equal(levels[99].gold, 9_600 + 96 ** 3);
  assert.equal(levels[99].hours, 24 + 96 * 96 / 100);
  assert.equal(levels.reduce((sum, l) => sum + l.gold, 0), 22_144_096);
  assert.deepEqual(levels.slice(0, 4).map((l) => duration(defaultArchives(), l)), [15_000, 60_000, 300_000, 600_000]);
  assert.ok(levels.every((l) => l.effect.target === "potionHeal" && l.effect.op === "add" && l.effect.value === 3));
  assert.deepEqual(RESEARCH_IDS.slice(0, 10), ["researchSpeed", "researchCostDiscount", "potionHp", "regen", "attack", "critChance", "critFactor", "chargedShot", "shardAttack", "defense"], "after the Archives' own two, Regen beside it, then the stats' (the crits, Charged Shot and Shard ATK beside ATK)");
  assert.deepEqual(RESEARCH.potionHp.categories, ["defense"]);
});

test("Undo Count needs Rehearsed steps or Echoes of time, costs what Heart Door Resilience does, and each level stores one more undo at once", () => {
  const save = owner();
  const g = new Game(save);
  g.clock = () => T0;
  assert.deepEqual(
    RESEARCH.undoCount.levels.map(({ gold, hours }) => [gold, hours]),
    RESEARCH.heartDoorResilience.levels.slice(0, 8).map(({ gold, hours }) => [gold, hours]),
  );
  assert.equal(status(save, "undoCount"), "locked");
  assert.equal(g.research.start(0, "undoCount"), false);
  save.upgrades.inspirationUndos = 1;
  assert.equal(g.undoCapacity, 1);
  assert.ok(g.research.start(0, "undoCount"));
  g.clock = () => T0 + 8 * HOUR;
  assert.equal(g.research.settle().length, 1);
  assert.equal(g.undoCapacity, 2);
  save.archives.levels.undoCount = 4;
  assert.equal(g.undoCapacity, 1 + 4);
});

test("Undo Count opens 4 levels for each of Rehearsed steps and Echoes of time owned, either first", () => {
  for (const first of ["inspirationUndos", "undos"] as const) {
    const save = owner();
    const g = new Game(save);
    g.clock = () => T0;
    save.upgrades[first] = 1;
    assert.equal(maxLevel("undoCount", save.upgrades), 4, first);
    assert.equal(status(save, "undoCount"), "available");
    save.archives.levels.undoCount = 4;
    assert.equal(status(save, "undoCount"), "completed", "4 levels with one skill");
    assert.equal(g.research.start(0, "undoCount"), false);
    save.upgrades[first === "undos" ? "inspirationUndos" : "undos"] = 1;
    assert.equal(maxLevel("undoCount", save.upgrades), 8);
    assert.ok(g.research.start(0, "undoCount"), "the second skill opens 4 more");
  }
  // Echoes of time alone stores no undo until research does.
  const save = owner();
  save.upgrades.undos = 1;
  const g = new Game(save);
  assert.equal(g.undoCapacity, 0);
  save.archives.levels.undoCount = 2;
  assert.equal(g.undoCapacity, 2);
});

test("Potion HP needs Greater Heal, and every level strengthens potions at once, mid-run too", () => {
  const save = owner();
  const g = new Game(save);
  g.clock = () => T0;
  assert.equal(status(save, "potionHp"), "locked");
  assert.equal(g.research.start(0, "potionHp"), false);
  save.upgrades.greaterHeal = 1;
  assert.equal(status(save, "potionHp"), "available");
  assert.equal(g.stepRules.potionHeal, 100);
  assert.ok(g.research.start(0, "potionHp"));
  g.clock = () => T0 + 15_000;
  assert.equal(g.research.settle().length, 1);
  assert.equal(g.stepRules.potionHeal, 103);
  save.archives.levels.potionHp = 100;
  assert.equal(g.stepRules.potionHeal, 400);
  assert.equal(researched(save.archives, "potionHeal"), 400);
});

test("Shard ATK and Shard DEF open with Tower II's floor 20 and 30 Goals, cost what Potion HP does, and raise every shard picked up at once", () => {
  const save = owner();
  save.upgrades.delve = 1;
  const g = new Game(save);
  g.switchMode("delve");
  for (const [id, target, value] of [["shardAttack", "shardAttackPercent", 2], ["shardDefense", "shardDefensePercent", 3]] as const) {
    assert.deepEqual(RESEARCH[id].levels.map(({ gold, hours }) => [gold, hours]), RESEARCH.potionHp.levels.map(({ gold, hours }) => [gold, hours]));
    assert.ok(RESEARCH[id].levels.every((l) => l.effect.target === target && l.effect.op === "add" && l.effect.value === value));
    assert.equal(status(save, id), "locked");
  }
  save.goals.claimed[2] = [20];
  assert.deepEqual([status(save, "shardAttack"), status(save, "shardDefense")], ["available", "locked"]);
  save.goals.claimed[2] = [20, 30];
  assert.equal(status(save, "shardDefense"), "available");
  assert.deepEqual(RESEARCH.shardDefense.categories, ["defense"]);
  // Read at the step, so a level completed mid-run counts on the next shard.
  const p = g.run.player, { attack, defense } = p;
  save.archives.levels.shardAttack = 50;
  g.world.changes["15,1"] = { kind: "attack" };
  assert.ok(g.move(0, 1));
  assert.equal(g.run.player.attack, attack + 2, "+100% at level 50");
  save.archives.levels.shardDefense = 10;
  g.world.changes["15,2"] = { kind: "defense", amount: 10 };
  assert.ok(g.move(0, 1));
  assert.equal(g.run.player.defense, defense + 13, "+30% at level 10, on a later tier's shard");
  save.archives.levels.shardAttack = 100;
  assert.deepEqual([g.stepRules.shardAttack, g.stepRules.shardDefense], [300, 130]);
});

test("Parry % opens with Parry and Tower V's floor 30 Goal, adds 0.2% Parry % a level, and reaches a run inside at once", () => {
  const def = RESEARCH.parry;
  assert.deepEqual(def.requires, [{ upgrade: "parry" }, { goalUnlock: "parryPercent" }]);
  assert.deepEqual(def.categories, ["defense"]);
  assert.equal(def.levels.length, 50);
  assert.ok(def.levels.every((l) => l.effect.target === "parryPercent" && l.effect.op === "add" && l.effect.value === 2));
  // The curve the spec fits: 5k, ~10m at 11, ~100m at 19, ~1b at 33; n² + 55n − 3 minutes.
  assert.deepEqual([1, 2, 11, 19, 33, 50].map((n) => def.levels[n - 1]!.gold), [5000, 14_400, 10_100_000, 96_800_000, 997_000_000, 6_000_000_000]);
  assert.deepEqual([1, 2, 3, 4, 5, 50].map((n) => Math.round(def.levels[n - 1]!.hours * 60)), [53, 111, 171, 233, 297, 5247]);
  const save = owner(1e12);
  assert.equal(status(save, "parry"), "locked");
  save.goals.claimed[5] = [30];
  assert.equal(status(save, "parry"), "locked", "Parry first");
  save.upgrades.parry = 1;
  assert.equal(status(save, "parry"), "available");
  save.training.parry = 100;
  const trainedCut = loadout(save).parry;
  assert.equal(trainedCut, 50);
  save.archives.levels.parry = 50;
  assert.equal(loadout(save).parry, 60, "+10% at level 50");
  save.archives.levels.parry = 3;
  assert.equal(loadout(save).parry, 50.6, "tenths keep the sum exact");
  // A level completed mid-run reaches the hero at once, and undo keeps it.
  save.archives.levels = {};
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  g.clock = () => T0;
  g.newRun({ seed: 5 });
  assert.ok(g.move(0, 1));
  assert.ok(g.research.start(0, "parry"));
  g.clock = () => T0 + HOUR;
  g.research.settle();
  assert.equal(save.archives.levels.parry, 1);
  assert.equal(g.run.player.parry, 50.2, "inside the run already");
  assert.ok(g.undo());
  assert.equal(g.run.player.parry, 50.2, "undo takes back the step, not the research");
});

test("the Game's research commands need the Archives skill", () => {
  const save = owner();
  save.upgrades.archives = 0;
  const g = new Game(save);
  assert.equal(g.research.start(0, "heartDoorResilience"), false);
  assert.equal(g.research.hire(), false);
  g.save.upgrades.archives = 1;
  g.clock = () => T0;
  assert.ok(g.research.start(0, "heartDoorResilience"));
  assert.deepEqual(g.research.finishNow(0), [], "only in Dev mode");
  g.save.settings.devMode = true;
  assert.equal(g.research.finishNow(0).length, 1);
  assert.equal(g.save.archives.levels.heartDoorResilience, 1);
});

test("Rush completes an archivist's research for a Gem per ten minutes left, rounded up", () => {
  const g = new Game(owner());
  g.clock = () => T0;
  assert.equal(g.research.rushGems(0), 0, "nothing to rush while idle");
  assert.ok(g.research.start(0, "heartDoorResilience"));
  const job = g.save.archives.slots[0].job!;
  assert.equal(g.research.rushGems(0), Math.ceil((job.completesAt - T0) / 600_000));
  // 25 minutes left: two whole ten minutes and part of a third.
  const now = job.completesAt - 25 * 60_000;
  g.clock = () => now;
  assert.equal(g.research.rushGems(0), 3);
  g.save.gems = 2;
  assert.deepEqual(g.research.rush(0), [], "too few Gems");
  assert.equal(g.save.gems, 2);
  assert.equal(g.save.archives.levels.heartDoorResilience ?? 0, 0);
  g.save.gems = 5;
  assert.equal(g.research.rush(0).length, 1);
  assert.equal(g.save.gems, 2);
  assert.equal(g.save.archives.levels.heartDoorResilience, 1);
  assert.equal(g.save.archives.slots[0].job, undefined);
  // Dev free purchases rush for nothing.
  g.save.settings.freePurchases = true;
  assert.equal(g.research.rushGems(0), 0);
});

test("with Dev free purchases each press researches one level, even with auto-continue on", () => {
  const g = new Game(owner());
  g.clock = () => T0;
  g.save.settings.freePurchases = true;
  g.save.archives.slots[0].autoContinue = true;
  const id = RESEARCH_IDS.find((id) => status(g.save, id) === "available" && maxLevel(id) >= 3)!;
  assert.ok(g.research.start(0, id));
  assert.equal(researchLevel(g.save.archives, id), 1);
  assert.equal(g.save.archives.slots[0].job, undefined, "the archivist waits for the next press");
  assert.ok(g.research.start(0, id));
  assert.equal(researchLevel(g.save.archives, id), 2);
});

test("each project completed takes 1.5% off Rush", () => {
  const g = new Game(owner());
  g.clock = () => T0;
  assert.ok(g.research.start(0, "heartDoorResilience"));
  const base = g.research.rushGems(0);
  const done = RESEARCH_IDS.filter((id) => id !== "heartDoorResilience" && status(g.save, id) === "available").slice(0, 10);
  for (const id of done) g.save.archives.levels[id] = RESEARCH[id].levels.length;
  assert.equal(researchCompleted(g.save), done.length);
  assert.ok(done.length >= 2);
  assert.equal(g.research.rushGems(0), Math.ceil((base * 1000) / (1000 + 15 * done.length)));
});

test("a busy archivist switches research: its Gold back, its time kept, the new project paid and started", () => {
  const save = owner(1_000);
  save.upgrades.dash = 1;
  assert.ok(startResearch(save, 0, "heartDoorResilience", T0));
  assert.equal(save.gold, 500);
  assert.equal(cannotSwitch(save, 0, "heartDoorResilience"), "Already being researched.");
  assert.equal(switchResearch(save, 0, "heartDoorResilience", T0), false);
  assert.equal(cannotSwitch(save, 0, "dash"), null, "the job's Gold back pays for the new one");
  assert.equal(cannotStart(save, 0, "dash"), "That archivist is busy.");
  assert.ok(switchResearch(save, 0, "dash", T0 + 2 * HOUR));
  assert.equal(save.archives.slots[0].job?.research, "dash");
  assert.equal(save.gold, 1_000 - 250);
  assert.equal(save.archives.progress.heartDoorResilience, 0.25, "two of Heart Door Resilience's eight hours are kept");
  // Too little Gold, even with the job's back, changes nothing.
  save.gold = 0;
  assert.ok(cannotSwitch(save, 0, "heartDoorResilience"));
  assert.equal(switchResearch(save, 0, "heartDoorResilience", T0 + 3 * HOUR), false);
  assert.equal(save.archives.slots[0].job?.research, "dash");
});

test("ATK (+2%), DEF and Max HP (+3%), open with the Archives, and Shroud (+4%, to ×5) multiply the whole stat, on Pocket Money's schedule", () => {
  for (const [id, target, value, upgrade] of [["attack", "attackPercent", 2, "archives"], ["defense", "defensePercent", 3, "archives"], ["maxHp", "maxHpPercent", 3, "archives"], ["shroud", "shroudPercent", 4, "shroud"]] as const) {
    const def = RESEARCH[id];
    assert.deepEqual(def.requires, [{ upgrade }], id);
    assert.deepEqual(def.levels.map((l) => [l.gold, l.hours]), RESEARCH.pocketMoney.levels.map((l) => [l.gold, l.hours]), `${id}: Pocket Money's Gold and time`);
    assert.ok(def.levels.every((l) => l.effect.target === target && l.effect.op === "add" && l.effect.value === value), id);
  }
  const done = (id: ResearchId, level: number) => ({ ...defaultArchives(), levels: { [id]: level } }) as ReturnType<typeof defaultArchives>;
  assert.equal(researched(done("shroud", 100), "shroudPercent"), 500, "Shroud ×5 at level 100");
  // The loadout's whole stat is multiplied, and a run inside gains it as the level completes.
  const save = owner();
  save.upgrades.shroud = 1;
  const g = new Game(save);
  g.clock = () => T0;
  g.newRun({ seed: 5 });
  const before = loadout(save);
  save.archives.levels.attack = 10;
  save.archives.levels.defense = 10;
  save.archives.levels.maxHp = 10;
  save.archives.levels.shroud = 25;
  const after = loadout(save);
  assert.equal(after.attack, Math.round(before.attack * 1.2 * 1e6) / 1e6);
  assert.equal(after.maxHp, Math.round(before.maxHp * 1.3 * 1e6) / 1e6);
  assert.equal(after.shroud, Math.round(before.shroud * 2 * 1e6) / 1e6);
  save.archives.levels = {};
  const attack = g.run.player.attack;
  assert.ok(g.research.start(0, "attack"));
  g.clock = () => T0 + HOUR;
  g.research.settle();
  assert.equal(save.archives.levels.attack, 1);
  assert.equal(g.run.player.attack, Math.round(attack * 1.02 * 1e6) / 1e6, "inside the run already");
});

test("Training Discount opens with Tower II's floor 80 Goal: 99 levels of 0.5% off a trainer's Gold", () => {
  const def = RESEARCH.trainingDiscount, save = owner();
  assert.deepEqual(def.requires, [{ upgrade: "archives" }, { goalUnlock: "trainingDiscount" }]);
  assert.deepEqual(def.categories, ["economy"]);
  assert.equal(status(save, "trainingDiscount"), "locked");
  save.goals.claimed[2] = [80];
  assert.equal(status(save, "trainingDiscount"), "available");
  assert.equal(def.levels.length, 99);
  assert.ok(def.levels.every((l) => l.effect.target === "trainingDiscount" && l.effect.op === "add" && l.effect.value === 5));
  const gold = (n: number) => def.levels[n - 1]!.gold, minutes = (n: number) => def.levels[n - 1]!.hours * 60;
  assert.deepEqual([1, 12, 26, 59, 99].map(gold), [30, 9784, 103478, 1052319, 4144729], "about 10k at 12, 100k at 26, 1M at 59 and 4.2M at 99");
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => Math.round(minutes(n) * 10) / 10), [0.5, 6, 16, 31, 52, 80, 116]);
  assert.equal(minutes(50), 13554, "about 13,531 minutes at 50");
  assert.equal(Math.round(minutes(99) / 1440), 49, "49 days at 99");
  assert.ok(def.levels.every((l, i) => i === 0 || (l.gold > def.levels[i - 1]!.gold && l.hours > def.levels[i - 1]!.hours)), "each level dearer and longer");
  save.archives.levels.trainingDiscount = 99;
  assert.equal(researched(save.archives, "trainingDiscount"), 495, "49.5% off, in tenths of a percent");
});
