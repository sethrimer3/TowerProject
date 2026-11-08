import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { snap } from "../src/exact.ts";
import { loadout } from "../src/progression/loadout.ts";
import { trainedAmount } from "../src/progression/training.ts";
import { duration, RESEARCH } from "../src/progression/archives.ts";
import { doorKeyScale } from "../src/doors.ts";
import { addItem, equip, type EquipItem, type EquipmentSave } from "../src/equipment/inventory.ts";
import { arcanaWithGear, bestWorn, equipmentEffects, noEffects } from "../src/equipment/effects.ts";
import { gearRowValue } from "../src/equipment/gear-rows.ts";
import { CATEGORY_FAMILIES, effectPool, SLOT_EFFECTS, slotEffectDef, slotValue } from "../src/equipment/slot-effects.ts";
import { rollCandidates, slotPool } from "../src/equipment/slots.ts";
import { STARTER_CATEGORIES } from "../src/equipment/catalog.ts";
import type { EquipRarity } from "../src/equipment/balance.ts";
import type { Enemy, Tile } from "../src/entities.ts";

/** A piece of `def` at `rarity`, level 41, its first slots holding `effects` at `rarity`. */
function wear(e: EquipmentSave, def: string, rarity: EquipRarity, effects: string[], mode: "tower" | "delve" = "tower"): EquipItem {
  const item = addItem(e, def, rarity)!;
  item.level = 241;
  item.slots = effects.map((effect) => ({ effect, rarity }));
  equip(e, mode, item.id);
  return item;
}
const opened = () => { const s = defaults(); s.equipment.unlocked = true; return s; };

// --- The catalogue ---

test("each starting category rolls from its own family, Uncommon values at ×1, Rare ×1.5, its own steps where it has them", () => {
  assert.deepEqual(STARTER_CATEGORIES.map((c) => CATEGORY_FAMILIES[c]), [["arcana"], ["defense"], ["efficiency"], ["offense"], ["utility"]]);
  assert.deepEqual(STARTER_CATEGORIES.map((c) => effectPool(c).length), [28, 15, 11, 17, 13]);
  const v = (id: string, r: EquipRarity) => slotValue(slotEffectDef(id)!, r);
  assert.deepEqual([v("ferocity", "uncommon"), v("ferocity", "rare"), v("ferocity", "ancestral")], [3, 4.5, 22.5]);
  assert.deepEqual((["uncommon", "rare", "epic", "legendary", "mythic", "ancestral"] as const).map((r) => v("deflection", r)), [1, 2, 3, 4, 5, 8]);
  assert.deepEqual((["uncommon", "ancestral"] as const).map((r) => v("freeOffense", r)), [1, 10]);
  assert.deepEqual((["uncommon", "ancestral"] as const).map((r) => v("hpSkip", r)), [1, 8]);
  assert.deepEqual((["uncommon", "rare", "ancestral"] as const).map((r) => v("automaton", r)), [1, 2, 6]);
  assert.deepEqual((["epic", "legendary", "ancestral"] as const).map((r) => v("thunderbolt1", r)), [1, 2, 4], "bolts from Epic");
  assert.equal(v("thunderbolt1", "rare"), 0, "not below its rarity");
  assert.deepEqual([v("volley", "mythic"), v("volley", "ancestral")], [1, 2]);
  assert.deepEqual([v("secondWind", "uncommon"), v("freshAir", "uncommon"), v("shieldRegen", "uncommon")], [3, 5, 10]);
  assert.equal(SLOT_EFFECTS.filter((d) => d.family === "arcana" && d.kind.startsWith("arcanum:")).length, 27, "every attribute of every arcanum");
});

test("a substat that only rolls from a higher rarity never reaches a lower piece, and rolls at its own rarity or above", () => {
  const e = { ...opened().equipment };
  const epic = addItem(e, "raptorBlade", "epic")!, rare = addItem(e, "knightsSword", "rare")!;
  epic.level = rare.level = 1;
  epic.slots = [{}];
  rare.slots = [{}];
  assert.ok(!slotPool(rare, 0).some((d) => d.id === "volley"), "Volley is Mythic and up");
  const helm = addItem(e, "psionicTempest", "epic")!;
  helm.level = 1;
  helm.slots = [{}];
  assert.ok(slotPool(helm, 0).some((d) => d.id === "thunderbolt1"));
  let n = 0;
  for (let i = 0; i < 2000; i++)
    for (const c of rollCandidates(helm, 0, false, Math.random)) if (c.effect === "thunderbolt1") { n++; assert.equal(c.rarity, "epic"); }
  assert.ok(n > 0);
});

// --- Training rows ---

test("worn substats raise the Training rows they name, once the row is open", () => {
  assert.equal(gearRowValue({ critChance: 2 }, "critChance", 500), 700, "points, in the row's hundredths");
  assert.equal(gearRowValue({ critFactor: 5 }, "critFactor", 130), 136.5, "a percent of the factor");
  assert.equal(gearRowValue({ multishotTargets: 2 }, "multishotTargets", 3), 5);
  assert.equal(gearRowValue({ regrowCut: 3 }, "regrowShield", 1000), 970);
  assert.equal(gearRowValue({ overhealPct: 3 }, "overheal", 2000), 2060);
  assert.equal(gearRowValue({ ferocity: 9 } as never, "attackRange", 300), 300, "rows it doesn't name stay as they are");
  const save = opened();
  save.upgrades.critical = 1;
  save.training.critChance = 5;
  const plain = trainedAmount(save, "critChance");
  assert.equal(trainedAmount({ ...save, gear: { critChance: 2 } }, "critChance"), plain + 200);
  assert.equal(trainedAmount({ ...save, gear: { superCritChance: 4 } }, "superCritChance"), trainedAmount(save, "superCritChance"), "Super Crit stays closed without its skill");
});

test("a run's crits, Overheal and Aether Shield read the hero's worn substats", () => {
  const s = opened();
  Object.assign(s.upgrades, { critical: 1 });
  s.training.critChance = 10;
  const g = new Game(s);
  g.newRun({ seed: 4 });
  const before = g.crit!.chance;
  wear(s.equipment, "knightsSword", "rare", ["keenEye"]);
  assert.equal(g.crit!.chance, snap(before + 3 * (100 / 100)), "Keen Eye II adds 3 points");
  assert.equal(g.equipment.item(s.equipment.items[0].id)!.slots[0].effect, "keenEye");
});

// --- The loadout ---

test("Shield substats raise shroud, Regen, Thorns, Armor Break and Shield Thorns by a percent, Parry and Lifesteal by points", () => {
  const s = opened();
  Object.assign(s.training, { shroud: 20, regen: 20, thorns: 10, parry: 10, armorBreak: 10, lifesteal: 10 });
  Object.assign(s.upgrades, { shroud: 1, regen: 1, thorns: 1, parry: 1, armorBreak: 1, lifesteal: 1 });
  const base = loadout(s);
  wear(s.equipment, "ironShield", "rare", ["warding", "mending", "thorns", "deflection", "bloodthirst", "shieldThorns"]);
  const sword = wear(s.equipment, "knightsSword", "rare", ["sunder"]);
  const l = loadout(s);
  const worn = equipmentEffects(s.equipment, "tower");
  assert.equal(l.shroud, snap(base.shroud * 1.075));
  assert.equal(l.regen, snap(base.regen * 1.045));
  assert.equal(l.thorns, snap(base.thorns * 1.075));
  assert.equal(l.armorBreak, snap(base.armorBreak * 1.075));
  assert.equal(l.parry, snap(base.parry + 2), "Deflection II: 2 points");
  assert.equal(l.lifesteal, snap(base.lifesteal + 0.3));
  assert.equal(worn.shieldThornsPct, 7.5);
  assert.ok(sword);
});

// --- Doors, Gold, drops, Dash ---

test("Key Efficiency substats cut each colour's keys, multiplying the card trees' cut", () => {
  const door = { kind: "door", color: "blue" } as unknown as Tile;
  const scale = doorKeyScale(door, 1, { blueKey: 10, blueGear: 10 });
  assert.equal(typeof scale === "number" ? scale : scale.blue, 0.81);
  const s = opened();
  const g = new Game(s);
  g.newRun({ seed: 4 });
  wear(s.equipment, "travelersBoots", "rare", ["locksmith", "redsmith"]);
  assert.deepEqual([g.doorOff?.yellowGear, g.doorOff?.redGear, g.doorOff?.blueGear], [3, 3, undefined]);
});

test("Bounty raises kill Gold, Fortune's Eye the drop chances, Sprinter End Rush, Momentum each Combo", () => {
  const s = opened();
  const g = new Game(s, () => 0.0152);
  g.newRun({ seed: 3, height: 9 });
  const purse = (g as any).purse, foe = { name: "E", hp: 1, attack: 1, defense: 1, strength: "normal" } as Enemy;
  // The Boots' own Gold found counts first; Bounty II then raises the kill's Gold 4.5% more.
  const boots = wear(s.equipment, "travelersBoots", "rare", []);
  const plain = purse.killGoldOf(foe);
  boots.slots = [{ effect: "headhunter", rarity: "rare" }];
  assert.equal((g as any).purse.killGoldOf(foe), snap(plain * 1.045));
  // A boss kill's 1.5% material chance: 1.52 is past it, but not past 1.5% raised by Fortune's Eye II's 3%.
  const boss = { ...foe, strength: "boss" } as Enemy;
  assert.deepEqual((g as any).purse.enemyLoot(boss, 2, 2).equipment, []);
  wear(s.equipment, "steelCuirass", "rare", ["fortunesEye", "sprinter"]);
  assert.equal((g as any).purse.enemyLoot(boss, 2, 3).equipment.length, 1);
  assert.equal(g.dashFor("stairs") - g.dashFor("key" as never), 2, "Sprinter II: two End Rush tiles on STAIRS");
  g.run.combo = { next: 3 } as never;
  const sword = wear(s.equipment, "knightsSword", "rare", ["momentum"]);
  assert.equal(g.fighter.comboAttack, snap(3 * 20 * 1.075));
  assert.ok(sword);
});

test("Free Upgrade and Level Skip substats add points to each floor's chances; Windfall to every Free group", () => {
  const s = opened();
  const g = new Game(s);
  g.newRun({ seed: 4 });
  assert.equal((g as any).freeChances, undefined);
  wear(s.equipment, "travelersBoots", "legendary", ["freeOffense", "hpSkip"]);
  wear(s.equipment, "steelCuirass", "rare", ["windfall"]);
  assert.deepEqual((g as any).freeChances, { offense: 750, defense: 150, utility: 150 }, "6 + 1.5 points, and Windfall's 1.5 on each");
});

// --- Arcana ---

test("Helmet substats raise an arcanum's attributes: a percent, Slowdown's points, whole counts and cooldowns cut", () => {
  const worn = { ...noEffects(), "arcanum:thunderbolt:0": 10, "arcanum:thunderbolt:1": 2, "arcanum:thunderbolt:2": 4 };
  assert.deepEqual(arcanaWithGear(worn, "thunderbolt", [10, 5, 180] as const), [11, 7, 173]);
  const dilation = { ...noEffects(), "arcanum:timeDilation:0": 15, "arcanum:timeDilation:1": 5 };
  assert.deepEqual(arcanaWithGear(dilation, "timeDilation", [10, 20, 180] as const), [12, 25, 180], "a duration rounds to whole turns");
  assert.deepEqual(arcanaWithGear(worn, "phantasm", [10, 3, 200] as const), [10, 3, 200], "another arcanum's substats leave it alone");
});

// --- Between runs ---

test("Scholarship speeds research, from either loadout, the more of the two", () => {
  const s = opened();
  const level = RESEARCH.potionHp.levels[0];
  const plain = duration(s.archives, level, s);
  wear(s.equipment, "steelCuirass", "rare", ["scholarship"], "delve");
  assert.equal(bestWorn(s, "researchSpeed"), 4.5);
  assert.equal(duration(s.archives, level, s), Math.round((level.hours * 3_600_000) / (1.045)));
  assert.ok(duration(s.archives, level, s) < plain);
});
