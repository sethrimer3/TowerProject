import test from "node:test";
import assert from "node:assert/strict";
import { AREA1_DOOR_URLS, AREA1_FLOOR_URLS, AREA1_ITEM_URLS, area1ItemId, floorVariant, wallAdjacencyMask } from "../src/area1-tileset.ts";

test("wall adjacency uses NESW bits for every structural combination", () => {
  for (let mask = 0; mask < 16; mask++) assert.equal(wallAdjacencyMask({
    northWall: !!(mask & 1), eastWall: !!(mask & 2), southWall: !!(mask & 4), westWall: !!(mask & 8),
  }), mask);
});

test("area-one floor variants are deterministic and bounded", () => {
  assert.equal(floorVariant(3, 7, 99), floorVariant(3, 7, 99));
  assert.ok(floorVariant(3, 7, 99) >= 0 && floorVariant(3, 7, 99) < 4);
});

test("asset URLs retain a deployable base instead of escaping to the host root", () => {
  assert.match(AREA1_FLOOR_URLS[0], /assets\/tilesets\/area1\/floor_01\.png$/);
  assert.match(AREA1_DOOR_URLS.heart, /assets\/tilesets\/area1\/doors\/door_heart\.png$/);
  assert.match(AREA1_ITEM_URLS.chest_gold, /assets\/tilesets\/area1\/items\/chest_gold\.png$/);
});

test("every area-one pickup and chest maps to its dedicated sprite", () => {
  assert.equal(area1ItemId({ kind: "key", color: "yellow" }), "key_yellow");
  assert.equal(area1ItemId({ kind: "key", color: "blue" }), "key_blue");
  assert.equal(area1ItemId({ kind: "key", color: "red" }), "key_red");
  assert.equal(area1ItemId({ kind: "potion", color: "blue" }), "potion_flat");
  assert.equal(area1ItemId({ kind: "potion", color: "red" }), "potion_percent");
  assert.equal(area1ItemId({ kind: "attack" }), "upgrade_attack");
  assert.equal(area1ItemId({ kind: "defense" }), "upgrade_defense");
  assert.equal(area1ItemId({ kind: "treasure" }), "chest_treasure");
  for (const tier of ["silver", "gold"] as const)
    assert.equal(area1ItemId({ kind: "reward", tier }), `chest_${tier}`);
  assert.equal(area1ItemId({ kind: "openedChest" }), "chest_treasure_open");
  assert.equal(area1ItemId({ kind: "openedChest", tier: "gold" }), "chest_gold_open");
  assert.equal(Object.keys(AREA1_ITEM_URLS).length, 13);
});
