import assert from "node:assert/strict";
import test from "node:test";
import { torchAnimationFrame, TORCH_FRAME_COUNT, TORCH_FRAME_MS } from "../src/sprites/options.ts";

test("torch frames advance while spatial offsets keep torches out of sync", () => {
  const offsets = new Set(Array.from({ length: 12 }, (_, x) => torchAnimationFrame(x, x * 3, 0, false)));
  assert.ok(offsets.size > 1, "different torch coordinates should not share one animation phase");
  const start = torchAnimationFrame(7, 11, 0, false);
  assert.equal(torchAnimationFrame(7, 11, TORCH_FRAME_MS, false), (start + 1) % TORCH_FRAME_COUNT);
  assert.equal(torchAnimationFrame(7, 11, TORCH_FRAME_MS * 9, true), start, "reduced motion freezes the spatial frame");
});
