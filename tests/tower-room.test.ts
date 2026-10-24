import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTowerRoom, RoomWorld } from "../src/tower/room-world.ts";
import { reachable } from "../src/board.ts";
import { point } from "../src/entities.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { TOWER_WIDTH, TOWER_HEIGHT, TOWER_START_X, levelForXp, xpForKill, xpForLevel } from "../src/config.ts";
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
  assert.equal(g.save.tower.inspiration, 1);
});
test("Shards and Essence only pay out on a new best, Gold and XP accrue regardless", () => {
  const g = new Game(defaults());
  g.switchMode("tower");
  g.run.height = 5;
  g.run.kills = 3;
  g.finish("test retire");
  assert.match(g.message, /a new record/);
  assert.ok(g.save.tower.inspiration > 0);
  const inspirationAfterFirst = g.save.tower.inspiration;
  g.newRun();
  g.run.height = 5;
  g.finish("test retire again");
  assert.doesNotMatch(g.message, /a new record/);
  assert.equal(g.save.tower.inspiration, inspirationAfterFirst);
});
test("XP is earned from kills in both modes and grants a level", () => {
  const g = new Game(defaults());
  assert.equal(g.save.xp, 0);
  g.gainXp({ name: "x", hp: 1, attack: 20, defense: 0, tier: 3, strength: "elite" }, 0);
  assert.equal(g.save.xp, 24);
  assert.equal(levelForXp(g.save.xp), 0);
  g.gainXp({ name: "x", hp: 1, attack: 20, defense: 0, tier: 3, strength: "elite" }, 0);
  assert.equal(levelForXp(g.save.xp), 1);
});
test("XP comes from strength and equivalent floor, and each floor is a smaller share of a level", () => {
  assert.deepEqual((["weak", "normal", "strong", "elite", "boss"] as const).map((s) => xpForKill(s, 0)), [6, 9, 15, 24, 36]);
  assert.deepEqual([0, 30, 100, 1000].map((f) => xpForKill("normal", f)), [9, 18, 30, 90]);
  // A floor of ten normal kills, as a share of the level it reaches, every
  // 100 floors (the dearer band past level 25 holds the hero near one level
  // long enough that 50 floors can see the share tick up).
  let xp = 0, last = Infinity;
  for (let f = 0; f < 1000; f++) {
    const gained = 10 * xpForKill("normal", f), level = levelForXp(xp);
    const share = gained / (xpForLevel(level + 1) - xpForLevel(level));
    if (f % 100 === 99) { assert.ok(share < last, `floor ${f + 1}`); last = share; }
    xp += gained;
  }
});
test("a Tower run saved under an older layout version restarts its floor at the entrance", () => {
  const g = new Game(defaults());
  g.run.layoutVersion = 3;
  g.run.player.x = 3;
  g.run.player.y = 7;
  g.run.changes["3,7"] = { kind: "floor" };
  const migrated = new Game(JSON.parse(JSON.stringify(g.save)));
  assert.equal(migrated.run.player.x, TOWER_START_X);
  assert.equal(migrated.run.player.y, 0);
  assert.deepEqual(migrated.run.changes, {});
  assert.notEqual(migrated.world.tile(TOWER_START_X, 1).kind, "wall");
});
