import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { cost, schedulePrice, trainedAmount, trainingDef, UPGRADES } from "../src/config.ts";
import { trainingGold } from "../src/progression/training-jobs.ts";
import { skillAvailable, TREES } from "../src/progression/skill-trees.ts";
import { healAfterVictory, hpCeiling, regenerate, resolveStep, POTION_HEAL, type StepEffect, type StepRules } from "../src/step-effects.ts";
import { boostMaxHp, shiftHero } from "../src/progression/hero-stats.ts";
import { potionShade, type Player, type Tile } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Save } from "../src/save/shape.ts";

const hero = (hp: number, extra: Partial<Player> = {}): Player =>
  ({ x: 0, y: 0, hp, maxHp: 1000, attack: 50, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...extra });
const rules = (overheal?: number): StepRules => ({ potionHeal: 100, percentPotion: 100, regen: 0, ...(overheal ? { overheal } : {}) });
const healed = (p: Player, t: Tile, r: StepRules) => resolveStep(p, t, r) as StepEffect;

test("Overheal is a 20-Courage skill between Max Interest and Refocus", () => {
  const row = UPGRADES.find((u) => u.id === "overheal")!;
  assert.deepEqual([row.currency, row.max, cost("overheal", 0)], ["courage", 1, 20]);
  const nodes = TREES.find((t) => t.id === "courage")!.nodes;
  assert.deepEqual(nodes.find((n) => n.id === "overheal")!.requires, ["maxInterest"]);
  assert.deepEqual(nodes.find((n) => n.id === "refocus")!.requires, ["overheal"]);
  const s = defaults();
  Object.assign(s.upgrades, { delve: 1, moveSpeed: 1, focus: 1, findYellowKey: 1, keyEfficiency: 1, interest: 1, maxInterest: 1 });
  assert.equal(skillAvailable("refocus", s.upgrades), false, "Refocus waits on Overheal");
  assert.ok(skillAvailable("overheal", s.upgrades));
  s.upgrades.overheal = 1;
  assert.ok(skillAvailable("refocus", s.upgrades));
});

test("Overheal training is ×1 until the skill, then 0.031 more a rank, ×16.5 at its 500", () => {
  const s = defaults();
  s.training.overheal = 10;
  assert.equal(trainedAmount(s, "overheal"), 1000, "nothing above max without the skill");
  s.upgrades.overheal = 1;
  assert.deepEqual([0, 1, 10, 500].map((n) => trainedAmount(s, "overheal", n)), [1000, 1031, 1310, 16500]);
  assert.equal(trainingDef("overheal").group, "utility");
  assert.equal(trainingDef("overheal").max, 500);
});

test("Overheal's ranks cost the same in Silver and a trainer's Gold, 1,000 to over 150 billion", () => {
  const row = trainingDef("overheal");
  const price = (n: number) => schedulePrice(row.silver, n - 1);
  assert.equal(price(1), 1000);
  assert.ok(Math.abs(price(10) - 21_000) < 1000, `about 21k for the 10th (${price(10)})`);
  for (const [n, over] of [[40, 5e6], [150, 1e9], [250, 1e10], [450, 1e11], [500, 1.5e11]]) assert.ok(price(n) > over, `rank ${n}: ${price(n)}`);
  for (let n = 2; n <= 500; n++) assert.ok(price(n) > price(n - 1), `rank ${n} dearer than the one before`);
  for (const n of [1, 10, 40, 150, 500]) assert.equal(trainingGold(row, n - 1), price(n), `the trainer's Gold for rank ${n}`);
});

test("potions, regular and percent, heal above max HP up to the Overheal ceiling", () => {
  const plain: Tile = { kind: "potion", color: "blue" }, percent: Tile = { kind: "potion", color: "red" };
  assert.equal(hpCeiling(1000, {}), 1000);
  assert.equal(hpCeiling(1000, { overheal: 1310 }), 1310);
  assert.equal(healed(hero(1000), plain, rules()).healed, 0, "without Overheal a potion stops at max HP");
  assert.equal(healed(hero(1000), plain, rules(1310)).player.hp, 1000 + POTION_HEAL);
  assert.equal(healed(hero(1000), percent, rules(1310)).player.hp, 1000 + POTION_HEAL + 10, "35 and 1% of max HP");
  assert.equal(healed(hero(1300), plain, rules(1310)).healed, 10, "up to the ceiling");
  assert.equal(healed(hero(1310), percent, rules(1310)).healed, 0);
  assert.equal(healed(hero(990), plain, rules(1310)).player.hp, 1025, "from below max past it");
});

test("Regen, the victory heal and Lifesteal never heal above max HP, nor lower HP above it", () => {
  const r = { ...rules(1310), regen: 5, victoryHeal: 10 };
  assert.equal(regenerate(998, 1000, r), 1000);
  assert.equal(regenerate(1100, 1000, r), 1100);
  assert.equal(healAfterVictory(1100, 1000, r), 1100);
  assert.equal(healAfterVictory(995, 1000, r), 1000);
  // A one-strike fight with Lifesteal against an enemy that never answers.
  const weak = { attack: 0, defense: 0, hp: 10, x: 0, y: 0 } as never;
  assert.equal(healed(hero(1100, { lifesteal: 50 }), { kind: "enemy", enemy: weak }, r).player.hp, 1100);
});

test("max HP changing keeps HP above it within the new Overheal ceiling", () => {
  const run = { player: hero(1200) } as never as Parameters<typeof shiftHero>[0];
  shiftHero(run, { maxHp: 100 }, 1310);
  assert.deepEqual([run.player.maxHp, run.player.hp], [1100, 1300], "more max HP adds the HP to fill it");
  shiftHero(run, { maxHp: -900 }, 1310);
  assert.deepEqual([run.player.maxHp, run.player.hp], [200, 262], "less leaves no more than the new ceiling");
  const plain = { player: hero(1200) } as never as Parameters<typeof shiftHero>[0];
  shiftHero(plain, { maxHp: -100 });
  assert.equal(plain.player.hp, 900, "without Overheal, no more than the new max");
  const boosted = { player: hero(1200) } as never as Parameters<typeof boostMaxHp>[0];
  boostMaxHp(boosted, 10);
  assert.deepEqual([boosted.player.maxHp, boosted.player.hp], [1100, 1320], "a Max HP boost keeps the share above max");
});

/** A Game on a cleared floor with Overheal owned and trained `ranks`. */
function overhealGame(ranks: number, edit: (s: Save) => void = () => {}) {
  const s = defaults();
  Object.assign(s.upgrades, { overheal: 1, inspirationUndos: 1 });
  s.training.overheal = ranks;
  edit(s);
  const g = new Game(s);
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x <= 12; x++) w.cells.set(`${x},0`, { kind: "floor" });
  w.torches = [];
  Object.assign(g.run.player, { x: 6, y: 0 });
  return g;
}

test("the game reads Overheal at the step: a potion drunk at full HP rises above max", () => {
  const g = overhealGame(100), p = g.run.player;
  assert.equal(g.stepRules.overheal, 4100);
  assert.equal(g.hpCeiling, (p.maxHp * 4100) / 1000);
  (g.world as RoomWorld).cells.set("6,1", { kind: "potion", color: "blue" });
  p.hp = p.maxHp;
  assert.ok(g.move(0, 1));
  assert.equal(g.run.player.hp, p.maxHp + POTION_HEAL);
  assert.ok(g.undo());
  assert.equal(g.run.player.hp, g.run.player.maxHp, "undo takes the heal back");
  // Up to the ceiling only.
  const full = overhealGame(100);
  (full.world as RoomWorld).cells.set("6,1", { kind: "potion", color: "red" });
  full.run.player.hp = full.hpCeiling - 5;
  assert.ok(full.move(0, 1));
  assert.equal(full.run.player.hp, full.hpCeiling);
  assert.equal(overhealGame(0).stepRules.overheal, undefined, "no ranks, nothing above max");
});

test("GK TO HP may heal above max HP by Overheal", () => {
  const g = overhealGame(10);
  g.run.hand = ["keyToHp", "stairs"];
  const p = g.run.player;
  p.keys.yellow = 1;
  p.hp = p.maxHp;
  assert.ok(g.handRules.canAct("keyToHp"), "room above max for 10% of it");
  g.autoTurn();
  assert.ok(Math.abs(p.hp - p.maxHp * 1.1) < 1e-6);
  const none = overhealGame(0);
  none.run.hand = ["keyToHp", "stairs"];
  none.run.player.keys.yellow = 1;
  assert.equal(none.handRules.canAct("keyToHp"), false, "full HP, no Overheal");
});

test("a regular potion is drawn red, like the HP bar, and a percent potion blue, like the Overheal bar", () => {
  assert.equal(potionShade({ color: "blue" }), "red");
  assert.equal(potionShade({}), "red");
  assert.equal(potionShade({ color: "red" }), "blue");
});

test("a saved run may hold HP above max by Overheal", () => {
  const g = overhealGame(10), hp = g.run.player.maxHp * 1.2;
  g.run.player.hp = hp;
  assert.equal(decode(JSON.stringify(g.save)).tower.run?.player.hp, hp);
});
