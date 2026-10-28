import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { ENVIRONMENT_IDS, environmentOn, hasEnvironment, possibleEnvironments } from "../src/environments.ts";
import { isTreasureFloor } from "../src/board.ts";
import { tileRandom } from "../src/random.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../src/progression/archives.ts";
import { goldMultipliers } from "../src/economy/gold-multipliers.ts";
import { World } from "../src/delve/world.ts";
import type { Enemy } from "../src/entities.ts";

const FLOORS = [...Array(400).keys()].map((i) => i + 1);
const foe: Enemy = { name: "Slime", hp: 10, attack: 1, defense: 0, tier: 0, strength: "normal" };

test("each environment rolls a floor's own fixed number under its own salt: Treasure Floors as before, overlapping Golden Floors, more at a higher chance", () => {
  for (const floor of FLOORS) assert.equal(isTreasureFloor(7, floor, 30), tileRandom(floor, 0, 7 ^ 0x7f10c) * 100 < 30, `floor ${floor} is the Treasure Floor it was`);
  const treasure = FLOORS.filter((f) => environmentOn("treasure", 7, f, 50)), golden = FLOORS.filter((f) => environmentOn("golden", 7, f, 50));
  const both = treasure.filter((f) => golden.includes(f));
  assert.ok(both.length > 50 && both.length < 150, `about a quarter of the floors are both (${both.length})`);
  assert.notDeepEqual(treasure, golden, "the environments roll apart");
  for (const id of ENVIRONMENT_IDS) {
    const at = (chance: number) => FLOORS.filter((f) => environmentOn(id, 7, f, chance));
    assert.deepEqual(at(0), [], `${id}: none at no chance`);
    assert.deepEqual(at(100), FLOORS, `${id}: every floor at 100%`);
    assert.ok(at(10).every((f) => at(30).includes(f)), `${id}: a higher chance only adds floors`);
  }
});

test("Golden Floor Chance: +0.5% a level for 60 levels, to 30%; Golden Floor Multiplier: ×2, +×0.1 a level for 80, to ×10; both behind Golden Floors, ending in billions of Gold", () => {
  const chance = RESEARCH.goldenFloorChance, multiplier = RESEARCH.goldenFloorMultiplier;
  assert.equal(chance.levels.length, 60);
  assert.equal(multiplier.levels.length, 80);
  for (const r of [chance, multiplier]) {
    assert.deepEqual(r.requires, [{ upgrade: "goldenFloors" }]);
    assert.deepEqual(r.categories, ["economy"]);
    assert.deepEqual(r.levels.slice(0, 10).map((l) => l.gold), [5000, 15000, 40000, 90000, 180000, 330000, 560000, 900000, 1350000, 1950000]);
    for (let i = 1; i < r.levels.length; i++) assert.ok(r.levels[i]!.gold > r.levels[i - 1]!.gold && r.levels[i]!.hours > r.levels[i - 1]!.hours, `${r.name} ${i + 1}`);
  }
  assert.equal(chance.levels.at(-1)!.gold, 2_510_000_000);
  assert.equal(chance.levels.at(-1)!.hours, 30 * 24, "30 days");
  assert.equal(multiplier.levels.at(-1)!.gold, 5_020_000_000);
  assert.equal(multiplier.levels.at(-1)!.hours, 40 * 24, "40 days");
  const a = defaults().archives;
  assert.equal(RESEARCH_TARGETS.goldenFloorMultiplier.shown(researched(a, "goldenFloorMultiplier")), "×2");
  a.levels.goldenFloorChance = 60;
  a.levels.goldenFloorMultiplier = 80;
  assert.equal(RESEARCH_TARGETS.goldenFloorChance.shown(researched(a, "goldenFloorChance")), "30%");
  assert.equal(RESEARCH_TARGETS.goldenFloorMultiplier.shown(researched(a, "goldenFloorMultiplier")), "×10");
});

test("a climb fixes its Golden Floor chance as it goes inside, only with Golden Floors owned, in both modes", () => {
  for (const mode of ["tower", "delve"] as const) {
    const save = defaults();
    save.archives.levels.goldenFloorChance = 7;
    const g = new Game(save);
    g.switchMode(mode);
    g.newRun({ seed: 11 });
    assert.equal(g.run.goldenFloor, undefined, `${mode}: none without Golden Floors`);
    save.upgrades.goldenFloors = 1;
    g.newRun({ seed: 11 });
    assert.equal(g.run.goldenFloor, 3.5, `${mode}: 7 levels of 0.5%`);
    save.archives.levels.goldenFloorChance = 60;
    assert.equal(g.run.goldenFloor, 3.5, `${mode}: research done mid-climb waits for the next`);
  }
});

test("every Gold found on a Golden Floor is multiplied by Golden Floor Multiplier once, read at once; off one, not at all", () => {
  const save = defaults();
  save.themes = [];
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.goldenFloor = 50;
  const golden = FLOORS.find((f) => hasEnvironment(g.run, "golden", f))!, plain = FLOORS.find((f) => !hasEnvironment(g.run, "golden", f))!;
  const purse = (floor?: number) => new RunPurse(save, "tower", g.run, () => 0.5, 0, () => 0.5, floor === undefined ? undefined : () => floor);
  const finds = (p: RunPurse, x: number) => [p.enemyLoot(foe, x, 1).gold, p.treasure(x, 2)!.gold, p.pickupGold(x, 3, 4), p.badgeGold(`badge:${x}`, 10), p.smeltGold(`smelt:${x}`, 6, 2)];
  const base = finds(purse(), 0);
  assert.ok(base.every((n) => n > 0), "each find pays Gold");
  assert.deepEqual(finds(purse(plain), 1), base, "a plain floor pays as without");
  assert.deepEqual(finds(purse(golden), 2), base.map((n) => n * 2), "×2 before research");
  save.archives.levels.goldenFloorMultiplier = 80;
  assert.deepEqual(finds(purse(golden), 3), base.map((n) => n * 10), "×10 at once, never twice");
  assert.equal(purse(golden).golden(plain), 1);
  g.run.goldenFloor = undefined;
  assert.deepEqual(finds(purse(golden), 4), base, "no Golden Floors in a climb without the chance");
});

test("All Gold Bonuses shows the Golden Floor line once Golden Floors is owned, active on a Golden Floor", () => {
  const save = defaults();
  const g = new Game(save);
  g.newRun({ seed: 7 });
  const line = () => goldMultipliers(g.goldContext).find((m) => m.id === "golden");
  assert.equal(line(), undefined, "no line before Golden Floors");
  save.upgrades.goldenFloors = 1;
  assert.equal(line()!.factor, null, "Inactive off a Golden Floor");
  g.run.goldenFloor = 100;
  assert.equal(line()!.factor, 2);
});

test("the enemy stats box's environments: each the climb can roll, with its chance, marked where the hero's floor has it", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  assert.deepEqual(g.floorEnvironments, [], "none while every chance is none");
  g.run.treasureFloor = 2.5;
  g.run.goldenFloor = 100;
  assert.deepEqual(possibleEnvironments(g.run).map((e) => [e.id, e.chance]), [["treasure", 2.5], ["golden", 100]]);
  const floor = g.run.height + 1;
  assert.deepEqual(g.floorEnvironments.map((e) => [e.name, e.chance, e.here]), [["Treasure Floor", 2.5, hasEnvironment(g.run, "treasure", floor)], ["Golden Floor", 100, true]]);
});

test("the board draws a Tower Golden Floor whole, and a Delve wall golden beside a Golden Floor's open ground", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 7 });
  assert.equal(g.goldenAt(0, 0), false, "none without the chance");
  g.run.goldenFloor = 100;
  for (let y = 0; y < g.world.height; y++) for (let x = 0; x < g.world.width; x++) assert.ok(g.goldenAt(x, y), `${x},${y}`);
  g.switchMode("delve");
  g.newRun({ seed: 7 });
  g.run.goldenFloor = 50;
  const world = g.world as World, p = g.run.player;
  let walls = 0;
  for (let y = p.y; y < p.y + 60; y++) for (let x = 0; x < world.width; x++) {
    const open = (xx: number, yy: number) => world.tile(xx, yy).kind !== "wall";
    if (open(x, y)) {
      assert.equal(g.goldenAt(x, y), hasEnvironment(g.run, "golden", Math.floor(world.depth(x, y) / 10) + 1));
      continue;
    }
    const beside = [[0, 1], [1, 0], [0, -1], [-1, 0]].filter(([dx, dy]) => open(x + dx!, y + dy!));
    assert.equal(g.goldenAt(x, y), beside.some(([dx, dy]) => g.goldenAt(x + dx!, y + dy!)), `wall ${x},${y}`);
    if (beside.length) walls++;
  }
  assert.ok(walls > 0);
});
