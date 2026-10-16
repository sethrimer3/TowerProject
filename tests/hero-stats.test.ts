import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { addItem, equip } from "../src/equipment/inventory.ts";
import { changeLoadout } from "../src/game/hero-sync.ts";
import { flatShift, shiftHero } from "../src/hero-stats.ts";
import { rowValue, statFactor } from "../src/loadout.ts";
import { snap } from "../src/exact.ts";

/** A Tower run inside, its hero wearing the Bloodprice Blade (+8% ATK,
 * −10% max HP), with `attack` ranks of ATK trained and Silver to spend. */
function armed(attack = 200) {
  const save = defaults();
  save.upgrades.onTheJob = 1;
  save.training.attack = attack;
  const e = save.equipment;
  e.unlocked = true;
  equip(e, "tower", addItem(e, "bloodpriceBlade", "common")!.id);
  const g = new Game(save);
  g.newRun({ seed: 5 });
  g.run.silver = 1e6;
  return g;
}

test("a rank bought with Silver moves the hero as a trainer's rank does, equipment's percent counted", () => {
  const silver = armed(), trainer = armed();
  const before = silver.run.player.attack;
  assert.ok(silver.trainInRun("attack"));
  const bought = snap(silver.run.player.attack - before);
  changeLoadout(trainer.save, () => { trainer.save.training.attack += 1; });
  assert.equal(snap(trainer.run.player.attack - before), bought);
  assert.ok(bought > 0);
});

test("the Training tab's next value is what buying the rank for the run gives", () => {
  const g = armed();
  const promised = rowValue(g.save, "attack", 1, g.trainingView).value;
  assert.ok(g.trainInRun("attack"));
  assert.equal(rowValue(g.save, "attack", 0, g.trainingView).value, promised);
});

test("a flat max HP given for the run is raised by Max HP research, as a provision is", () => {
  const save = defaults();
  assert.equal(flatShift(save, "maxHp", 10), 10);
  save.archives.levels.maxHp = 10;
  assert.ok(statFactor(save, "maxHp") > 1);
  assert.equal(flatShift(save, "maxHp", 10), snap(10 * statFactor(save, "maxHp")));
});

test("more max HP mid-run comes with the HP to fill it, however it came; less leaves HP no higher than the max", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 5 });
  const p = g.run.player;
  p.hp = snap(p.maxHp - 3);
  const [hp, max] = [p.hp, p.maxHp];
  changeLoadout(g.save, () => { g.save.training.hp += 4; });
  const gain = snap(p.maxHp - max);
  assert.ok(gain > 0);
  assert.equal(p.hp, snap(hp + gain), "a trainer's rank fills HP too");
  shiftHero(g.run, { maxHp: -(p.maxHp - 1) });
  assert.deepEqual([p.maxHp, p.hp], [1, 1]);
});

test("a fallen hero stays down whatever its max HP gains", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 5 });
  g.run.player.hp = 0;
  shiftHero(g.run, { maxHp: 20 });
  assert.equal(g.run.player.hp, 0);
});
