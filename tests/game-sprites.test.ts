import assert from "node:assert/strict";
import test from "node:test";
import { GAME_SPRITE_URLS, torchAnimationFrame, TORCH_FRAME_COUNT, TORCH_FRAME_MS } from "../src/game-sprites.ts";
import { decode, defaults } from "../src/save.ts";

test("player, torch, and both stairs use deploy-safe sprite assets", () => {
  assert.deepEqual(Object.keys(GAME_SPRITE_URLS), ["player", "torch", "torchFrames", "stairsUp", "stairsDown"]);
  for (const url of Object.values(GAME_SPRITE_URLS)) assert.match(url, /assets\/sprites\/.+\.png$/);
});

test("sprite fallback setting defaults to new art and persists opt-out", () => {
  assert.equal(defaults().settings.spritesOff, false);
  assert.equal(decode(JSON.stringify({ version: 3, settings: { spritesOff: true } })).settings.spritesOff, true);
  assert.equal(decode(JSON.stringify({ version: 3, settings: { spritesOff: "yes" } })).settings.spritesOff, false);
});

test("torch frames advance while spatial offsets keep torches out of sync", () => {
  const offsets = new Set(Array.from({ length: 12 }, (_, x) => torchAnimationFrame(x, x * 3, 0, false)));
  assert.ok(offsets.size > 1, "different torch coordinates should not share one animation phase");
  const start = torchAnimationFrame(7, 11, 0, false);
  assert.equal(torchAnimationFrame(7, 11, TORCH_FRAME_MS, false), (start + 1) % TORCH_FRAME_COUNT);
  assert.equal(torchAnimationFrame(7, 11, TORCH_FRAME_MS * 9, true), start, "reduced motion freezes the spatial frame");
});
