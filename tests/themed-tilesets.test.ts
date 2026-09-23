import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEMED_TILESET_NAMES, THEMED_TILESET_URLS, themedTileUrl } from "../src/themed-tilesets.ts";

test("all ten dungeon themes expose complete floor and wall PNG sets", () => {
  assert.equal(THEMED_TILESET_NAMES.length, 10);
  for (const [index, set] of THEMED_TILESET_URLS.entries()) {
    assert.equal(set.floors.length, 4, `${THEMED_TILESET_NAMES[index]} floor variants`);
    assert.equal(set.walls.length, 16, `${THEMED_TILESET_NAMES[index]} wall masks`);
    for (const asset of [...set.floors, ...set.walls]) {
      assert.match(asset, /assets\/tilesets\/.+\.png$/);
      const relative = asset.slice(asset.indexOf("assets/"));
      assert.ok(existsSync(fileURLToPath(new URL(`../public/${relative}`, import.meta.url))), `missing ${relative}`);
    }
  }
});

test("tower zones select their matching themed PNGs", () => {
  const neighbors = { northWall: true, eastWall: false, southWall: true, westWall: false };
  assert.match(themedTileUrl("tower", 12, false, 3, 4, 7, neighbors), /mossbound-ruins\/floor_0[1-4]\.png$/);
  assert.match(themedTileUrl("tower", 35, true, 3, 4, 7, neighbors), /frozen-vault\/wall_vertical\.png$/);
  assert.match(themedTileUrl("tower", 99, true, 3, 4, 7, neighbors), /astral-sanctuary\/wall_vertical\.png$/);
});

