import { test } from "node:test";
import assert from "node:assert/strict";
import type { Point } from "../src/entities.ts";
import { CIRCUIT, EDGE_GAP, FALCON_OFFSET, HALF_ROOM, ROOM_MIDDLE, pathOffset, wolfAngle, wolfOffset, type Roamer } from "../src/familiars/paths.ts";
import { pointing } from "../src/exact.ts";

const ROAMERS = Object.keys(CIRCUIT) as Roamer[];
const length = (p: Point) => Math.sqrt(p.x * p.x + p.y * p.y);
const near = (a: number, b: number, slack = 1e-9) => Math.abs(a - b) <= slack;
/** `p` with the path's slow turning taken back out. */
const unturned = (p: Point, turns: number): Point => {
  const { x: sin, y: cos } = pointing(-(turns % 360));
  return { x: p.x * cos + p.y * sin, y: p.y * cos - p.x * sin };
};

test("the room is a Tower floor to its outer edge", () => {
  assert.equal(HALF_ROOM, 8.5);
  assert.deepEqual(ROOM_MIDDLE, { x: 8, y: 8 });
  assert.deepEqual(CIRCUIT, { dragon: 100, slime: 60, falcon: 50, wisp: 80 });
});

test("every path reaches its distance from the edge and never nearer", () => {
  for (const id of ROAMERS) {
    const reach = HALF_ROOM - EDGE_GAP[id];
    let farthest = 0;
    // Every whole turn until shape and turning have come round together, at quarter turns.
    for (let t = 0; t < 3600; t += 0.25) farthest = Math.max(farthest, length(pathOffset(id, t)));
    assert.ok(farthest <= reach + 1e-9, `${id} reaches ${farthest}`);
    assert.ok(farthest >= reach - 0.01, `${id} reaches only ${farthest}`);
  }
});

test("no familiar jumps: a turn's step is short, circuits' seams included", () => {
  for (const id of ROAMERS)
    for (let t = 0; t < 800; t++) {
      const a = pathOffset(id, t), b = pathOffset(id, t + 1);
      assert.ok(length({ x: b.x - a.x, y: b.y - a.y }) < 1.5, `${id} at ${t}`);
    }
});

test("drawing between two turns lands on the turns themselves", () => {
  for (const id of ROAMERS)
    for (const t of [0, 13, CIRCUIT[id] - 1, 359]) {
      const at = pathOffset(id, t + 1), close = pathOffset(id, t + 1 - 1e-7);
      assert.ok(near(at.x, close.x, 1e-4) && near(at.y, close.y, 1e-4), `${id} at ${t}`);
    }
});

test("the Dragon flies five petals through the middle", () => {
  const radii = Array.from({ length: 1000 }, (_, i) => length(pathOffset("dragon", i / 10)));
  let tips = 0, middles = 0;
  radii.forEach((r, i) => {
    const before = radii[(i + 999) % 1000]!, after = radii[(i + 1) % 1000]!;
    if (r > 4 && r > before && r >= after) tips++;
    if (r < 0.2 && r < before && r <= after) middles++;
  });
  assert.equal(tips, 5);
  assert.equal(middles, 5);
});

test("the Slime's triangle has equal sides, walked evenly", () => {
  const corners = [0, 20, 40].map((t) => unturned(pathOffset("slime", t), t));
  const side = (a: Point, b: Point) => length({ x: b.x - a.x, y: b.y - a.y });
  const sides = [side(corners[0]!, corners[1]!), side(corners[1]!, corners[2]!), side(corners[2]!, corners[0]!)];
  assert.ok(near(sides[0]!, sides[1]!) && near(sides[1]!, sides[2]!));
  for (let t = 0; t < 60; t++) assert.ok(near(side(unturned(pathOffset("slime", t), t), unturned(pathOffset("slime", t + 1), t + 1)), sides[0]! / 20));
});

test("the Falcon circles a middle two tiles out, which moves a degree a turn", () => {
  const radius = HALF_ROOM - EDGE_GAP.falcon - FALCON_OFFSET;
  for (let t = 0; t < 720; t++) {
    const p = pathOffset("falcon", t), m = pointing(t % 360);
    assert.ok(near(length({ x: p.x - m.x * FALCON_OFFSET, y: p.y - m.y * FALCON_OFFSET }), radius), `turn ${t}`);
  }
});

test("each shape turns a degree a turn", () => {
  for (const id of ["dragon", "slime", "wisp"] as const) {
    const a = unturned(pathOffset(id, 7), 7), b = unturned(pathOffset(id, 7 + CIRCUIT[id]), 7 + CIRCUIT[id]);
    assert.ok(near(a.x, b.x) && near(a.y, b.y), id);
    assert.ok(length({ x: pathOffset(id, 7).x - pathOffset(id, 7 + CIRCUIT[id]).x, y: pathOffset(id, 7).y - pathOffset(id, 7 + CIRCUIT[id]).y }) > 0.01, id);
  }
});

test("the Wolf dashes onto the square four tiles in, at a replayable angle", () => {
  const inset = HALF_ROOM - EDGE_GAP.wolf, quarters = new Set<number>();
  for (let cast = 0; cast < 400; cast++) {
    const angle = wolfAngle(12345, cast), p = wolfOffset(angle);
    assert.ok(angle >= 0 && angle < 360);
    assert.ok(near(Math.max(Math.abs(p.x), Math.abs(p.y)), inset), `cast ${cast}`);
    assert.equal(wolfAngle(12345, cast), angle);
    quarters.add(Math.floor(angle / 90));
  }
  assert.equal(quarters.size, 4);
  assert.notEqual(wolfAngle(1, 0), wolfAngle(2, 0));
});
