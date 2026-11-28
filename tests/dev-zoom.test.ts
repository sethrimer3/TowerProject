import { test } from "node:test";
import assert from "node:assert/strict";
import { artScreenPixels, stepZoom, zoomForScale, zoomLook, anchorOffset, clampOffset, zoomSteps, ZOOM_CANVAS_MAX } from "../src/render/dev-zoom.ts";

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

test("zooming keeps the point under the pointer still", () => {
  // At ×1 with no offset the board point under 100 is 100; at ×4 it must stay at 100.
  const t = anchorOffset(0, 100, 1, 4);
  assert.equal(t + 100 * 4, 100);
  // Zooming further from ×4 to ×8 about 300: that board point stays put.
  const u = (300 - t) / 4, t2 = anchorOffset(t, 300, 4, 8);
  assert.equal(t2 + u * 8, 300);
});

test("panning never shows past the board", () => {
  assert.equal(clampOffset(50, 400, 4, 1), 0);
  assert.equal(clampOffset(-5000, 400, 4, 1), -1200);
  assert.equal(clampOffset(-600.3, 400, 4, 2), -600.5);
  assert.equal(clampOffset(-30, 400, 1, 1), 0);
});
