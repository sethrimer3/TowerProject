import { test } from "node:test";
import assert from "node:assert/strict";
import { barrelProp, crateProp, flowerProp, gridProp, PROP_DENSITY, PROP_GRIDS, type PropGridId, type PropPixels } from "../src/sprites/half-props.ts";
import { pixelOutline } from "../src/sprites/pixel-outline.ts";

const alphaOf = (p: PropPixels) => Uint8ClampedArray.from({ length: p.width * p.height }, (_, i) => p.data[i * 4 + 3]);
const opaque = (p: PropPixels, x: number, y: number) => x >= 0 && y >= 0 && x < p.width && y < p.height && p.data[(y * p.width + x) * 4 + 3] > 0;

test("crates are drawn at twice the world's density and fill their box edge to edge", () => {
  for (const [w, h] of [[8, 8], [9, 9], [10, 10], [11, 11], [16, 16]]) for (let tone = 0; tone < 3; tone++) {
    const p = crateProp(w, h, tone);
    assert.equal(p.width, w * PROP_DENSITY);
    assert.equal(p.height, h * PROP_DENSITY);
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) assert.ok(opaque(p, x, y), `crate ${w}x${h} pixel ${x},${y}`);
  }
});

test("barrels fill their box but for square-stepped corners", () => {
  for (const [w, h] of [[7, 9], [8, 10], [9, 11]]) {
    const p = barrelProp(w, h, 0);
    assert.equal(p.width, w * PROP_DENSITY);
    assert.equal(p.height, h * PROP_DENSITY);
    assert.ok(!opaque(p, 0, 0) && opaque(p, p.width >> 1, 0) && opaque(p, 0, p.height >> 1));
  }
});

test("every prop's outline is solid black, one half pixel, orthogonal, and hugs the sprite", () => {
  const props: PropPixels[] = [
    ...Object.keys(PROP_GRIDS).map((id) => gridProp(id as PropGridId)),
    ...[0, 1, 2, 3].map(flowerProp), crateProp(9, 9, 1), barrelProp(8, 10, 2),
  ];
  for (const p of props) {
    const rim = pixelOutline(alphaOf(p), p.width, p.height, "solid"), w = p.width + 2;
    for (let y = 0; y < p.height + 2; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!rim[i + 3]) continue;
      assert.deepEqual([...rim.slice(i, i + 4)], [0, 0, 0, 255]);
      const sx = x - 1, sy = y - 1;
      assert.ok(!opaque(p, sx, sy), "never over the sprite");
      assert.ok(opaque(p, sx - 1, sy) || opaque(p, sx + 1, sy) || opaque(p, sx, sy - 1) || opaque(p, sx, sy + 1), "only beside the sprite, never at a diagonal corner");
    }
  }
});

test("hand-drawn props are 24 half pixels square and use only their own colours", () => {
  for (const [id, grid] of Object.entries(PROP_GRIDS)) {
    assert.equal(grid.rows.length, 24, id);
    for (const row of grid.rows) {
      assert.equal(row.length, 24, `${id}: ${row}`);
      for (const ch of row) assert.ok(ch === "." || ch in grid.colors, `${id} uses ${ch}`);
    }
  }
});
