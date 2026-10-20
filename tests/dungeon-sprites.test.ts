import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS, DUNGEON_BLEND_ATLAS, DUNGEON_INFILL_ATLAS, DUNGEON_CORNER_FRAME, drawDungeonGround, dungeonAtlasId, dungeonDiagonals, dungeonFloorFrame, dungeonMaterial, dungeonMaterialJoins, dungeonWallVariant } from "../src/sprite-dungeon.ts";
import { dungeonWallBands, dungeonWallDepth, dungeonWallProfile } from "../src/wall-depth.ts";
import { paintTile, type BoardLook } from "../src/tile-painters.ts";
import { WaterReflections, type ReflectionScene } from "../src/decor-reflections.ts";
import type { TileDecor } from "../src/decor.ts";

test("interior PNGs contain native 24-pixel floors, all sixteen wall joins and shared transition masks", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
  assert.equal(DUNGEON_ATLASES.length, 21);
  for (const id of [...DUNGEON_ATLASES, DUNGEON_EDGE_ATLAS, DUNGEON_BLEND_ATLAS, DUNGEON_INFILL_ATLAS]) {
    const bytes = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    const height = id === DUNGEON_EDGE_ATLAS ? 216 : id === DUNGEON_BLEND_ATLAS ? 480 : id === DUNGEON_INFILL_ATLAS ? 96 : 720;
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [96, height], id);
    assert.equal(manifest.assets[id].tile, true);
  }
});

test("wall depth follows real air across materials, including diagonals, while missing cells remain solid", () => {
  for (const kind of ["floor", "door", "stairs", "enemy"] as const) {
    const world = { tile: (x: number, y: number) => ({ kind: x === 0 && y === 0 ? kind : "wall" as const }) };
    assert.equal(dungeonWallDepth(world, 1, 0), 0);
    assert.equal(dungeonWallDepth(world, 1, 1), 0, "diagonal air exposes an inner corner");
    assert.equal(dungeonWallDepth(world, 2, 0), 1);
    assert.equal(dungeonWallDepth(world, 2, 2), 1);
    assert.equal(dungeonWallDepth(world, 3, 0), 2);
    assert.equal(dungeonWallDepth(world, 3, 3), 2);
  }
  assert.equal(dungeonWallDepth({ tile: () => undefined }, 0, 0), 2, "world bounds do not create a false bright edge");
  const world = { tile: (x: number, y: number) => ({ kind: x === 0 && y === 0 ? "floor" as const : "wall" as const }) };
  assert.deepEqual(dungeonWallProfile(world, 0, 2), { depth: 1, openings: 1 << 2 }, "shade attaches toward the actual opening to the south");
  assert.deepEqual(dungeonWallProfile(world, 2, 0), { depth: 1, openings: 1 << 10 });
  assert.deepEqual(dungeonWallProfile(world, 2, 2), { depth: 1, openings: 1 }, "diagonal air retains its precise corner position");
  assert.deepEqual(dungeonWallProfile(world, -2, -2), { depth: 1, openings: 1 << 24 });
  assert.deepEqual(dungeonWallProfile(world, 0, 1), { depth: 0, openings: 1 << 7 });
});

test("wall contours cross seams continuously without repeating holes or illuminating entire diagonal edges", () => {
  const straight = { tile: (_x: number, y: number) => ({ kind: y < 0 ? "floor" as const : "wall" as const }) };
  for (const seed of [1, 1107, 8903]) for (let x = -8; x < 8; x++) {
    const bands = (x: number, y: number) => dungeonWallBands(dungeonWallProfile(straight, x, y), x, y, seed);
    for (const y of [0, 1]) {
      const current = bands(x, y), next = bands(x + 1, y);
      for (let row = 0; row < 12; row++)
        assert.ok(Math.abs(current[row * 12 + 11] - next[row * 12]) <= 1, "adjacent native clusters cannot jump across shade levels at a tile seam");
      for (let col = 0; col < 12; col++) for (let row = 1; row < 12; row++)
        assert.ok(current[row * 12 + col] <= current[(row - 1) * 12 + col], "no isolated dark holes inside a connected band");
    }
    assert.ok([...bands(x, 0)].every(b => b < 2), "the exposed tile keeps a broad, solid material body");
    assert.ok([...bands(x, 2)].every(b => b === 3), "farther solids are uniformly black");
    assert.deepEqual(bands(x, 1), bands(x, 1), "contours are stable on redraw");
  }
  const corner = { tile: (x: number, y: number) => ({ kind: !x && !y ? "floor" as const : "wall" as const }) };
  const bands = dungeonWallBands(dungeonWallProfile(corner, 2, 2), 2, 2, 1107);
  assert.equal(bands[11 * 12], 2, "the nearby southwest corner receives the dark transition");
  assert.equal(bands[11], 3, "the unrelated northeast corner stays black");
  assert.ok([...bands].filter(b => b !== 3).length < 36, "one diagonal opening cannot light two whole tile edges");
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
  class ReadyImage { src = ""; complete = true; naturalWidth = 96; naturalHeight = 720; }
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
  class ReadyImage { src = ""; complete = true; naturalWidth = 96; naturalHeight = 720; }
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
    assert.deepEqual(dungeonMaterialJoins(floor, ["earth", "earth", "earth", "earth"]), { sides: 0, corners: 15 });
    assert.deepEqual(dungeonMaterialJoins({ ...floor, neighbors: { northWall: true, eastWall: true, southWall: true, westWall: true } }, ["earth", "earth", "earth", "earth"]), { sides: 0, corners: 0 }, "soil corners cannot cross a wall");
    frames.length = 0; drawDungeonGround(c, tile, [], { depth: 2, openings: 0 });
    assert.deepEqual(frames, [12], "deep solids use only the shared black core");
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
