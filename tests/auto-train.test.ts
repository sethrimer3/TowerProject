import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { cost } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { xpForLevel } from "../src/progression/xp.ts";
import { autoTrainPicks, autoTrains, runTrainingOffer } from "../src/progression/run-training.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

/** A save with On the Job and Auto-Train, Max HP and ATK switched on, and
 * their groups (`groups`) switched on. */
function autoSave(groups: ("offense" | "defense" | "utility")[] = ["offense", "defense"]) {
  const save = defaults();
  save.upgrades.onTheJob = 1;
  save.upgrades.autoTrain = 1;
  save.xp = xpForLevel(10);
  save.runAutoTrain = ["hp", "attack"];
  save.runAutoTrainGroups = groups;
  return save;
}

test("Auto-Train is a 2-point Breakthrough skill right of Life, which it requires", () => {
  const nodes = TREES.find((t) => t.id === "breakthrough")!.nodes;
  const node = nodes.find((n) => n.id === "autoTrain")!, life = nodes.find((n) => n.id === "life")!;
  assert.deepEqual(node.requires, ["life"]);
  assert.equal(node.y, life.y);
  assert.ok(node.x > life.x);
  assert.ok(!nodes.some((n) => n !== node && n.x === node.x && n.y === node.y), "its spot is its own");
  assert.equal(cost("autoTrain", 0), 2);
});

test("Auto-Train buys the cheapest next rank of the rows switched on, one after another, until the Silver runs short", () => {
  const save = autoSave(), run = { training: {}, hand: [] };
  // Max HP from 3 (3, 5, 8, …) and ATK from 5 (5, 7, …): a tie goes by the Training table's order.
  assert.deepEqual(autoTrainPicks(save, run, 30), [
    { id: "hp", price: 3 }, { id: "hp", price: 5 }, { id: "attack", price: 5 }, { id: "attack", price: 7 }, { id: "hp", price: 8 },
  ]);
  assert.deepEqual(autoTrainPicks(save, run, 2), [], "nothing affordable, nothing bought");
});

test("Auto-Train skips a row switched off, a group switched off, and buys nothing before the skill is owned", () => {
  const run = { training: {}, hand: [] };
  assert.deepEqual(autoTrainPicks(autoSave(["offense"]), run, 12).map((p) => p.id), ["attack", "attack"], "Defense off: no Max HP");
  assert.deepEqual(autoTrainPicks(autoSave([]), run, 100), [], "every group off by default");
  const save = autoSave();
  save.runAutoTrain = ["attack"];
  assert.equal(autoTrains(save, "hp"), false);
  assert.ok(autoTrains(save, "attack"));
  save.upgrades.autoTrain = 0;
  assert.deepEqual(autoTrainPicks(save, run, 100), []);
});

test("each new Tower floor auto-trains with the Silver held", () => {
  const g = new Game(autoSave());
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  g.run.silver = 30;
  const attack = g.run.player.attack;
  assert.ok(g.move(1, 0));
  assert.ok((g.run.training?.hp ?? 0) >= 3 && (g.run.training?.attack ?? 0) >= 2);
  assert.ok(g.run.player.attack > attack, "the ranks raise the stats at once");
  const cheapest = Math.min(runTrainingOffer(g.save, g.run, "hp").price, runTrainingOffer(g.save, g.run, "attack").price);
  assert.ok(g.silver < cheapest, "it stops only when the next rank is out of reach");
});

test("Auto-Train's switches last from run to run and through a save, and unknown ones are dropped", () => {
  const save = autoSave();
  const g = new Game(save);
  g.training.toggleRunAuto("potion");
  g.training.toggleRunAuto("hp");
  g.training.toggleRunAutoGroup("utility");
  assert.deepEqual(save.runAutoTrain, ["attack", "potion"]);
  assert.deepEqual(save.runAutoTrainGroups, ["offense", "defense", "utility"]);
  const back = decode(JSON.stringify({ ...save, runAutoTrain: ["attack", "nope", "potion"], runAutoTrainGroups: ["utility", "bogus"] }));
  assert.deepEqual(back.runAutoTrain, ["attack", "potion"]);
  assert.deepEqual(back.runAutoTrainGroups, ["utility"]);
  assert.deepEqual([defaults().runAutoTrain, defaults().runAutoTrainGroups], [[], []], "everything starts off");
});
