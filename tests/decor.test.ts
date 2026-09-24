import { test } from "node:test";
import assert from "node:assert/strict";
import { point, type Tile, type Torch } from "../src/entities.ts";
import type { Board } from "../src/generation.ts";
import { clearDecorCache, decorSourceFor, TILE_PX, tileDecor, waterAt, type DecorSource } from "../src/decor.ts";
import { DecorLayer } from "../src/decor-render.ts";
import { OutsideGrass } from "../src/outside-grass.ts";
import { OutsideWorld } from "../src/outside.ts";
import { decode, defaults } from "../src/save.ts";

/** A 17x17 room board shaped like a Tower RoomWorld: two chambers split by
 * a wall with a door, pillars, a torch, and a few items. */
function fakeRoom(room: number, seed = 99): Board & { cells: Map<string, Tile>; room: number; height: number } {
  const cells = new Map<string, Tile>();
  for (let y = 0; y < 17; y++)
    for (let x = 0; x < 17; x++) {
      const edge = x === 0 || y === 0 || x === 16 || y === 16;
      const divider = x === 8 && y !== 8;
      const pillar = (x === 4 || x === 12) && (y === 4 || y === 12);
      cells.set(point(x, y), { kind: edge || divider || pillar ? "wall" : "floor" });
    }
  cells.set(point(8, 8), { kind: "door", color: "yellow" });
  cells.set(point(3, 9), { kind: "key", color: "yellow" });
  cells.set(point(13, 2), { kind: "enemy", enemy: { name: "Slime", hp: 5, attack: 1, defense: 0, tier: 0 } });
  cells.set(point(14, 14), { kind: "stairs" });
  const torches: Torch[] = [{ x: 1, y: 1, lightRadius: 5, baseIntensity: 0.7, active: true }];
  return {
    width: 17, height: 17, floor: 0, room, cells, torches,
    tile: (x, y) => cells.get(point(x, y)) ?? { kind: "wall" },
    step: (x, y, dx, dy) => ({ x: x + dx, y: y + dy }),
    clear: (x, y) => { cells.set(point(x, y), { kind: "floor" }); },
  };
}
/** The first room numbers whose character matches `want`. */
function roomWhere(want: (s: DecorSource) => boolean, seed = 99) {
  for (let room = 0; room < 400; room++) {
    const src = decorSourceFor(fakeRoom(room, seed), seed)!;
    if (want(src)) return room;
  }
  throw Error("no such room");
}
const eachTile = (fn: (x: number, y: number) => void) => {
  for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) fn(x, y);
};

test("decor plans are deterministic and never touch tiles", () => {
  const board = fakeRoom(roomWhere((s) => s.lush(0, 0) > 0.7));
  const before = JSON.stringify([...board.cells]);
  const a = decorSourceFor(board, 99)!;
  const planA = [] as string[];
  eachTile((x, y) => planA.push(JSON.stringify(tileDecor(a, x, y), (_, v) => (v instanceof Uint8Array ? [...v].join("") : v))));
  clearDecorCache();
  const b = decorSourceFor(board, 99)!;
  const planB = [] as string[];
  eachTile((x, y) => planB.push(JSON.stringify(tileDecor(b, x, y), (_, v) => (v instanceof Uint8Array ? [...v].join("") : v))));
  assert.deepEqual(planA, planB);
  assert.equal(JSON.stringify([...board.cells]), before);
});

test("outside boards get no dungeon decor", () => {
  assert.equal(decorSourceFor(new OutsideWorld(5, "tower"), 5), null);
});

test("crates sit against walls on plain floor, clear of torches, doors and stairs", () => {
  let found = 0;
  for (let room = 0; room < 120; room++) {
    const board = fakeRoom(room), src = decorSourceFor(board, 99)!;
    eachTile((x, y) => {
      const d = tileDecor(src, x, y);
      if (!d.crates.length) return;
      found++;
      assert.equal(board.tile(x, y).kind, "floor", `crate on ${board.tile(x, y).kind} at ${x},${y}`);
      assert.ok(!(x === 1 && y === 1), "crate on the torch tile");
      const around = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => board.tile(x + dx, y + dy).kind);
      assert.ok(around.includes("wall"), "crate must lean on a wall");
      assert.ok(!around.includes("door") && !around.includes("stairs"), "crate blocks a doorway or stairs");
      for (const c of d.crates) {
        assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= TILE_PX && c.y + c.h <= TILE_PX, "crate spills out of its tile");
      }
    });
  }
  assert.ok(found > 0, "some crates should appear");
});

test("thickets and plants grow only on plain floor", () => {
  let thickets = 0;
  for (let room = 0; room < 80; room++) {
    const board = fakeRoom(room), src = decorSourceFor(board, 99)!;
    eachTile((x, y) => {
      const d = tileDecor(src, x, y), kind = board.tile(x, y).kind;
      if (d.thicket) { thickets++; assert.equal(kind, "floor"); assert.ok(d.blades.length > 10); }
      if (d.plants.length) assert.equal(kind, "floor");
    });
  }
  assert.ok(thickets > 0, "lush rooms should have walk-through thickets");
});

test("pools stay on open ground, off torches, and short of the walls", () => {
  const room = roomWhere((s) => s.damp(0, 0) > 0.8);
  const board = fakeRoom(room), src = decorSourceFor(board, 99)!;
  let wet = 0;
  eachTile((x, y) => {
    const d = tileDecor(src, x, y), kind = board.tile(x, y).kind;
    if (!d.water) return;
    assert.ok(kind !== "wall" && kind !== "door" && kind !== "stairs", `water on ${kind}`);
    assert.ok(!(x === 1 && y === 1), "water under the torch");
    for (let j = 0; j < TILE_PX; j++)
      for (let i = 0; i < TILE_PX; i++) {
        if (d.water[j * TILE_PX + i] !== 1) continue;
        wet++;
        // No water pixel touches a neighbouring wall tile directly.
        if (i === 0) assert.notEqual(board.tile(x - 1, y).kind, "wall");
        if (i === TILE_PX - 1) assert.notEqual(board.tile(x + 1, y).kind, "wall");
        if (j === 0) assert.notEqual(board.tile(x, y + 1).kind, "wall");
        if (j === TILE_PX - 1) assert.notEqual(board.tile(x, y - 1).kind, "wall");
      }
  });
  assert.ok(wet > 0, "a damp room should hold some water");
});

test("moss fades continuously across tile seams", () => {
  const room = roomWhere((s) => s.lush(0, 0) > 0.6);
  const board = fakeRoom(room), src = decorSourceFor(board, 99)!;
  let seams = 0, jumps = 0;
  eachTile((x, y) => {
    if (board.tile(x, y).kind !== "floor" || board.tile(x + 1, y).kind !== "floor") return;
    const a = tileDecor(src, x, y).moss, b = tileDecor(src, x + 1, y).moss;
    for (let j = 0; j < TILE_PX; j++) {
      const la = a ? a[j * TILE_PX + TILE_PX - 1] & 3 : 0, lb = b ? b[j * TILE_PX] & 3 : 0;
      seams++;
      if (Math.abs(la - lb) > 1) jumps++;
    }
  });
  assert.ok(seams > 100);
  assert.ok(jumps / seams < 0.05, `moss jumps at ${jumps} of ${seams} seam pixels`);
});

test("doors and stairs stay clean", () => {
  for (let room = 0; room < 60; room++) {
    const src = decorSourceFor(fakeRoom(room), 99)!;
    for (const [x, y] of [[8, 8], [14, 14]]) {
      const d = tileDecor(src, x, y);
      assert.ok(d.empty, `decor on a door or stairs in room ${room}`);
    }
  }
});

test("stepping onto crates splinters them, and the pieces stay out of the walls", () => {
  let room = -1, at: [number, number] = [0, 0];
  for (let r = 0; r < 200 && room < 0; r++) {
    const src = decorSourceFor(fakeRoom(r), 99)!;
    eachTile((x, y) => { if (room < 0 && tileDecor(src, x, y).crates.length) { room = r; at = [x, y]; } });
  }
  const board = fakeRoom(room), layer = new DecorLayer();
  layer.sync(board, 99);
  const tileAt = (x: number, y: number) => board.tile(x, y);
  let now = 1000;
  // Walk in from the open side, then stand on the crate tile.
  const [cx, cy] = at;
  const from = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => [cx + dx, cy + dy]).find(([x, y]) => board.tile(x, y).kind === "floor")!;
  layer.update(0.016, now, from[0], from[1], tileAt, false);
  for (let k = 0; k <= 10; k++) layer.update(0.016, (now += 16), from[0] + (cx - from[0]) * k / 10, from[1] + (cy - from[1]) * k / 10, tileAt, false);
  assert.ok(layer.broken.has(`${layer.src!.key}:${cx},${cy}`), "crate should break underfoot");
  const splinters = () => layer.particles.filter((p) => p.kind === "splinter");
  assert.ok(splinters().length > 5, "breaking throws splinters");
  for (let k = 0; k < 300; k++) layer.update(0.016, (now += 16), cx, cy, tileAt, false);
  for (const p of splinters()) {
    const tx = Math.floor(p.gx / TILE_PX), ty = -Math.floor(p.gy / TILE_PX);
    assert.notEqual(board.tile(tx, ty).kind, "wall", `splinter came to rest inside a wall at ${tx},${ty}`);
    assert.equal(p.z, 0, "splinters settle on the floor");
  }
  // Reduced motion still breaks the crate, without flying pieces.
  const calm = new DecorLayer();
  calm.sync(fakeRoom(room), 99);
  calm.update(0.016, 1000, cx, cy, tileAt, true);
  assert.ok(calm.broken.size === 1 && calm.particles.length === 0);
});

test("wading through a pool makes ripples only on the water", () => {
  const room = roomWhere((s) => s.damp(0, 0) > 0.8);
  const board = fakeRoom(room), src = decorSourceFor(board, 99)!;
  let spot: [number, number] | null = null;
  eachTile((x, y) => {
    if (!spot && waterAt(src, x * TILE_PX + 12, -y * TILE_PX + 20) && board.tile(x, y).kind === "floor") spot = [x, y];
  });
  assert.ok(spot, "need a wet tile");
  const layer = new DecorLayer();
  layer.sync(board, 99);
  const [x, y] = spot!;
  let now = 1000;
  for (let k = 0; k < 20; k++) layer.update(0.016, (now += 16), x + (k % 2) * 0.05, y, (a, b) => board.tile(a, b), false);
  assert.ok(layer.ripples.length > 0, "moving in water ripples it");
  assert.ok(layer.ripples.every((r) => waterAt(src, r.gx, r.gy)));
});

test("outside grass only grows on grass tiles and survives reduced motion", () => {
  const world = new OutsideWorld(11, "tower"), grass = new OutsideGrass();
  const rects: [number, number][] = [];
  let transform: [number, number, number, number] = [0, 0, 1, 1];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, fill() {},
    translate(x: number, y: number) { transform = [x, y, transform[2], transform[3]]; },
    scale(a: number, b: number) { transform = [transform[0], transform[1], a, b]; },
    rect(x: number, y: number) { rects.push([x, y]); },
    set fillStyle(_: string) {},
  } as unknown as CanvasRenderingContext2D;
  const view = { left: 0, bottom: 0, n: 20, s: 24 };
  grass.draw(ctx, view, world, 11, world.entranceX, "storm", 1000, 0.016, 8, 5, false);
  assert.ok(rects.length > 100, "the clearing should be grassy");
  for (const [gx, gy] of rects) {
    // Blade roots are inside their tile; tips may lean or rise out of it.
    const tx = Math.floor((gx + 6) / TILE_PX), ty = -Math.floor(gy / TILE_PX);
    assert.ok(ty >= -1 && ty <= 20 && tx >= -1 && tx <= world.width, "blade far outside the board");
  }
  rects.length = 0;
  grass.draw(ctx, view, world, 11, world.entranceX, "sunny", 2000, 0.016, 8, 5, true);
  assert.ok(rects.length > 100);
});

test("environment decor is on by default and its toggle persists", () => {
  assert.equal(defaults().settings.decorOff, false);
  assert.equal(decode(JSON.stringify({ version: 3, settings: { decorOff: true } })).settings.decorOff, true);
  assert.equal(decode(JSON.stringify({ version: 3, settings: { decorOff: "yes" } })).settings.decorOff, false);
  assert.equal(decode(JSON.stringify({ version: 3, settings: {} })).settings.decorOff, false);
});
