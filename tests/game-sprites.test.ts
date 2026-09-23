import assert from "node:assert/strict";
import test from "node:test";
import { GAME_SPRITE_URLS } from "../src/game-sprites.ts";
import { decode, defaults } from "../src/save.ts";

test("player, torch, and both stairs use deploy-safe sprite assets", () => {
  assert.deepEqual(Object.keys(GAME_SPRITE_URLS), ["player", "torch", "stairsUp", "stairsDown"]);
  for (const url of Object.values(GAME_SPRITE_URLS)) assert.match(url, /assets\/sprites\/.+\.png$/);
});

test("sprite fallback setting defaults to new art and persists opt-out", () => {
  assert.equal(defaults().settings.spritesOff, false);
  assert.equal(decode(JSON.stringify({ version: 3, settings: { spritesOff: true } })).settings.spritesOff, true);
  assert.equal(decode(JSON.stringify({ version: 3, settings: { spritesOff: "yes" } })).settings.spritesOff, false);
});
