import { test } from "node:test";
import assert from "node:assert/strict";
import { snapCell, snapEdge, snapSprites, sprite } from "../src/sprites/pixel-sprite.ts";

/** The rectangles a sprite fills, on a stand-in context. */
function fills(draw: (c: CanvasRenderingContext2D) => void) {
  const rects: number[][] = [];
  const c = { fillStyle: "", fillRect: (...r: number[]) => rects.push(r) } as unknown as CanvasRenderingContext2D;
  draw(c);
  return rects;
}

test("sprites keep their own pixel size while the pixel filter is off", () => {
  snapSprites(0);
  assert.equal(snapCell(1.4), 1.4);
  assert.equal(snapEdge(3.3), 3.3);
});

test("the pixel filter puts every sprite pixel on its grid, a whole number of grid pixels each", () => {
  snapSprites(1.5);
  try {
    assert.deepEqual([0.75, 1, 1.4, 1.6, 2.6, 3].map(snapCell), [1.5, 1.5, 1.5, 1.5, 3, 3]);
    const rects = fills((c) => sprite(c, ["X.X", ".X."], { X: "#fff" }, 1.4, 12, 12.6));
    for (const [x, y, w] of rects) {
      assert.equal(Math.round(x / 1.5) * 1.5, x);
      assert.equal(Math.round(y / 1.5) * 1.5, y);
      assert.equal(w, 1.5 + 0.15);
    }
  } finally {
    snapSprites(0);
  }
});
