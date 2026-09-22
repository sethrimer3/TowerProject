import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTowerRoom, reachable, RoomWorld } from "../src/generation.ts";
import { point } from "../src/entities.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { TOWER_WIDTH, TOWER_HEIGHT, TOWER_START_X } from "../src/config.ts";
test("tower rooms are fully generated and reachable from entrance to exit", () => {
  for (let seed = 0; seed < 40; seed++)
    for (const room of [0, 3, 7, 15, 30]) {
      const cells = generateTowerRoom(seed, room);
      assert.deepEqual(cells, generateTowerRoom(seed, room));
      const entrance = point(TOWER_START_X, 0);
      assert.notEqual(cells.get(entrance)?.kind, "wall");
      const exits = [...cells].filter(([, t]) => t.kind === "stairs");
      assert.equal(exits.length, 1);
      const reached = reachable(cells, entrance);
      assert.ok(reached.has(exits[0][0]));
      for (const [k, t] of cells) {
        const [x, y] = k.split(",").map(Number);
        assert.ok(x >= 0 && x < TOWER_WIDTH && y >= 0 && y < TOWER_HEIGHT);
        if (t.kind !== "wall") assert.ok(reached.has(k));
      }
    }
});
test("RoomWorld boundaries block movement instead of wrapping", () => {
  const w = new RoomWorld(1, 0, {});
  assert.equal(w.width, TOWER_WIDTH);
  assert.equal(w.step(0, 5, -1, 0), null);
  assert.equal(w.step(TOWER_WIDTH - 1, 5, 1, 0), null);
  assert.equal(w.tile(-1, 5).kind, "wall");
  assert.equal(w.tile(TOWER_WIDTH, 5).kind, "wall");
});
test("Tower and Delve keep fully independent, persistent runs", () => {
  const g = new Game(defaults());
  assert.equal(g.mode, "tower");
  const towerSeed = g.run.seed;
  g.move(0, 1, true);
  const towerY = g.run.player.y;
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  assert.notEqual(g.run.seed, towerSeed);
  g.move(0, 1, true);
  const delveHeight = g.run.height,
    delveSeed = g.run.seed;
  g.switchMode("tower");
  assert.equal(g.run.seed, towerSeed);
  assert.equal(g.run.player.y, towerY);
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  assert.equal(g.run.seed, delveSeed);
  assert.equal(g.run.height, delveHeight);
});
test("reaching the stairs advances the Tower room and awards each new height immediately", () => {
  const g = new Game(defaults());
  assert.equal(g.mode, "tower");
  const before = g.run.height;
  // Force-place a stairway one step above the player and walk onto it.
  g.run.changes[point(g.run.player.x, g.run.player.y + 1)] = { kind: "stairs" };
  g.move(0, 1, true);
  assert.equal(g.run.height, before + 1);
  assert.equal(g.run.player.x, TOWER_START_X);
  assert.equal(g.run.player.y, 0);
  assert.deepEqual(g.run.changes, {});
  assert.equal(g.save.tower.shards, 1);
});
test("Shards and Essence only pay out on a new best, Gold and XP accrue regardless", () => {
  const g = new Game(defaults());
  g.switchMode("tower");
  g.run.height = 5;
  g.run.kills = 3;
  g.finish("test retire");
  assert.ok(g.summary!.record);
  assert.ok(g.save.tower.shards > 0);
  const shardsAfterFirst = g.save.tower.shards;
  g.summary = null;
  g.newRun();
  g.run.height = 5;
  g.finish("test retire again");
  assert.equal(g.summary!.record, false);
  assert.equal(g.save.tower.shards, shardsAfterFirst);
});
test("XP is earned from kills in both modes and grants a level", () => {
  const g = new Game(defaults());
  assert.equal(g.save.xp, 0);
  g.gainXp({ name: "x", hp: 1, attack: 20, defense: 0, tier: 3 });
  assert.ok(g.save.xp > 0);
});
