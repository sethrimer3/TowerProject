import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TIERS } from "../src/tiers.ts";
import { decodePng } from "../tools/ui-atlas-png.mjs";
const towers = Array.from({length:TIERS-1},(_,i)=>i+2);
import { drawDungeonGround, towerFloorFrame, towerTierAtlasId, towerTileset, dungeonWallVariant } from "../src/sprites/dungeon.ts";
import { paintTile, type BoardLook } from "../src/render/tile-painters.ts";

test("Towers II–IX each ship a distinct native floor panel and connected wall atlas", () => {
  for (const part of ["floor", "walls"] as const) {
    const files = towers.map(tier => readFileSync(new URL(`../public/assets/style/${towerTierAtlasId(tier, part)}.png`, import.meta.url)));
    for (const bytes of files) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [96, part === "floor" ? 96 : 720]);
    assert.equal(new Set(files.map(b=>b.toString("base64"))).size,towers.length,"each tower has its own artwork");
  }
  for (const tier of [undefined, 1, 0, 10, 2.5, NaN]) assert.equal(towerTileset("tower", tier), undefined);
  for (const tier of towers) {
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
    for (const tier of towers) for (const height of [0, 9, 10, 29, 90, 100, 1234]) {
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


test("new tower sprites use only the shared palette and preserve native corner alpha and black cores", () => {
  const values=readFileSync(new URL("../assets/ui-sprites/palette.ppm",import.meta.url),"utf8").replace(/#[^\n]*/g,"").trim().split(/\s+/).slice(4).map(Number);
  const palette=new Set(Array.from({length:values.length/3},(_,i)=>values.slice(i*3,i*3+3).join(",")));
  const base=decodePng(readFileSync(new URL("../public/assets/style/dungeon-tower-2-walls.png",import.meta.url)));
  for(const tier of towers)for(const part of ["floor","walls"] as const) {
    const path=`../public/assets/style/${towerTierAtlasId(tier,part)}.png`;
    const {width,height,pixels}=decodePng(readFileSync(new URL(path,import.meta.url)));
    for(let i=0;i<pixels.length;i+=4) {
      assert.ok(pixels[i+3]===0||pixels[i+3]===255,`${tier}: binary alpha`);
      if(pixels[i+3])assert.ok(palette.has([...pixels.subarray(i,i+3)].join(",")),`${tier}: palette`);
    }
    if(part==="walls") {
      for(let frame=100;frame<104;frame++)for(let y=0;y<24;y++)for(let x=0;x<24;x++) {
        const pos=((Math.floor(frame/4)*24+y)*width+(frame%4*24+x))*4+3;
        assert.equal(pixels[pos],base.pixels[pos],`${tier}: original collision corner silhouette`);
      }
      for(let y=height-24;y<height;y++)for(let x=0;x<width;x++) {
        const pos=(y*width+x)*4;assert.deepEqual([...pixels.subarray(pos,pos+4)],[12,16,22,255]);
      }
    }
  }
});
