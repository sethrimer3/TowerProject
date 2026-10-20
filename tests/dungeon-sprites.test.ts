import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS, DUNGEON_CORNER_FRAME, drawDungeonGround, dungeonAtlasId, dungeonDiagonals, dungeonFloorFrame, dungeonMaterial, dungeonWallVariant } from "../src/sprite-dungeon.ts";
import { paintTile, type BoardLook } from "../src/tile-painters.ts";
import { WaterReflections, type ReflectionScene } from "../src/decor-reflections.ts";
import type { TileDecor } from "../src/decor.ts";

test("interior PNGs contain native 24-pixel floors, all sixteen wall joins and shared transition masks", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
  assert.equal(DUNGEON_ATLASES.length, 21);
  for (const id of [...DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS]) {
    const bytes = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [96, id === DUNGEON_EDGE_ATLAS ? 216 : 624], id);
    assert.equal(manifest.assets[id].tile, true);
  }
});

test("Delve stone and earth form repeatable contiguous patches rather than independent tile noise", () => {
  for (const seed of [1, 1107, 8903]) {
    let changes = 0, pairs = 0; const counts = { stone: 0, earth: 0 };
    for (let y = -10; y < 80; y++) for (let x = -10; x < 80; x++) {
      const m = dungeonMaterial("delve", x, y, seed);
      assert.notEqual(m, "masonry"); counts[m as keyof typeof counts]++;
      assert.equal(dungeonMaterial("delve", x, y, seed), m);
      assert.equal(dungeonMaterial("tower", x, y, seed), "masonry");
      for (const [dx, dy] of [[1, 0], [0, 1]]) { pairs++; if (dungeonMaterial("delve", x + dx, y + dy, seed) !== m) changes++; }
    }
    assert.ok(counts.stone > 1500 && counts.earth > 1500);
    assert.ok(changes / pairs < .16, "neighboring tiles usually share their material");
  }
});

test("all wall connections, material floors and live tile contents use the correct native atlas frame", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 96; naturalHeight = 624; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const draws: (string | number)[][] = [];
  const c = new Proxy({}, { set: () => true, get: (_, name) => name === "drawImage"
    ? (image: ReadyImage, ...args: number[]) => draws.push([image.src.split("/").at(-1)!, ...args]) : () => {} }) as CanvasRenderingContext2D;
  try {
    for (const [variant, x] of [10, 2, 1, 5, 0, 3].entries()) for (let mask = 0; mask < 16; mask++) {
      const neighbors = { northWall: !!(mask & 1), eastWall: !!(mask & 2), southWall: !!(mask & 4), westWall: !!(mask & 8) };
      draws.length = 0;
      assert.ok(drawDungeonGround(c, { mode: "tower", height: 0, seed: 3, x, y: 5, wall: true, empty: false, neighbors }));
      const frame = 4 + variant * 16 + mask;
      assert.deepEqual(draws, [["dungeon-masonry-0.png", frame % 4 * 24, Math.floor(frame / 4) * 24, 24, 24, 0, 0, 24, 24]]);
    }
    const world = { tile: () => ({ kind: "floor" as const }) };
    const look: BoardLook = { mode: "delve", height: 0, seed: 1107, outside: false, entranceX: 8,
      styledSprites: true, spritesOff: false, reduceMotion: true, area1: false, themed: null };
    const materialSeen = new Set<string>();
    for (let x = 0; x < 20; x++) for (const tile of [{ kind: "floor" }, { kind: "attack" }, { kind: "door", color: "blue" }] as const) {
      draws.length = 0;
      assert.ok(paintTile(c, world, tile, x, 1, 0, 0, look));
      const material = dungeonMaterial("delve", x, 1, look.seed); materialSeen.add(material);
      assert.ok(String(draws[0][0]).startsWith(`dungeon-${material}`));
      const frame = dungeonFloorFrame(x, 1, look.seed);
      assert.deepEqual(draws[0].slice(1), [frame * 24, 0, 24, 24, 0, 0, 24, 24]);
      assert.equal(world.tile().kind, "floor");
    }
    assert.equal(materialSeen.size, 2);
    assert.equal(dungeonAtlasId("earth", 8), "dungeon-earth", "dirt stays earthy in every biome");
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original); else Reflect.deleteProperty(globalThis, "Image");
  }
});

test("wall variation is seeded, diagonal corners read real openings, and corner PNGs stay on eligible joins", () => {
  assert.deepEqual(new Set(Array.from({ length: 60 }, (_, x) => dungeonWallVariant(x, 5, 3))), new Set([0, 1, 2, 3, 4, 5]));
  const variants = (seed: number) => Array.from({ length: 60 }, (_, x) => dungeonWallVariant(x, 5, seed));
  assert.deepEqual(variants(3), variants(3), "wall art is stable on redraw and reload");
  assert.notDeepEqual(variants(3), variants(4), "different runs vary their wall art");
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 96; naturalHeight = 624; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const frames: number[] = [];
  const c = new Proxy({}, { set: () => true, get: (_, name) => name === "drawImage"
    ? (_image: ReadyImage, sx: number, sy: number) => frames.push(sy / 24 * 4 + sx / 24) : () => {} }) as CanvasRenderingContext2D;
  try {
    const tile = { mode: "tower" as const, height: 0, seed: 3, x: 8, y: 5, wall: true, empty: false };
    const calls: string[] = [];
    const diagonals = dungeonDiagonals({ tile: (x, y) => { calls.push(`${x},${y}`); return x === 7 && y === 6 ? { kind: "door", color: "blue" } : { kind: "wall" }; } }, "tower", 8, 5, 3);
    assert.deepEqual(calls, ["7,6", "9,6", "9,4", "7,4"]);
    assert.deepEqual(diagonals, ["masonry", "wall", "wall", "wall"], "a door is an opening; no out-of-world opening is invented");
    for (let corner = 0; corner < 4; corner++) for (const joined of [false, true]) {
      frames.length = 0;
      const neighbors = { northWall: joined, eastWall: joined, southWall: joined, westWall: joined };
      const d = ["wall", "wall", "wall", "wall"] as ("wall" | "masonry")[]; d[corner] = "masonry";
      drawDungeonGround(c, { ...tile, neighbors }, d);
      assert.equal(frames.length, 2); assert.equal(frames[1], DUNGEON_CORNER_FRAME + corner);
    }
    frames.length = 0;
    drawDungeonGround(c, { ...tile, neighbors: { northWall: true, eastWall: false, southWall: true, westWall: false } }, ["masonry", "masonry", "masonry", "masonry"]);
    assert.equal(frames.length, 1, "straight sides keep their original lips");
    frames.length = 0;
    drawDungeonGround(c, { ...tile, neighbors: { northWall: true, eastWall: true, southWall: true, westWall: true } }, [undefined, "wall", "wall", "wall"]);
    assert.equal(frames.length, 1, "missing diagonal terrain is not an opening");
    const seed = 1107;
    let at: { x: number; y: number } | undefined;
    for (let y = 0; y < 20 && !at; y++) for (let x = 0; x < 20 && !at; x++)
      if ([[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0]].every(([dx, dy]) => dungeonMaterial("delve", x + dx, y + dy, seed) === "stone")) at = { x, y };
    assert.ok(at);
    const floor = { mode: "delve" as const, height: 0, seed, ...at, wall: false, empty: true };
    frames.length = 0;
    drawDungeonGround(c, floor, ["earth", "earth", "earth", "earth"]);
    assert.deepEqual(frames.slice(1), [32, 33, 34, 35], "diagonal earth joins receive their matching soil PNGs");
    frames.length = 0;
    drawDungeonGround(c, { ...floor, neighbors: { northWall: true, eastWall: true, southWall: true, westWall: true } }, ["earth", "earth", "earth", "earth"]);
    assert.ok(frames.every(frame => frame < 32), "soil corners cannot cross a wall");
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original); else Reflect.deleteProperty(globalThis, "Image");
  }
});

test("water refreshes reflected hero and wall art immediately on a sprite-style change", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const context = () => new Proxy({}, { set: () => true, get: (_, name) => name === "createImageData"
    ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {} }) as CanvasRenderingContext2D;
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: context }) } });
  try {
    let hero = 0, walls = 0;
    const pool = { water: new Uint8Array(576).fill(1), waterCount: 576, crates: [] } as unknown as TileDecor;
    const scene: ReflectionScene = { key: "same-board", pools: [[0, -1, pool]], now: 1000, reduceMotion: true,
      waves: () => [], tileAt: () => ({ kind: "wall" }), plan: (x, y) => x === 0 && y === -1 ? pool : null,
      isBroken: () => false, drawCrates() {}, sprites: { style: "legacy", tile: () => { walls++; }, torches: [],
        hero: { x: 0, y: 0, paint: () => { hero++; } } } };
    const reflections = new WaterReflections(), c = context();
    reflections.draw(c, scene); const firstWalls = walls;
    assert.equal(hero, 1); assert.ok(firstWalls > 0);
    scene.now++; reflections.draw(c, scene);
    assert.equal(hero, 1); assert.equal(walls, firstWalls, "unchanged art reuses its snapshot");
    scene.sprites!.style = "kit:1"; scene.now++; reflections.draw(c, scene);
    assert.equal(hero, 2); assert.ok(walls > firstWalls, "refresh before the four-second image cache expires");
    scene.sprites!.style = "legacy"; scene.now++; reflections.draw(c, scene);
    assert.equal(hero, 3, "switching off restores the original reflected hero immediately");
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original); else Reflect.deleteProperty(globalThis, "document");
  }
});
