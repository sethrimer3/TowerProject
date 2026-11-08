import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { OutsideWorld, BLACKSMITH } from "../src/outside.ts";
import { MODES } from "../src/modes.ts";
import { unlockAt } from "../src/goals.ts";
import { random } from "../src/random.ts";
import { loadout } from "../src/progression/loadout.ts";
import { predict } from "../src/combat.ts";
import { resolveStep } from "../src/step-effects.ts";
import {
  CATEGORIES, CATEGORY_IDS, EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, ITEMS, itemDef, materialOf, materialsOf, STARTER_CATEGORIES, standardsOf, uniquesOf,
} from "../src/equipment/catalog.ts";
import {
  BOSS_DROPS, EQUIPMENT_CAPACITY, PITY, PULL_GEMS, PULL_RATES, pullGems, RARITY_TIERS, rarityRank, STARS, TOP_LEVEL,
  upgradeGold, upgradeMaterial, type EquipRarity,
} from "../src/equipment/balance.ts";
import {
  addItem, autoMerges, decodeEquipment, defaultEquipment, defaultFodder, dismantle, equip, isProtected, levelUp, maxLevel, merge, mergeFodder, mergePlan,
  salvageTotals, setLocked, unequip, type EquipmentSave,
} from "../src/equipment/inventory.ts";
import { effectText, equipmentEffects } from "../src/equipment/effects.ts";
import { efficiency, mainEffect } from "../src/equipment/main-effect.ts";
import { snap } from "../src/exact.ts";
import { drawTogglesOpen, keepDrop, pull, pullOne, pullRates, rollRarity } from "../src/equipment/acquire.ts";
import { ICON_ROWS, pieceRows } from "../src/ui/equipment-icons.ts";
import type { Enemy } from "../src/entities.ts";

const open = (): EquipmentSave => ({ ...defaultEquipment(), unlocked: true });
/** A stream that returns `values` in turn, then the last forever. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

// --- Catalogue ---

test("nine categories share four base resources; each starting one has three Standard pieces and three Uniques", () => {
  assert.equal(CATEGORY_IDS.length, 9);
  assert.ok(!(CATEGORY_IDS as readonly string[]).includes("ring"), "Ring is gone");
  assert.equal(EQUIP_MATERIAL_IDS.length, 4);
  assert.deepEqual(new Set(CATEGORY_IDS.map(materialOf)).size, 4, "only four resource types");
  for (const c of CATEGORY_IDS) {
    assert.equal(standardsOf(c).length, STARTER_CATEGORIES.includes(c) ? 3 : 1, c);
    assert.equal(uniquesOf(c).length, 3, c);
    assert.ok(materialsOf(c).every(m => EQUIP_MATERIAL_IDS.includes(m)));
  }
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length, "ids are unique");
  assert.equal(new Set(ITEMS.map((i) => i.name)).size, ITEMS.length, "names are unique");
});

test("each icon is a 12×12 grid", () => {
  for (const [id, rows] of Object.entries(ICON_ROWS)) {
    assert.equal(rows.length, 12, id);
    for (const row of rows) assert.equal(row.length, 12, `${id}: ${row}`);
  }
});

test("every piece wears its own icon, each Unique one of its own", () => {
  const drawn = ITEMS.map((i) => pieceRows(i.id).join("/"));
  assert.equal(new Set(drawn).size, ITEMS.length, "no two pieces look alike");
  for (const item of ITEMS) if (item.class === "unique") assert.ok(item.id in ICON_ROWS, `${item.id} has its own icon`);
  for (const [id, rows] of Object.entries(ICON_ROWS))
    for (const row of rows) for (const ch of row) assert.ok(ch === "." || ch === "#" || /[a-z]/.test(ch), `${id} uses a known colour`);
});

test("main effects: the rarity's base at level 0, then each band of ten split evenly; Stars raise the whole", () => {
  const sword = (rarity: EquipRarity, level: number, stars = 0) => mainEffect({ category: "weapon", rarity, level, stars })!.value;
  assert.equal(sword("common", 0), 1);
  assert.equal(sword("common", 1), 1.2, "a tenth of the first band's 2%");
  assert.equal(sword("common", 10), 3);
  assert.equal(sword("common", 20), 6, "5% from levels to 20");
  assert.equal(sword("rare", 60), 33, "30% from levels to 60");
  assert.equal(sword("epic", 75), 7 + 42 + 8, "half of the 70s' 16%");
  assert.equal(sword("ancestral", 300, 5), snap((30 + 4342) * 1.2), "every band, then ×1.20 for five Stars");
  assert.equal(sword("ancestral", 200, 1), snap((30 + 1492) * 1.04));
  assert.equal(mainEffect({ category: "weapon", rarity: "common", level: 0 })!.kind, "attackPct");
  assert.equal(mainEffect({ category: "shield", rarity: "legendary", level: 10 })!.value, 15);
  assert.equal(mainEffect({ category: "helmet", rarity: "common", level: 10 })!.value, 5.4, "Arcanum Damage's steps are 20% larger");
  assert.equal(mainEffect({ category: "helmet", rarity: "ancestral", level: 0 })!.kind, "arcanumDamage");
  assert.equal(mainEffect({ category: "boots", rarity: "common", level: 5 })!.value, 1.6, "0.6% from five levels");
  assert.equal(mainEffect({ category: "boots", rarity: "mythic", level: 300 })!.value, snap(3.2 + 323));
  assert.equal(mainEffect({ category: "chestplate", rarity: "rare", level: 20 })!.value, 8, "a Chestplate's max HP runs on the ATK curve");
  assert.equal(efficiency({ category: "chestplate", rarity: "rare", level: 20 }), 4.2, "and its efficiency on the Gold curve");
  assert.equal(efficiency({ category: "weapon", rarity: "rare", level: 20 }), 0);
  assert.equal(mainEffect({ category: "cape", rarity: "rare", level: 20 }), null, "the future corners have none yet");
  assert.equal(effectText("arcanumDamage", 5.4), "+5.4% Arcanum Damage");
});

test("a worn Chestplate's efficiency raises the other worn pieces' main effects, not its own", () => {
  const e = open();
  const sword = addItem(e, "knightsSword", "rare")!, plate = addItem(e, "steelCuirass", "rare")!;
  sword.level = 10; plate.level = 20;
  e.equipped.tower = { weapon: sword.id, chestplate: plate.id };
  const worn = equipmentEffects(e, "tower");
  assert.equal(worn.attackPct, snap((3 + 2) * 1.042));
  assert.equal(worn.maxHpPct, 8);
});

test("Gold and material to reach each level follow the agreed schedules", () => {
  assert.deepEqual([1, 5, 10].map(upgradeGold), [2000, 10000, 20000]);
  assert.deepEqual([11, 15, 20, 21, 50, 51, 60].map(upgradeGold), [25000, 45000, 70000, 80000, 1.4e6, 2.2e6, 4e6]);
  assert.deepEqual([160, 161, 162, 171, 181, 191, 201].map(upgradeGold), [1e12, 10e12, 60e12, 510e12, 1.01e15, 1.51e15, 2.5e15]);
  assert.deepEqual([221, 241, 261, 281, 300].map(upgradeGold), [265e15, 1e18, 106e18, 411e18, 886e18]);
  assert.equal(upgradeGold(166), 10e12 + 50e12 + 4 * 50e12, "linear between the listed levels");
  assert.deepEqual([1, 10, 20, 40, 60].map(upgradeMaterial), [1, 10, 30, 100, 210], "⌈L × (L + 10) / 20⌉ to level 60");
  assert.deepEqual([101, 161, 201, 221, 241, 261, 281, 300].map(upgradeMaterial), [1000, 5000, 10000, 15000, 20000, 30000, 40000, 49500]);
  assert.equal(upgradeMaterial(80), 595, "bending upward between 60 and 101");
  for (let l = 2; l <= TOP_LEVEL; l++) assert.ok(upgradeMaterial(l) >= upgradeMaterial(l - 1), `materials never fall at ${l}`);
  assert.equal(TOP_LEVEL, 300);
});

// --- Saves ---

test("a new save starts with Equipment closed and empty; old saves load with it", () => {
  const d = defaults();
  assert.deepEqual(d.equipment, defaultEquipment());
  assert.equal(d.equipment.unlocked, false);
  const old = JSON.parse(JSON.stringify(defaults()));
  delete old.equipment;
  old.equipmentInventory = [{ id: "e1", slot: "weapon", name: "Blade", metal: "steel" }];
  old.equipped = { weapon: "e1" };
  const loaded = decode(JSON.stringify(old));
  assert.deepEqual(loaded.equipment, defaultEquipment(), "crafted equipment of the old system is dropped");
  assert.ok(!("equipmentInventory" in loaded) && !("equipped" in loaded));
});

test("equipment round-trips through a save: ids, rarity, level, loadouts, locks, materials, pity and investment", () => {
  const s = defaults(), e = s.equipment;
  e.unlocked = true;
  const a = addItem(e, "raptorBlade", "rare")!, b = addItem(e, "steelCuirass", "common")!;
  e.materials.whetstone = 999;
  s.gold = 1e6;
  levelUp(e, s, a.id, 5, false);
  setLocked(e, b.id, true);
  equip(e, "tower", a.id);
  equip(e, "delve", b.id);
  e.pity.helmet = 57;
  pull(e, "shield", 3, seq([0.5]));
  const loaded = decode(JSON.stringify(s)).equipment;
  assert.deepEqual(loaded, e);
  assert.ok(!JSON.stringify(loaded).includes("Raptor Blade"), "no catalogue data saved");
});

test("decoding drops unknown pieces, clamps levels to the cap, and keeps loadouts to owned pieces of the right category", () => {
  const raw = {
    unlocked: true, nextId: 1,
    items: [
      { id: "e1", def: "knightsSword", rarity: "common", level: 99 },
      { id: "e2", def: "nope", rarity: "common", level: 1 },
      { id: "e3", def: "kiteShield", rarity: "golden", level: 1 },
      { id: "e5", def: "raptorBlade", rarity: "ancestral", stars: 3, level: 999 },
      { id: "e6", def: "raptorBlade", rarity: "mythic", stars: 3, level: 0 },
      { id: "e1", def: "kiteShield", rarity: "common", level: 1 },
      { id: "e4", def: "kiteShield", rarity: "common", level: 1 },
    ],
    equipped: { tower: { weapon: "e1", shield: "e1", helmet: "e2" }, delve: { shield: "e4" } },
    pity: { weapon: PITY, shield: 12 },
    materials: { amber: -3, silk: 4 },
  };
  const e = decodeEquipment(raw);
  assert.deepEqual(e.items.map((i) => [i.id, i.level, i.stars]), [["e1", 20, undefined], ["e5", 260, 3], ["e6", 0, undefined], ["e4", 1, undefined]], "Stars only on Ancestral pieces, the cap raised by them");
  assert.deepEqual(e.equipped, { tower: { weapon: "e1" }, delve: { shield: "e4" } });
  assert.deepEqual([e.pity.weapon, e.pity.shield], [0, 12]);
  assert.deepEqual([e.materials.padding, e.materials.rivets], [2, 2]);
  assert.ok(!("silk" in e.materials) && !("amber" in e.materials));
  assert.equal(e.nextId, 7, "never reuses an id");
});

// --- Unlock and the Blacksmith ---

test("Equipment opens by claiming Tower II's floor 60 Goal, not by reaching a floor", () => {
  assert.deepEqual(unlockAt("equipment"), { tower: 2, floor: 60 });
  const s = defaults();
  s.tower.best = s.tower.reached = 200;
  s.tower.tiersOpen = 2;
  s.tower.tierRecords[2] = { best: 200, reached: 200 };
  s.delve.best = 2000;
  const g = new Game(s);
  assert.equal(g.save.equipment.unlocked, false, "reaching floors opens nothing");
  g.newRun({ outside: true, seed: 7 });
  assert.equal(g.claimGoal(2, 60, false)?.kind, "unlock");
  assert.equal(g.save.equipment.unlocked, true);
  assert.equal(new Game(decode(JSON.stringify(g.save))).save.equipment.unlocked, true, "kept by the save");
});

test("the Blacksmith stands in the forest only once Equipment is open, beside the path", () => {
  const before = new Game(defaults());
  before.newRun({ outside: true, seed: 7 });
  const x = MODES.tower.entranceX + BLACKSMITH.dx + 1, y = BLACKSMITH.y + 1;
  assert.equal(before.atBlacksmith(x, y), false);
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 7 });
  g.save.tower.tiersOpen = 2;
  g.save.tower.tierRecords[2] = { best: 60, reached: 60 };
  g.claimGoal(2, 60, false);
  assert.equal(g.atBlacksmith(x, y), true, "standing at once in the forest the claim was made from");
  assert.equal(g.world.tile(x, y).kind, "wall", "its walls block the way");
  const forest = new OutsideWorld(7, "tower", true);
  // The path to the entrance stays open.
  for (let row = 0; row < 12; row++) assert.notEqual(forest.tile(MODES.tower.entranceX, row).kind, "wall");
});

// --- Chest pieces and kills ---

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "Test", hp: 10, attack: 1, defense: 0, strength });

test("a full inventory salvages a chest's piece at once", () => {
  const e = open();
  for (let i = 0; i < EQUIPMENT_CAPACITY; i++) addItem(e, "kiteShield", "common");
  assert.equal(addItem(e, "kiteShield", "common"), null);
  const kept = keepDrop(e, { def: "knightsSword", rarity: "uncommon", category: "weapon" });
  assert.deepEqual([kept.item, kept.salvaged, e.materials.whetstone], [null, RARITY_TIERS.uncommon.salvage, RARITY_TIERS.uncommon.salvage]);
});

test("Auto-salvage dismantles Common chest pieces and keeps the rest, and is saved", () => {
  const e = open();
  e.autoSalvage = true;
  const common = keepDrop(e, { def: "knightsSword", rarity: "common", category: "weapon" });
  assert.deepEqual([common.item, common.salvaged, common.auto, e.items.length, e.materials.whetstone], [null, RARITY_TIERS.common.salvage, true, 0, RARITY_TIERS.common.salvage]);
  const uncommon = keepDrop(e, { def: "knightsSword", rarity: "uncommon", category: "weapon" });
  assert.deepEqual([uncommon.item?.rarity, uncommon.auto, e.items.length], ["uncommon", false, 1]);
  assert.equal(decodeEquipment(JSON.parse(JSON.stringify(e))).autoSalvage, true);
  assert.equal(decodeEquipment({ ...e, autoSalvage: "yes" }).autoSalvage, false);
  e.autoSalvage = false;
  assert.equal(keepDrop(e, { def: "knightsSword", rarity: "common", category: "weapon" }).item?.rarity, "common");
});

test("bosses and Greater Bosses drop materials (1.5%) and a Standard piece (0.5%); other kills nothing without an enemy card's tree", () => {
  assert.deepEqual(BOSS_DROPS, { material: 1.5, equipment: 0.5 });
  const kill = (strength: Enemy["strength"], roll: number, unlocked = true) => {
    const s = defaults();
    s.equipment.unlocked = unlocked;
    const g = new Game(s, seq([roll]));
    g.newRun({ seed: 3, height: 9 });
    return { loot: (g as any).purse.enemyLoot(enemy(strength), 4, strength.length), e: g.save.equipment };
  };
  for (const strength of ["weak", "elite"] as const) assert.deepEqual(kill(strength, 0).loot.equipment, []);
  for (const strength of ["boss", "greaterBoss"] as const) {
    const { loot, e } = kill(strength, 0.004);
    assert.deepEqual(loot.equipment.map((l: any) => [!!l.materials, !!(l.item || l.salvaged)]), [[true, false], [false, true]], `${strength}: under both chances`);
    assert.ok(Object.values(e.materials).some((n) => n > 0) && e.items.length === 1);
    assert.equal(itemDef(e.items[0].def)!.class, "standard", "a Standard piece, as an Equipment Chest holds");
    assert.deepEqual(kill(strength, 0.01).loot.equipment.map((l: any) => !!l.materials), [true], "under 1.5% only: materials");
    assert.deepEqual(kill(strength, 0.015).loot.equipment, [], "1.5% and up: nothing");
    assert.deepEqual(kill(strength, 0, false).loot.equipment, [], "nothing before Equipment opens");
  }
});

// --- Gem pulls ---

const isUnique = (def: string) => itemDef(def)!.class === "unique";

test("pulls cost 20 and 200 Gems, need room, and bring the category's Standard pieces at Common to Rare, its Uniques at Epic and Legendary", () => {
  const g = new Game(defaults());
  assert.equal(g.equipment.pull("weapon", 1), "locked");
  g.save.equipment.unlocked = true;
  assert.equal(g.equipment.pull("weapon", 1), "gems");
  g.save.gems = 230;
  const one = g.equipment.pull("weapon", 1);
  assert.ok(Array.isArray(one) && one.length === 1);
  assert.equal(g.save.gems, 230 - PULL_GEMS[1]);
  const ten = g.equipment.pull("weapon", 10);
  assert.ok(Array.isArray(ten) && ten.length === 10);
  assert.equal(g.save.gems, 10);
  for (const { item } of [...one, ...ten]) {
    assert.equal(itemDef(item.def)!.category, "weapon");
    assert.equal(isUnique(item.def), rarityRank(item.rarity) >= rarityRank("epic"), `${item.def} at ${item.rarity}`);
  }
  assert.equal(g.equipment.pull("weapon", 1), "gems");
  for (let i = g.save.equipment.items.length; i < EQUIPMENT_CAPACITY - 5; i++) addItem(g.save.equipment, "kiteShield", "common");
  g.save.gems = 1000;
  assert.equal(g.equipment.pull("weapon", 10), "room");
  assert.equal(g.save.gems, 1000, "a refused pull takes nothing");
});

test("with Auto-salvage on, a pull's Common pieces are dismantled once pulled", () => {
  const g = new Game(defaults());
  const e = g.save.equipment;
  e.unlocked = true;
  e.autoSalvage = true;
  g.save.gems = 10_000;
  const pulled = [];
  for (let i = 0; i < 5; i++) {
    const r = g.equipment.pull("weapon", 10);
    assert.ok(Array.isArray(r));
    pulled.push(...r);
  }
  const commons = pulled.filter((p) => p.item.rarity === "common");
  assert.ok(commons.length && commons.length < pulled.length, "the pulls brought Common pieces and others");
  for (const p of pulled) assert.equal(!!p.salvaged, p.item.rarity === "common");
  assert.deepEqual(e.items.map((i) => i.id), pulled.filter((p) => p.item.rarity !== "common").map((p) => p.item.id));
  assert.equal(e.materials.whetstone, commons.reduce((n, p) => n + p.salvaged!.quantity, 0));
  assert.equal(commons[0].salvaged!.quantity, RARITY_TIERS.common.salvage, "a Common pulled is a Standard piece");
});

test("pulls of all types cost 10% less, reach every open category, and keep a pity count of their own", () => {
  assert.equal(pullGems(1, true), 18);
  assert.equal(pullGems(10, true), 180);
  const g = new Game(defaults());
  g.save.equipment.unlocked = true;
  g.save.gems = 18 + 180 * 6;
  const pulled = [g.equipment.pull("all", 1), ...Array.from({ length: 6 }, () => g.equipment.pull("all", 10))];
  assert.equal(g.save.gems, 0);
  const items = pulled.flatMap((r) => (Array.isArray(r) ? r.map((x) => x.item) : assert.fail(String(r))));
  assert.equal(items.length, 61);
  assert.deepEqual(new Set(items.map((i) => itemDef(i.def)!.category)), new Set(STARTER_CATEGORIES), "all-type pulls reach only the five starting categories");
  let since = 0;
  for (const i of items) since = rarityRank(i.rarity) >= rarityRank("epic") ? 0 : since + 1;
  assert.equal(g.save.equipment.pity.all, since, "pulls of all types count their own pity");
  for (const c of CATEGORY_IDS) assert.equal(g.save.equipment.pity[c], 0, "and leave each category's alone");
  assert.equal(g.equipment.pull("all", 1), "gems");
});

test("pull rarities follow the configured rates", () => {
  assert.deepEqual(PULL_RATES, { common: 60, uncommon: 29, rare: 8, epic: 2.5, legendary: 0.5 });
  assert.equal(rollRarity(PULL_RATES, 0.599), "common");
  assert.equal(rollRarity(PULL_RATES, 0.6), "uncommon");
  assert.equal(rollRarity(PULL_RATES, 0.889), "uncommon");
  assert.equal(rollRarity(PULL_RATES, 0.89), "rare");
  assert.equal(rollRarity(PULL_RATES, 0.97), "epic");
  assert.equal(rollRarity(PULL_RATES, 0.995), "legendary");
  const e = open(), counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < 300; i++) {
    for (const { item } of pull(e, "boots", 10, () => 0.25)) counts[item.rarity]++;
    e.items = [];
  }
  assert.ok(Math.abs(counts.common / 3000 - 0.6) < 0.03 && Math.abs(counts.uncommon / 3000 - 0.29) < 0.03 && Math.abs(counts.rare / 3000 - 0.08) < 0.02, JSON.stringify(counts));
});

test("pity: the 120th pull in a row without an Epic or better is an Epic Unique, per category, counted through a ×10", () => {
  assert.equal(PITY, 120);
  const e = open();
  e.pity.boots = PITY - 5;
  const rolls = pull(e, "boots", 10, () => 0.5);
  const pityAt = rolls.findIndex((r) => r.pity);
  assert.ok(pityAt >= 0 && pityAt <= 4, "the pity Epic comes by the fifth pull");
  assert.equal(rolls[pityAt].item.rarity, "epic");
  assert.ok(isUnique(rolls[pityAt].item.def));
  assert.equal(e.pity.weapon, 0, "other categories keep their own count");
  const forced = open();
  forced.pity.helmet = PITY - 1;
  const p = pullOne(forced, "helmet", seq([0]));
  assert.deepEqual([p.item.rarity, isUnique(p.item.def)], ["epic", true], "even on a Common roll");
  assert.equal(forced.pity.helmet, 0);
  const natural = open();
  natural.pity.helmet = 50;
  pullOne(natural, "helmet", seq([0.999, 0, 0]));
  assert.equal(natural.pity.helmet, 0, "a natural Legendary resets it");
  pullOne(natural, "helmet", seq([0.9, 0, 0]));
  assert.equal(natural.pity.helmet, 1, "a Rare doesn't");
});

test("relics' bonus moves Gem pull chance from Common to Epic", () => {
  const e = open();
  const rows = pullRates(e, "weapon", 1);
  assert.deepEqual(rows.map((r) => [r.rarity, r.chance]), [["common", 59], ["uncommon", 29], ["rare", 8], ["epic", 3.5], ["legendary", 0.5]]);
});

test("each category's pulls, pulls of all types and substat rolls keep saved streams of their own, so reloading can't reroll them", () => {
  const a = open(), b = open();
  pull(a, "boots", 1, () => 0.3);
  b.streams = { ...a.streams };
  const next = pull(a, "boots", 10, () => 0.9).map((r) => r.item.def + r.item.rarity);
  const again = pull(decodeEquipment(JSON.parse(JSON.stringify(b))), "boots", 10, () => 0.1).map((r) => r.item.def + r.item.rarity);
  assert.deepEqual(next, again);
  // Pulling in one category leaves every other stream where it stood.
  const c = open();
  pull(c, "weapon", 1, () => 0.3);
  pull(c, "all", 1, () => 0.6);
  const before = { ...c.streams };
  pull(c, "helmet", 10, () => 0.7);
  assert.deepEqual([c.streams.weapon, c.streams.all, c.streams.substats], [before.weapon, before.all, undefined]);
  assert.ok(c.streams.helmet !== undefined);
});

test("the draw rates divide each rarity among the named pieces, and a Unique left out gives its share to the rest", () => {
  const e = open();
  const rows = pullRates(e, "shield");
  const share = (rarity: string, def: string) => rows.find((r) => r.rarity === rarity)!.pieces.find((p) => p.def === def)!.chance;
  assert.equal(share("common", "kiteShield"), 20, "60% among three Standard pieces");
  assert.equal(share("epic", "zenithGuard"), 2.5 / 3);
  e.drawOff = ["zenithGuard"];
  const left = pullRates(e, "shield");
  const after = (def: string) => left.find((r) => r.rarity === "epic")!.pieces.find((p) => p.def === def)!.chance;
  assert.deepEqual([after("zenithGuard"), after("amberPrison"), after("cradleOfLife")], [0, 1.25, 1.25]);
  const all = pullRates(open(), "all");
  assert.equal(all.find((r) => r.rarity === "common")!.pieces.length, 15, "all types: every open category's three");
  assert.ok(Math.abs(all.find((r) => r.rarity === "legendary")!.pieces.reduce((n, p) => n + p.chance, 0) - 0.5) < 1e-9);
});

test("the first five-Star copy of a Unique leaves it out of draws; toggles show once a five-Star piece is owned; every Unique left out refuses the pulls", () => {
  const g = new Game(defaults());
  const e = g.save.equipment;
  e.unlocked = true;
  g.save.gems = 1000;
  assert.equal(g.equipment.setDrawn("raptorBlade", false), false, "no toggles before a five-Star piece");
  const a = addItem(e, "raptorBlade", "ancestral")!;
  a.stars = 4;
  merge(e, a.id, [addItem(e, "raptorBlade", "legendary")!.id]);
  assert.equal(a.stars, 5);
  assert.deepEqual([e.maxed, e.drawOff], [["raptorBlade"], ["raptorBlade"]]);
  assert.equal(drawTogglesOpen(e), true);
  assert.ok(g.equipment.setDrawn("raptorBlade", true));
  assert.deepEqual(e.drawOff, []);
  // A second five-Star copy leaves the player's choice alone.
  const b = addItem(e, "raptorBlade", "ancestral")!;
  b.stars = 4;
  merge(e, b.id, [addItem(e, "raptorBlade", "legendary")!.id]);
  assert.deepEqual(e.drawOff, []);
  for (const d of uniquesOf("weapon")) g.equipment.setDrawn(d.id, false);
  assert.equal(g.equipment.pull("weapon", 1), "excluded");
  assert.equal(g.save.gems, 1000);
  assert.ok(Array.isArray(g.equipment.pull("shield", 1)), "other categories still pull");
  assert.deepEqual(decodeEquipment(JSON.parse(JSON.stringify(e))).drawOff, e.drawOff);
  // All types never land an Epic or Legendary in a category with every Unique left out.
  for (let i = 0; i < 200; i++) {
    const r = pullOne(e, "all", Math.random);
    if (isUnique(r.item.def)) assert.notEqual(itemDef(r.item.def)!.category, "weapon");
  }
});

// --- Leveling, merging, dismantling ---

test("leveling costs the curve's Gold and material, stops at the cap, and records the investment", () => {
  const e = open(), purse = { gold: 1e9 }, mat = materialOf("boots");
  e.materials[mat] = 1e6;
  const boots = addItem(e, "travelersBoots", "common")!;
  assert.equal(boots.level, 0, "a piece starts at level 0");
  assert.equal(levelUp(e, purse, boots.id, 1, false), 1);
  assert.deepEqual([purse.gold, e.materials[mat]], [1e9 - upgradeGold(1), 1e6 - upgradeMaterial(1)]);
  assert.equal(levelUp(e, purse, boots.id, 100, false), RARITY_TIERS.common.maxLevel - 1);
  assert.equal(boots.level, RARITY_TIERS.common.maxLevel);
  assert.equal(levelUp(e, purse, boots.id, 1, false), "maxed");
  assert.equal(boots.spent!.gold, 1e9 - purse.gold);
  const poor = { gold: 0 };
  assert.equal(levelUp(e, poor, addItem(e, "travelersBoots", "common")!.id, 1, false), "gold");
  e.materials[mat] = 0;
  assert.equal(levelUp(e, purse, addItem(e, "travelersBoots", "common")!.id, 1, false), "material");
});

test("merging takes exactly two other copies, raises the chosen target's rarity and keeps its level", () => {
  const e = open();
  const [a, b, c, d] = [0, 1, 2, 3].map(() => addItem(e, "amberPrison", "uncommon")!);
  a.level = 29;
  equip(e, "tower", a.id);
  setLocked(e, a.id, true);
  b.level = 4;
  addItem(e, "amberPrison", "rare");
  addItem(e, "kiteShield", "uncommon");
  assert.deepEqual(mergeFodder(e, a).map((i) => i.id), [c.id, d.id, b.id], "same piece and rarity, lowest level first");
  assert.equal(merge(e, a.id, [b.id]), "count");
  assert.equal(merge(e, a.id, [b.id, b.id]), "count");
  assert.equal(merge(e, a.id, [b.id, e.items.at(-1)!.id]), "mismatch");
  setLocked(e, c.id, true);
  assert.equal(merge(e, a.id, [b.id, c.id]), "protected", "a locked copy is never used up");
  const before = e.items.length;
  const merged = merge(e, a.id, [b.id, d.id]);
  assert.ok(typeof merged !== "string");
  assert.deepEqual([merged.id, merged.rarity, merged.level, merged.locked, e.equipped.tower.shield], [a.id, "rare", 29, true, a.id]);
  assert.equal(e.items.length, before - 2);
  assert.ok(!e.items.some((i) => i.id === b.id || i.id === d.id));
  const r = addItem(e, "amberPrison", "rare")!;
  assert.equal(merge(e, r.id, []), "count", "Rare merges on, into Epic");
});

test("Epic and Legendary take two copies and one more piece of the category; Mythic two copies; Ancestral takes Stars", () => {
  const e = open();
  const [a, b] = [0, 1].map(() => addItem(e, "raptorBlade", "epic")!);
  const other = addItem(e, "soulReaper", "epic")!, std = addItem(e, "knightsSword", "epic")!, shield = addItem(e, "amberPrison", "epic")!;
  addItem(e, "raptorBlade", "legendary");
  a.level = 70;
  assert.deepEqual(mergePlan(a), { kind: "rarity", next: "legendary", same: 2, any: 1, need: 2 });
  assert.deepEqual(mergeFodder(e, a).map((i) => i.id), [b.id, std.id, other.id], "its copies first, then the category's others, Standard before Unique");
  assert.deepEqual(defaultFodder(e, a).map((i) => i.id), [b.id, std.id], "a Standard piece is the cheapest fodder");
  assert.equal(merge(e, a.id, [other.id, std.id]), "mismatch", "one copy of the piece itself is needed");
  assert.equal(merge(e, a.id, [b.id, shield.id]), "mismatch", "the third piece is of the same category");
  assert.ok(typeof merge(e, a.id, [b.id, other.id]) !== "string", "a Unique of the category serves as the third");
  assert.deepEqual([a.rarity, a.level], ["legendary", 70]);
  // Legendary to Mythic, the same way.
  const [c, d] = [0, 1].map(() => addItem(e, "raptorBlade", "legendary")!);
  assert.ok(typeof merge(e, a.id, [c.id, d.id]) !== "string", "two more copies serve too");
  assert.equal(a.rarity, "mythic");
  // Mythic to Ancestral: two copies, nothing else.
  const m = addItem(e, "raptorBlade", "mythic")!;
  assert.deepEqual(mergePlan(a), { kind: "rarity", next: "ancestral", same: 2, any: 0, need: 1 });
  assert.ok(typeof merge(e, a.id, [m.id]) !== "string");
  assert.deepEqual([a.rarity, a.stars, maxLevel(a)], ["ancestral", undefined, 200]);
  // Each Star: one Legendary copy of the same piece, up to five.
  for (let star = 1; star <= STARS.most; star++) {
    assert.equal(merge(e, a.id, [addItem(e, "soulReaper", "legendary")!.id]), "mismatch", "only its own definition");
    assert.ok(typeof merge(e, a.id, [addItem(e, "raptorBlade", "legendary")!.id]) !== "string");
    assert.deepEqual([a.stars, maxLevel(a)], [star, 200 + 20 * star]);
  }
  assert.equal(mergePlan(a), null, "five Stars is the top");
  assert.equal(merge(e, a.id, [addItem(e, "raptorBlade", "legendary")!.id]), "unmergeable");
});

test("Standard pieces merge up to Legendary and no higher; Rare takes three copies into Epic", () => {
  const e = open();
  const [a, b, c] = [0, 1, 2].map(() => addItem(e, "knightsSword", "rare")!);
  assert.ok(typeof merge(e, a.id, [b.id, c.id]) !== "string");
  assert.equal(a.rarity, "epic");
  const [d, f] = [0, 1].map(() => addItem(e, "knightsSword", "epic")!);
  assert.ok(typeof merge(e, a.id, [d.id, f.id]) !== "string");
  assert.deepEqual([a.rarity, maxLevel(a), mergePlan(a)], ["legendary", 120, null]);
  assert.equal(merge(e, a.id, [addItem(e, "knightsSword", "legendary")!.id, addItem(e, "knightsSword", "legendary")!.id]), "unmergeable");
});

test("Auto-assemble offers every merge at once, none sharing a piece, leaving worn pieces out and locked ones only kept", () => {
  const e = open();
  const [worn, locked, a, b, c, d, f] = [0, 1, 2, 3, 4, 5, 6].map(() => addItem(e, "amberPrison", "uncommon")!);
  equip(e, "tower", worn.id);
  setLocked(e, locked.id, true);
  [worn.level, locked.level, a.level, b.level, c.level, d.level, f.level] = [40, 3, 9, 1, 5, 2, 7];
  addItem(e, "kiteShield", "uncommon");
  addItem(e, "kiteShield", "uncommon");
  [0, 1, 2].map(() => addItem(e, "knightsSword", "common"));
  const merges = autoMerges(e);
  assert.deepEqual(merges, [
    { target: locked.id, fodder: [b.id, d.id] },
    { target: a.id, fodder: [c.id, f.id] },
  ], "the locked piece kept first, then the highest level; the lowest-level copies used up");
  for (const m of merges) assert.ok(typeof merge(e, m.target, m.fodder) !== "string", "each merge still stands after those before it");
  assert.deepEqual([worn, locked, a].map((i) => i.rarity), ["uncommon", "rare", "rare"]);
  assert.deepEqual(autoMerges(e), [], "nothing left to assemble");
});

test("Auto-assemble fills an Epic recipe's third place with the category's cheapest piece, and never offers a Star", () => {
  const e = open();
  const [a, b] = [0, 1].map(() => addItem(e, "raptorBlade", "epic")!);
  const std = addItem(e, "knightsSword", "epic")!;
  a.level = 9;
  const anc = addItem(e, "soulReaper", "ancestral")!;
  addItem(e, "soulReaper", "legendary");
  assert.deepEqual(autoMerges(e), [{ target: a.id, fodder: [b.id, std.id] }]);
  assert.equal(mergePlan(anc)?.kind, "star");
});

test("Common pieces never merge: they are only worn as they are or salvaged", () => {
  const e = open();
  const [a, b, c] = [0, 1, 2].map(() => addItem(e, "amberPrison", "common")!);
  assert.deepEqual(mergeFodder(e, a), [], "no Common piece is a merge candidate");
  assert.equal(merge(e, a.id, [b.id, c.id]), "unmergeable");
  assert.deepEqual(e.items.map((i) => i.rarity), ["common", "common", "common"]);
});

test("dismantling returns the rarity's salvage (Uniques twice), never the investment, and never takes protected pieces", () => {
  const e = open();
  const common = addItem(e, "knightsSword", "common")!, rare = addItem(e, "raptorBlade", "rare")!, worn = addItem(e, "knightsSword", "uncommon")!;
  common.level = 15;
  common.spent = { gold: 9999, material: 400 };
  equip(e, "delve", worn.id);
  assert.equal(dismantle(e, [common.id, worn.id]), "protected");
  assert.equal(dismantle(e, []), "empty");
  assert.deepEqual(salvageTotals(e, [common.id, rare.id]), { whetstone: RARITY_TIERS.common.salvage + RARITY_TIERS.rare.salvage * 2 });
  assert.deepEqual(dismantle(e, [common.id, rare.id]), { whetstone: 5 + 150 });
  assert.equal(e.materials.whetstone, 155);
  assert.deepEqual(e.items.map((i) => i.id), [worn.id]);
  assert.ok(isProtected(e, worn));
  unequip(e, "delve", "weapon");
  assert.ok(!isProtected(e, worn));
});

test("the inventory holds at most 500 pieces", () => {
  const e = open();
  for (let i = 0; i < EQUIPMENT_CAPACITY; i++) assert.ok(addItem(e, "leatherBelt", "common"));
  assert.equal(addItem(e, "leatherBelt", "common"), null);
  assert.equal(decodeEquipment(JSON.parse(JSON.stringify({ ...e, items: [...e.items, { id: "e9999", def: "leatherBelt", rarity: "common", level: 1 }] }))).items.length, EQUIPMENT_CAPACITY);
});

// --- Stats ---

test("worn stats are derived: equip, unequip, reload and mode switches never count them twice", () => {
  const s = defaults();
  s.upgrades.breakthrough = 1;
  s.equipment.unlocked = true;
  const g = new Game(s);
  g.newRun({ seed: 9 });
  const base = g.run.player.attack;
  const sword = addItem(s.equipment, "knightsSword", "common")!;
  g.equipment.equip("tower", sword.id);
  const worn = g.run.player.attack;
  assert.equal(worn, loadout(s, "tower").attack, "the run takes the loadout's ATK");
  assert.equal(worn, snap(base * 1.01), "+1% ATK at Common, level 0");
  for (let i = 0; i < 5; i++) {
    g.equipment.equip("tower", sword.id);
    g.equipment.equip("tower", sword.id);
    assert.equal(g.run.player.attack, worn);
    g.equipment.unequip("tower", "weapon");
    assert.equal(g.run.player.attack, base);
  }
  g.equipment.equip("tower", sword.id);
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(reloaded.run.player.attack, worn, "a reload keeps the run's stats as they were");
  reloaded.switchMode("delve");
  reloaded.switchMode("tower");
  assert.equal(reloaded.run.player.attack, worn);
  assert.equal(loadout(reloaded.save, "delve").attack, loadout(defaults()).attack, "the Delve's hero wears its own");
  // Leveling the worn piece shifts the run by just the difference.
  reloaded.save.gold = 1e6;
  reloaded.save.equipment.materials.whetstone = 1e3;
  reloaded.equipment.levelUp(sword.id, 5);
  assert.equal(reloaded.run.player.attack, loadout(reloaded.save, "tower").attack);
  assert.equal(reloaded.run.player.attack, snap(base * 1.02), "+2% at level 5");
});

test("the worn Helmet's Arcanum Damage raises what arcana strike for", () => {
  const s = defaults();
  s.equipment.unlocked = true;
  const g = new Game(s);
  g.newRun({ seed: 9 });
  const boost = (g.arcana as any).boost.bind(g.arcana);
  const plain = boost(2);
  const helm = addItem(s.equipment, "ironHelm", "rare")!;
  helm.level = 10;
  g.equipment.equip("tower", helm.id);
  assert.equal(boost(2), (plain * (100 + 8 + 2.4)) / 100);
});

test("a Delve loadout reaches the Delve run and not the Tower's", () => {
  const s = defaults();
  s.upgrades.breakthrough = 1;
  s.equipment.unlocked = true;
  const g = new Game(s);
  g.newRun({ seed: 2 });
  const tower = g.run.player.defense;
  g.switchMode("delve");
  g.newRun({ seed: 2 });
  const delve = g.run.player.defense;
  g.equipment.equip("delve", addItem(s.equipment, "ironShield", "common")!.id);
  assert.equal(g.run.player.defense, snap(delve * 1.01));
  g.switchMode("tower");
  assert.equal(g.run.player.defense, tower);
});

test("Boss ATK raises the hero's strikes on bosses only", () => {
  const p = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, bossAttack: 50 };
  const boss: Enemy = { name: "B", hp: 30, attack: 1, defense: 0, strength: "boss" };
  assert.equal(predict(p, boss).hit, 15);
  assert.equal(predict(p, { ...boss, strength: "normal" }).hit, 10);
});

test("victory heal restores a share of max HP after a won fight", () => {
  const s = defaults();
  s.equipment.unlocked = true;
  const amulet = addItem(s.equipment, "phoenixTalisman", "rare")!;
  amulet.level = 1;
  amulet.slots = [{ effect: "secondWind", rarity: "rare" }];
  s.equipment.equipped.tower.amulet = amulet.id;
  const g = new Game(s);
  g.newRun({ seed: 4 });
  assert.equal(g.stepRules.victoryHeal, 4.5);
  const player = { ...g.run.player, hp: 50, maxHp: 100, attack: 50, defense: 50 };
  const next = resolveStep(player, { kind: "enemy", enemy: { name: "E", hp: 10, attack: 1, defense: 0, strength: "weak" } } as never, g.stepRules);
  assert.equal(next.player.hp, 54.5);
});
