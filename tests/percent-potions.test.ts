import { trainNow } from "./train-now.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { withPotions } from "../src/board.ts";
import { resolveStep, POTION_HEAL, type StepEffect } from "../src/step-effects.ts";
import { percentPotionChance, potionPercent, trainingPoints, trainingStep } from "../src/loadout.ts";
import { xpForLevel } from "../src/config.ts";
import type { Player, Tile } from "../src/entities.ts";

const redPotions = (tiles: Iterable<Tile>) => [...tiles].filter((t) => t.kind === "potion" && t.color === "red").length;
const boardTiles = (b: { tile(x: number, y: number): Tile }, w: number, y0: number, y1: number) => {
  const out: Tile[] = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) out.push(b.tile(x, y));
  return out;
};

test("a percent potion restores its HP and a share of max HP, which Potion HP leaves alone", () => {
  const p: Player = { x: 0, y: 0, hp: 1, maxHp: 1000, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  const heal = (t: Tile, potionHeal: number, percentPotion: number) =>
    (resolveStep(p, t, { potionHeal, percentPotion }) as StepEffect).healed;
  assert.equal(heal({ kind: "potion", color: "red" }, 100, 100), POTION_HEAL + 10, "35 and 1% of 1000");
  assert.equal(heal({ kind: "potion", color: "red" }, 200, 150), POTION_HEAL + 15, "Potion HP doubles only the regular potion");
  assert.equal(heal({ kind: "potion", color: "blue" }, 200, 150), 70);
  assert.equal(heal({ kind: "potion", color: "red" }, 100, 125), POTION_HEAL + 12.5, "the half kept");
});

test("Recovery opens percent potions at 1%, and Potion % training adds 0.25% a rank", () => {
  const s = defaults();
  s.xp = xpForLevel(2);
  assert.equal(potionPercent(s), 0);
  const g = new Game(s);
  assert.equal(trainNow(g, "potion"), false, "the row waits on Recovery");
  s.upgrades.recovery = 1;
  assert.equal(potionPercent(s), 100);
  assert.deepEqual((({ now, next, worth, unit }) => ({ now, next, worth, unit }))(trainingStep(s, "potion")), { now: 1, next: 1.25, worth: 0.25, unit: "%" });
  const left = trainingPoints(s).left;
  assert.ok(trainNow(g, "potion"));
  assert.equal(trainingPoints(s).left, left - 1, "one point a rank");
  assert.equal(potionPercent(s), 125);
  assert.equal(g.stepRules.percentPotion, 125);
});

test("a board's potions are percent potions by the run's chance, a higher one only adding more", () => {
  const blue: Tile = { kind: "potion", color: "blue" }, sized: Tile = { kind: "potion", amount: 60 };
  assert.equal(withPotions(blue, 3, 4, 9, 0), blue, "none without a chance");
  assert.deepEqual(withPotions(blue, 3, 4, 9, 10000), { kind: "potion", color: "red" });
  assert.equal(withPotions(sized, 3, 4, 9, 10000), sized, "a pocket's sized potion never is one");
  const floors = (chance?: number) => {
    const out: Tile[] = [];
    for (let seed = 1; seed <= 30; seed++) for (let room = 0; room < 6; room++) out.push(...boardTiles(new RoomWorld(seed, room, {}, chance), 17, 0, 17));
    return out;
  };
  const reds = (chance: number) => new Set(floors(chance).flatMap((t, i) => (t.kind === "potion" && t.color === "red" ? [i] : [])));
  const low = reds(200), mid = reds(1000), high = reds(2000);
  assert.equal(reds(0).size, 0);
  assert.ok(low.size > 0, "some percent potions at 2%");
  assert.ok(low.size < mid.size && mid.size < high.size);
  assert.ok([...low].every((i) => mid.has(i)) && [...mid].every((i) => high.has(i)), "a higher chance keeps every percent potion");
  const potions = floors().filter((t) => t.kind === "potion").length;
  assert.ok(high.size > potions * 0.1 && high.size < potions * 0.3, `${high.size} of ${potions} at 20%`);
});

test("the Delve's guard potions are percent potions by the run's chance", () => {
  const run = (percentPotions: number) => ({ seed: 7, changes: {}, floor: 0, milestone: 0, percentPotions });
  const shown = boardTiles(new World(run(5000)), 30, 0, 200), hidden = boardTiles(new World(run(0)), 30, 0, 200);
  const plain = shown.filter((t) => t.kind === "potion" && t.amount === undefined);
  const reds = redPotions(plain);
  assert.ok(plain.length >= 10 && reds > plain.length * 0.25 && reds < plain.length * 0.75, `${reds} of ${plain.length} at 50%`);
  assert.equal(redPotions(hidden), 0);
  assert.equal(redPotions(shown.filter((t) => t.kind === "potion" && t.amount !== undefined)), 0, "pocket potions stay regular");
  assert.equal(hidden.filter((t) => t.kind === "potion").length, shown.filter((t) => t.kind === "potion").length);
});

test("percent potions come at 2% with Recovery; Find Potion training adds 0.25% a rank, up to 20%", () => {
  const s = defaults();
  s.xp = xpForLevel(40);
  const g = new Game(s);
  assert.equal(percentPotionChance(s), 0);
  s.upgrades.recovery = 1;
  assert.equal(percentPotionChance(s), 200);
  assert.equal(trainNow(g, "findPotion"), false, "the row waits on Find Potion");
  s.upgrades.findPotion = 1;
  const step = () => (({ now, next, worth, unit, maxed }) => ({ now, next, worth, unit, maxed }))(trainingStep(s, "findPotion"));
  assert.deepEqual(step(), { now: 2, next: 2.25, worth: 0.25, unit: "%", maxed: false });
  const left = trainingPoints(s).left;
  assert.ok(trainNow(g, "findPotion"));
  assert.equal(trainingPoints(s).left, left - 1, "one point a rank");
  assert.equal(percentPotionChance(s), 225);
  s.training.findPotion = 71;
  assert.ok(trainNow(g, "findPotion"));
  assert.equal(percentPotionChance(s), 2000);
  assert.equal(trainNow(g, "findPotion"), false, "72 ranks at most");
  assert.equal(s.training.findPotion, 72);
  assert.deepEqual(step(), { now: 20, next: 20, worth: 0.25, unit: "%", maxed: true });
  assert.equal(trainingStep(s, "findPotion").affordable, false);
});

test("a run fixes its chance of percent potions when it goes inside, from what was bought in the forest", () => {
  const g = new Game(defaults());
  g.save.xp = xpForLevel(5);
  g.newRun({ outside: true, seed: 3 });
  g.save.tower.inspiration = 100;
  for (const id of ["combatStance", "buildout", "training", "largerHand", "archives", "delve", "greaterHeal", "recovery", "findPotion"] as const) assert.ok(g.buy(id), id);
  assert.ok(trainNow(g, "findPotion") && trainNow(g, "findPotion"));
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 20 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
  assert.equal(g.run.percentPotions, 250);
  assert.ok(trainNow(g, "findPotion"));
  assert.equal(g.run.percentPotions, 250, "training inside waits for the next run");
  const without = new Game(defaults());
  without.newRun({ seed: 3 });
  assert.equal(without.run.percentPotions, undefined);
});
