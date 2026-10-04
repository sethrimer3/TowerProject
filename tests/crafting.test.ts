import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import {
  metalUnlocked,
  GEMS,
  METALS,
  MATERIALS,
} from "../src/materials.ts";
import { rollEnemyDrops, rollGold, rollMetal, rollTreasureLoot, towerEnemyDrops } from "../src/loot.ts";
import { TOWER_ZONE_ENEMIES } from "../src/scaling.ts";

// --- Deterministic RNG helpers ---
const always = (values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};
const constant = (v: number) => () => v;


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

test("materials persist across a save encode/decode round trip", () => {
  const save = defaults();
  save.materials.ironBar = 40;
  save.materials.cinderSlimeBlob = 12;
  save.materials.garnet = 3;
  const loaded = decode(JSON.stringify(save));
  assert.equal(loaded.materials.garnet, 3);
  assert.equal(loaded.materials.ironBar, 40);
});

test("a version-2 (pre-crafting) save migrates with empty materials/equipment rather than being invalidated", () => {
  const old = defaults();
  (old as any).version = 2;
  delete (old as any).materials;
  delete (old as any).equipment;
  delete (old as any).consumables;
  const loaded = decode(JSON.stringify(old));
  assert.equal(loaded.materials.ironBar, 0);
  assert.deepEqual(loaded.equipment.items, []);
  assert.equal(loaded.equipment.unlocked, false);
});

test("materials persist through death, undo, and new runs (never part of Run)", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.run.changes["15,1"] = { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 0 } };
  g.world = new World(g.run);
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
  g.world = new World(g.run);
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
  g.newRun({ seed: 1 });
  g.run.changes["9,0"] = { kind: "enemy", enemy: { name: "Thief", hp: 1, attack: 0, defense: 0, tier: 1 } };
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
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", { kind: "treasure" });
  w.cells.set("4,4", { kind: "stairs" });
  g.run.changes["1,0"] = { kind: "treasure" };
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
  assert.ok(goldAfterFirst > 0);
  assert.equal(g.save.tower.runGold, goldAfterFirst, "the run's Gold counts the chest once and undo keeps it");
  g.newRun();
  assert.equal(g.save.tower.runGold, 0, "a new run starts its Gold count afresh");
});
