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

test("a torch tucked in a corner keeps its brightest light on its own tile", () => {
  const { isWall } = grid([
    "#######",
    "#.....#",
    "#.....#",
    "#.....#",
    "#######",
  ]);
  const torch = { x: 1, y: 1, lightRadius: 5.5 };
  const field = torchLightField({ ...torch, visibilityPolygon: computeVisibilityPolygon(torch, isWall) }, isWall);
  let peak = 0, at = [0, 0];
  for (let py = 0; py < field.rows; py++)
    for (let px = 0; px < field.cols; px++) {
      const v = field.values[py * field.cols + px];
      if (v > peak) { peak = v; at = [field.left + (px + 0.5) / field.res, field.top - (py + 0.5) / field.res]; }
    }
  assert.equal(Math.floor(at[0]), torch.x, "peak x is on the torch tile");
  assert.equal(Math.floor(at[1]), torch.y, "peak y is on the torch tile");
  assert.ok(sample(field, 1.5, 1.5) > sample(field, 2.5, 2.5), "light is brighter on the torch tile than one tile into the room");
});

test("swayed light bakes share the tile grid and never spill deeper into walls", () => {
  const { isWall } = grid([
    "#########",
    "#.......#",
    "#.......#",
    "#.......#",
    "#########",
  ]);
  const torch = { x: 1, y: 1, lightRadius: 5.5 };
  const bake = (dx: number) =>
    torchLightField(
      { ...torch, visibilityPolygon: computeVisibilityPolygon({ ...torch, x: torch.x + dx }, isWall) },
      isWall, undefined, dx,
    );
  const left = bake(-0.12), right = bake(0.12);
  assert.deepEqual([left.left, left.top, left.tiles], [right.left, right.top, right.tiles], "same grid placement");
  // A wall-face sample half a tile deep: the soft rim may light it, but it stays the same
  // whichever way the flame leans, so the glow never slides on and off the wall.
  const rimL = sample(left, 0.25, 2.5), rimR = sample(right, 0.25, 2.5);
  assert.ok(Math.abs(rimL - rimR) < 0.08, `wall rim stays steady (${rimL.toFixed(3)} vs ${rimR.toFixed(3)})`);
  assert.ok(sample(left, -0.5, 2.5) < 0.01 && sample(right, -0.5, 2.5) < 0.01, "outside the wall stays dark");
  assert.ok(sample(right, 3.5, 1.5) > sample(left, 3.5, 1.5), "leaning right brightens the floor to the right");
});

test("walls around a torch catch the same lit edge on every side", () => {
  // Mirror-image corner torches: walls north+west versus south+east.
  const isWall = (x: number, y: number) => x < 1 || y < 1 || x > 7 || y > 7;
  const edge = (t: { x: number; y: number; lightRadius: number }) => {
    const f = torchLightField({ ...t, visibilityPolygon: computeVisibilityPolygon(t, isWall) }, isWall);
    return (wx: number, wy: number) => sample(f, wx, wy);
  };
  const nw = edge({ x: 1, y: 7, lightRadius: 5.5 }), se = edge({ x: 7, y: 1, lightRadius: 5.5 });
  const westFace = nw(0.94, 7.5), northFace = nw(1.5, 8.06);
  const eastFace = se(8.06, 1.5), southFace = se(7.5, 0.94);
  for (const v of [westFace, northFace, eastFace, southFace]) assert.ok(v > 0.5, `wall edge is lit (${v.toFixed(2)})`);
  assert.ok(Math.abs(westFace - eastFace) < 0.05 && Math.abs(northFace - southFace) < 0.05, "mirrored walls light equally");
  assert.ok(nw(0.5, 7.5) < westFace, "the sheen fades into the wall");
});
