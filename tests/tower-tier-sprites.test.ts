import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { drawDungeonGround, towerFloorFrame, towerTierAtlasId, towerTileset, dungeonWallVariant } from "../src/sprites/dungeon.ts";
import { paintTile, type BoardLook } from "../src/render/tile-painters.ts";

test("Tower II and III each ship a distinct native floor panel and connected wall atlas", () => {
  for (const part of ["floor", "walls"] as const) {
    const files = [2, 3].map(tier => readFileSync(new URL(`../public/assets/style/${towerTierAtlasId(tier as 2 | 3, part)}.png`, import.meta.url)));
    for (const bytes of files) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [96, part === "floor" ? 96 : 720]);
    assert.notDeepEqual(files[0], files[1], "each tower has its own artwork");
  }
  for (const tier of [undefined, 1, 4, 5, 9]) assert.equal(towerTileset("tower", tier), undefined);
  for (const tier of [2, 3] as const) {
    assert.equal(towerTileset("tower", tier), tier);
    assert.equal(towerTileset("delve", tier), undefined, "the matching Delve tier keeps its existing cave art");
  }
});

test("fixed Tower materials ignore ten-floor biome changes and cover floor under contents plus every wall join", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 96; naturalHeight = 720; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const draws: (string | number)[][] = [];
  const c = new Proxy({}, { set: () => true, get: (_, name) => name === "drawImage"
    ? (image: ReadyImage, ...args: number[]) => draws.push([image.src.split("/").at(-1)!, ...args]) : () => {} }) as CanvasRenderingContext2D;
  try {
    const world = { tile: () => ({ kind: "floor" as const }) };
    for (const tier of [2, 3] as const) for (const height of [0, 9, 10, 29, 90, 100, 1234]) {
      const look: BoardLook = { mode: "tower", tier, height, seed: 1103, outside: false, entranceX: 8,
        styledSprites: true, reduceMotion: true, themed: null };
      for (const tile of [{ kind: "floor" }, { kind: "door", color: "blue" }, { kind: "attack" }] as const) {
        draws.length = 0; paintTile(c, world, tile, -3, 5, 0, 0, look);
        const frame = towerFloorFrame(-3, 5, look.seed);
        assert.deepEqual(draws[0], [`dungeon-tower-${tier}-floor.png`, frame % 4 * 24, Math.floor(frame / 4) * 24, 24, 24, 0, 0, 24, 24]);
      }
      for (let mask = 0; mask < 16; mask++) {
        draws.length = 0;
        drawDungeonGround(c, { mode: "tower", tier, height, seed: 1103, x: 2, y: 5, wall: true, empty: false,
          neighbors: { northWall: !!(mask & 1), eastWall: !!(mask & 2), southWall: !!(mask & 4), westWall: !!(mask & 8) } });
        const frame = 4 + dungeonWallVariant(2, 5, 1103) * 16 + mask;
        assert.deepEqual(draws[0], [`dungeon-tower-${tier}-walls.png`, frame % 4 * 24, Math.floor(frame / 4) * 24, 24, 24, 0, 0, 24, 24]);
      }

    }
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original); else Reflect.deleteProperty(globalThis, "Image");
  }
});
