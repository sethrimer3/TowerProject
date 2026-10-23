import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { THEMED_BOARDS } from "../src/themed-boards.ts";
import { ARCADE } from "../src/arcade-board.ts";
import { PIXEL } from "../src/pixel-board.ts";
import { DOODLE } from "../src/doodle-board.ts";
import { MURK } from "../src/murk-board.ts";

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

/** How the Arcade hero is painted: whether mirrored, and whether its eyes
 * (the ground's black) show. */
function arcadeHero(facing?: { dx: number; dy: number }) {
  const scales: number[][] = [], fills: string[] = [];
  const c = new Proxy({ scale: (x: number, y: number) => scales.push([x, y]) } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (_t, k, v) => {
      if (k === "fillStyle") fills.push(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  THEMED_BOARDS.arcade.hero(c, facing!);
  return { mirrored: scales.some(([x]) => x < 0), eyes: fills.includes(ARCADE.ground) };
}

test("the Arcade hero turns the way it faces (world y up, the screen's down)", () => {
  assert.deepEqual(arcadeHero({ dx: 1, dy: 0 }), { mirrored: false, eyes: true }, "side on, looking right");
  assert.deepEqual(arcadeHero(undefined), { mirrored: false, eyes: true }, "right without a facing");
  assert.deepEqual(arcadeHero({ dx: -1, dy: 0 }), { mirrored: true, eyes: true });
  assert.deepEqual(arcadeHero({ dx: 0, dy: 1 }), { mirrored: false, eyes: false }, "its back going up the screen");
  assert.deepEqual(arcadeHero({ dx: 0, dy: -1 }), { mirrored: false, eyes: true }, "its face going down");
});

/** How the Pixel hero is painted: whether mirrored, and whether its sword
 * (at its side, hidden behind it from the back) shows. */
function pixelHero(facing?: { dx: number; dy: number }) {
  const scales: number[][] = [], fills: string[] = [];
  const c = new Proxy({ scale: (x: number, y: number) => scales.push([x, y]) } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (_t, k, v) => {
      if (k === "fillStyle") fills.push(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  THEMED_BOARDS.pixel.hero(c, facing!);
  return { mirrored: scales.some(([x]) => x < 0), sword: fills.includes(PIXEL.steel) };
}

test("the Pixel hero turns the way it faces (world y up, the screen's down)", () => {
  assert.deepEqual(pixelHero({ dx: 1, dy: 0 }), { mirrored: false, sword: true }, "side on, looking right");
  assert.deepEqual(pixelHero({ dx: -1, dy: 0 }), { mirrored: true, sword: true });
  assert.deepEqual(pixelHero({ dx: 0, dy: 1 }), { mirrored: false, sword: false }, "its back going up the screen");
  assert.deepEqual(pixelHero({ dx: 0, dy: -1 }), { mirrored: false, sword: true }, "its face going down");
});

/** Whether the Doodle hero is painted mirrored, and whether its sword is
 * drawn. */
function doodleHero(facing: { dx: number; dy: number }) {
  const scales: number[][] = [], strokes: string[] = [];
  const c = new Proxy({ scale: (x: number, y: number) => scales.push([x, y]) } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (_t, k, v) => {
      if (k === "strokeStyle") strokes.push(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  THEMED_BOARDS.doodle.hero(c, facing);
  return { mirrored: scales.some(([x]) => x < 0), sword: strokes.includes(DOODLE.pencil) };
}

test("the Doodle hero turns the way it last stepped sideways, its sword always in hand", () => {
  assert.deepEqual(doodleHero({ dx: 1, dy: 0 }), { mirrored: false, sword: true });
  assert.deepEqual(doodleHero({ dx: -1, dy: 0 }), { mirrored: true, sword: true });
  assert.deepEqual(doodleHero({ dx: 0, dy: 1 }), { mirrored: false, sword: true });
});

/** Whether the Murk hero is painted mirrored, and whether its sword is
 * drawn. */
function murkHero(facing: { dx: number; dy: number }) {
  const scales: number[][] = [], strokes: string[] = [];
  const c = new Proxy({ scale: (x: number, y: number) => scales.push([x, y]) } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (_t, k, v) => {
      if (k === "strokeStyle") strokes.push(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  THEMED_BOARDS.murk.hero(c, facing);
  return { mirrored: scales.some(([x]) => x < 0), sword: strokes.includes(MURK.chalk) };
}

test("the Murk hero turns the way it last stepped sideways, its sword always in hand", () => {
  assert.deepEqual(murkHero({ dx: 1, dy: 0 }), { mirrored: false, sword: true });
  assert.deepEqual(murkHero({ dx: -1, dy: 0 }), { mirrored: true, sword: true });
  assert.deepEqual(murkHero({ dx: 0, dy: 1 }), { mirrored: false, sword: true });
});
