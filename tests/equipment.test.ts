import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { OutsideWorld, BLACKSMITH } from "../src/outside.ts";
import { MODES } from "../src/modes.ts";
import { unlockFloor } from "../src/goals.ts";
import { random } from "../src/random.ts";
import { loadout } from "../src/loadout.ts";
import { predict } from "../src/combat.ts";
import { resolveStep } from "../src/step-effects.ts";
import {
  CATEGORIES, CATEGORY_IDS, EQUIP_MATERIALS, EQUIP_MATERIAL_IDS, ITEMS, itemDef, materialOf, standardOf, uniquesOf,
} from "../src/equipment/catalog.ts";
import {
  BOSS_DROPS, EQUIPMENT_CAPACITY, MATERIAL_DROPS, PITY, PULL_GEMS, PULL_RATES, pullGems, RARITY_TIERS,
  upgradeGold, upgradeMaterial,
} from "../src/equipment/balance.ts";
import {
  addItem, decodeEquipment, defaultEquipment, dismantle, equip, isProtected, levelUp, merge, mergeFodder, salvageTotals,
  setLocked, unequip, type EquipmentSave,
} from "../src/equipment/inventory.ts";
import { lineValue, effectText } from "../src/equipment/effects.ts";
import { keepDrop, pull, pullOne, rollBossDrop, rollMaterials, rollRarity } from "../src/equipment/acquire.ts";
import { ICON_ROWS, pieceRows } from "../src/ui/equipment-icons.ts";
import type { Enemy } from "../src/entities.ts";

const open = (): EquipmentSave => ({ ...defaultEquipment(), unlocked: true });
/** A stream that returns `values` in turn, then the last forever. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

// --- Catalogue ---

test("nine categories, each with its own material, a Standard piece and three Uniques", () => {
  assert.equal(CATEGORY_IDS.length, 9);
  assert.equal(EQUIP_MATERIAL_IDS.length, 9);
  assert.deepEqual(new Set(CATEGORY_IDS.map(materialOf)).size, 9, "one material per category");
  for (const c of CATEGORY_IDS) {
    assert.equal(standardOf(c).class, "standard");
    assert.equal(uniquesOf(c).length, 3, c);
    assert.equal(EQUIP_MATERIALS[CATEGORIES[c].material].category, c);
  }
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length, "ids are unique");
  assert.equal(new Set(ITEMS.map((i) => i.name)).size, ITEMS.length, "names are unique");
  for (const item of ITEMS) {
    assert.ok(item.effects.some((l) => !l.from || l.from === "common"), `${item.id} does something at Common`);
    for (const r of ["uncommon", "rare"] as const)
      assert.ok(item.class === "standard" || item.effects.some((l) => l.from === r), `${item.id} opens a line at ${r}`);
  }
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

test("lines grow with level and rarity power; fixed lines don't; whole kinds round down", () => {
  const sword = standardOf("weapon").effects[0]; // +3 ATK, +0.5 a level
  assert.equal(lineValue(sword, "common", 1), 3);
  assert.equal(lineValue(sword, "common", 11), 8);
  assert.equal(lineValue(sword, "uncommon", 1), 3.75);
  assert.equal(lineValue(sword, "rare", 1), 4.8);
  const blood = ITEMS.find((i) => i.id === "bloodpriceBlade")!.effects.find((l) => l.fixed)!;
  assert.equal(lineValue(blood, "rare", 60), -10, "a drawback never grows");
  const keys = ITEMS.find((i) => i.id === "locksmithsGloves")!.effects[0];
  assert.equal(lineValue(keys, "common", 20), 1, "1.76 keys is one key");
  assert.equal(effectText("attack", 3.75), "+3.75 ATK");
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
  const a = addItem(e, "kingsbane", "rare")!, b = addItem(e, "steelCuirass", "common")!;
  e.materials.whetstone = 999;
  s.gold = 1e6;
  levelUp(e, s, a.id, 5, false);
  setLocked(e, b.id, true);
  equip(e, "tower", a.id);
  equip(e, "delve", b.id);
  e.pity.helmet = 57;
  pull(e, "ring", 3, seq([0.5]));
  const loaded = decode(JSON.stringify(s)).equipment;
  assert.deepEqual(loaded, e);
  assert.ok(!JSON.stringify(loaded).includes("Kingsbane"), "no catalogue data saved");
});

test("decoding drops unknown pieces, clamps levels to the cap, and keeps loadouts to owned pieces of the right category", () => {
  const raw = {
    unlocked: true, nextId: 1,
    items: [
      { id: "e1", def: "knightsSword", rarity: "common", level: 99 },
      { id: "e2", def: "nope", rarity: "common", level: 1 },
      { id: "e3", def: "silverBand", rarity: "legendary", level: 1 },
      { id: "e1", def: "silverBand", rarity: "common", level: 1 },
      { id: "e4", def: "silverBand", rarity: "common", level: 1 },
    ],
    equipped: { tower: { weapon: "e1", ring: "e1", helmet: "e2" }, delve: { ring: "e4" } },
    pity: { weapon: PITY, ring: 12 },
    materials: { amber: -3, silk: 4 },
  };
  const e = decodeEquipment(raw);
  assert.deepEqual(e.items.map((i) => [i.id, i.level]), [["e1", 20], ["e4", 1]]);
  assert.deepEqual(e.equipped, { tower: { weapon: "e1" }, delve: { ring: "e4" } });
  assert.deepEqual([e.pity.weapon, e.pity.ring], [0, 12]);
  assert.deepEqual([e.materials.amber, e.materials.silk], [0, 4]);
  assert.equal(e.nextId, 5, "never reuses an id");
});

// --- Unlock and the Blacksmith ---

test("Equipment opens by claiming Tower I's floor 60 Goal, not by reaching a floor", () => {
  const floor = unlockFloor("equipment");
  assert.equal(floor, 60);
  const s = defaults();
  s.tower.best = s.tower.reached = 200;
  s.delve.best = 2000;
  const g = new Game(s);
  assert.equal(g.save.equipment.unlocked, false, "reaching floors opens nothing");
  g.newRun({ outside: true, seed: 7 });
  assert.equal(g.claimGoal(1, floor, false)?.kind, "unlock");
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
  g.save.tower.reached = 60;
  g.claimGoal(1, 60, false);
  assert.equal(g.atBlacksmith(x, y), true, "standing at once in the forest the claim was made from");
  assert.equal(g.world.tile(x, y).kind, "wall", "its walls block the way");
  const forest = new OutsideWorld(7, "tower", true);
  // The path to the entrance stays open.
  for (let row = 0; row < 12; row++) assert.notEqual(forest.tile(MODES.tower.entranceX, row).kind, "wall");
});

// --- Boss drops and materials ---

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "Test", hp: 10, attack: 1, defense: 0, strength });

test("bosses drop only Standard pieces, on any floor", () => {
  assert.equal(rollBossDrop("strong", 0, seq([0])), null, "only bosses");
  const rng = random(42);
  let drops = 0;
  for (let i = 0; i < 2000; i++) {
    const d = rollBossDrop("boss", 0, rng);
    if (!d) continue;
    drops++;
    assert.equal(ITEMS.find((it) => it.id === d.def)!.class, "standard");
    assert.notEqual(d.rarity, "rare", "a boss drops Common or Uncommon");
  }
  assert.ok(Math.abs(drops / 2000 - BOSS_DROPS.boss!.chance / 100) < 0.05, `${drops} of 2000`);
  assert.ok(rollBossDrop("greaterBoss", 0, seq([0.99, 0, 0])), "a Greater Boss always drops one");
});

test("a full inventory salvages a boss drop at once", () => {
  const e = open();
  for (let i = 0; i < EQUIPMENT_CAPACITY; i++) addItem(e, "silverBand", "common");
  assert.equal(addItem(e, "silverBand", "common"), null);
  const kept = keepDrop(e, { def: "knightsSword", rarity: "uncommon", category: "weapon" });
  assert.deepEqual([kept.item, kept.salvaged, e.materials.whetstone], [null, RARITY_TIERS.uncommon.salvage, RARITY_TIERS.uncommon.salvage]);
});

test("material drops scale with the enemy and the floor, raised by Material Find", () => {
  assert.equal(rollMaterials("weak", 0, 0, seq([0.99])), null);
  assert.deepEqual(rollMaterials("boss", 0, 0, seq([0, 0]))?.quantity, MATERIAL_DROPS.boss.amount);
  assert.equal(rollMaterials("boss", 100, 0, seq([0, 0]))!.quantity, MATERIAL_DROPS.boss.amount * 5);
  assert.equal(rollMaterials("boss", 100, 50, seq([0, 0]))!.quantity, 60);
});

test("a boss beaten after Equipment opens pays its drop through the run, once per physical kill, on any floor", () => {
  const s = defaults();
  s.equipment.unlocked = true;
  const g = new Game(s, seq([0]));
  g.newRun({ seed: 3, height: 9 });
  const purse = (g as any).purse;
  const first = purse.enemyLoot(enemy("boss"), 4, 4);
  assert.ok(first.equipment.item, "a drop at the 0 roll");
  assert.equal(g.save.equipment.items.length, 1);
  const again = purse.enemyLoot(enemy("boss"), 4, 4);
  assert.equal(again.equipment, null, "undo and fight it again: nothing more");
  assert.equal(g.save.equipment.items.length, 1);
});

// --- Gem pulls ---

test("pulls cost 20 and 200 Gems, need room, and bring only the category's Uniques", () => {
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
  for (const { item } of [...one, ...ten]) assert.ok(uniquesOf("weapon").some((d) => d.id === item.def));
  assert.equal(g.equipment.pull("weapon", 1), "gems");
  for (let i = g.save.equipment.items.length; i < EQUIPMENT_CAPACITY - 5; i++) addItem(g.save.equipment, "silverBand", "common");
  g.save.gems = 1000;
  assert.equal(g.equipment.pull("ring", 10), "room");
  assert.equal(g.save.gems, 1000, "a refused pull takes nothing");
});

test("pulls of all types cost 10% less and bring Uniques of every category", () => {
  assert.equal(pullGems(1, true), 18);
  assert.equal(pullGems(10, true), 180);
  const g = new Game(defaults());
  g.save.equipment.unlocked = true;
  g.save.gems = 18 + 180 * 6;
  const pulled = [g.equipment.pull("all", 1), ...Array.from({ length: 6 }, () => g.equipment.pull("all", 10))];
  assert.equal(g.save.gems, 0);
  const items = pulled.flatMap((r) => (Array.isArray(r) ? r.map((x) => x.item) : assert.fail(String(r))));
  assert.equal(items.length, 61);
  assert.ok(items.every((i) => itemDef(i.def)!.class === "unique"));
  assert.deepEqual(new Set(items.map((i) => itemDef(i.def)!.category)), new Set(CATEGORY_IDS), "61 pulls reach all nine");
  // Each category's pity counts its own pulls since its last Rare.
  const since = Object.fromEntries(CATEGORY_IDS.map((c) => [c, 0]));
  for (const i of items) { const c = itemDef(i.def)!.category; since[c] = i.rarity === "rare" ? 0 : since[c] + 1; }
  assert.deepEqual(g.save.equipment.pity, since);
  assert.equal(g.equipment.pull("all", 1), "gems");
});

test("pull rarities follow the configured rates", () => {
  assert.deepEqual(PULL_RATES, { common: 72, uncommon: 25, rare: 3 });
  assert.equal(rollRarity(PULL_RATES, 0.71), "common");
  assert.equal(rollRarity(PULL_RATES, 0.72), "uncommon");
  assert.equal(rollRarity(PULL_RATES, 0.969), "uncommon");
  assert.equal(rollRarity(PULL_RATES, 0.97), "rare");
  const e = open(), counts = { common: 0, uncommon: 0, rare: 0 };
  for (let i = 0; i < 300; i++) {
    for (const { item } of pull(e, "boots", 10, () => 0.25)) counts[item.rarity]++;
    e.items = [];
  }
  assert.ok(Math.abs(counts.common / 3000 - 0.72) < 0.03 && Math.abs(counts.uncommon / 3000 - 0.25) < 0.03, JSON.stringify(counts));
});

test("pity: the 100th pull in a row without a Rare is Rare, per category, counted through a ×10", () => {
  const e = open();
  e.pity.cape = PITY - 5;
  const rolls = pull(e, "cape", 10, () => 0.5); // the stream's first draw seeds it
  // Without a natural Rare, pull 5 of the ten is the pity Rare, and the count starts over.
  const pityAt = rolls.findIndex((r) => r.pity);
  assert.ok(pityAt <= 4, "the pity Rare comes by the fifth pull");
  assert.equal(rolls[pityAt].item.rarity, "rare");
  assert.equal(e.pity.weapon, 0, "other categories keep their own count");
  const forced = open();
  forced.pity.belt = PITY - 1;
  assert.deepEqual(pullOne(forced, "belt", seq([0])).item.rarity, "rare", "even on a Common roll");
  assert.equal(forced.pity.belt, 0);
  const natural = open();
  natural.pity.belt = 50;
  pullOne(natural, "belt", seq([0.99, 0]));
  assert.equal(natural.pity.belt, 0, "a natural Rare resets it");
  pullOne(natural, "belt", seq([0, 0]));
  assert.equal(natural.pity.belt, 1);
});

test("pulls carry on a saved stream, so reloading can't reroll them", () => {
  const a = open(), b = open();
  pull(a, "amulet", 1, () => 0.3);
  b.rng = a.rng;
  const next = pull(a, "amulet", 10, () => 0.9).map((r) => r.item.def + r.item.rarity);
  const again = pull(decodeEquipment(JSON.parse(JSON.stringify(b))), "amulet", 10, () => 0.1).map((r) => r.item.def + r.item.rarity);
  assert.deepEqual(next, again);
});

// --- Leveling, merging, dismantling ---

test("leveling costs the curve's Gold and material, stops at the cap, and records the investment", () => {
  const e = open(), purse = { gold: 1e9 }, mat = materialOf("boots");
  e.materials[mat] = 1e6;
  const boots = addItem(e, "travelersBoots", "common")!;
  assert.equal(levelUp(e, purse, boots.id, 1, false), 1);
  assert.deepEqual([purse.gold, e.materials[mat]], [1e9 - upgradeGold(1), 1e6 - upgradeMaterial(1)]);
  assert.equal(levelUp(e, purse, boots.id, 100, false), RARITY_TIERS.common.maxLevel - 2);
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
  const [a, b, c, d] = [0, 1, 2, 3].map(() => addItem(e, "ringOfWarding", "common")!);
  a.level = 9;
  equip(e, "tower", a.id);
  setLocked(e, a.id, true);
  b.level = 4;
  addItem(e, "ringOfWarding", "uncommon");
  addItem(e, "silverBand", "common");
  assert.deepEqual(mergeFodder(e, a).map((i) => i.id), [c.id, d.id, b.id], "same piece and rarity, lowest level first");
  assert.equal(merge(e, a.id, [b.id]), "count");
  assert.equal(merge(e, a.id, [b.id, b.id]), "count");
  assert.equal(merge(e, a.id, [b.id, e.items.at(-1)!.id]), "mismatch");
  setLocked(e, c.id, true);
  assert.equal(merge(e, a.id, [b.id, c.id]), "protected", "a locked copy is never used up");
  const before = e.items.length;
  const merged = merge(e, a.id, [b.id, d.id]);
  assert.ok(typeof merged !== "string");
  assert.deepEqual([merged.id, merged.rarity, merged.level, merged.locked, e.equipped.tower.ring], [a.id, "uncommon", 9, true, a.id]);
  assert.equal(e.items.length, before - 2);
  assert.ok(!e.items.some((i) => i.id === b.id || i.id === d.id));
  const r = addItem(e, "ringOfWarding", "rare")!;
  assert.equal(merge(e, r.id, []), "top", "Rare is the top for now");
});

test("dismantling returns the rarity's salvage (Uniques twice), never the investment, and never takes protected pieces", () => {
  const e = open();
  const common = addItem(e, "knightsSword", "common")!, rare = addItem(e, "kingsbane", "rare")!, worn = addItem(e, "knightsSword", "uncommon")!;
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
  s.upgrades.delve = 1;
  s.equipment.unlocked = true;
  const g = new Game(s);
  g.newRun({ seed: 9 });
  const base = g.run.player.attack;
  const sword = addItem(s.equipment, "knightsSword", "common")!;
  for (let i = 0; i < 5; i++) {
    g.equipment.equip("tower", sword.id);
    g.equipment.equip("tower", sword.id);
    assert.equal(g.run.player.attack, base + 3);
    g.equipment.unequip("tower", "weapon");
    assert.equal(g.run.player.attack, base);
  }
  g.equipment.equip("tower", sword.id);
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(reloaded.run.player.attack, base + 3, "a reload keeps the run's stats as they were");
  assert.equal(loadout(reloaded.save, "tower").attack, loadout(defaults()).attack + 3);
  reloaded.switchMode("delve");
  reloaded.switchMode("tower");
  assert.equal(reloaded.run.player.attack, base + 3);
  assert.equal(loadout(reloaded.save, "delve").attack, loadout(defaults()).attack, "the Delve's hero wears its own");
  // Leveling the worn piece shifts the run by just the difference.
  reloaded.save.gold = 1e6;
  reloaded.save.equipment.materials.whetstone = 1e3;
  reloaded.equipment.levelUp(sword.id, 2);
  assert.equal(reloaded.run.player.attack, base + 4);
});

test("a Delve loadout reaches the Delve run and not the Tower's", () => {
  const s = defaults();
  s.upgrades.delve = 1;
  s.equipment.unlocked = true;
  const g = new Game(s);
  g.newRun({ seed: 2 });
  const tower = g.run.player.defense;
  g.switchMode("delve");
  g.newRun({ seed: 2 });
  const delve = g.run.player.defense;
  g.equipment.equip("delve", addItem(s.equipment, "steelCuirass", "common")!.id);
  assert.equal(g.run.player.defense, delve + 2);
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
  s.equipment.equipped.tower.amulet = addItem(s.equipment, "phoenixTalisman", "common")!.id;
  const g = new Game(s);
  g.newRun({ seed: 4 });
  assert.equal(g.stepRules.victoryHeal, 1.5);
  const player = { ...g.run.player, hp: 50, maxHp: 100, attack: 50, defense: 50 };
  const next = resolveStep(player, { kind: "enemy", enemy: { name: "E", hp: 10, attack: 1, defense: 0, strength: "weak" } } as never, g.stepRules);
  assert.equal(next.player.hp, 51.5);
});
