import test from "node:test";
import assert from "node:assert/strict";
import { bakeReliefMasks, heightMap, insidePolygon, reliefWeights } from "../src/floor-relief.ts";

const torch = { x: 5, y: 5, lightRadius: 4.5, baseIntensity: 0.5 };

test("height map treats dark grout as low and block faces as high", () => {
  const rgba = new Uint8ClampedArray([21, 30, 40, 255, 39, 52, 66, 255, 58, 74, 89, 255, 39, 52, 66, 0]);
  assert.deepEqual([...heightMap(rgba, 2)], [0, 1, 1, 0]);
});

test("a groove lights its far wall and shadows its torch-side lip", () => {
  // Row of 5 pixels: block, block, groove, block, block. Torch is to the east.
  const size = 5;
  const h = new Uint8Array(size * size).fill(1);
  for (let y = 0; y < size; y++) h[y * size + 2] = 0;
  const m = bakeReliefMasks(h, 1, 0, size);
  const row = (a: Float32Array) => [...a.slice(size * 2, size * 3)];
  assert.deepEqual(row(m.highlight), [0, 1, 0, 0, 1]); // west of the groove, plus the tile edge
  assert.deepEqual(row(m.shadow), [0.5, 0, 1, 0.5, 0]); // groove under the east lip; away-facing block edges (incl. tile edge)
});

test("relief is flat directly under the torch and fades out past its radius", () => {
  assert.equal(reliefWeights(5, 5, torch), null);
  assert.equal(reliefWeights(15, 5, torch), null);
  const near = reliefWeights(6, 5, torch)!, mid = reliefWeights(7, 5, torch)!;
  assert.ok(near.w > 0 && near.e === 0 && near.n === 0 && near.s === 0, "torch west of the tile lights west-facing edges");
  assert.ok(mid.far > near.far, "long shadows grow at grazing angles");
});

test("world-up torches light the top (north) edges in tile pixel space", () => {
  const w = reliefWeights(5, 3, torch)!;
  assert.ok(w.n > 0 && w.s === 0);
});

test("point in polygon respects the torch visibility shape", () => {
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  assert.ok(insidePolygon(2, 2, square));
  assert.ok(!insidePolygon(5, 2, square));
});
