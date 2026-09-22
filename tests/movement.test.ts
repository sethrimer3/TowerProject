import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save.ts";
import { point, type Tile } from "../src/entities.ts";
import { generate, reachable } from "../src/generation.ts";
function corridor() {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: "wall" };
  for (let y = 0; y < 10; y++) g.run.changes[point(15, y)] = { kind: "floor" };
  return g;
}
const enemy: Tile = {
  kind: "enemy",
  enemy: { name: "Test foe", hp: 25, attack: 8, defense: 0, tier: 0 },
};
const doom: Tile = {
  kind: "enemy",
  enemy: { name: "Doom", hp: 999, attack: 999, defense: 999, tier: 3 },
};
test("tap route collects items, fights enemies, consumes keys and reaches destination", () => {
  const g = corridor();
  g.run.changes["15,1"] = { kind: "key", color: "red" };
  g.run.changes["15,2"] = enemy;
  g.run.changes["15,3"] = { kind: "door", color: "red" };
  g.walkTo(15, 5);
  while (g.route.length) g.routeStep();
  assert.equal(g.run.player.y, 5);
  assert.equal(g.run.kills, 1);
  assert.equal(g.run.player.hp, 114);
  assert.equal(g.run.player.keys.red, 0);
});
test("missing key walks to door, stops, and places feedback on the door", () => {
  const g = corridor();
  g.run.changes["15,3"] = { kind: "door", color: "blue" };
  g.walkTo(15, 6);
  while (g.route.length) g.routeStep();
  assert.equal(g.run.player.y, 2);
  assert.deepEqual([g.blocked.x, g.blocked.y], [15, 3]);
  assert.ok(g.blocked.until > performance.now());
  assert.equal(g.save.delve.history.length, 1);
});
test("unreachable wall target does not move; accessible detour beats missing-key route", () => {
  const g = corridor();
  g.walkTo(14, 5);
  assert.equal(g.route.length, 0);
  assert.equal(g.blocked.x, 14);
  for (let y = 0; y < 6; y++) g.run.changes[point(16, y)] = { kind: "floor" };
  g.run.changes["15,2"] = { kind: "door", color: "blue" };
  g.walkTo(15, 5);
  while (g.route.length) g.routeStep();
  assert.equal(g.run.player.y, 5);
  assert.equal(g.world.tile(15, 2).kind, "door");
});
test("undo restores combat, health, drops, equipment, door keys and score; history caps at five", () => {
  const g = corridor();
  g.save.upgrades.undos = 4;
  g.run.changes["15,1"] = enemy;
  g.run.changes["15,2"] = { kind: "treasure" };
  g.run.changes["15,3"] = { kind: "key", color: "yellow" };
  g.run.changes["15,4"] = { kind: "door", color: "yellow" };
  g.run.changes["15,5"] = { kind: "potion" };
  const initial = structuredClone(g.run);
  for (let i = 0; i < 5; i++) assert.ok(g.move(0, 1));
  assert.equal(g.save.delve.history.length, 5);
  for (let i = 0; i < 5; i++) assert.ok(g.undo());
  assert.deepEqual(g.run, { ...initial, damaged: g.run.damaged, keysSpent: g.run.keysSpent });
  assert.equal(g.save.delve.best, 5);
  assert.equal(g.undo(), false);
  for (let i = 0; i < 6; i++) g.move(0, 1);
  assert.equal(g.save.delve.history.length, 5);
});
test("fatal path resets to entrance, stops route, and cannot undo without Revive", () => {
  const g = corridor();
  g.run.changes["15,2"] = doom;
  const seed = g.run.seed;
  g.walkTo(15, 5);
  while (g.route.length) g.routeStep();
  assert.notEqual(g.run.seed, seed);
  assert.equal(g.run.player.y, 0);
  assert.equal(g.save.delve.history.length, 0);
  assert.equal(g.undo(), false);
  assert.equal(g.save.delve.essence, 0);
});
test("Revive restores pre-fatal state and rolls back pending rewards; next move forfeits it irreversibly", () => {
  const g = corridor();
  g.save.upgrades.revive = 1;
  g.move(0, 1);
  g.move(0, 1);
  g.run.changes["15,3"] = doom;
  const before = structuredClone(g.run);
  g.move(0, 1);
  assert.ok(g.save.delve.revival);
  assert.equal(g.save.delve.essence, 0);
  assert.ok(g.undo());
  assert.deepEqual(g.run, before);
  assert.equal(g.save.delve.essence, 0);
  g.move(0, 1);
  g.summary = null;
  g.move(0, -1);
  assert.ok(g.save.delve.revival, "Blocked move must not forfeit revival");
  g.move(0, 1);
  assert.equal(g.save.delve.revival, null);
  assert.equal(g.save.delve.essence, 0);
  g.undo();
  assert.equal(g.run.player.y, 0);
  assert.equal(g.save.delve.revival, null);
  assert.equal(g.save.delve.essence, 0);
});
test("undo and Revive persist safely across refresh", () => {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.save.upgrades.revive = 1;
  g.run.changes["15,1"] = { kind: "floor" }; // Isolate persistence from procedural encounters.
  g.move(0, 1);
  let loaded = new Game(decode(JSON.stringify(g.save)));
  loaded.switchMode("delve");
  assert.ok(loaded.undo());
  assert.equal(loaded.run.player.y, 0);
  const before = loaded.snapshot();
  loaded.save.delve.revival = { snapshot: before, earned: 7 };
  loaded.save.delve.history = [];
  const saved = decode(JSON.stringify(loaded.save));
  assert.ok(saved.delve.revival);
  loaded = new Game(saved);
  loaded.switchMode("delve");
  assert.ok(loaded.undo());
  assert.equal(loaded.save.delve.essence, 0);
  const corrupt = JSON.parse(JSON.stringify(saved));
  corrupt.delve.history = [{ run: { player: {} }, best: 0 }];
  corrupt.delve.revival = { snapshot: null, earned: 10 };
  assert.equal(decode(JSON.stringify(corrupt)).delve.history.length, 0);
  assert.equal(decode(JSON.stringify(corrupt)).delve.revival, null);
});
test("paired horizontal openings wrap, use destination locks, and undo correctly", () => {
  const g = corridor();
  g.run.player.x = 29;
  g.run.player.y = 4;
  g.run.changes["29,4"] = { kind: "floor" };
  g.run.changes["0,4"] = { kind: "door", color: "red" };
  assert.equal(g.move(1, 0), false);
  assert.equal(g.blocked.x, 0);
  g.run.player.keys.red = 1;
  assert.ok(g.move(1, 0));
  assert.equal(g.run.player.x, 0);
  assert.equal(g.run.player.keys.red, 0);
  g.undo();
  assert.equal(g.run.player.x, 29);
  assert.equal(g.run.player.keys.red, 1);
  g.run.changes["0,4"] = { kind: "wall" };
  assert.equal(g.move(1, 0), false);
  g.run.changes["0,4"] = { kind: "floor" };
  g.walkTo(0, 4);
  assert.equal(g.route.length, 1);
  g.routeStep();
  assert.equal(g.run.player.x, 0);
});
test("generated wraps have paired openings and do not disconnect floor space", () => {
  let wraps = 0;
  for (let seed = 0; seed < 30; seed++) {
    const c = generate(seed, 0);
    for (let y = 0; y < 20; y++) {
      const left = c.get(point(0, y))!.kind !== "wall",
        right = c.get(point(29, y))!.kind !== "wall";
      assert.equal(left, right);
      if (left) wraps++;
    }
    assert.equal(
      reachable(c, "15,0").size,
      [...c.values()].filter((t) => t.kind !== "wall").length,
    );
  }
  assert.ok(wraps > 0);
});
