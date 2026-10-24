import "./portable-math.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import { random } from "../src/random.ts";
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "../src/render/lighting.ts";
import { computeVisibilityPolygon } from "../src/torches.ts";
import { ATMOSPHERE_CONFIG, LightingPass } from "../src/render/lighting-pass.ts";
import { EntityLighting } from "../src/render/entity-lighting.ts";
import { DungeonLight, type Foreground, type LitBoard } from "../src/render/dungeon-light.ts";
import { forEachViewTile, toTileSpace, type BoardTiles, type FrameContext, type Rect } from "../src/render/render-frame.ts";
import { isArea1, paintContents, paintHeroFallback, type BoardLook } from "../src/render/tile-painters.ts";
import type { Mode } from "../src/entities.ts";
import type { Torch } from "../src/entities.ts";

// Characterization hashes of the dungeon lighting: seeded frames drawn by
// DungeonLight (relief, cast shadows, darkness, glows, darkened sprites,
// sprite light, lightmap and haze, the hero and what stands in front of it,
// vignette) over Tower rooms and Delve areas on a fake DOM whose canvases
// record every call (and read back pixels derived from what was drawn on
// them), the darkening pass clipped to odd regions, visibility polygons,
// flicker and sway.
// Regenerate (only when a lighting change is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/lighting-passes.golden.json", import.meta.url);

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

let hash: Hash = createHash("sha256");
let canvasIds = 0;
/** The first canvas id of the current scene (see FakeCanvas.name). */
let sceneFirstId = 0;
/** Starts a scene: resets the hash and numbers new canvases from zero. */
function startScene() {
  hash = createHash("sha256");
  sceneFirstId = canvasIds;
}
/** When set, new canvases hand out no 2D context. */
let noContexts = false;

type Img = { data: Uint8ClampedArray; width: number; height: number };

/** A canvas whose context logs every call and property write to `hash`,
 * and whose pixels are made up from what has been drawn on it since it was
 * last sized or written directly. */
class FakeCanvas {
  readonly id = canvasIds++;
  private w = 300;
  private h = 150;
  private log = "";
  private pixels: Uint8ClampedArray | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  get width() { return this.w; }
  set width(v: number) { this.w = v; this.reset(); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; this.reset(); }
  /** Canvases made in this scene are numbered in order from zero. One left
   * over from an earlier scene (a module-level cache) is named by its size,
   * so which scene made it, and in what order, doesn't shift later scenes. */
  get name() { return this.id >= sceneFirstId ? `${this.id - sceneFirstId}` : `old${this.w}x${this.h}`; }
  toString() { return `cv${this.name}`; }
  private reset() {
    this.log = `${this.w}x${this.h}`;
    this.pixels = null;
    this.note(`size ${this.w}x${this.h}`);
  }
  note(line: string) {
    hash.update(`${this.name}:${line}\n`);
    this.log = createHash("sha256").update(this.log + line).digest("hex");
    this.pixels = null;
  }
  read(): Uint8ClampedArray {
    if (this.pixels) return this.pixels;
    const px = new Uint8ClampedArray(this.w * this.h * 4);
    let s = parseInt(this.log.slice(0, 8), 16) || 1;
    for (let i = 0; i < px.length; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      px[i] = s & 255;
    }
    return (this.pixels = px);
  }
  write(img: Img) {
    this.note(`put ${digest(Array.from(img.data))}`);
    this.pixels = new Uint8ClampedArray(this.w * this.h * 4);
    this.pixels.set(img.data.subarray(0, this.pixels.length));
  }
  getContext() {
    if (noContexts) return null;
    return (this.ctx ??= context(this));
  }
}

function context(cv: FakeCanvas): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { canvas: cv };
  let gradients = 0;
  const special: Record<string, (...a: never[]) => unknown> = {
    createRadialGradient: (...a: number[]) => {
      const name = `g${cv.name}.${gradients++}`;
      cv.note(`${name}=radial(${a.join(",")})`);
      return { addColorStop: (o: number, c: string) => cv.note(`${name}.stop(${o},${c})`), toString: () => name };
    },
    createImageData: (w: number, h: number): Img => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (x: number, y: number, w: number, h: number): Img => {
      const src = cv.read(), data = new Uint8ClampedArray(w * h * 4);
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++)
          for (let k = 0; k < 4; k++) data[(r * w + c) * 4 + k] = src[((y + r) * cv.width + x + c) * 4 + k] ?? 0;
      return { data, width: w, height: h };
    },
    putImageData: (img: Img) => cv.write(img),
  };
  return new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key in special) return special[key];
      return (...args: unknown[]) => void cv.note(`${key}(${args.join(",")})`);
    },
    set: (_, key: string, value) => {
      state[key] = value;
      cv.note(`${key}=${value}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeImage {
  complete = true;
  naturalWidth = 24;
  naturalHeight = 24;
  src = "";
  toString() { return `img:${this.src.split("/").pop()}`; }
}

const g = globalThis as Record<string, unknown>;
const fakeDocument = { createElement: () => new FakeCanvas(), hidden: false };
g.document = fakeDocument;
g.Image = FakeImage;

type Scene = { world: BoardTiles; look: BoardLook; torches: () => Torch[]; center: { x: number; y: number } };

/** How a dungeon board at `height` looks, sprites on and motion full. */
const lookOf = (mode: Mode, height: number, seed: number): BoardLook => ({
  mode, height, seed, outside: false, entranceX: 15, spritesOff: false, reduceMotion: false, area1: isArea1(mode, height),
});

function towerScene(seed: number, room: number): Scene {
  const world = new RoomWorld(seed, room, {});
  return { world, look: lookOf("tower", room, seed), torches: () => world.torches ?? [], center: { x: 8, y: 8 } };
}

function delveScene(seed: number, y: number): Scene {
  const world = new World({ seed, changes: {}, floor: 0, milestone: 0 });
  return { world, look: lookOf("delve", y, seed), torches: () => world.torches, center: { x: 15, y } };
}

/** A board whose contents are the tiles' sprites and whose hero is the
 * fallback figure; the rest of what a board draws between the light's
 * steps is left out, as it doesn't touch the light. */
function board(f: FrameContext, foreground: Foreground | null): LitBoard {
  const none = () => {};
  return {
    floor: none, glow: none, torches: none, route: none, edge: none,
    contents: (ctx) =>
      forEachViewTile(f, (x, y) => {
        const t = f.world.tile(x, y);
        if (t.kind === "wall" || t.kind === "floor") return;
        ctx.save();
        toTileSpace(ctx, f, x, y);
        paintContents(ctx, t, { x, y, time: f.now, spritesOff: f.look.spritesOff, reduceMotion: f.look.reduceMotion, area1: f.look.area1 });
        ctx.restore();
      }),
    hero: paintHeroFallback,
    foreground: () => foreground,
  };
}

/** One frame of dungeon light; returns its glows. */
function drawFrame(f: FrameContext, light: DungeonLight, b: LitBoard) {
  f.glows = light.glows(f);
  light.draw(f, b);
  return digest(f.glows);
}

/** Things in front of the hero, in world pixels: none, over its feet, a
 * wide swathe, and a box off the board. */
const FOREGROUNDS = (f: Pick<FrameContext, "playerX" | "playerY">): (Foreground | null)[] => {
  const x = f.playerX * 24, y = -f.playerY * 24, draw = paintHeroFallback;
  return [
    null,
    { bounds: { x0: x - 4, y0: y, x1: x + 28, y1: y + 25 }, draw },
    { bounds: { x0: x - 120, y0: y - 60, x1: x + 150, y1: y + 40 }, draw },
    { bounds: { x0: x - 2000, y0: y - 2000, x1: x - 1900, y1: y - 1950 }, draw },
  ];
};

const REGIONS = (w: number): (Rect | Rect[] | undefined)[] => [
  undefined,
  { x: w * 0.2, y: w * 0.1, w: w * 0.5, h: w * 0.6 },
  [{ x: 10, y: 10, w: 60, h: 40 }, { x: 50, y: 30, w: 80, h: 90 }, { x: w - 20, y: w - 20, w: 60, h: 60 }],
  { x: -40, y: -40, w: 30, h: 30 },
  [],
  { x: -10.5, y: 3.25, w: w + 30, h: 17.75 },
  // Wide but above the board: no height left once cut to the canvas.
  { x: 10, y: -60, w: 80, h: 30 },
  // Two boxes, the first to the right of the second.
  [{ x: w * 0.6, y: 40, w: 50, h: 50 }, { x: 20, y: 60, w: 40, h: 40 }],
  // One box above the board beside one on it.
  [{ x: 30, y: -80, w: 60, h: 20 }, { x: 40, y: 50, w: 70, h: 30 }],
];

function sceneRun(scene: Scene, seed: number) {
  startScene();
  const rnd = random(seed);
  const light = new DungeonLight();
  const frames: unknown[] = [];
  for (let i = 0; i < 24; i++) {
    const width = [408, 340, 255][Math.floor(rnd() * 3)], dpr = [1, 1.5, 2][Math.floor(rnd() * 3)];
    const n = 17, s = width / n;
    const playerX = scene.center.x + Math.floor(rnd() * 7) - 3 + (rnd() < 0.3 ? rnd() : 0);
    const playerY = scene.center.y + Math.floor(rnd() * 7) - 3 + (rnd() < 0.3 ? rnd() : 0);
    const left = playerX - 8 + (rnd() < 0.4 ? rnd() - 0.5 : 0), bottom = playerY - 8 + (rnd() < 0.4 ? rnd() - 0.5 : 0);
    const main = new FakeCanvas();
    main.width = main.height = Math.round(width * dpr);
    const c = main.getContext()!;
    const now = 1000 + i * 413 + Math.floor(rnd() * 2000);
    const darkness = [0, 0, 0.25, 0.6, 1][Math.floor(rnd() * 5)];
    if (i === 8) light.atmosphere = { ...ATMOSPHERE_CONFIG, ambientStrength: 0, torchHazeStrength: 0, vignetteStrength: 0 };
    if (i === 16) light.atmosphere = { ...ATMOSPHERE_CONFIG, vignetteSoftness: 1.4, torchHazeRadius: 0 };
    const walls: [number, number][] = [];
    forEachViewTile({ n, left, bottom }, (x, y) => { if (scene.world.tile(x, y)?.kind === "wall") walls.push([x, y]); });
    const torches = scene.torches().filter((t) => t.active && Math.abs(t.x - left - n / 2) < n / 2 + 8 && Math.abs(t.y - bottom - n / 2) < n / 2 + 8);
    const reduceMotion = rnd() < 0.2, spritesOff = rnd() < 0.25;
    const f: FrameContext = {
      c, now, dt: 0.016, dpr, width, n, s, left, bottom, playerX, playerY, world: scene.world,
      look: { ...scene.look, reduceMotion, spritesOff, area1: scene.look.area1 && !spritesOff }, darkness, torches, walls, glows: [],
    };
    const foregrounds = FOREGROUNDS(f);
    const out = drawFrame(f, light, board(f, foregrounds[Math.floor(rnd() * foregrounds.length)]));
    frames.push([i, torches.length, out, hash.copy().digest("hex").slice(0, 12)]);
  }
  return { frames: digest(frames), canvas: hash.digest("hex").slice(0, 12) };
}

/** Frames where canvases have no context, and where there is no DOM. */
function degraded() {
  startScene();
  const scene = delveScene(3, 10);
  const out: unknown[] = [];
  const main = new FakeCanvas();
  main.width = main.height = 408;
  const c = main.getContext()!;
  const frame = (darkness: number): FrameContext => ({
    c, now: 5000, dt: 0.016, dpr: 1, width: 408, n: 17, s: 24, left: 7, bottom: 2, playerX: 15, playerY: 10,
    world: scene.world, look: scene.look, darkness,
    torches: scene.torches(), walls: [[0, 0], [1, 0]], glows: [],
  });
  noContexts = true;
  for (const darkness of [0, 0.7]) {
    const f = frame(darkness);
    // Sprites need canvases of their own, so this board has none.
    const bare = { ...board(f, FOREGROUNDS(f)[1]), contents: () => {}, hero: () => {} };
    out.push(drawFrame(f, new DungeonLight(), bare), new LightingPass().wallMask(f));
  }
  noContexts = false;
  // Silhouettes baked in one frame, then a frame whose shadow layer has no
  // context, and a darkening pass whose own layers have none.
  const warm = new EntityLighting(), lit = frame(0.7);
  warm.drawShadows(lit, () => null);
  warm.drawSpriteLighting(lit, c);
  const later = { ...lit, now: lit.now + 100 };
  noContexts = true;
  warm.drawShadows(later, () => null);
  out.push(!!warm.shadows);
  new LightingPass().drawDarkened(later, main as unknown as HTMLCanvasElement, {
    amount: 0.5, draw: paintHeroFallback, region: { x: 5, y: 5, w: 90, h: 90 },
  });
  noContexts = false;
  warm.drawSpriteLighting(later, c);
  warm.drawSpriteLighting(later, c, true);
  delete g.document;
  for (const darkness of [0, 0.7]) {
    const lighting = new LightingPass(), entities = new EntityLighting();
    const f = frame(darkness);
    lighting.startFrame();
    entities.drawShadows(f, () => null);
    out.push(entities.shadows, lighting.buildDarkness(f, null), lighting.drawLightmap(f, null));
  }
  g.document = fakeDocument;
  return { out: digest(out), canvas: hash.digest("hex").slice(0, 12) };
}

/** The darkening pass on its own (an internal step of DungeonLight), with
 * sprites clipped to odd regions: none, one box, overlapping boxes, boxes
 * off or partly off the board, and empty lists. */
function darkenedRegions() {
  startScene();
  const scene = delveScene(7, 30);
  for (const [width, dpr] of [[408, 1], [340, 1.5], [255, 2]]) {
    const main = new FakeCanvas();
    main.width = main.height = Math.round(width * dpr);
    const n = 17, f: FrameContext = {
      c: main.getContext()!, now: 3000, dt: 0.016, dpr, width, n, s: width / n, left: 7, bottom: 22, playerX: 15, playerY: 30,
      world: scene.world, look: scene.look, darkness: 0.6,
      torches: scene.torches(), walls: [], glows: [],
    };
    const pass = new LightingPass();
    pass.startFrame();
    const dark = pass.buildDarkness(f, null)!;
    for (const region of REGIONS(width))
      pass.drawDarkened(f, dark.spriteDark, { amount: 0.4, draw: board(f, null).contents, region });
  }
  return hash.digest("hex").slice(0, 12);
}

function polygons(seed: number) {
  const rnd = random(seed * 11 + 5);
  const W = 22, H = 18, walls = new Set<string>();
  const density = 0.08 + rnd() * 0.35;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rnd() < density) walls.add(`${x},${y}`);
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || walls.has(`${x},${y}`);
  const out: unknown[] = [];
  for (let i = 0; i < 12; i++) {
    const torch = { x: 1 + Math.floor(rnd() * (W - 2)), y: 1 + Math.floor(rnd() * (H - 2)), lightRadius: 1 + rnd() * 7 };
    const poly = computeVisibilityPolygon(torch, isWall);
    out.push(poly.length, poly.map((p) => [Math.round(p.x * 1e6), Math.round(p.y * 1e6)]));
  }
  out.push(computeVisibilityPolygon({ x: 5, y: 5, lightRadius: 4 }, () => false).length);
  return digest(out);
}

function flicker() {
  const out: unknown[] = [];
  for (const t of [{ x: 0, y: 0 }, { x: 3, y: 9 }, { x: 17, y: 2 }, { x: -4, y: 250 }])
    for (const now of [0, 17, 1234.5, 99999])
      for (const reduce of [false, true]) out.push(getTorchFlicker(t, now, reduce), getTorchSway(t, now, reduce));
  return digest(out);
}

test("dungeon lighting passes and visibility polygons match the golden", () => {
  const actual: Record<string, unknown> = {};
  for (const [seed, room] of [[1, 0], [7, 3], [42, 8], [5, 14], [99, 27]]) actual[`tower ${seed}/${room}`] = sceneRun(towerScene(seed, room), seed * 100 + room);
  for (const [seed, y] of [[1, 12], [7, 30], [42, 55], [500, 20]]) actual[`delve ${seed}/${y}`] = sceneRun(delveScene(seed, y), seed * 100 + y);
  actual.degraded = degraded();
  actual["darkened regions"] = darkenedRegions();
  for (const seed of [1, 2, 3, 4, 5, 6]) actual[`polygons ${seed}`] = polygons(seed);
  actual.flicker = flicker();

  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + "\n");
  assert.ok(existsSync(GOLDEN), "golden missing; run with UPDATE_GOLDEN=1");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const key of Object.keys(golden)) assert.deepEqual(actual[key], golden[key], `${key} diverges`);
  assert.deepEqual(Object.keys(actual), Object.keys(golden));
});
