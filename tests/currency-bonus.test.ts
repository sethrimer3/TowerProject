import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { trainingOpen } from "../src/progression/loadout.ts";
import { TRAINING, type TrainingId, trainedAmount } from "../src/progression/training.ts";
import { cost, type UpgradeId } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { RESEARCH, researched, type ResearchId } from "../src/progression/archives.ts";
import { trainingStep, trainingText, type TrainingView } from "../src/progression/loadout.ts";
import { addItem } from "../src/equipment/inventory.ts";
import { boonEffects } from "../src/shrines.ts";
import { runTrainingValue } from "../src/progression/run-training.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { World } from "../src/delve/world.ts";
import type { Tile } from "../src/entities.ts";
import { random } from "../src/random.ts";
import { silverFound } from "../src/economy/gold-multipliers.ts";
import { snap } from "../src/exact.ts";
import { playedSave } from "./first-skills.ts";

/** Silver Bonus training's multiplier on all Silver, in percent. */
const silverBonus = (save: ReturnType<typeof defaults>) => snap(silverFound(save, "tower", save.training.silverBonus) * 100);

/** Wealthy, Loot and Wishing Well (under Spare Change): each opens a
 * Utility Training row and Archives research of the same name. */
const SKILLS: [UpgradeId, TrainingId & ResearchId][] = [["wealthy", "silverBonus"], ["loot", "goldBonus"], ["wishingWell", "floorSilver"]];

test("Wealthy, Loot and Wishing Well cost 2 Inspiration each, after Spare Change", () => {
  const g = new Game(playedSave());
  g.save.tower.inspiration = 1000;
  for (const [skill] of SKILLS) {
    assert.deepEqual(TREES[0].nodes.find((n) => n.id === skill)!.requires, ["spareChange"]);
    assert.equal(cost(skill, 0), 2);
    assert.equal(g.skills.buy(skill), false, `${skill} waits for Spare Change`);
  }
  for (const id of ["combatStance", "buildout", "trainers", "largerHand", "shroud", "critical", "archives", "delve", "pocketMoney", "spareChange"] as const) assert.ok(g.skills.buy(id));
  for (const [skill] of SKILLS) assert.ok(g.skills.buy(skill), skill);
});

test("Wealthy, Loot and Wishing Well each open their Training row and research", () => {
  const save = playedSave();
  for (const [skill, id] of SKILLS) {
    const row = TRAINING.find((t) => t.id === id)!;
    assert.equal(row.group, "utility");
    assert.equal(row.cost, 1);
    assert.equal(trainingOpen(row, save), false, id);
    save.upgrades[skill] = 1;
    assert.ok(trainingOpen(row, save), id);
    assert.deepEqual(RESEARCH[id].requires, [{ upgrade: skill }]);
    assert.equal(RESEARCH[id].levels.length, 100);
    // Priced and timed like Spare Change's Gold / Floor, level for level.
    assert.deepEqual(RESEARCH[id].levels.map((l) => [l.gold, l.hours]), RESEARCH.floorGold.levels.map((l) => [l.gold, l.hours]));
  }
});

test("Silver Bonus starts at ×1 and adds 1% a rank, Gold Bonus 3%; Silver / Floor starts at 0 and adds 4", () => {
  const save = playedSave();
  assert.deepEqual([silverBonus(save), trainedAmount(save, "goldBonus"), trainedAmount(save, "floorSilver")], [100, 100, 0], "nothing without the skills");
  save.training.silverBonus = save.training.goldBonus = save.training.floorSilver = 10;
  assert.deepEqual([silverBonus(save), trainedAmount(save, "goldBonus"), trainedAmount(save, "floorSilver")], [100, 100, 0], "ranks count only with the skill");
  save.upgrades.wealthy = save.upgrades.loot = save.upgrades.wishingWell = 1;
  assert.deepEqual([silverBonus(save), trainedAmount(save, "goldBonus"), trainedAmount(save, "floorSilver")], [110, 130, 40]);
  const step = trainingStep(save, "silverBonus");
  assert.deepEqual([step.unit, step.now, step.next, step.worth], ["×", 1.1, 1.11, 0.01]);
  assert.equal(trainingText(step.now, step.unit), "×1.10");
  assert.equal(trainingText(40, ""), "40");
  // Research adds 3% a level (5% for Silver / Floor), simply.
  save.archives.levels.silverBonus = 10;
  save.archives.levels.floorSilver = 10;
  assert.deepEqual([researched(save.archives, "silverBonus"), researched(save.archives, "floorSilver")], [130, 150]);
});

test("the Training tab's values count research, equipment and Silver Bonus; a run's cards its own ranks and boons too, never a global Gold multiplier", () => {
  const save = playedSave();
  Object.assign(save.upgrades, { wealthy: 1, loot: 1, wishingWell: 1, spareChange: 1, critical: 1, freeTraining: 1 });
  save.training.silverBonus = save.training.goldBonus = save.training.floorSilver = save.training.floorGold = 10;
  save.training.critChance = 5;
  Object.assign(save.archives.levels, { silverBonus: 10, goldBonus: 10, floorSilver: 10, floorGold: 10, critChance: 3 });
  const crit = researched(save.archives, "critChancePercent") / 100;
  const step = (id: TrainingId, view?: TrainingView) => [trainingStep(save, id, 1, view).now, trainingStep(save, id, 1, view).next];
  assert.deepEqual(step("silverBonus"), [1.43, 1.443], "×1.10 → ×1.11, times 1.3");
  assert.deepEqual(step("goldBonus"), [1.69, 1.729], "×1.30 → ×1.33, times 1.3");
  assert.deepEqual(step("floorSilver"), [85.8, 94.38], "40 → 44, times 1.5, times Silver Bonus's ×1.43");
  assert.deepEqual(step("floorGold"), [19.5, 21], "13 → 14, times 1.5, and no global Gold multiplier");
  assert.deepEqual(step("critChance"), [5 * crit, 6 * crit].map((n) => Math.round(n * 1e6) / 1e6));
  // Regen's research raises the HP a step regains.
  save.training.regen = 50;
  save.archives.levels.regen = 10;
  const plain = trainingStep({ ...save, archives: { ...save.archives, levels: { ...save.archives.levels, regen: 0 } } }, "regen");
  assert.ok(trainingStep(save, "regen").now > plain.now);
  // The equipment the mode's hero wears counts: a sword raises the Tower's ATK row, not the Delve's.
  save.equipment.unlocked = true;
  const bare = step("attack", { mode: "tower" });
  save.equipment.equipped.tower.weapon = addItem(save.equipment, "knightsSword", "common")!.id;
  assert.ok(step("attack", { mode: "tower" })[0]! > bare[0]!);
  assert.deepEqual(step("attack", { mode: "delve" }), bare);
  // Inside a run: the hero's own stat (what it found) moved by a rank, and the ranks bought with Silver.
  const run = { training: { floorSilver: 2 }, player: { attack: 500 } } as never as TrainingView["run"];
  const [now, next] = step("attack", { mode: "tower", run });
  assert.equal(now, 500);
  assert.ok(next! > 500);
  assert.deepEqual(runTrainingValue(save, run!, "floorSilver"), { value: 102.96, unit: "" }, "48 × 1.5 × 1.43");
  assert.deepEqual(runTrainingValue(save, run!, "floorGold"), { value: 19.5, unit: "" });
  // A Tower run's boons: Silver Bonus's ×1.25 and Free Up Chance's +5%.
  const boosted = { ...run!, shrine: { picked: ["silver", "freeUp"], rolls: 0 } } as never as TrainingView["run"];
  assert.deepEqual(runTrainingValue(save, boosted!, "silverBonus"), { value: Math.round(1.43 * boonEffects(["silver"], save).silverFound * 1e6) / 1e6, unit: "×" });
  assert.equal(runTrainingValue(save, boosted!, "freeOffense").value, runTrainingValue(save, run!, "freeOffense").value + 5);
});

/** A Tower run inside on floor 11, the hero at (0, 0) facing a strong enemy at (1, 0). */
function facingEnemy() {
  const g = new Game(playedSave());
  // No theme's Gold, so these figures are the mechanic's alone (theme-collection.test.ts covers it).
  g.save.themes = [];
  g.save.settings.devMode = true;
  g.save.upgrades.inspirationUndos = 1;
  g.run.height = 10;
  (g.world as RoomWorld).cells = new Map<string, any>([["0,0", { kind: "floor" }],
    ["1,0", { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 1, strength: "strong" } }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}

test("a kill's Silver takes Silver Bonus and its Gold takes Gold Bonus, training and research multiplied", () => {
  const g = facingEnemy(), s = g.save;
  s.upgrades.wealthy = s.upgrades.loot = 1;
  s.training.silverBonus = s.training.goldBonus = 10;
  s.archives.levels.silverBonus = s.archives.levels.goldBonus = 10;
  assert.ok(g.stepManually(1, 0));
  // 12 Silver × 1.1 × 1.3 and 2 Gold × 1.3 × 1.3.
  assert.equal(g.silver, 17.16);
  assert.equal(s.gold, 3.38);
  assert.ok(g.gains.some((gain) => gain.text === "+17 Silver"));
  assert.equal(new Game(decode(JSON.stringify(s))).silver, 17.16, "Silver keeps its fraction in the save");
});

test("every item taken off the floor pays Gold, a key or door by its colours, raised by Gold Bonus, once a tile", () => {
  const g = facingEnemy(), s = g.save, w = g.world as RoomWorld;
  s.upgrades.loot = 1;
  s.training.goldBonus = s.archives.levels.goldBonus = 10;
  const cells = w.cells = new Map<string, any>([["0,0", { kind: "floor" }], ["1,0", { kind: "key", color: "red" }],
    ["2,0", { kind: "door", door: { type: "keys", keys: ["yellow", "blue", "red"], mode: "all" } }], ["3,0", { kind: "floor" }], ["4,0", { kind: "potion" }]]);
  w.torches = [{ x: 3, y: 0, active: true }, { x: 0, y: 1, active: true }] as RoomWorld["torches"];
  Object.assign(g.run.player.keys, { yellow: 1, blue: 1 });
  // ×1.3 training and ×1.3 research: a red key's 3, a Triune Door's
  // 1 + 2 + 3, a torch's 1 and a potion's 1.
  const paid = [3, 6, 1, 1].map((base) => base * 1.69);
  let gold = s.gold;
  for (let x = 1; x <= 4; x++) {
    assert.ok(g.stepManually(1, 0));
    assert.ok(Math.abs(s.gold - gold - paid[x - 1]) < 1e-9, `step ${x}`);
    gold = s.gold;
  }
  assert.ok(g.undo());
  (g.world as RoomWorld).cells = cells; // Undo builds the floor again from its seed.
  assert.ok(g.stepManually(1, 0));
  assert.equal(s.gold, gold, "undo can't pay a potion again");
});

test("a treasure chest's Gold, its 1 for opening counted, takes Gold Bonus; an area chest pays no Gold", () => {
  /** The Gold a chest at (1, 0) pays with `ranks` of Gold Bonus, its loot rolled the same each time. */
  const chest = (ranks: number, tile: Tile = { kind: "treasure" }) => {
    const save = playedSave();
    save.themes = [];
    save.settings.devMode = true;
    save.upgrades.loot = 1;
    save.training.goldBonus = ranks;
    const g = new Game(save, random(7));
    g.run.height = 10;
    (g.world as RoomWorld).cells = new Map<string, any>([["0,0", { kind: "floor" }], ["1,0", tile]]);
    Object.assign(g.run.player, { x: 0, y: 0 });
    const gold = save.gold;
    assert.ok(g.stepManually(1, 0));
    return save.gold - gold;
  };
  const plain = chest(0);
  assert.ok(plain > 1);
  assert.ok(Math.abs(chest(10) - plain * 1.3) < 1e-9, "×1.3 with 10 ranks");
  assert.equal(chest(10, { kind: "reward", tier: "gold" }), 0);
});

/** A Tower run inside on floor 4, the hero at (0, 0) beside the stairs at (1, 0). */
function stairs(tier = 1) {
  const save = playedSave();
  // No theme's Gold, so these figures are the mechanic's alone (theme-collection.test.ts covers it).
  save.themes = [];
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
  assert.equal(g.silver, 4.84, "4 × 1.1 × 1.1");
  assert.equal(g.undo(), false, "the climb can't be undone");
  assert.equal(g.silver, 4.84);
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
  assert.deepEqual(runTrainingValue(h.save, h.run, "floorSilver"), { value: 4, unit: "" });
  h.save.upgrades.wealthy = 1;
  assert.ok(h.trainInRun("silverBonus"));
  assert.deepEqual(runTrainingValue(h.save, h.run, "silverBonus"), { value: 1.01, unit: "×" });
  const before = h.silver;
  assert.ok(h.move(1, 0));
  assert.equal(Math.round((h.silver - before) * 100) / 100, 4.04, "4 × 1.01");
});

test("the Delve pays Silver / Floor for each new equivalent floor (ten depth)", () => {
  const g = new Game(playedSave());
  g.save.upgrades.delve = g.save.upgrades.wishingWell = 1;
  g.save.training.floorSilver = 1;
  g.switchMode("delve");
  g.newRun({ seed: 5 });
  (g as unknown as { enterFromOutside(): void }).enterFromOutside();
  (g.world as World).depth = () => 25;
  g.run.maxHeight = 5;
  (g as unknown as { afterDelveStep(t: unknown, x: number, y: number, from: { x: number; y: number }): void }).afterDelveStep({ kind: "floor" }, g.run.player.x, g.run.player.y, g.run.player);
  assert.equal(g.silver, 8, "floors 1 and 2");
});
