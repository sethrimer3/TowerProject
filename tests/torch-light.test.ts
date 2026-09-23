import test from "node:test";
import assert from "node:assert/strict";
import { torchLightField } from "../src/torch-light.ts";
import { computeVisibilityPolygon } from "../src/lighting.ts";
import { chooseTorchSpots, TORCH_PLACEMENT } from "../src/generation.ts";
import { point, type Tile } from "../src/entities.ts";

/** Builds a tile map from rows drawn top (high y) to bottom (y = 0). */
function grid(rows: string[]) {
  const cells = new Map<string, Tile>();
  rows.forEach((row, i) => {
    const y = rows.length - 1 - i;
    [...row].forEach((ch, x) => {
      const kind = ch === "#" ? "wall" : ch === "D" ? "door" : "floor";
      cells.set(point(x, y), kind === "door" ? { kind, color: "yellow" } : { kind } as Tile);
    });
  });
  const isWall = (x: number, y: number) => (cells.get(point(x, y))?.kind ?? "wall") === "wall";
  return { cells, isWall, height: rows.length, width: rows[0].length };
}

function sample(field: ReturnType<typeof torchLightField>, wx: number, wy: number) {
  const px = Math.floor((wx - field.left) * field.res), py = Math.floor((field.top - wy) * field.res);
  return field.values[py * field.cols + px];
}

test("torch light is bright nearby, dark far away, and blocked by walls", () => {
  // A torch in the left room; a thick wall separates the right room.
  const { isWall } = grid([
    "###########",
    "#...###...#",
    "#...###...#",
    "#...###...#",
    "###########",
  ]);
  const torch = { x: 1, y: 2, lightRadius: 5.5 };
  const field = torchLightField({ ...torch, visibilityPolygon: computeVisibilityPolygon(torch, isWall) }, isWall);
  const near = sample(field, 2.5, 2.5), far = sample(field, 3.5, 3.5), behindWall = sample(field, 7.5, 2.5);
  assert.ok(near > far && far > 0, "light falls off with distance");
  assert.ok(behindWall < 0.01, "no light leaks through a thick wall");
});

test("bounce light bends around a corner but fades", () => {
  // Torch at the bottom of an L-shaped corridor; the top-right arm is out of direct sight.
  const { isWall } = grid([
    "#######",
    "#.....#",
    "#.#####",
    "#.#####",
    "#.#####",
    "#######",
  ]);
  const torch = { x: 1, y: 1, lightRadius: 5.5 };
  const field = torchLightField({ ...torch, visibilityPolygon: computeVisibilityPolygon(torch, isWall) }, isWall);
  const aroundCorner = sample(field, 3.5, 4.5);
  const inSight = sample(field, 1.5, 3.5);
  assert.ok(aroundCorner > 0, "light reaches around the corner");
  assert.ok(aroundCorner < inSight, "light around the corner is dimmer than in direct view");
});

test("torches pick room corners, keep clear of doors, and stay spaced out", () => {
  const { cells } = grid([
    "##############",
    "#....#.......#",
    "#....D.......#",
    "#....#.......#",
    "######.......#",
    "#............#",
    "##############",
  ]);
  const spots = chooseTorchSpots(cells, 1, 12, 1, 5, 7);
  assert.ok(spots.length >= 1);
  const wall = (x: number, y: number) => (cells.get(point(x, y))?.kind ?? "wall") === "wall";
  for (const [x, y] of spots) {
    const n = wall(x, y + 1), s = wall(x, y - 1), e = wall(x + 1, y), w = wall(x - 1, y);
    assert.ok((n || s) && (e || w), `(${x},${y}) is tucked in a corner`);
    assert.ok(!(n && s) && !(e && w), `(${x},${y}) is not in a corridor`);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]])
      assert.notEqual(cells.get(point(x + dx, y + dy))?.kind, "door", `(${x},${y}) keeps the doorway clear`);
  }
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++)
      assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) >= TORCH_PLACEMENT.minSpacing);
  assert.deepEqual(chooseTorchSpots(cells, 1, 12, 1, 5, 7), spots, "placement is deterministic per seed");
});
