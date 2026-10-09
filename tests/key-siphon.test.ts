import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { TRAINING, cost, trained, type StatTrainingRow } from "../src/config.ts";
import { deckCards, planHand } from "../src/cards.ts";
import { RESEARCH } from "../src/archives.ts";
import { loadout } from "../src/loadout.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Save } from "../src/entities.ts";

const hpRow = TRAINING.find((t) => t.id === "hp")! as StatTrainingRow;

test("Rehearsed steps costs 5; Key Siphon (5) follows Into the depths, Buy Quantity (5) Key Siphon, Regen Research (10) Shroud", () => {
  assert.equal(cost("inspirationUndos", 0), 5);
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["combatStance", "buildout", "trainers", "critical", "archives"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("keySiphon"), false, "waits for Into the depths");
  assert.ok(g.buy("delve"));
  assert.equal(g.buy("buyQuantity"), false, "waits for Key Siphon");
  assert.equal(g.buy("regenResearch"), false, "waits for Shroud and Greater Heal");
  const before = g.save.tower.inspiration;
  assert.ok(g.buy("keySiphon"));
  assert.equal(before - g.save.tower.inspiration, 5);
  assert.ok(deckCards(g.save.upgrades).includes("keySiphon"), "its card joins the deck");
  assert.ok(g.buy("buyQuantity"));
  assert.equal(before - g.save.tower.inspiration, 5 + 5);
  assert.ok(g.buy("shroud"));
  assert.equal(g.buy("regenResearch"), false, "waits for Greater Heal");
  assert.ok(g.buy("greaterHeal"));
  assert.ok(g.buy("regenResearch"));
  assert.equal(before - g.save.tower.inspiration, 5 + 5 + 3 + 2 + 10);
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
 * hero at its west end holding KEY SIPHON then STAIRS, with `ranks` of Max
 * HP training. */
function corridor(ranks: number, edit: (save: Save) => void = () => {}) {
  const save = defaults();
  save.upgrades.keySiphon = 1;
  save.upgrades.inspirationUndos = 1;
  save.training.hp = ranks;
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

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test("KEY SIPHON trades Max HP training levels for a yellow key without moving, one level more each use", () => {
  const g = corridor(3), p = g.run.player, maxHp = p.maxHp, keys = p.keys.yellow;
  // The top level goes first: the third rank's worth, then the first two's.
  const top = trained(hpRow, 3) - trained(hpRow, 2);
  assert.deepEqual([g.siphonLevel("keySiphon"), g.siphonCost("keySiphon")], [3, 1]);
  g.autoTurn();
  assert.deepEqual([p.x, p.y], [0, 0], "no step");
  assert.equal(p.keys.yellow, keys + 1);
  assert.ok(near(p.maxHp, maxHp - top), "the first use takes one level");
  assert.equal(g.run.loadout!.maxHp, p.maxHp);
  assert.ok(p.hp <= p.maxHp, "HP falls with max HP");
  assert.equal(g.save.tower.history.length, 1, "a turn of its own");
  assert.deepEqual([g.siphonLevel("keySiphon"), g.siphonCost("keySiphon")], [2, 2]);
  g.autoTurn();
  assert.equal(p.keys.yellow, keys + 2);
  assert.ok(near(p.maxHp, maxHp - trained(hpRow, 3)), "the second takes two");
  assert.deepEqual([g.cardUses("keySiphon"), g.siphonLevel("keySiphon"), g.siphonCost("keySiphon")], [2, 0, 3]);
  assert.equal(g.canAct("keySiphon"), false);
  g.autoTurn();
  assert.deepEqual([p.x, p.y], [1, 0], "skipped: STAIRS moves the hero");
  assert.equal(p.keys.yellow, keys + 2);
  assert.equal(g.save.training.hp, 3, "the hero's own training is untouched");
});

test("with fewer levels left than the next use takes, the card is skipped", () => {
  const g = corridor(2);
  g.autoTurn();
  assert.deepEqual([g.siphonLevel("keySiphon"), g.siphonCost("keySiphon")], [1, 2]);
  assert.equal(g.canAct("keySiphon"), false);
  assert.equal(planHand(g, g.hand, "tower")?.card, 1, "STAIRS plays instead");
});

test("HP below the new max stays as it was", () => {
  const g = corridor(2), p = g.run.player;
  p.hp = 5;
  g.autoTurn();
  assert.equal(p.hp, 5);
});

test("undo takes a siphon back, and the next run starts with its max HP whole", () => {
  const g = corridor(1);
  const maxHp = g.run.player.maxHp;
  g.autoTurn();
  assert.equal(g.cardUses("keySiphon"), 1);
  assert.ok(g.undo());
  assert.equal(g.run.player.maxHp, maxHp);
  assert.equal(g.run.cardUses, undefined);
  g.autoTurn();
  g.newRun({ seed: 8 });
  assert.equal(g.run.player.maxHp, loadout(g.save).maxHp);
  assert.equal(g.siphonLevel("keySiphon"), 1);
});

test("Max HP bought with Silver this run can be siphoned too; with no Max HP training the card is skipped", () => {
  const none = corridor(0);
  assert.equal(none.canAct("keySiphon"), false);
  assert.equal(planHand(none, none.hand, "tower")?.card, 1, "STAIRS plays instead");
  const g = corridor(0, (s) => (s.upgrades.onTheJob = 1));
  g.run.silver = 100;
  assert.ok(g.trainInRun("hp"));
  assert.equal(g.siphonLevel("keySiphon"), 1);
  assert.deepEqual(planHand(g, g.hand, "tower"), { card: 0, path: [] });
});

test("no siphon in the forest", () => {
  const g = corridor(3);
  g.newRun({ outside: true, seed: 9 });
  assert.equal(g.siphonLevel("keySiphon"), 0);
  assert.equal(g.canAct("keySiphon"), false);
});
