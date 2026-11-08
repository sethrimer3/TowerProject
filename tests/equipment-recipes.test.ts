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
import { wornEffects } from "../src/equipment/effects.ts";
import { snap } from "../src/exact.ts";

const game = () => { const g = new Game(defaults()); g.save.equipment.unlocked = true; return g; };
const stock = (g: Game, amount = 10000) => { for (const m of EQUIP_MATERIAL_IDS) g.save.equipment.materials[m] = amount; };

test("starting acquisition pools contain exactly the five plus-shaped categories", () => {
  const g = game(), e = g.save.equipment, rng = random(234);
  assert.deepEqual(new Set(e.categories), new Set(["helmet", "shield", "chestplate", "weapon", "boots"]));
  assert.equal(Object.keys(e.materials).length, 4);
  g.save.gems = 1000;
  const before = structuredClone(e);
  assert.equal(g.equipment.pull("cape", 1), "locked");
  assert.equal(g.equipment.craft("woolCloak"), "locked");
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
  assert.equal(g.equipment.craft("steelCuirass"), "material"); assert.deepEqual(e, before);
  e.materials.hobnails++;
  const item = g.equipment.craft("scaleMail");
  assert.ok(typeof item !== "string"); assert.equal(item.def, "scaleMail", "any of a category's Standard pieces is crafted");
  assert.equal(g.equipment.craft("raptorBlade"), "locked", "never a Unique");
  assert.ok(Object.values(e.materials).every(n => n === 0)); assert.equal(g.save.gems, 0);
  const cape = addItem(e, "woolCloak", "common")!;
  assert.deepEqual(materialsOf("cape"), ["rivets", "hobnails"], "a Cape joins the Shield and the Boots");
  stock(g, CRAFT_MATERIAL);
  assert.ok(typeof g.equipment.craft("woolCloak") !== "string");
  assert.equal(e.materials.rivets, 0); assert.equal(e.materials.hobnails, 0);
  assert.equal(e.materials.whetstone, CRAFT_MATERIAL); assert.equal(e.materials.padding, CRAFT_MATERIAL);
  assert.equal(cape.level, 0);
  g.save.settings.devMode = true; g.save.settings.freePurchases = true;
  for (const m of EQUIP_MATERIAL_IDS) e.materials[m] = 0;
  assert.ok(typeof g.equipment.craft("ironShield") !== "string");
  assert.ok(Object.values(e.materials).every(n => n === 0));
  while (e.items.length < 500) addItem(e, "ironShield", "common");
  assert.equal(g.equipment.craft("ironShield"), "room");
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

test("each starting category raises its own percent, and the Chestplate's efficiency raises the others'", () => {
  const s = defaults(), e = s.equipment; e.unlocked = true;
  const sword = addItem(e, "knightsSword", "common")!, shield = addItem(e, "ironShield", "common")!;
  const plate = addItem(e, "steelCuirass", "common")!;
  e.equipped.tower = { weapon: sword.id, shield: shield.id };
  let worn = wornEffects(s, "tower");
  assert.deepEqual([worn.attackPct, worn.defensePct, worn.maxHpPct], [1, 1, 0], "+1% each at Common, level 0");
  e.equipped.tower.chestplate = plate.id;
  worn = wornEffects(s, "tower");
  assert.deepEqual([worn.attackPct, worn.defensePct, worn.maxHpPct], [1.01, 1.01, 1], "the plate's 1% efficiency raises the others, and its own max HP is 1%");
  assert.equal(loadout(s).maxHp, snap(loadout(defaults()).maxHp * 1.01));
});
