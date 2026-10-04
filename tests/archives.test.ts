import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVISTS, HISTORY_LIMIT, RESEARCH, RESEARCH_CATEGORIES, RESEARCH_IDS, RESEARCH_TARGETS, cancelResearch, decodeArchives,
  defaultArchives, duration, hireArchivist, jobProgress, maxLevel, researchLevel, researched, settleArchives, startResearch, status, withNextLevel,
} from "../src/archives.ts";
import { UPGRADES } from "../src/config.ts";
import { decode, defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { formatDuration } from "../src/ui/archives-page.ts";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 8, 29, 15);

/** A profile with the Focus skill and `gold` Gold. */
function owner(gold = 100_000) {
  const save = defaults();
  save.upgrades.archives = 1;
  save.upgrades.focus = 1;
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
      if ("research" in r) assert.ok(r.research in RESEARCH && r.level <= RESEARCH[r.research as "focusCount"].levels.length, id);
    }
  }
  assert.equal(ARCHIVISTS.prices.length, ARCHIVISTS.maximum - ARCHIVISTS.start);
});

test("Focus Count: nine levels of 8 more hours each and 500 × n more Gold each", () => {
  const levels = RESEARCH.focusCount.levels;
  assert.deepEqual(levels.map((l) => l.hours), [8, 16, 24, 32, 40, 48, 56, 64, 72]);
  assert.deepEqual(levels.map((l) => l.gold), [500, 1000, 2000, 3500, 5500, 8000, 11000, 14500, 18500]);
  assert.ok(levels.every((l) => l.effect.target === "focusPerRun" && l.effect.op === "add" && l.effect.value === 1));
});

test("research waits on its requirements, and is paid for when it starts", () => {
  const save = owner(600);
  save.upgrades.focus = 0;
  assert.equal(status(save, "focusCount"), "locked");
  assert.equal(startResearch(save, 0, "focusCount", T0), false);
  save.upgrades.focus = 1;
  assert.equal(status(save, "focusCount"), "available");
  assert.ok(startResearch(save, 0, "focusCount", T0));
  assert.equal(save.gold, 100);
  assert.equal(status(save, "focusCount"), "active");
  assert.equal(save.archives.slots[0].job!.completesAt, T0 + 8 * HOUR);
  assert.equal(startResearch(save, 0, "focusCount", T0), false, "the archivist is busy");
});

test("research completes on the wall clock, however long the game was closed", () => {
  const save = owner();
  startResearch(save, 0, "focusCount", T0);
  assert.deepEqual(settleArchives(save, T0 + 8 * HOUR - 1), []);
  assert.equal(jobProgress(save.archives.slots[0].job!, T0 + 2 * HOUR), 0.25);
  assert.equal(jobProgress(save.archives.slots[0].job!, T0 - HOUR), 0, "a clock set back reads as no progress");
  const done = settleArchives(save, T0 + 100 * HOUR);
  assert.deepEqual(done, [{ at: T0 + 8 * HOUR, research: "focusCount", level: 1 }]);
  assert.equal(save.archives.levels.focusCount, 1);
  assert.equal(save.archives.slots[0].job, undefined, "without auto-continue the archivist waits");
  assert.equal(researched(save.archives, "focusPerRun", 1), 2);
});

test("auto-continue starts each next level the moment the last completes, while the Gold lasts", () => {
  const save = owner(500 + 1000 + 2000 + 100);
  save.archives.slots[0].autoContinue = true;
  startResearch(save, 0, "focusCount", T0);
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
  startResearch(save, 0, "focusCount", T0);
  settleArchives(save, T0 + 10_000 * HOUR);
  assert.equal(save.archives.levels.focusCount, 9);
  assert.equal(status(save, "focusCount"), "completed");
  assert.equal(researched(save.archives, "focusPerRun", 1), 10);
});

test("stopping research refunds it and keeps its time for later", () => {
  const save = owner(1000);
  startResearch(save, 0, "focusCount", T0);
  assert.ok(cancelResearch(save, 0, T0 + 6 * HOUR));
  assert.equal(save.gold, 1000, "the Gold comes back");
  assert.equal(save.archives.progress.focusCount, 0.75);
  assert.ok(startResearch(save, 0, "focusCount", T0 + 50 * HOUR));
  assert.equal(save.gold, 500, "starting again pays again");
  const job = save.archives.slots[0].job!;
  assert.equal(job.completesAt, T0 + 52 * HOUR, "2 of the 8 hours were left");
  assert.equal(save.archives.progress.focusCount, undefined);
});

test("research speed shortens the time a level takes, not the definition", () => {
  const a = defaultArchives();
  assert.equal(duration(a, { gold: 1, hours: 10, effect: { target: "researchSpeed", op: "add", value: 0.3 } }), 10 * HOUR);
  assert.equal(researched(a, "researchSpeed", 0.3), 0.3, "with nothing researched a target keeps its base");
  assert.equal(formatDuration(Math.round(10 * HOUR / 1.3)), "7h 41m");
});

test("archivists are hired one at a time for Gems, not Gold, up to the maximum", () => {
  assert.deepEqual(ARCHIVISTS.prices, [200, 500, 900, 1400]);
  const save = owner(1e9);
  save.gems = 199;
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
  const a = owner().archives, show = (archives: typeof a, t: "focusPerRun" | "potionHeal" | "trainingSpeed") =>
    RESEARCH_TARGETS[t].shown(researched(archives, t, RESEARCH_TARGETS[t].base));
  assert.deepEqual([show(a, "focusPerRun"), show(withNextLevel(a, "focusCount"), "focusPerRun")], ["1", "2"]);
  assert.deepEqual([show(a, "potionHeal"), show(withNextLevel(a, "potionHp"), "potionHeal")], ["100%", "103%"]);
  assert.equal(show(a, "trainingSpeed"), "100%");
  assert.equal(RESEARCH_TARGETS.trainingSpeed.name, "Training Speed");
  assert.equal(researchLevel(a, "focusCount"), 0, "the Archives themselves are left alone");
});

test("the Archives save and load, dropping anything malformed", () => {
  const save = owner();
  save.gems = ARCHIVISTS.prices[0];
  assert.ok(hireArchivist(save));
  save.archives.slots[1].autoContinue = true;
  startResearch(save, 1, "focusCount", T0);
  settleArchives(save, T0 + 8 * HOUR);
  startResearch(save, 0, "focusCount", T0 + 9 * HOUR);
  const loaded = decode(JSON.stringify(save));
  assert.deepEqual(loaded.archives, save.archives);
  assert.deepEqual(decodeArchives(null), defaultArchives());
  const bad = decodeArchives({
    slots: [{ job: { research: "focusCount", level: 3, startedAt: 0, completesAt: 1, paid: 5 } }, { job: { research: "nope" } }],
    levels: { focusCount: 99 },
    progress: { focusCount: 1.5 },
    history: [{ at: 1, research: "focusCount", level: 1 }, { at: -1, research: "focusCount", level: 1 }, "x"],
  });
  assert.deepEqual(bad.slots, [{ autoContinue: false }, { autoContinue: false }]);
  assert.deepEqual(bad.levels, {});
  assert.deepEqual(bad.progress, {});
  assert.deepEqual(bad.history, [{ at: 1, research: "focusCount", level: 1 }]);
  const twice = decodeArchives({ slots: [0, 1].map(() => ({ job: { research: "focusCount", level: 1, startedAt: 0, completesAt: 1, paid: 5 } })) });
  assert.equal(twice.slots.filter((s) => s.job).length, 1, "no project in two slots");
  assert.equal(decodeArchives({ history: Array.from({ length: 300 }, (_, i) => ({ at: i, research: "focusCount", level: 1 })) }).history.length, HISTORY_LIMIT);
});

test("Focus Count adds to the Focus uses each run starts with", () => {
  const g = new Game(owner());
  g.clock = () => T0;
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.focusLeft, 1);
  assert.ok(g.research.start(0, "focusCount"));
  g.clock = () => T0 + 8 * HOUR;
  assert.equal(g.research.settle().length, 1);
  assert.match(g.message, /Focus Count level 1 complete/);
  assert.equal(g.focusLeft, 2, "the forest shows what the next run gets");
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.focusLeft, 2);
});

test("a Focus Count level completed mid-run adds its use at once", () => {
  const g = new Game(owner());
  g.clock = () => T0;
  g.newRun({ outside: true, seed: 1 });
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.focusLeft, 1);
  assert.ok(g.research.start(0, "focusCount"));
  g.clock = () => T0 + 8 * HOUR;
  g.research.settle();
  assert.equal(g.focusLeft, 2, "inside the run already");
  g.run.focusUsed = 2;
  assert.equal(g.focusLeft, 0);
});

test("Potion HP: +3% a level for 100 levels; quick first levels, then the formula starts over at level 5", () => {
  const levels = RESEARCH.potionHp.levels;
  assert.equal(levels.length, 100);
  assert.deepEqual(levels.slice(0, 6).map((l) => l.gold), [10, 25, 50, 75, 100, 200]);
  assert.deepEqual(levels.slice(0, 6).map((l) => Math.round(l.hours * 3600)), [15, 60, 300, 600, 900, 1800]);
  assert.equal(levels[99].gold, 9_600);
  assert.equal(levels[99].hours, 24);
  assert.equal(levels.reduce((sum, l) => sum + l.gold, 0), 465_760);
  assert.deepEqual(levels.slice(0, 4).map((l) => duration(defaultArchives(), l)), [15_000, 60_000, 300_000, 600_000]);
  assert.ok(levels.every((l) => l.effect.target === "potionHeal" && l.effect.op === "add" && l.effect.value === 3));
  assert.deepEqual(RESEARCH_IDS.slice(0, 3), ["potionHp", "regen", "focusCount"], "listed first, Regen beside it, before Focus Count");
  assert.deepEqual(RESEARCH.potionHp.categories, ["defense"]);
});

test("Undo Count needs Rehearsed steps or Echoes of time, costs what Focus Count does, and each level stores one more undo at once", () => {
  const save = owner();
  const g = new Game(save);
  g.clock = () => T0;
  assert.deepEqual(
    RESEARCH.undoCount.levels.slice(0, 9).map(({ gold, hours }) => [gold, hours]),
    RESEARCH.focusCount.levels.map(({ gold, hours }) => [gold, hours]),
  );
  assert.equal(status(save, "undoCount"), "locked");
  assert.equal(g.research.start(0, "undoCount"), false);
  save.upgrades.inspirationUndos = 1;
  assert.equal(g.undoCapacity, 1);
  assert.ok(g.research.start(0, "undoCount"));
  g.clock = () => T0 + 8 * HOUR;
  assert.equal(g.research.settle().length, 1);
  assert.equal(g.undoCapacity, 2);
  save.archives.levels.undoCount = 5;
  assert.equal(g.undoCapacity, 1 + 5);
});

test("Undo Count opens 5 levels for each of Rehearsed steps and Echoes of time owned, either first", () => {
  for (const first of ["inspirationUndos", "undos"] as const) {
    const save = owner();
    const g = new Game(save);
    g.clock = () => T0;
    save.upgrades[first] = 1;
    assert.equal(maxLevel("undoCount", save.upgrades), 5, first);
    assert.equal(status(save, "undoCount"), "available");
    save.archives.levels.undoCount = 5;
    assert.equal(status(save, "undoCount"), "completed", "5 levels with one skill");
    assert.equal(g.research.start(0, "undoCount"), false);
    save.upgrades[first === "undos" ? "inspirationUndos" : "undos"] = 1;
    assert.equal(maxLevel("undoCount", save.upgrades), 10);
    assert.ok(g.research.start(0, "undoCount"), "the second skill opens 5 more");
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
  assert.equal(researched(save.archives, "potionHeal", 100), 400);
});

test("the Game's research commands need the Archives skill", () => {
  const save = owner();
  save.upgrades.archives = 0;
  const g = new Game(save);
  assert.equal(g.research.start(0, "focusCount"), false);
  assert.equal(g.research.hire(), false);
  g.save.upgrades.archives = 1;
  g.clock = () => T0;
  assert.ok(g.research.start(0, "focusCount"));
  assert.deepEqual(g.research.finishNow(0), [], "only in Dev mode");
  g.save.settings.devMode = true;
  assert.equal(g.research.finishNow(0).length, 1);
  assert.equal(g.save.archives.levels.focusCount, 1);
});

test("Rush completes an archivist's research for a Gem per ten minutes left, rounded up", () => {
  const g = new Game(owner());
  g.clock = () => T0;
  assert.equal(g.research.rushGems(0), 0, "nothing to rush while idle");
  assert.ok(g.research.start(0, "focusCount"));
  const job = g.save.archives.slots[0].job!;
  assert.equal(g.research.rushGems(0), Math.ceil((job.completesAt - T0) / 600_000));
  // 25 minutes left: two whole ten minutes and part of a third.
  const now = job.completesAt - 25 * 60_000;
  g.clock = () => now;
  assert.equal(g.research.rushGems(0), 3);
  g.save.gems = 2;
  assert.deepEqual(g.research.rush(0), [], "too few Gems");
  assert.equal(g.save.gems, 2);
  assert.equal(g.save.archives.levels.focusCount ?? 0, 0);
  g.save.gems = 5;
  assert.equal(g.research.rush(0).length, 1);
  assert.equal(g.save.gems, 2);
  assert.equal(g.save.archives.levels.focusCount, 1);
  assert.equal(g.save.archives.slots[0].job, undefined);
  // Dev free purchases rush for nothing.
  g.save.settings.freePurchases = true;
  assert.equal(g.research.rushGems(0), 0);
});
