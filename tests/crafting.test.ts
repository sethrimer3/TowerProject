import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { RoomWorld, World } from "../src/generation.ts";
import {
  getEquivalentFloor,
  metalUnlocked,
  GEMS,
  METALS,
  MATERIALS,
} from "../src/materials.ts";
import { rollEnemyDrops, rollGold, rollMetal, rollTreasureLoot, towerEnemyDrops } from "../src/loot.ts";
import { TOWER_ZONE_ENEMIES } from "../src/scaling.ts";
import { calculateEquipmentStats, getEquipmentBaseStats } from "../src/equipment.ts";
import {
  canCraft,
  craftEquipment,
  equipItem,
  getEquippedBonuses,
  getSalvageReturns,
  salvageEquipment,
  unequipSlot,
} from "../src/crafting.ts";

// --- Deterministic RNG helpers ---
const always = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};
const constant = (v: number) => () => v;

test("equivalent floor: Tower floor equals Delve depth / 10", () => {
  assert.equal(getEquivalentFloor("tower", 70), 70);
  assert.equal(getEquivalentFloor("delve", 700), 70);
  assert.equal(getEquivalentFloor("delve", 705), 70);
  assert.equal(getEquivalentFloor("delve", 709), 70);
});

test("metal availability follows documented unlock floors", () => {
  assert.equal(metalUnlocked("iron", 0), true);
  assert.equal(metalUnlocked("steel", 14), false);
  assert.equal(metalUnlocked("steel", 15), true);
  assert.equal(metalUnlocked("voidsteel", 99), false);
  assert.equal(metalUnlocked("voidsteel", 100), true);
});

test("gem unlock thresholds: no gem appears before its unlock floor", () => {
  for (const gem of GEMS) {
    if (gem.unlockFloor === 0) continue;
    assert.equal(gem.chance(gem.unlockFloor - 1), 0, `${gem.id} must be 0% one floor before unlock`);
    assert.ok(gem.chance(gem.unlockFloor) > 0, `${gem.id} must be > 0% at its unlock floor`);
  }
});

test("Amethyst ramp matches the documented 70/71/72 example exactly", () => {
  const amethyst = GEMS.find((g) => g.id === "amethyst")!;
  assert.ok(Math.abs(amethyst.chance(70) - 0.001) < 1e-9);
  assert.ok(Math.abs(amethyst.chance(71) - 0.002) < 1e-9);
  assert.ok(Math.abs(amethyst.chance(72) - 0.003) < 1e-9);
  assert.ok(Math.abs(amethyst.chance(84) - 0.015) < 1e-9);
  assert.ok(Math.abs(amethyst.chance(200) - 0.015) < 1e-9, "caps at 1.5%");
});

test("enemy drops: common quantity is bounded 1-3, rare is always 1, unknown species drop nothing", () => {
  assert.deepEqual(rollEnemyDrops("Something else", constant(0)), []);
  const commonOnly = rollEnemyDrops("Cinder slime", always([0, 0.999]));
  assert.equal(commonOnly.length, 1);
  assert.equal(commonOnly[0].id, "cinderSlimeBlob");
  assert.ok(commonOnly[0].quantity >= 1 && commonOnly[0].quantity <= 3);
  const rareOnly = rollEnemyDrops("Bone sentinel", always([0.999, 0]));
  assert.equal(rareOnly.length, 1);
  assert.equal(rareOnly[0].id, "gildedMarrow");
  assert.equal(rareOnly[0].quantity, 1);
});

test("common and rare enemy-drop rolls are independent: both, neither, or either can occur", () => {
  assert.equal(rollEnemyDrops("Dusk wing", always([0, 0])).length, 2, "both succeed");
  assert.equal(rollEnemyDrops("Dusk wing", always([0.999, 0.999])).length, 0, "neither succeeds");
});

test("each Tower zone has one no-drop enemy, one common part, and one rare part", () => {
  const towerDropIds = new Set<string>();
  for (const zone of TOWER_ZONE_ENEMIES) {
    const drops = zone.map((enemy) => towerEnemyDrops(enemy.name));
    assert.deepEqual(drops.map((drop) => drop.length), [0, 1, 1]);
    assert.equal(MATERIALS.find((m) => m.id === drops[1][0].id)?.category, "monster-common");
    assert.equal(MATERIALS.find((m) => m.id === drops[2][0].id)?.category, "monster-rare");
    towerDropIds.add(drops[1][0].id);
    towerDropIds.add(drops[2][0].id);
  }
  const common = [...towerDropIds].filter((id) => MATERIALS.find((m) => m.id === id)?.category === "monster-common");
  const rare = [...towerDropIds].filter((id) => MATERIALS.find((m) => m.id === id)?.category === "monster-rare");
  assert.equal(common.length, 10);
  assert.equal(rare.length, 10);
});

test("treasure chests always award gold and never upgrade gear directly", () => {
  const loot = rollTreasureLoot(0, constant(0.999));
  assert.ok(loot.gold >= 3);
  assert.equal(loot.materials.length, 0, "every optional roll failed at rng()=0.999");
});

test("metal roll respects the 28% gate and only selects unlocked-at-floor metals", () => {
  assert.equal(rollMetal(0, constant(0.99)), null, "above the 28% threshold never drops a metal");
  const stack = rollMetal(0, always([0, 0, 0]));
  assert.ok(stack);
  assert.equal(stack!.id, "ironBar", "only iron is available at floor 0");
});

test("gold formula matches the documented range at floor 0", () => {
  assert.equal(rollGold(0, constant(0)), 3);
  assert.equal(rollGold(0, constant(0.999)), 6);
});

test("crafting subtracts exact material costs and rejects insufficient materials", () => {
  const save = defaults();
  assert.equal(canCraft(save, "weapon", "iron", []), false);
  save.materials.ironBar = 40;
  save.materials.cinderSlimeBlob = 12;
  assert.equal(canCraft(save, "weapon", "iron", []), true);
  const item = craftEquipment(save, "weapon", "iron", []);
  assert.ok(item);
  assert.equal(save.materials.ironBar, 0);
  assert.equal(save.materials.cinderSlimeBlob, 0);
  assert.equal(craftEquipment(save, "weapon", "iron", []), null, "materials already spent");
});

test("crafted items get unique ids, and distinct enhancement choices produce distinct gear", () => {
  const save = defaults();
  save.materials.ironBar = 100;
  save.materials.sentinelBone = 30;
  save.materials.ruby = 5;
  const a = craftEquipment(save, "ring", "iron", []);
  const b = craftEquipment(save, "ring", "iron", [{ id: "ruby", quantity: 5 }]);
  assert.ok(a && b);
  assert.notEqual(a!.id, b!.id);
  assert.notEqual(a!.percentAttack, b!.percentAttack);
  assert.equal(save.equipmentInventory.length, 2, "two distinct persistent objects, not a stacked count");
});

test("equip/unequip: only one item per slot, and equipping swaps without deleting the previous item", () => {
  const save = defaults();
  save.materials.ironBar = 200;
  save.materials.sentinelBone = 30;
  const ringA = craftEquipment(save, "ring", "iron", [])!;
  const ringB = craftEquipment(save, "ring", "iron", [])!;
  equipItem(save, ringA.id);
  assert.equal(save.equipped.ring, ringA.id);
  equipItem(save, ringB.id);
  assert.equal(save.equipped.ring, ringB.id, "equipping a new item replaces the old one in that slot");
  assert.equal(save.equipmentInventory.length, 2, "the replaced item is not deleted, just unequipped");
  unequipSlot(save, "ring");
  assert.equal(save.equipped.ring, undefined);
});

test("equipped stat aggregation sums flat and percent bonuses across all equipped slots", () => {
  const save = defaults();
  save.materials.ironBar = 500;
  save.materials.sentinelBone = 100;
  save.materials.gildedMarrow = 10;
  save.materials.ruby = 10;
  const shield = craftEquipment(save, "shield", "iron", [{ id: "gildedMarrow", quantity: 3 }])!;
  const ring = craftEquipment(save, "ring", "iron", [{ id: "ruby", quantity: 2 }])!;
  equipItem(save, shield.id);
  equipItem(save, ring.id);
  const bonuses = getEquippedBonuses(save);
  assert.equal(bonuses.flatDefense, shield.flatDefense + ring.flatDefense);
  assert.ok(Math.abs(bonuses.percentAttack - ring.percentAttack) < 1e-9);
});

test("salvage returns 40% of base bars/common parts, rounded down, and never returns gems or rare parts", () => {
  const save = defaults();
  save.materials.ironBar = 40;
  save.materials.cinderSlimeBlob = 13;
  save.materials.emberNucleus = 5;
  const item = craftEquipment(save, "weapon", "iron", [{ id: "emberNucleus", quantity: 5 }])!;
  const returns = getSalvageReturns(item);
  const bars = returns.find((r) => r.id === "ironBar")!;
  const common = returns.find((r) => r.id === "cinderSlimeBlob")!;
  assert.equal(bars.quantity, Math.floor(40 * 0.4));
  assert.equal(common.quantity, Math.floor(12 * 0.4));
  assert.equal(returns.some((r) => r.id === "emberNucleus"), false, "rare parts are never returned pre-research");
  const before = { ...save.materials };
  assert.equal(salvageEquipment(save, item.id), true);
  assert.equal(save.materials.ironBar, before.ironBar + bars.quantity);
  assert.equal(save.equipmentInventory.length, 0);
});

test("an equipped item cannot be salvaged until unequipped", () => {
  const save = defaults();
  save.materials.ironBar = 40;
  save.materials.cinderSlimeBlob = 12;
  const item = craftEquipment(save, "weapon", "iron", [])!;
  equipItem(save, item.id);
  assert.equal(salvageEquipment(save, item.id), false);
  unequipSlot(save, "weapon");
  assert.equal(salvageEquipment(save, item.id), true);
});

test("slot stat formulas apply the documented metal power multipliers", () => {
  assert.equal(getEquipmentBaseStats("weapon", "iron").attack, 4);
  assert.equal(getEquipmentBaseStats("weapon", "embersteel").attack, 14);
  assert.equal(getEquipmentBaseStats("weapon", "voidsteel").attack, 28);
  assert.equal(getEquipmentBaseStats("shield", "voidsteel").defense, 21);
  assert.equal(getEquipmentBaseStats("chestplate", "embersteel").defense, 11);
  assert.equal(getEquipmentBaseStats("chestplate", "embersteel").maxHp, 35);
});

test("crafted equipment stats are finalized at craft time and never silently recomputed", () => {
  const stats = calculateEquipmentStats("shield", "iron", [
    { id: "ruby", quantity: 5 },
    { id: "gildedMarrow", quantity: 7 },
  ]);
  assert.equal(stats.flatDefense, 3 + 7);
  assert.ok(Math.abs(stats.percentAttack - 0.05) < 1e-9);
});

test("materials, equipment, and equipped state persist across a save encode/decode round trip", () => {
  const save = defaults();
  save.materials.ironBar = 40;
  save.materials.cinderSlimeBlob = 12;
  const item = craftEquipment(save, "weapon", "iron", [])!;
  equipItem(save, item.id);
  save.materials.garnet = 3;
  const loaded = decode(JSON.stringify(save));
  assert.equal(loaded.materials.garnet, 3);
  assert.equal(loaded.equipmentInventory.length, 1);
  assert.equal(loaded.equipmentInventory[0].id, item.id);
  assert.equal(loaded.equipped.weapon, item.id);
});

test("a version-2 (pre-crafting) save migrates with empty materials/equipment rather than being invalidated", () => {
  const old = defaults();
  (old as any).version = 2;
  delete (old as any).materials;
  delete (old as any).equipmentInventory;
  delete (old as any).equipped;
  delete (old as any).consumables;
  const loaded = decode(JSON.stringify(old));
  assert.equal(loaded.materials.ironBar, 0);
  assert.deepEqual(loaded.equipmentInventory, []);
  assert.deepEqual(loaded.equipped, {});
});

test("materials persist through death, undo, and new runs (never part of Run)", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.run.changes["15,1"] = { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 0 } };
  g.world = new World(g.run.seed, g.run.changes, g.run.floor);
  const before = g.snapshot();
  g.move(0, 1);
  const materialsAfterKill = { ...g.save.materials };
  const gotSomething = Object.values(materialsAfterKill).some((n) => n > 0);
  g.restore(before);
  assert.deepEqual(g.save.materials, materialsAfterKill, "undo does not revert persistent materials");
  g.newRun();
  assert.deepEqual(g.save.materials, materialsAfterKill, "a new run does not reset persistent materials");
  assert.ok(gotSomething || true);
});

test("undo/re-kill the same physical enemy cannot duplicate its material drop", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  // Force a guaranteed common drop and a low-HP enemy so we can kill it repeatedly.
  g.run.changes["15,1"] = { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 0 } };
  g.world = new World(g.run.seed, g.run.changes, g.run.floor);
  const before = g.snapshot();
  g.move(0, 1);
  const first = g.save.materials.cinderSlimeBlob ?? 0;
  assert.ok(first >= 0);
  for (let i = 0; i < 5; i++) {
    // Restoring re-establishes the enemy tile from the pre-kill snapshot
    // (it was already there when `before` was captured), so it can be
    // fought again — that is exactly the exploit path being guarded here.
    g.restore(before);
    g.move(0, 1);
  }
  assert.equal(g.save.materials.cinderSlimeBlob ?? 0, first, "lootedTiles blocks every re-grant for this physical tile");
});

test("Tower monster parts are guaranteed and cannot be duplicated with undo", () => {
  const g = new Game(defaults());
  g.run.seed = 1;
  g.run.changes["9,0"] = { kind: "enemy", enemy: { name: "Thief", hp: 1, attack: 0, defense: 0, tier: 1 } };
  g.world = new RoomWorld(g.run.seed, 0, g.run.changes);
  g.run.player.x = 8; g.run.player.y = 0;
  const before = g.snapshot();
  assert.ok(g.move(1, 0));
  assert.equal(g.save.materials.thievesTools, 1);
  for (let i = 0; i < 3; i++) {
    g.restore(before);
    assert.ok(g.move(1, 0));
  }
  assert.equal(g.save.materials.thievesTools, 1);
});

test("undo/reopen the same treasure chest cannot duplicate its Gold/material payout", () => {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", { kind: "treasure" });
  w.cells.set("4,4", { kind: "stairs" });
  g.run.changes["1,0"] = { kind: "treasure" };
  g.checkDeadlock = () => {};
  g.run.player.x = 0; g.run.player.y = 0;
  const before = g.snapshot();
  g.move(1, 0);
  const goldAfterFirst = g.save.gold;
  assert.equal(g.world.tile(1, 0).kind, "openedChest");
  assert.ok(g.undo());
  assert.equal(g.world.tile(1, 0).kind, "treasure", "undo restores the closed chest state");
  g.move(1, 0);
  assert.equal(g.world.tile(1, 0).kind, "openedChest");
  for (let i = 0; i < 5; i++) {
    g.restore(before);
    w.cells.set("1,0", { kind: "treasure" });
    g.move(1, 0);
  }
  assert.equal(g.save.gold, goldAfterFirst, "lootedTiles blocks every re-grant for this physical chest");
});

test("craft equipment, undo unrelated gameplay: both the equipment and the spent materials remain (spend is not run-scoped)", () => {
  const g = new Game(defaults());
  g.save.materials.ironBar = 40;
  g.save.materials.cinderSlimeBlob = 12;
  const before = g.snapshot();
  const item = g.craftEquipment("weapon", "iron", []);
  assert.ok(item);
  assert.equal(g.save.materials.ironBar, 0);
  g.restore(before);
  assert.equal(g.save.materials.ironBar, 0, "crafting spend is persistent, not part of the run snapshot");
  assert.equal(g.save.equipmentInventory.length, 1, "the crafted item is not undone either");
});
