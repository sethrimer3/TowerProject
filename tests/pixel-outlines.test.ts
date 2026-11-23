import { test } from "node:test";
import assert from "node:assert/strict";
import { pixelOutline, OUTLINE_PALETTES } from "../src/sprites/pixel-outline.ts";

test("a procedural contour occupies exactly the four orthogonal neighbors, never the diagonal corners, and leaves the body intact", () => {
  const alpha = new Uint8ClampedArray(9); alpha[4] = 255;
  const before = alpha.slice(), rim = pixelOutline(alpha, 3, 3, "gold");
  assert.deepEqual(alpha, before);
  let count = 0;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const a = rim[(y * 5 + x) * 4 + 3];
    assert.equal(a, Math.abs(x - 2) + Math.abs(y - 2) === 1 ? 255 : 0);
    if (a) count++;
  }
  assert.equal(count, 4);
});

test("pixel contours shade with the sprite's upper-left light and use only the selected hard palette", () => {
  const alpha = new Uint8ClampedArray([255]);
  for (const kind of ["gold", "blue", "black"] as const) {
    const rim = pixelOutline(alpha, 1, 1, kind), palette = OUTLINE_PALETTES[kind];
    assert.equal(rim[3], 0, "no diagonal corner pixel");
    assert.deepEqual([...rim.slice(1 * 4, 1 * 4 + 3)], palette[0], "above is lit");
    assert.deepEqual([...rim.slice(3 * 4, 3 * 4 + 3)], palette[0], "left is lit");
    assert.deepEqual([...rim.slice(5 * 4, 5 * 4 + 3)], palette[2], "right is shaded");
    assert.deepEqual([...rim.slice(7 * 4, 7 * 4 + 3)], palette[2], "below is shaded");
    for (let i = 0; i < rim.length; i += 4) if (rim[i + 3]) {
      assert.equal(rim[i + 3], 255, "no blurry or translucent outline pixels");
      assert.ok(palette.some(color => color.every((value, channel) => value === rim[i + channel])));
    }
  }
});

test("closed interior holes stay clear and even translucent sprite pixels are never overwritten", () => {
  const alpha = new Uint8ClampedArray(25).fill(255);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) alpha[y * 5 + x] = 0;
  const rim = pixelOutline(alpha, 5, 5, "blue");
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) assert.equal(rim[(y * 7 + x) * 4 + 3], 0);
  alpha.fill(1);
  const translucent = pixelOutline(alpha, 5, 5, "black");
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) assert.equal(translucent[(y * 7 + x) * 4 + 3], 0);
  assert.ok(pixelOutline(new Uint8ClampedArray(25), 5, 5, "gold").every(value => value === 0));
});
