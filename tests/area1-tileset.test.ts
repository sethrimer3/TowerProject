import test from "node:test";
import assert from "node:assert/strict";
import { AREA1_DOOR_URLS, AREA1_FLOOR_URLS, floorVariant, wallAdjacencyMask, wallVariant } from "../src/area1-tileset.ts";

test("wall adjacency uses NESW bits for every structural combination", () => {
  for (let mask = 0; mask < 16; mask++) assert.equal(wallAdjacencyMask({
    northWall: !!(mask & 1), eastWall: !!(mask & 2), southWall: !!(mask & 4), westWall: !!(mask & 8),
  }), mask);
});

test("area-one variants are deterministic and bounded", () => {
  assert.equal(floorVariant(3, 7, 99), floorVariant(3, 7, 99));
  assert.ok(floorVariant(3, 7, 99) >= 0 && floorVariant(3, 7, 99) < 4);
  assert.ok(wallVariant(15, 3, 7, 99) >= 0 && wallVariant(15, 3, 7, 99) < 3);
  assert.equal(wallVariant(6, 3, 7, 99), 6);
});

test("asset URLs retain a deployable base instead of escaping to the host root", () => {
  assert.match(AREA1_FLOOR_URLS[0], /assets\/tilesets\/area1\/floor_01\.png$/);
  assert.match(AREA1_DOOR_URLS.heart, /assets\/tilesets\/area1\/doors\/door_heart\.png$/);
});
