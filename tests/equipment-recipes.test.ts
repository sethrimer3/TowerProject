import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { EQUIP_MATERIAL_IDS, STARTER_CATEGORIES, materialsOf, itemDef } from "../src/equipment/catalog.ts";
import { CRAFT_MATERIAL } from "../src/equipment/balance.ts";
import { addItem, decodeEquipment, defaultEquipment, levelUp, levelCost } from "../src/equipment/inventory.ts";
import { pull, rollChestPiece, rollSupplies } from "../src/equipment/acquire.ts";
import { firstRoll, takeCandidate, refine, improve } from "../src/equipment/slots.ts";
import { random } from "../src/random.ts";
import { loadout } from "../src/progression/loadout.ts";

const game = () => { const g = new Game(defaults()); g.save.equipment.unlocked = true; return g; };
const stock = (g: Game, amount = 10000) => { for (const m of EQUIP_MATERIAL_IDS) g.save.equipment.materials[m] = amount; };

test("starting acquisition pools contain exactly the five plus-shaped categories", () => {
  const g = game(), e = g.save.equipment, rng = random(234);
  assert.deepEqual(new Set(e.categories), new Set(["helmet", "shield", "chestplate", "weapon", "boots"]));
  assert.equal(Object.keys(e.materials).length, 4);
  g.save.gems = 1000;
  const before = structuredClone(e);
  assert.equal(g.equipment.pull("cape", 1), "locked");
  assert.equal(g.equipment.craft("cape"), "locked");
  assert.deepEqual(e, before); assert.equal(g.save.gems, 1000);
  const drawn = pull(e, "all", 100, rng);
  assert.deepEqual(new Set(drawn.map(p => itemDef(p.item.def)!.category)), new Set(STARTER_CATEGORIES));
  const chests = Array.from({ length: 200 }, () => rollChestPiece(rng, e.categories));
  assert.deepEqual(new Set(chests.map(c => c.category)), new Set(STARTER_CATEGORIES));
  const supplies = Array.from({ length: 100 }, () => rollSupplies(2, 0, rng));
  assert.deepEqual(new Set(supplies.map(s => s.id)), new Set(EQUIP_MATERIAL_IDS));
});

test("crafting pays every input atomically, supports full and free inventories, and never spends Gems", () => {
  const g = game(), e = g.save.equipment;
  stock(g, CRAFT_MATERIAL); e.materials.hobnails--;
  const before = structuredClone(e);
  assert.equal(g.equipment.craft("chestplate"), "material"); assert.deepEqual(e, before);
  e.materials.hobnails++;
  const item = g.equipment.craft("chestplate");
  assert.ok(typeof item !== "string"); assert.equal(item.def, "steelCuirass");
  assert.ok(Object.values(e.materials).every(n => n === 0)); assert.equal(g.save.gems, 0);
  const cape = addItem(e, "woolCloak", "common")!;
  assert.deepEqual(materialsOf("cape"), ["rivets", "padding"]);
  stock(g, CRAFT_MATERIAL);
  assert.ok(typeof g.equipment.craft("cape") !== "string");
  assert.equal(e.materials.rivets, 0); assert.equal(e.materials.padding, 0);
  assert.equal(e.materials.whetstone, CRAFT_MATERIAL); assert.equal(e.materials.hobnails, CRAFT_MATERIAL);
  assert.equal(cape.level, 1);
  g.save.settings.devMode = true; g.save.settings.freePurchases = true;
  for (const m of EQUIP_MATERIAL_IDS) e.materials[m] = 0;
  assert.ok(typeof g.equipment.craft("shield") !== "string");
  assert.ok(Object.values(e.materials).every(n => n === 0));
  while (e.items.length < 500) addItem(e, "ironShield", "common");
  assert.equal(g.equipment.craft("shield"), "room");
});

test("multi-resource leveling, Refine and Improve refuse missing inputs without partial payment", () => {
  const g = game(), e = g.save.equipment, purse = { gold: 1e7 };
  const plate = addItem(e, "steelCuirass", "uncommon")!;
  stock(g); e.materials.padding = 0;
  const before = structuredClone(e), gold = purse.gold;
  assert.equal(levelUp(e, purse, plate.id, 1, false), "material");
  assert.deepEqual(e, before); assert.equal(purse.gold, gold);
  e.materials.padding = 10000;
  const cost = levelCost(plate)!;
  assert.equal(levelUp(e, purse, plate.id, 1, false), 1);
  for (const m of EQUIP_MATERIAL_IDS) assert.equal(e.materials[m], 10000 - cost.material);
  assert.equal(plate.spent!.material, 4 * cost.material);
  firstRoll(e, plate.id, 0, () => .2); takeCandidate(e, plate.id, 0, 0);
  e.materials.whetstone = 0;
  const held = structuredClone(e), paid = purse.gold;
  assert.equal(refine(e, purse, plate.id, 0, false, () => .2), "material");
  assert.deepEqual(e, held); assert.equal(purse.gold, paid);
  plate.slots[0].rarity = "common";
  assert.equal(improve(e, purse, plate.id, 0, false), "material");
  assert.equal(purse.gold, paid);
});

test("old materials convert without losing units; owned future categories and loadouts survive reloading", () => {
  const old = { unlocked: true, items: [{ id: "e1", def: "woolCloak", rarity: "common", level: 4 }],
    materials: { whetstone: 3, rivets: 4, padding: 5, hobnails: 6, silk: 7, leather: 9, buckles: 11, moonstone: 13, amber: 15 },
    equipped: { tower: { cape: "e1" }, delve: {} } };
  const e = decodeEquipment(old);
  assert.equal(Object.values(e.materials).reduce((a, b) => a + b), 73);
  assert.deepEqual(Object.keys(e.materials), EQUIP_MATERIAL_IDS);
  assert.ok(e.categories.includes("cape")); assert.ok(!e.categories.includes("ring"));
  assert.equal(e.equipped.tower.cape, "e1"); assert.equal(e.items[0].level, 4);
  assert.deepEqual(decodeEquipment(JSON.parse(JSON.stringify(e))), e);
  const s = defaults(); s.equipment = e;
  assert.deepEqual(decode(JSON.stringify(s)).equipment, e);
  assert.deepEqual(defaultEquipment().categories, defaults().equipment.categories);
});

test("the all-resource chestplate gives superior defense, while shield and sword occupy independent slots", () => {
  const s = defaults(), e = s.equipment; e.unlocked = true; const base = loadout(s);
  const sword = addItem(e, "knightsSword", "common")!, shield = addItem(e, "ironShield", "common")!;
  const plate = addItem(e, "steelCuirass", "common")!;
  e.equipped.tower = { weapon: sword.id, shield: shield.id, chestplate: plate.id };
  assert.equal(loadout(s).attack, base.attack + 3);
  assert.equal(loadout(s).defense, base.defense + 6);
  assert.equal(itemDef(plate.def)!.effects[0].base, 2 * itemDef(shield.def)!.effects[0].base);
});

test("old chestplates update a run and its undo history once, keeping damage and collected stats", () => {
  for (const [rarity,before,after] of [["common",130,160],["uncommon",144.375,192.5]] as const) {
    const s = defaults(); s.upgrades.inspirationUndos = 1; s.equipment.unlocked = true;
    const armor = addItem(s.equipment, "giantsHauberk", rarity)!;
    s.equipment.equipped.tower.chestplate = armor.id;
    const g = new Game(s); g.newRun({seed:7}); g.move(0,1);
    assert.equal(s.tower.history.length,1);
    const raw = JSON.parse(JSON.stringify(s));
    delete raw.equipment.categories; // Before shared recipes and superior chestplates.
    for (const run of [raw.tower.run,...raw.tower.history.map(h=>h.run)]) {
      run.player.maxHp=before;run.player.hp=before;run.loadout.maxHp=before;
    }
    raw.tower.run.player.hp=before-20;raw.tower.run.player.attack+=2;
    const migrated=decode(JSON.stringify(raw));
    assert.equal(migrated.tower.run!.player.maxHp,after);
    assert.equal(migrated.tower.run!.player.hp,after-20,"the same 20 HP of damage is retained");
    assert.equal(migrated.tower.run!.player.attack,14,"collected ATK remains");
    assert.equal(migrated.tower.history[0].run.player.maxHp,after);
    assert.deepEqual(decode(JSON.stringify(migrated)),migrated,"the conversion runs only once");
    const resumed=new Game(migrated);resumed.equipment.unequip("tower","chestplate");
    assert.equal(resumed.run.player.maxHp,100,"taking off the armor returns the original base HP");
    assert.equal(resumed.run.player.attack,14);
    assert.ok(resumed.undo());assert.equal(resumed.run.player.maxHp,100);
  }
});
