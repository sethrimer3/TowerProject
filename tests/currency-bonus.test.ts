import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { TRAINING, cost, trainingOpen, type TrainingId, type UpgradeId } from "../src/config.ts";
import { TREES } from "../src/skill-trees.ts";
import { RESEARCH, researched, type ResearchId } from "../src/archives.ts";
import { floorSilver, killGold, silverBonus, trainingStep, trainingText } from "../src/loadout.ts";
import { runTrainingValue } from "../src/run-training.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { World } from "../src/delve/world.ts";

/** Wealthy, Loot and Wishing Well (under Spare Change): each opens a
 * Utility Training row and Archives research of the same name. */
const SKILLS: [UpgradeId, TrainingId & ResearchId][] = [["wealthy", "silverBonus"], ["loot", "killGold"], ["wishingWell", "floorSilver"]];

test("Wealthy, Loot and Wishing Well cost 2 Inspiration each, after Spare Change", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const [skill] of SKILLS) {
    assert.deepEqual(TREES[0].nodes.find((n) => n.id === skill)!.requires, ["spareChange"]);
    assert.equal(cost(skill, 0), 2);
    assert.equal(g.buy(skill), false, `${skill} waits for Spare Change`);
  }
  for (const id of ["combatStance", "buildout", "trainers", "largerHand", "archives", "delve", "pocketMoney", "spareChange"] as const) assert.ok(g.buy(id));
  for (const [skill] of SKILLS) assert.ok(g.buy(skill), skill);
});

test("Wealthy, Loot and Wishing Well each open their Training row and research", () => {
  const save = defaults();
  for (const [skill, id] of SKILLS) {
    const row = TRAINING.find((t) => t.id === id)!;
    assert.equal(row.group, "utility");
    assert.equal(row.cost, 1);
    assert.equal(trainingOpen(row, save.upgrades), false, id);
    save.upgrades[skill] = 1;
    assert.ok(trainingOpen(row, save.upgrades), id);
    assert.deepEqual(RESEARCH[id].requires, [{ upgrade: skill }]);
    assert.equal(RESEARCH[id].levels.length, 100);
    // Priced and timed like Spare Change's Gold / Floor, level for level.
    assert.deepEqual(RESEARCH[id].levels.map((l) => [l.gold, l.hours]), RESEARCH.floorGold.levels.map((l) => [l.gold, l.hours]));
  }
});

test("Silver Bonus and Gold / Kill start at ×1 and add 3% a rank; Silver / Floor starts at 3 and adds 3", () => {
  const save = defaults();
  assert.deepEqual([silverBonus(save), killGold(save), floorSilver(save)], [100, 100, 0], "nothing without the skills");
  save.training.silverBonus = save.training.killGold = save.training.floorSilver = 10;
  assert.deepEqual([silverBonus(save), killGold(save), floorSilver(save)], [100, 100, 0], "ranks count only with the skill");
  save.upgrades.wealthy = save.upgrades.loot = save.upgrades.wishingWell = 1;
  assert.deepEqual([silverBonus(save), killGold(save), floorSilver(save)], [130, 130, 33]);
  const step = trainingStep(save, "silverBonus");
  assert.deepEqual([step.unit, step.now, step.next, step.worth], ["×", 1.3, 1.33, 3]);
  assert.equal(trainingText(step.now, step.unit), "×1.30");
  assert.equal(trainingText(33, ""), "33");
  // Research adds 3% a level (5% for Silver / Floor), simply.
  save.archives.levels.silverBonus = 10;
  save.archives.levels.floorSilver = 10;
  assert.deepEqual([researched(save.archives, "silverBonus", 100), researched(save.archives, "floorSilver", 100)], [130, 150]);
});

/** A Tower run inside on floor 11, the hero at (0, 0) facing a strong enemy at (1, 0). */
function facingEnemy() {
  const g = new Game(defaults());
  g.save.settings.devMode = true;
  g.save.upgrades.inspirationUndos = 1;
  g.run.height = 10;
  (g.world as RoomWorld).cells = new Map<string, any>([["0,0", { kind: "floor" }],
    ["1,0", { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 1, strength: "strong" } }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}

test("a kill's Silver takes Silver Bonus and its Gold takes Gold / Kill, training and research multiplied", () => {
  const g = facingEnemy(), s = g.save;
  s.upgrades.wealthy = s.upgrades.loot = 1;
  s.training.silverBonus = s.training.killGold = 10;
  s.archives.levels.silverBonus = s.archives.levels.killGold = 10;
  assert.ok(g.stepManually(1, 0));
  // 6 Silver and 2 Gold, each × 1.3 × 1.3.
  assert.equal(g.silver, 10.14);
  assert.equal(s.gold, 3.38);
  assert.ok(g.gains.some((gain) => gain.text === "+10 Silver"));
  assert.equal(new Game(decode(JSON.stringify(s))).silver, 10.14, "Silver keeps its fraction in the save");
});

/** A Tower run inside on floor 4, the hero at (0, 0) beside the stairs at (1, 0). */
function stairs(tier = 1) {
  const save = defaults();
  save.tower.tiersOpen = save.tower.tier = tier;
  save.upgrades.wishingWell = 1;
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  g.run.height = g.run.maxHeight = 3;
  standBeside(g);
  return g;
}
function standBeside(g: Game) {
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
}

test("a new Tower floor pays Silver / Floor, with research and Silver Bonus but not the tier's bonus", () => {
  const g = stairs(3), s = g.save;
  s.upgrades.wealthy = 1;
  s.training.floorSilver = 1;
  s.training.silverBonus = 10;
  s.archives.levels.floorSilver = 2;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.height, 4);
  assert.equal(g.silver, 8.58, "6 × 1.1 × 1.3");
  assert.equal(g.undo(), false, "the climb can't be undone");
  assert.equal(g.silver, 8.58);
});

test("a floor already reached this run pays no Silver; Silver training raises it for the run", () => {
  const g = stairs();
  g.run.maxHeight = 5;
  assert.ok(g.move(1, 0));
  assert.equal(g.silver, 0);
  const h = stairs();
  h.run.silver = 1000;
  h.save.upgrades.onTheJob = 1;
  assert.ok(h.trainInRun("floorSilver"));
  assert.deepEqual(runTrainingValue(h.save, h.run, "floorSilver"), { value: 6, unit: "" });
  h.save.upgrades.wealthy = 1;
  assert.ok(h.trainInRun("silverBonus"));
  assert.deepEqual(runTrainingValue(h.save, h.run, "silverBonus"), { value: 1.03, unit: "×" });
  const before = h.silver;
  assert.ok(h.move(1, 0));
  assert.equal(Math.round((h.silver - before) * 100) / 100, 6.18, "6 × 1.03");
});

test("the Delve pays Silver / Floor for each new equivalent floor (ten depth)", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = g.save.upgrades.wishingWell = 1;
  g.switchMode("delve");
  g.newRun({ seed: 5 });
  (g as unknown as { enterFromOutside(): void }).enterFromOutside();
  (g.world as World).depth = () => 25;
  g.run.maxHeight = 5;
  (g as unknown as { afterDelveStep(t: unknown, x: number, y: number): void }).afterDelveStep({ kind: "floor" }, g.run.player.x, g.run.player.y);
  assert.equal(g.silver, 6, "floors 1 and 2");
});
