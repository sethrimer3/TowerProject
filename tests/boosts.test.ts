import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { BOOST_IDS, BOOST_MS, SCARAB_COOLDOWN_SECONDS, SCARAB_MISSED_FLOORS, countdown, scaledBoost } from "../src/boosts/catalog.ts";
import {
  addBoost, boostDuration, boostFactor, boostPlus, decodeBoosts, openBoosts, rollBoost, scarabCooldown, trainingDoneAt, trainingLeft,
} from "../src/boosts/boosts.ts";
import { decodeScarabDrop, defaultScarabDrop, scarabDraw } from "../src/boosts/scarabs.ts";
import { doneAfter, repaced, workBetween, type Pace } from "../src/boosts/pace.ts";
import { RESEARCH, jobProgress, repaceResearch, researchPace, researched, startResearch } from "../src/progression/archives.ts";
import { goldMultipliers, goldMultiplierTotal } from "../src/economy/gold-multipliers.ts";
import { RunPurse } from "../src/game/run-purse.ts";

const MINUTE = 60_000, NOW = 1_000_000;

test("a boost's value: a factor raised as a whole by Golden Scarab Effect, or steps and tiles rounded down", () => {
  assert.equal(scaledBoost("gold", 100), 1.5);
  assert.equal(scaledBoost("gold", 150), 2.25);
  assert.equal(scaledBoost("gold", 300), 4.5, "three times the base at most");
  assert.equal(scaledBoost("gemBank", 300), 6);
  assert.equal(scaledBoost("speed", 100), 1);
  assert.equal(scaledBoost("speed", 198), 1);
  assert.equal(scaledBoost("speed", 300), 3);
  assert.equal(scaledBoost("endRush", 150), 4);
  assert.equal(scaledBoost("endRush", 300), 9);
  assert.equal(countdown(12 * MINUTE), "12:00");
  assert.equal(countdown(5_001), "0:06", "rounded up to the second");
  assert.equal(countdown(62 * MINUTE + 30_000), "1:02:30");
});

test("time adds onto a boost still running, and starts afresh from now once it has run out", () => {
  const save = defaults();
  assert.equal(boostFactor(save, "gold", NOW), 1);
  addBoost(save, "gold", BOOST_MS, NOW);
  addBoost(save, "gold", BOOST_MS, NOW + MINUTE);
  assert.equal(save.boosts.gold, NOW + 2 * BOOST_MS, "12 minutes more on top of what was left");
  assert.equal(boostFactor(save, "gold", NOW + 2 * BOOST_MS - 1), 1.5);
  assert.equal(boostFactor(save, "gold", NOW + 2 * BOOST_MS), 1, "over");
  addBoost(save, "gold", BOOST_MS, NOW + 3 * BOOST_MS);
  assert.equal(save.boosts.gold, NOW + 4 * BOOST_MS);
  addBoost(save, "endRush", BOOST_MS, NOW);
  assert.equal(boostPlus(save, "endRush", NOW), 3);
  assert.equal(boostPlus(save, "speed", NOW), 0);
});

test("a Golden Scarab picks only among the boosts whose features are open", () => {
  const save = defaults();
  assert.deepEqual(openBoosts(save), ["gold", "xp", "cardXp", "speed"]);
  save.upgrades.archives = 1;
  save.trainers = 1;
  save.upgrades.endRush = 1;
  save.equipment.unlocked = true;
  save.upgrades.gemCard = 1;
  assert.ok(!openBoosts(save).includes("rubies") && !openBoosts(save).includes("cells"), "not before one is earned");
  save.profile.earned.rubies = 1;
  save.profile.earned.cells = 0.5;
  assert.deepEqual(openBoosts(save), BOOST_IDS);
  // Game Speed only while the speed arrows can go faster than they reach.
  save.upgrades.speedUp = 1;
  save.archives.levels.moveSpeed = RESEARCH.moveSpeed.levels.length;
  assert.equal(openBoosts(save).includes("speed"), researched(save.archives, "moveSpeed") + 1 < 15);
  const picked = new Set(Array.from({ length: 200 }, (_, i) => rollBoost(save, () => (i % 100) / 100)));
  assert.deepEqual([...picked].sort(), [...openBoosts(save)].sort(), "each open boost can be picked");
});

test("Golden Scarab research: Effect to ×3, Duration to ×3 (36 minutes), Cooldown 3 minutes off (12)", () => {
  assert.deepEqual([RESEARCH.scarabEffect, RESEARCH.scarabDuration, RESEARCH.scarabCooldown].map((r) => r.levels.length), [100, 100, 90]);
  for (const r of [RESEARCH.scarabEffect, RESEARCH.scarabDuration, RESEARCH.scarabCooldown]) {
    assert.deepEqual(r.requires, [{ upgrade: "goldenScarab" }]);
    assert.ok(r.levels.every((l, i) => i === 0 || (l.gold >= r.levels[i - 1]!.gold && l.hours >= r.levels[i - 1]!.hours)), "each level dearer and longer");
  }
  const save = defaults();
  assert.equal(boostDuration(save), 12 * MINUTE);
  assert.equal(scarabCooldown(save), SCARAB_COOLDOWN_SECONDS * 1000);
  save.archives.levels.scarabEffect = 100;
  save.archives.levels.scarabDuration = 100;
  save.archives.levels.scarabCooldown = 90;
  assert.equal(boostDuration(save), 36 * MINUTE);
  assert.equal(scarabCooldown(save), 12 * MINUTE);
  addBoost(save, "xp", MINUTE, NOW);
  assert.equal(boostFactor(save, "xp", NOW), 4.5);
});

test("the Gold line: a Golden Scarab's Gold multiplies the Level-up Boost, listed only while it runs", () => {
  const save = defaults(), context = { save, mode: "tower" as const, tier: 1, now: NOW, levelBoostUntil: NOW + MINUTE };
  assert.ok(!goldMultipliers(context).some((m) => m.id === "scarab"));
  const before = goldMultiplierTotal(goldMultipliers(context));
  addBoost(save, "gold", BOOST_MS, NOW);
  const lines = goldMultipliers(context);
  assert.deepEqual(lines.find((m) => m.id === "scarab"), { id: "scarab", name: "Golden Scarab", factor: 1.5 });
  assert.equal(goldMultiplierTotal(lines), before * 1.5, "×3 and ×1.5 make ×4.5");
});

test("pace: work over rate windows, and the time it takes, are each other's inverse", () => {
  const pace: Pace = { rate: 1, windows: [{ until: 1000, factor: 2 }, { until: 3000, factor: 1.5 }] };
  assert.equal(workBetween(0, 1000, pace), 3000);
  assert.equal(workBetween(1000, 3000, pace), 3000);
  assert.equal(workBetween(3000, 4000, pace), 1000);
  for (const work of [0, 500, 3000, 6000, 9000]) assert.equal(Math.round(workBetween(0, doneAfter(work, 0, pace), pace)), work);
  const none: Pace = { rate: 1, windows: [] };
  assert.equal(repaced(10_000, 0, none, pace), 7_000, "10 s of work: 3 s in the first second, 3 in the next two, 4 after");
});

test("Training Speed: ranks in training keep the work they have left and finish sooner", () => {
  const g = new Game(defaults());
  g.clock = () => NOW;
  Object.assign(g.save, { trainers: 1, gold: 1e9 });
  g.save.upgrades.trainers = 1;
  const id = "defense";
  assert.ok(g.training.trainWithGold(id));
  const job = g.save.trainingJobs[0]!, due = job.completesAt, left = g.training.left(id);
  assert.ok(left > 0);
  g.boostStarting("training", () => addBoost(g.save, "training", BOOST_MS, NOW));
  assert.ok(job.completesAt < due, "due sooner");
  assert.ok(Math.abs(g.training.left(id) - left) <= 1, "the same training left");
  // A rank needing less than the boost's time finishes at 1.5 times the pace.
  const pace = g.training.pace;
  assert.equal(trainingDoneAt(MINUTE * 1.5, NOW, pace), NOW + MINUTE);
  assert.equal(Math.round(trainingLeft(NOW + MINUTE, NOW, pace)), MINUTE * 1.5);
});

test("Research Speed: research under way keeps its share done, and research started during it is quicker", () => {
  const save = defaults();
  Object.assign(save, { gold: 1e12 });
  save.upgrades.archives = 1;
  save.upgrades.goldenScarab = 1;
  assert.ok(startResearch(save, 0, "scarabEffect", NOW));
  const job = save.archives.slots[0]!.job!, whole = job.completesAt - job.startedAt;
  const half = NOW + Math.round(whole / 2);
  // The boost starts halfway: the pace changes from none to ×1.5, as a claim retimes it.
  const before = researchPace(save);
  addBoost(save, "research", BOOST_MS, half);
  repaceResearch(save, before, half);
  assert.ok(Math.abs(jobProgress(job, half) - 0.5) < 0.001, "half done still");
  const rest = whole / 2, boosted = Math.min(BOOST_MS, rest / 1.5);
  assert.ok(Math.abs(job.completesAt - (half + boosted + (rest - boosted * 1.5))) <= 1, "the boosted part goes ×1.5");
  // Research started while it runs is quicker from the start.
  const other = defaults();
  Object.assign(other, { gold: 1e12, boosts: { ...save.boosts } });
  other.upgrades.archives = 1;
  other.upgrades.goldenScarab = 1;
  assert.ok(startResearch(other, 0, "scarabEffect", half));
  const quick = other.archives.slots[0]!.job!;
  assert.ok(quick.completesAt - half < whole, "sooner than without the boost");
  assert.equal(jobProgress(quick, half), 0);
});

test("in a run, the first Golden Scarab waits out a cooldown, then lies out of the way and gives a boost when touched", () => {
  const g = arena();
  g.move(1, 0);
  assert.equal(g.scarabFinder.scarab, null, "none on a new profile's first floor");
  assert.equal(g.save.scarab.readyAt, NOW + SCARAB_COOLDOWN_SECONDS * 1000);
  // Once ready, the next new floor has one.
  g.save.scarab.readyAt = 1;
  g.save.scarab.reached.tower = null;
  g.move(0, 1);
  const s = g.scarabFinder.scarab!;
  assert.ok(s, "one on the new floor");
  assert.equal(g.world.tile(s.x, s.y).kind, "floor");
  assert.ok(!g.gemFinder.gems.some((gem) => gem.x === s.x && gem.y === s.y), "never on a Gem");
  assert.equal(g.scarabFinder.collectAt(s.x === 2 ? 3 : 2, 4), null, "no scarab there");
  const claim = g.scarabFinder.collectAt(s.x, s.y)!;
  assert.ok(claim);
  assert.equal(claim.ms, BOOST_MS);
  assert.equal(g.save.boosts[claim.id], NOW + BOOST_MS);
  assert.deepEqual(g.scarabFinder.claims, [claim], "queued for the drop animation");
  assert.equal(g.scarabFinder.scarab, null);
  assert.equal(g.save.scarab.readyAt, NOW + SCARAB_COOLDOWN_SECONDS * 1000, "the cooldown starts again");
  assert.ok(g.scarabFinder.sparkle);
  assert.equal(g.scarabFinder.collectAt(s.x, s.y), null, "only once");
});

test("a Golden Scarab left behind is missed, and another comes three new floors on", () => {
  const d = defaultScarabDrop();
  const { reachTimedFloor } = timedDrop;
  assert.ok(reachTimedFloor(d, { mode: "tower", seed: 7, floor: 0 }, 0, SCARAB_MISSED_FLOORS));
  d.out = { mode: "tower", seed: 7, floor: 0, x: 3, y: 3 };
  const found: number[] = [];
  for (let floor = 1; floor <= 6; floor++) if (reachTimedFloor(d, { mode: "tower", seed: 7, floor }, 0, SCARAB_MISSED_FLOORS)) {
    found.push(floor);
    d.out = { mode: "tower", seed: 7, floor, x: 3, y: 3 };
  }
  assert.deepEqual(found, [3, 6]);
});
const timedDrop = await import("../src/economy/timed-drop.ts");

test("boosts tap XP, Card XP and Game Speed while they run", () => {
  const g = new Game(defaults());
  g.clock = () => NOW;
  g.addXp(10);
  const xp = g.save.xp;
  addBoost(g.save, "xp", BOOST_MS, NOW);
  g.addXp(10);
  assert.equal(g.save.xp - xp, 15);
  g.gainCardXp("stairs", 10);
  const card = g.save.cardXp.stairs ?? 0;
  addBoost(g.save, "cardXp", BOOST_MS, NOW);
  g.gainCardXp("stairs", 10);
  assert.equal((g.save.cardXp.stairs ?? 0) - card, 15);
  g.save.settings.speed = 2;
  const rate = g.moveRate;
  addBoost(g.save, "speed", BOOST_MS, NOW);
  assert.equal(g.moveRate, rate + 1);
  g.save.settings.speed = 0;
  assert.equal(g.moveRate, 0, "a paused hero stays paused");
});

test("Rubies and Cells: those found are ×1.5 while their boost runs", () => {
  const save = defaults();
  const purse = new RunPurse(save, "tower", save.tower.run ?? defaults().tower.run!, () => 0.5, NOW);
  assert.equal(purse.bankRubies(2), 2);
  addBoost(save, "rubies", BOOST_MS, NOW);
  assert.equal(purse.bankRubies(2), 3);
  assert.equal(save.rubies, 5);
  assert.equal(save.profile.earned.rubies, 5);
  addBoost(save, "cells", BOOST_MS, NOW);
  assert.equal((purse as any).bankCells(1), 1.5);
  assert.equal(save.cells, 1.5);
});

test("the boosts and scarabs decode field by field, and the pick stream carries on across a reload", () => {
  assert.deepEqual(decodeBoosts({ gold: NOW, xp: -3, speed: 1.5, nope: 4 }), { gold: NOW });
  assert.deepEqual(decodeBoosts("x"), {});
  const d = defaultScarabDrop();
  Object.assign(d, { readyAt: 1.7e12, wait: 2, out: { mode: "delve", seed: 4, floor: 3, x: 29, y: 140 }, reached: { tower: null, delve: { seed: 4, floor: 3 } }, rng: 99 });
  assert.deepEqual(decodeScarabDrop(JSON.parse(JSON.stringify(d))), d);
  assert.deepEqual(decodeScarabDrop({ wait: 9, rng: -1 }), defaultScarabDrop());
  const a = { ...d }, b = decodeScarabDrop(JSON.parse(JSON.stringify(d)));
  assert.deepEqual([scarabDraw(a), scarabDraw(a)], [scarabDraw(b), scarabDraw(b)]);
  const save = defaults();
  addBoost(save, "research", BOOST_MS, NOW);
  assert.deepEqual(decode(JSON.stringify(save)).boosts, { research: NOW + BOOST_MS });
});

/** A Tower run on an open 5×5 floor, stairs in the far corner. */
function arena() {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  g.clock = () => NOW;
  return g;
}
