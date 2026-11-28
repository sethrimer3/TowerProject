import { test } from "node:test";
import assert from "node:assert/strict";
import { artScreenPixels, stepZoom, zoomForScale, zoomLook, zoomOffset, zoomSteps, ZOOM_CANVAS_MAX } from "../src/render/dev-zoom.ts";

test("dev zoom's steps are whole screen pixels an art pixel, ending just past ×4", () => {
  for (const [width, dpr] of [[390, 3], [700, 1], [360, 2], [1024, 1.25], [408, 1]]) {
    const a = artScreenPixels(width, dpr, 17), { min, max } = zoomSteps(a);
    assert.ok(min > a && min - 1 <= a);
    assert.ok(max / a > 4, `${width}@${dpr}: ×${max / a}`);
    assert.ok((max - 1) / a <= 4);
    assert.ok(Number.isInteger(min) && Number.isInteger(max));
  }
});

test("the wheel steps in and out, off below the first step", () => {
  const a = 2.87, { min, max } = zoomSteps(a);
  assert.equal(stepZoom(0, 1, a), min);
  assert.equal(stepZoom(0, -1, a), 0);
  assert.equal(stepZoom(min, -1, a), 0);
  assert.equal(stepZoom(max, 1, a), max);
  let level = 0;
  for (let i = 0; i < 50; i++) level = stepZoom(level, 1, a);
  assert.equal(level, max);
});

test("a pinch picks the step nearest its spread", () => {
  const a = 2;
  assert.equal(zoomForScale(1, a), 0);
  assert.equal(zoomForScale(2, a), 4);
  assert.equal(zoomForScale(100, a), zoomSteps(a).max);
});

test("the zoomed canvas keeps whole canvas pixels an art pixel, within its cap", () => {
  const look = zoomLook(12, 2.87, 17);
  assert.equal(look.scale, 12 / 2.87);
  assert.ok(Number.isInteger(look.perArtPixel));
  assert.ok(17 * 24 * look.perArtPixel <= ZOOM_CANVAS_MAX);
  assert.equal(zoomLook(3, 2.5, 17).perArtPixel, 3);
});

test("the zoom centres the hero but never shows past the board", () => {
  assert.deepEqual(zoomOffset(200, 200, 400, 4, 1), { x: -600, y: -600 });
  assert.deepEqual(zoomOffset(0, 400, 400, 4, 1), { x: 0, y: -1200 });
});
