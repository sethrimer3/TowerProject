import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILIARS, FAMILIAR_IDS, HATCH_MEDALS, LINGER_TURNS, familiarValues, statAt, statValue, upgradeMedals, type FamiliarId, type FamiliarLevels } from "../src/familiars/catalog.ts";
import { decodeFamiliars, validFamiliarsRun } from "../src/familiars/save.ts";
import { decode, defaults } from "../src/save/save.ts";
import { exportProfile, importProfile } from "../src/profile-file.ts";
import { Game } from "../src/state.ts";
import { random } from "../src/random.ts";

const SLOTS = [0, 1, 2, 3];
const table = (id: FamiliarId, at: "first" | "last") => SLOTS.map((slot) => {
  const stat = statAt(id, slot);
  return `${stat.name}: ${stat.shown(statValue(id, slot, at === "first" ? 0 : stat.levels))}`;
});

test("five familiars, in the order their rows show", () => {
  assert.deepEqual(FAMILIAR_IDS, ["dragon", "slime", "wolf", "falcon", "wisp"]);
  assert.deepEqual(FAMILIAR_IDS.map((id) => FAMILIARS[id].name), ["Fire Dragon", "Lightning Slime", "Hunting Wolf", "Golden Falcon", "Support Wisp"]);
});

test("each stat starts as given", () => {
  assert.deepEqual(table("dragon", "first"), ["Damage: ×5", "Range: 3 tiles", "Cooldown: 75 turns", "Damage Reduction: 20%"]);
  assert.deepEqual(table("slime", "first"), ["Duration: 5 turns", "Cooldown: 120 turns", "Linger: 20% for 3 turns", "Range: 2 tiles"]);
  assert.deepEqual(table("wolf", "first"), ["Duration: 20 turns", "Cooldown: 120 turns", "Bonus: ×3.5", "Range: 2.5 tiles"]);
  assert.deepEqual(table("falcon", "first"), ["Duration: 20 turns", "Cooldown: 120 turns", "Bonus: ×2", "Range: 2 tiles"]);
  assert.deepEqual(table("wisp", "first"), ["Duration: 20 turns", "Cooldown: 120 turns", "Bonus: ×1.05", "Range: 2.5 tiles"]);
});

test("each stat ends as given at its last level", () => {
  assert.deepEqual(table("dragon", "last"), ["Damage: ×290", "Range: 9 tiles", "Cooldown: 30 turns", "Damage Reduction: 95%"]);
  assert.deepEqual(table("slime", "last"), ["Duration: 15 turns", "Cooldown: 75 turns", "Linger: 80% for 3 turns", "Range: 6.5 tiles"]);
  assert.deepEqual(table("wolf", "last"), ["Duration: 35 turns", "Cooldown: 75 turns", "Bonus: ×15.5", "Range: 7 tiles"]);
  assert.deepEqual(table("falcon", "last"), ["Duration: 35 turns", "Cooldown: 75 turns", "Bonus: ×8", "Range: 7 tiles"]);
  assert.deepEqual(table("wisp", "last"), ["Duration: 35 turns", "Cooldown: 75 turns", "Bonus: ×2.55", "Range: 7 tiles"]);
});

test("each stat has its levels, and every level's value is whole units", () => {
  const levels = Object.fromEntries(FAMILIAR_IDS.map((id) => [id, SLOTS.map((slot) => statAt(id, slot).levels)]));
  assert.deepEqual(levels, { dragon: [30, 15, 15, 25], slime: [10, 15, 20, 15], wolf: [15, 15, 30, 18], falcon: [15, 15, 30, 20], wisp: [15, 15, 30, 18] });
  for (const id of FAMILIAR_IDS)
    for (const slot of SLOTS)
      for (let level = 0; level <= statAt(id, slot).levels; level++) assert.ok(Number.isInteger(statValue(id, slot, level)), `${id} ${slot} ${level}`);
  assert.equal(LINGER_TURNS, 3);
});

test("the Dragon's damage is grown into: ×5, then ×9.5 more a level", () => {
  assert.deepEqual([0, 1, 2, 30].map((level) => statValue("dragon", 0, level)), [50, 145, 240, 2900]);
});

test("a familiar's values read by key", () => {
  const levels: FamiliarLevels = [1, 2, 3, 4];
  assert.deepEqual(familiarValues("dragon", levels), { damage: 145, range: 380, cooldown: 66, reduction: 32 });
  assert.deepEqual(familiarValues("slime", levels), { duration: 6, cooldown: 114, linger: 29, range: 320 });
});

test("hatching costs by how many are owned, growing 100 Medals and 40 more a level", () => {
  assert.deepEqual(HATCH_MEDALS, [150, 300, 600, 900, 1200]);
  assert.equal(HATCH_MEDALS.length, FAMILIAR_IDS.length);
  assert.deepEqual([0, 1, 2, 29].map((level) => upgradeMedals("dragon", 0, level)), [100, 140, 180, 1260]);
  assert.equal(upgradeMedals("dragon", 0, 30), null);
  assert.equal(upgradeMedals("slime", 0, 10), null);
  let all = HATCH_MEDALS.reduce<number>((a, b) => a + b, 0);
  for (const id of FAMILIAR_IDS)
    for (const slot of SLOTS) for (let level = 0; level < statAt(id, slot).levels; level++) all += upgradeMedals(id, slot, level)!;
  assert.equal(all, 194_090);
});

test("the save keeps what is hatched and drops what can't be", () => {
  assert.deepEqual(defaults().familiars, {});
  for (const bad of [undefined, null, 5, "dragon", [], { dragon: true }, { phoenix: { levels: [1, 1, 1, 1] } }]) assert.deepEqual(decodeFamiliars(bad), {});
  assert.deepEqual(
    decodeFamiliars({ dragon: { levels: [31, 15, 2.5, -1], off: true }, wisp: { off: "yes" }, slime: { levels: [4, 5] } }),
    { dragon: { levels: [30, 15, 0, 0], off: true }, slime: { levels: [4, 5, 0, 0] }, wisp: { levels: [0, 0, 0, 0] } },
  );
});

test("familiars come back from a save and a profile file", () => {
  const save = defaults();
  save.familiars = { dragon: { levels: [3, 0, 2, 25] }, falcon: { levels: [0, 1, 0, 0], off: true } };
  assert.deepEqual(decode(JSON.stringify(save)).familiars, save.familiars);
  const file = importProfile(exportProfile(save, 1_800_000_000_000)) as { save: { familiars: unknown } };
  assert.deepEqual(file.save.familiars, save.familiars);
});

test("a run keeps its familiars, dropping a state that can't be", () => {
  for (const good of [{}, { dragon: { turns: 0 } }, { slime: { turns: 9, timer: 3, left: 2 } }, { wolf: { turns: 4, casts: 2, left: 5, at: { x: 12.5, y: -3.25 } } }, { wolf: { turns: 4, timer: 9, casts: 2 } }])
    assert.ok(validFamiliarsRun(good), JSON.stringify(good));
  for (const bad of [[], { owl: { turns: 1 } }, { dragon: {} }, { dragon: { turns: -1 } }, { dragon: { turns: 1, timer: 0 } }, { dragon: { turns: 1, at: { x: 1, y: 1 } } }, { wolf: { turns: 1, left: 3 } }, { wolf: { turns: 1, at: { x: 1, y: 1 } } }])
    assert.ok(!validFamiliarsRun(bad), JSON.stringify(bad));
  const game = new Game(defaults(), random(3));
  game.newRun({ seed: 3 });
  game.run.familiars = { dragon: { turns: 41, timer: 34 }, wolf: { turns: 41, left: 6, casts: 1, at: { x: 3.5, y: 9 } } };
  assert.deepEqual(decode(JSON.stringify(game.save)).tower.run!.familiars, game.run.familiars);
});
