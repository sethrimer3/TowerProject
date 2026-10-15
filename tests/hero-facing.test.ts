import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { THEMED_BOARDS } from "../src/themed-boards.ts";

/** A Tower room of open floor, x 0..4 by y 0..4, the hero at its middle,
 * a wall at (3, 2) and an enemy at (2, 3). */
function room() {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("3,2", { kind: "wall" });
  w.cells.set("2,3", { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength: "normal" } });
  w.torches = [];
  g.run.player.x = 2;
  g.run.player.y = 2;
  return g;
}

test("the hero faces its last step: right until it moves, into a fight too, not a refused step, and undo leaves it", () => {
  const g = room();
  assert.deepEqual(g.facing, { dx: 1, dy: 0 }, "right before any step");
  assert.ok(g.move(-1, 0));
  assert.deepEqual(g.facing, { dx: -1, dy: 0 });
  assert.ok(g.move(0, -1));
  assert.deepEqual(g.facing, { dx: 0, dy: -1 });
  assert.ok(g.move(1, 0));
  assert.ok(g.move(0, 1), "back to the middle");
  assert.ok(!g.move(1, 0), "the wall refuses the step");
  assert.deepEqual(g.facing, { dx: 0, dy: 1 }, "a refused step doesn't turn it");
  assert.ok(g.move(-1, 0));
  assert.ok(g.move(1, 0));
  assert.ok(g.move(0, 1), "into the enemy");
  assert.deepEqual(g.facing, { dx: 0, dy: 1 }, "facing the enemy it fought");
  assert.ok(g.undo());
  assert.deepEqual(g.facing, { dx: 0, dy: 1 }, "undo doesn't turn it");
});

/** The rotations the Arcade hero is painted with. */
function arcadeTurns(facing?: { dx: number; dy: number }) {
  const turns: number[] = [];
  const c = new Proxy({ rotate: (a: number) => turns.push(a) }, {
    get: (t, k) => (k in t ? t[k as "rotate"] : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  THEMED_BOARDS.arcade.hero(c, facing!);
  return turns;
}

test("the Arcade chomper turns its mouth the way the hero faces (world y up, the screen's down)", () => {
  assert.deepEqual(arcadeTurns({ dx: 1, dy: 0 }), [], "the sprite opens right");
  assert.deepEqual(arcadeTurns(undefined), [], "right without a facing");
  assert.deepEqual(arcadeTurns({ dx: -1, dy: 0 }), [Math.PI]);
  assert.deepEqual(arcadeTurns({ dx: 0, dy: 1 }), [-Math.PI / 2], "up the screen");
  assert.deepEqual(arcadeTurns({ dx: 0, dy: -1 }), [Math.PI / 2], "down the screen");
});
