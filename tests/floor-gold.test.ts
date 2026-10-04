import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { TRAINING, trainingOpen } from "../src/config.ts";
import { RESEARCH, researched } from "../src/archives.ts";
import { floorGold, trainingStep } from "../src/loadout.ts";
import { runTrainingValue } from "../src/run-training.ts";
import { tierGold } from "../src/tiers.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { World } from "../src/delve/world.ts";

/** A Tower run inside in `tier`, the hero at (0, 0) beside the stairs at (1, 0). */
function stairs(tier = 1) {
  const save = defaults();
  save.tower.tiersOpen = save.tower.tier = tier;
  save.upgrades.spareChange = 1;
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  g.run.height = 3;
  standBeside(g);
  return g;
}
function standBeside(g: Game) {
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
}

test("Spare Change opens Gold / Floor training (3, and 2 a rank) and its research", () => {
  const save = defaults(), row = TRAINING.find((t) => t.id === "floorGold")!;
  assert.equal(floorGold(save), 0);
  assert.equal(trainingOpen(row, save.upgrades), false);
  save.upgrades.spareChange = 1;
  assert.ok(trainingOpen(row, save.upgrades));
  assert.equal(floorGold(save), 3);
  save.training.floorGold = 4;
  assert.equal(floorGold(save), 11);
  assert.deepEqual([trainingStep(save, "floorGold").now, trainingStep(save, "floorGold").next], [11, 13]);
  assert.deepEqual(RESEARCH.floorGold.requires, [{ upgrade: "spareChange" }]);
  assert.equal(RESEARCH.floorGold.levels.length, 100);
  // Priced and timed like Potion HP, level for level.
  assert.deepEqual(RESEARCH.floorGold.levels.map((l) => [l.gold, l.hours]), RESEARCH.potionHp.levels.map((l) => [l.gold, l.hours]));
  save.archives.levels.floorGold = 3;
  assert.equal(researched(save.archives, "floorGold", 100), 115);
});

test("a floor climbed for the first time in a run pays Gold / Floor, with research and the tier's bonus", () => {
  const g = stairs(3);
  g.save.training.floorGold = 1;
  g.save.archives.levels.floorGold = 2;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.height, 4);
  const paid = tierGold(3, 5 * 1.1);
  assert.equal(g.save.gold, paid);
  assert.equal(paid, 17.05);
  assert.equal(g.undo(), false, "undo stays on the floor it was taken on");
  assert.equal(g.run.height, 4);
});

test("without Spare Change a new floor pays nothing; Silver training raises it for the run", () => {
  const g = stairs();
  g.save.upgrades.spareChange = 0;
  assert.ok(g.move(1, 0));
  assert.equal(g.save.gold, 0);
  const h = stairs();
  h.run.silver = 1000;
  h.save.upgrades.onTheJob = 1;
  assert.ok(h.trainInRun("floorGold"));
  assert.deepEqual(runTrainingValue(h.save, h.run, "floorGold"), { value: 5, unit: "" });
  assert.ok(h.move(1, 0));
  assert.equal(h.save.gold, 5);
});

test("the Delve pays Gold / Floor for each new equivalent floor (ten depth) once", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = g.save.upgrades.spareChange = 1;
  g.switchMode("delve");
  g.newRun({ seed: 5 });
  (g as unknown as { enterFromOutside(): void }).enterFromOutside();
  const world = g.world as World;
  world.depth = () => 25;
  g.run.maxHeight = 5;
  const step = (g as unknown as { afterDelveStep(t: unknown, x: number, y: number): void }).afterDelveStep.bind(g);
  step({ kind: "floor" }, g.run.player.x, g.run.player.y);
  assert.equal(g.save.gold, 6, "floors 1 and 2");
  g.run.maxHeight = 5;
  step({ kind: "floor" }, g.run.player.x, g.run.player.y);
  assert.equal(g.save.gold, 6, "each pays once a run");
});
