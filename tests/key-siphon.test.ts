import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { TRAINING, cost, levelForXp, trainingWorth, type StatTrainingRow } from "../src/config.ts";
import { deckCards, planHand } from "../src/cards.ts";
import { RESEARCH } from "../src/archives.ts";
import { loadout } from "../src/loadout.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Save } from "../src/entities.ts";

const defRow = TRAINING.find((t) => t.id === "defense")! as StatTrainingRow;

test("Rehearsed steps costs 5; Key Siphon (5) follows Into the depths, Regen Research (2) Key Siphon", () => {
  assert.equal(cost("inspirationUndos", 0), 5);
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["combatStance", "buildout", "training", "largerHand", "archives"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("keySiphon"), false, "waits for Into the depths");
  assert.ok(g.buy("delve"));
  assert.equal(g.buy("regenResearch"), false, "waits for Key Siphon");
  const before = g.save.tower.inspiration;
  assert.ok(g.buy("keySiphon"));
  assert.equal(before - g.save.tower.inspiration, 5);
  assert.ok(deckCards(g.save.upgrades).includes("keySiphon"), "its card joins the deck");
  assert.ok(g.buy("regenResearch"));
  assert.equal(before - g.save.tower.inspiration, 5 + 2);
});

test("Regen research: +3% Regen a level, priced and timed like Potion HP, needing Regen Research", () => {
  assert.deepEqual(RESEARCH.regen.requires, [{ upgrade: "regenResearch" }]);
  assert.deepEqual(RESEARCH.regen.levels.map((l) => [l.gold, l.hours]), RESEARCH.potionHp.levels.map((l) => [l.gold, l.hours]));
  assert.ok(RESEARCH.regen.levels.every((l) => l.effect.target === "regenPercent" && l.effect.op === "add" && l.effect.value === 3));
  const g = new Game(defaults());
  g.run.player.regen = 0.5;
  g.save.archives.levels.regen = 10;
  assert.equal(g.stepRules.regen, 0.65, "130% of 0.5");
});

/** A Tower corridor along the bottom row, the stairs at its east end, the
 * hero at its west end holding KEY SIPHON then STAIRS, with `ranks` of DEF
 * training. */
function corridor(ranks: number, edit: (save: Save) => void = () => {}) {
  const save = defaults();
  save.upgrades.keySiphon = 1;
  save.upgrades.inspirationUndos = 1;
  save.training.defense = ranks;
  edit(save);
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["keySiphon", "stairs"];
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 6; x++) w.cells.set(`${x},0`, { kind: "floor" });
  w.cells.set("6,0", { kind: "stairs" });
  w.cells.set("6,1", { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength: "normal" } });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}

test("KEY SIPHON trades a DEF training level for a yellow key without moving, until none are left", () => {
  const g = corridor(2), p = g.run.player, def = p.defense, keys = p.keys.yellow;
  const worth = trainingWorth(defRow, levelForXp(g.save.xp));
  assert.equal(g.siphonLevel, 2);
  g.autoTurn();
  assert.deepEqual([p.x, p.y], [0, 0], "no step");
  assert.equal(p.keys.yellow, keys + 1);
  assert.ok(Math.abs(p.defense - (def - worth)) < 1e-6, "the DEF one level is worth");
  assert.equal(g.run.loadout!.defense, p.defense);
  assert.equal(g.save.tower.history.length, 1, "a turn of its own");
  g.autoTurn();
  assert.equal(p.keys.yellow, keys + 2);
  assert.equal(g.siphonLevel, 0);
  assert.equal(g.canAct("keySiphon"), false);
  g.autoTurn();
  assert.deepEqual([p.x, p.y], [1, 0], "skipped: STAIRS moves the hero");
  assert.equal(p.keys.yellow, keys + 2);
  assert.equal(g.save.training.defense, 2, "the hero's own training is untouched");
});

test("undo takes a siphon back, and the next run starts with its DEF whole", () => {
  const g = corridor(1);
  const def = g.run.player.defense;
  g.autoTurn();
  assert.equal(g.run.siphoned, 1);
  assert.ok(g.undo());
  assert.equal(g.run.player.defense, def);
  assert.equal(g.run.siphoned, undefined);
  g.autoTurn();
  g.newRun({ seed: 8 });
  assert.equal(g.run.player.defense, loadout(g.save).defense);
  assert.equal(g.siphonLevel, 1);
});

test("DEF bought with Silver this run can be siphoned too; with no DEF training the card is skipped", () => {
  const none = corridor(0);
  assert.equal(none.canAct("keySiphon"), false);
  assert.equal(planHand(none, none.hand, "tower")?.card, 1, "STAIRS plays instead");
  const g = corridor(0, (s) => (s.upgrades.onTheJob = 1));
  g.run.silver = 100;
  assert.ok(g.trainInRun("defense"));
  assert.equal(g.siphonLevel, 1);
  assert.deepEqual(planHand(g, g.hand, "tower"), { card: 0, path: [] });
});

test("no siphon in the forest", () => {
  const g = corridor(3);
  g.newRun({ outside: true, seed: 9 });
  assert.equal(g.siphonLevel, 0);
  assert.equal(g.canAct("keySiphon"), false);
});
