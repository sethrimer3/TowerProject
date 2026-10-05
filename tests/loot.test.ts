import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { metalUnlocked, MATERIAL_IDS } from "../src/materials.ts";
import { rollGold, rollMetal, rollTreasureLoot } from "../src/loot.ts";
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

test("treasure chests always award gold, and at most a stack of metal bars", () => {
  const loot = rollTreasureLoot(0, constant(0.999));
  assert.ok(loot.gold >= 3);
  assert.equal(loot.materials.length, 0, "the metal roll failed at rng()=0.999");
  const lucky = rollTreasureLoot(0, constant(0));
  assert.deepEqual(lucky.materials.map((m) => m.id), ["ironBar"]);
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
  save.materials.steelBar = 3;
  const loaded = decode(JSON.stringify(save));
  assert.equal(loaded.materials.steelBar, 3);
  assert.equal(loaded.materials.ironBar, 40);
});

test("a save holding the old crafting materials keeps its metal bars and drops the rest", () => {
  const save = defaults() as any;
  save.materials = { ironBar: 7, cinderSlimeBlob: 12, garnet: 3, emptyVial: 2 };
  save.consumables = { cinderTonic: 4 };
  const loaded = decode(JSON.stringify(save)) as any;
  assert.deepEqual(Object.keys(loaded.materials).sort(), [...MATERIAL_IDS].sort());
  assert.equal(loaded.materials.ironBar, 7);
  assert.equal(loaded.consumables, undefined);
});

test("a version-2 (pre-crafting) save migrates with empty materials/equipment rather than being invalidated", () => {
  const old = defaults();
  (old as any).version = 2;
  delete (old as any).materials;
  delete (old as any).equipment;
  const loaded = decode(JSON.stringify(old));
  assert.equal(loaded.materials.ironBar, 0);
  assert.deepEqual(loaded.equipment.items, []);
  assert.equal(loaded.equipment.unlocked, false);
});

test("kills drop none of the old crafting materials, in either mode", () => {
  const tower = new Game(defaults());
  tower.newRun({ seed: 1 });
  tower.run.changes["9,0"] = { kind: "enemy", enemy: { name: TOWER_ZONE_ENEMIES[0][2].name, hp: 1, attack: 0, defense: 0, tier: 1 } };
  tower.run.player.x = 8; tower.run.player.y = 0;
  assert.ok(tower.move(1, 0));
  assert.equal(tower.run.kills, 1);
  assert.ok(Object.values(tower.save.materials).every((n) => n === 0));

  const delve = new Game(defaults());
  delve.save.upgrades.delve = 1;
  delve.switchMode("delve");
  delve.run.changes["15,1"] = { kind: "enemy", enemy: { name: "Cinder slime", hp: 1, attack: 0, defense: 0, tier: 0 } };
  delve.world = new World(delve.run);
  delve.move(0, 1);
  assert.equal(delve.run.kills, 1);
  assert.ok(Object.values(delve.save.materials).every((n) => n === 0));
});

test("undo/reopen the same treasure chest cannot duplicate its Gold or metal payout", () => {
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
