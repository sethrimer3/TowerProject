import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import type { Board } from "../src/board.ts";
import { area1ItemId, floorVariant, wallAdjacencyMask } from "../src/area1-tileset.ts";
import { TreeParticles } from "../src/tree-particles.ts";
import { withStream } from "../src/random.ts";
import { DecorLayer, type DecorFrame, type MirroredSprites } from "../src/decor-render.ts";
import type { BoardView } from "../src/render-frame.ts";
import { decorSourceFor, tileDecor, type TileDecor } from "../src/decor.ts";
import { TREES, type SkillNode } from "../src/skill-trees.ts";
import type { KeyColor, Tile } from "../src/entities.ts";

// Characterization hashes of three small art modules: the area-one sprite
// lookups and draws (with images loaded, loading and broken), the skill-tree
// particle fluid over seeded frames (resizes, tree switches, purchases,
// selections, reduced motion), and the decor layer walked through seeded
// Tower rooms and Delve areas, drawing its ground, glow and foreground passes
// on a fake DOM whose canvases record every call. Regenerate (only when a
// change to this art is intended) with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/art-modules.golden.json", import.meta.url);

let hash: Hash = createHash("sha256");
let canvasIds = 0;
const note = (line: string) => void hash.update(line + "\n");

/** A 2D context that logs every call and property write to `hash`. */
function recorder(name: string, extra: Record<string, unknown> = {}): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { ...extra };
  return new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key === "toString") return () => name;
      if (key === "createImageData" || key === "getImageData")
        return (...a: number[]) => {
          const [w, h] = key === "createImageData" ? a : a.slice(2);
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i++) data[i] = (i * 37 + w * 11 + h) & 255;
          return { data, width: w, height: h };
        };
      // A gradient notes its colour stops, and names itself where it's used.
      if (key === "createLinearGradient" || key === "createRadialGradient")
        return (...a: number[]) => {
          const label = `${name}.${key}(${a.join(",")})`;
          note(label);
          return { addColorStop: (at: number, colour: string) => note(`${label}.stop(${at},${colour})`), toString: () => label };
        };
      return (...args: unknown[]) => note(`${name}.${key}(${args.map((a) => (a instanceof Object && "data" in a ? "img" : a)).join(",")})`);
    },
    set: (_, key: string, value) => {
      state[key] = value;
      note(`${name}.${key}=${value}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeCanvas {
  readonly name = `cv${canvasIds++}`;
  private w = 300;
  private h = 150;
  private ctx: CanvasRenderingContext2D | null = null;
  get width() { return this.w; }
  set width(v: number) { this.w = v; note(`${this.name}.width=${v}`); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; note(`${this.name}.height=${v}`); }
  toString() { return this.name; }
  getContext() { return (this.ctx ??= recorder(`${this.name}ctx`, { canvas: this })); }
}

/** How the next images come out: loaded, still loading, or broken. */
let imageState: "loaded" | "loading" | "broken" = "loaded";
class FakeImage {
  complete = imageState !== "loading";
  naturalWidth = imageState === "loaded" ? 24 : 0;
  src = "";
  toString() { return `img:${this.src.split("/").pop()}`; }
}

const g = globalThis as Record<string, unknown>;
g.document = { createElement: () => new FakeCanvas(), hidden: false };
g.Image = FakeImage;

const digest = () => {
  const out = hash.digest("hex").slice(0, 16);
  hash = createHash("sha256");
  return out;
};

// ------------------------------------------------------------------ area one

const KINDS: Tile["kind"][] = ["wall", "floor", "enemy", "key", "door", "potion", "attack", "defense", "reward", "treasure", "openedChest", "stairs", "stairsDown", "oneway"];
const COLORS: (KeyColor | undefined)[] = [undefined, "yellow", "blue", "red"];
const TIERS: Tile["tier"][] = [undefined, "silver", "gold"];

function tiles(): Tile[] {
  const out: Tile[] = [];
  for (const kind of KINDS) for (const color of COLORS) for (const tier of TIERS) out.push({ kind, color, tier });
  const keys: KeyColor[][] = [["yellow"], ["blue"], ["red"], ["yellow", "blue"], ["red", "yellow"], ["blue", "red"], ["red", "blue", "yellow"], []];
  for (const k of keys) for (const mode of ["all", "any"] as const) out.push({ kind: "door", door: { type: "keys", keys: k, mode } });
  out.push({ kind: "door", door: { type: "fullHp" } });
  return out;
}

function area1(): Record<string, string> {
  const out: Record<string, string> = {};
  out.ids = createHash("sha256").update(JSON.stringify(tiles().map(area1ItemId))).digest("hex").slice(0, 16);
  const masks = [];
  for (let m = 0; m < 16; m++) masks.push(wallAdjacencyMask({ northWall: !!(m & 1), eastWall: !!(m & 2), southWall: !!(m & 4), westWall: !!(m & 8) }));
  const variants = [];
  for (const seed of [0, 7, 99, 123456]) for (let y = -3; y < 20; y++) for (let x = -3; x < 20; x++) variants.push(floorVariant(x, y, seed));
  out.variants = createHash("sha256").update(JSON.stringify([masks, variants])).digest("hex").slice(0, 16);
  return out;
}

async function area1Draws(state: "loaded" | "loading" | "broken") {
  imageState = state;
  // Each state gets its own module copy, since the image cache keeps the first.
  const mod = (await import(`../src/area1-tileset.ts?${state}`)) as typeof import("../src/area1-tileset.ts");
  const c = recorder("tile");
  for (const t of tiles()) {
    note(`door ${JSON.stringify(t)} ${mod.drawArea1Door(c, t)}`);
    note(`item ${JSON.stringify(t)} ${mod.drawArea1Item(c, t)}`);
  }
  for (const seed of [3, 99]) for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) note(`floor ${String(mod.area1FloorSprite(x, y, seed))}`);
  return digest();
}

// ------------------------------------------------------------ tree particles

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

type TreeCanvas = { clientWidth: number; clientHeight: number; width: number; height: number; getContext: () => CanvasRenderingContext2D | null };

/** The particles draw from the effects stream. */
function treeRun(seed: number): string {
  return withStream("effects", seeded(seed), () => treeRunDrawn(seed));
}
function treeRunDrawn(seed: number): string {
  {
    const fluid = new TreeParticles();
    const ctx = recorder("tree");
    const canvas: TreeCanvas = { clientWidth: 400, clientHeight: 600, width: 0, height: 0, getContext: () => ctx };
    const el = canvas as unknown as HTMLCanvasElement;
    const trees = TREES.map((t) => [t.id, t.nodes] as [string, SkillNode[]]);
    let time = 100, [tree, nodes] = trees[seed % trees.length];
    const gaps = [16, 16, 17, 40, 8, 16, 200, 16, 33, 5, 16, 70, 16];
    for (let frame = 0; frame < 70; frame++) {
      g.devicePixelRatio = [1, 1.5, 3, 0][(frame >> 4) % 4];
      if (frame === 20) { canvas.clientWidth = 520; canvas.clientHeight = 380; }
      if (frame === 35) [tree, nodes] = trees[(seed + 1) % trees.length];
      if (frame % 9 === 4) fluid.purchase(nodes[(frame + seed) % nodes.length]);
      if (frame === 50) canvas.clientWidth = 0;
      if (frame === 52) canvas.clientWidth = 300;
      if (frame === 55) canvas.getContext = () => null;
      if (frame === 57) canvas.getContext = () => ctx;
      const selected = frame % 11 < 4 ? nodes[frame % nodes.length].id : frame === 30 ? "missing" : null;
      const reduced = frame >= 60 && frame < 64;
      time += gaps[frame % gaps.length];
      note(`frame ${frame} ${time} ${canvas.width}x${canvas.height}`);
      fluid.draw(el, time, { tree, nodes, selected, reduced });
    }
    const f = fluid as unknown as { u: Float32Array; v: Float32Array; particles: unknown[]; pulses: unknown[] };
    note(JSON.stringify([Array.from(f.u), Array.from(f.v), f.particles, f.pulses]));
    return digest();
  }
}

/** A steady 40 ms frame (exactly the 30 Hz step), long-lived purchase
 * pulses, a mote right at a pulse's centre, two unlocks' rays (one still
 * shining as the next comes), and a frame with no height. */
function treeSteady(): string {
  return withStream("effects", seeded(9), treeSteadyDrawn);
}
function treeSteadyDrawn(): string {
  {
    g.devicePixelRatio = 1;
    const fluid = new TreeParticles(), ctx = recorder("steady");
    const canvas: TreeCanvas = { clientWidth: 360, clientHeight: 480, width: 0, height: 0, getContext: () => ctx };
    const el = canvas as unknown as HTMLCanvasElement, nodes = TREES[0].nodes, pulse = nodes[1];
    let time = 500;
    for (let frame = 0; frame < 60; frame++) {
      if (frame === 1) {
        fluid.purchase(pulse);
        (fluid as unknown as { particles: unknown[] }).particles.push({ x: pulse.x / 100 + 0.5 / 360, y: pulse.y / 100, radius: 1, alpha: 0.5 });
      }
      if (frame === 3) fluid.purchase(nodes[0]);
      if (frame === 5 || frame === 20) fluid.unlock(nodes[frame === 5 ? 2 : 0]);
      canvas.clientHeight = frame === 50 ? 0 : 480;
      time += 40;
      note(`steady ${frame}`);
      fluid.draw(el, time, { tree: "steady", nodes, selected: null, reduced: false });
    }
    const f = fluid as unknown as { u: Float32Array; particles: unknown[]; pulses: unknown[]; rays: unknown[] };
    note(JSON.stringify([Array.from(f.u), f.particles, f.pulses, f.rays]));
    return digest();
  }
}

function fluidSteps(): string {
  const nodes: SkillNode[] = [
    { id: "a", x: 20, y: 30, requires: [], icon: "" },
    { id: "b", x: 70, y: 40, requires: ["a"], icon: "" },
    { id: "c", x: 50, y: 80, requires: ["a", "b", "gone"], icon: "" },
    { id: "d", x: 50, y: 80, requires: ["c"], icon: "" },
  ];
  type Forcing = { w: number; h: number; nodes: SkillNode[]; selected: string | null };
  const fluid = new TreeParticles() as unknown as { step: (dt: number, f: Forcing) => void; u: Float32Array; v: Float32Array; pressure: Float32Array };
  for (let i = 0; i < 25; i++) {
    fluid.step([1 / 30, 1 / 15, 0.02][i % 3], { w: i < 12 ? 400 : 700, h: i < 12 ? 600 : 300, nodes, selected: ["a", null, "c", "d"][i % 4] });
    note(JSON.stringify([Array.from(fluid.u), Array.from(fluid.v), Array.from(fluid.pressure)]));
  }
  return digest();
}

// --------------------------------------------------------------------- decor

/** A board to walk, and which tiles to walk to (by default, the ones in
 * view with crates, pools, tall grass, drips or blooms). */
type DecorScene = { name: string; world: Board; seed: number; view: BoardView; start: [number, number]; want?: (d: TileDecor) => boolean };

function towerDecor(seed: number, room: number): DecorScene {
  return { name: `tower ${seed}/${room}`, world: new RoomWorld(seed, room, {}), seed, view: { left: 0, bottom: 0, n: 17, s: 24 }, start: [8, 8] };
}

function delveDecor(seed: number, y: number): DecorScene {
  return { name: `delve ${seed}/${y}`, world: new World({ seed, changes: {}, floor: 0, milestone: 0 }), seed, view: { left: 6.4, bottom: y - 8.3, n: 17, s: 20 }, start: [15, y] };
}

const lively = (d: TileDecor) => !!(d.crates.length || d.water || d.thicket || d.drip || d.flowers.length);
const glowcaps = (d: TileDecor) => d.plants.some((p) => p.kind === "mushrooms" && p.glow);

/** A few of the tiles in view worth walking to. */
function stops(s: DecorScene): [number, number][] {
  const src = decorSourceFor(s.world, s.seed);
  if (!src) return [];
  const out: [number, number][] = [];
  const { left, bottom, n } = s.view;
  for (let y = Math.floor(bottom); y < bottom + n; y++)
    for (let x = Math.floor(left); x < left + n; x++) {
      if (y < 0) continue;
      const d = tileDecor(src, x, y);
      if ((s.want ?? lively)(d)) out.push([x, y]);
    }
  return out.filter((_, i) => i % Math.max(1, Math.floor(out.length / 7)) === 0).slice(0, 8);
}

/** The board's sprites for the water: tiles, two torches (one beside the
 * stop `at`, one off to the side, on flame frame `n`) and the hero at
 * (hx, hy), each a marked box. */
function mirrored(hx: number, hy: number, at: [number, number], n: number): MirroredSprites {
  const [tx, ty] = at;
  return {
    tile: (ctx, t, x, y, layer) => {
      note(`mirror ${t.kind} ${x},${y} ${layer}`);
      ctx.fillRect(2, 2, 20, 21);
    },
    torches: [[tx + 1, ty + 1, n], [tx - 4, ty, 0]].map(([x, y, k]) => ({
      x, y, frame: k, paint: (ctx: CanvasRenderingContext2D) => ctx.fillRect(9 + k, 3, 6, 18),
    })),
    hero: { x: hx, y: hy, paint: (ctx) => ctx.fillRect(5, 1, 14, 22) },
  };
}

/** A tile in view holding water, if any. */
function poolTile(s: DecorScene): [number, number] | null {
  const src = decorSourceFor(s.world, s.seed);
  if (!src) return null;
  const { left, bottom, n } = s.view;
  for (let y = Math.max(0, Math.floor(bottom)); y < bottom + n; y++)
    for (let x = Math.floor(left); x < left + n; x++) if (tileDecor(src, x, y).waterCount) return [x, y];
  return null;
}

function decorRun(s: DecorScene): string {
  canvasIds = 0;
  const layer = new DecorLayer();
  layer.planBudget = 90;
  layer.sync(s.world, s.seed);
  layer.sync(s.world, s.seed);
  const tileAt = (x: number, y: number) => s.world.tile(x, y);
  const c = recorder("main");
  const bake = recorder("bake");
  let now = 1000, [hx, hy] = s.start, frame = 0;
  const route = [...stops(s), s.start];
  note(`${s.name} key ${layer.key} stops ${JSON.stringify(route)}`);
  for (const [tx, ty] of route) {
    const [fx, fy] = [hx, hy];
    for (let k = 1; k <= 5; k++, frame++) {
      hx = fx + ((tx - fx) * k) / 5;
      hy = fy + ((ty - fy) * k) / 5;
      now += frame % 6 === 5 ? 45 : 16;
      const calm = frame % 7 === 3;
      const v = { ...s.view, left: s.view.left + (frame % 4) * 0.25, bottom: s.view.bottom + (frame % 9 === 8 ? 1.5 : 0) };
      const f: DecorFrame = { view: v, now, tileAt, reduceMotion: calm };
      layer.update({ dt: 0.016, now, hx, hy, tileAt, reduceMotion: calm });
      note(`f${frame} busy ${layer.busy} broken ${[...layer.broken].join(";")} parts ${layer.particles.length} rip ${layer.ripples.length}`);
      note(`glows ${JSON.stringify(layer.glows(v))}`);
      if (frame % 5 === 0)
        for (let y = Math.floor(v.bottom); y < v.bottom + 4; y++)
          for (let x = Math.floor(v.left); x < v.left + 5; x++) note(`bake ${x},${y} ${layer.bakeTile(bake, x, y)}`);
      layer.drawGround(c, f, frame % 3 === 1 ? undefined : mirrored(hx, hy, [tx, ty], frame % 2));
      layer.drawGlow(c, f, [0, 0.35, 1, -0.2][frame % 4]);
      note(`fg ${JSON.stringify(layer.foregroundBounds(f))}`);
      layer.drawForeground(c, f);
    }
  }
  // Standing in a pool at one instant: the hero moving only northward must
  // redraw the reflection rather than reuse it; seconds later the mirrored
  // sprites are snapshotted afresh.
  const pool = poolTile(s);
  if (pool)
    for (const [dy, later] of [[0, 0], [0.4, 0], [0.4, 5000]])
      layer.drawGround(c, { view: s.view, now: now + later, tileAt, reduceMotion: false }, mirrored(pool[0], pool[1] + dy, pool, 0));
  now += 5000;
  // Settle: the pieces land and the board stops being busy.
  for (let k = 0; k < 120; k++) layer.update({ dt: 0.016, now: (now += 16), hx, hy, tileAt, reduceMotion: false });
  note(`settled busy ${layer.busy} parts ${layer.particles.length}`);
  layer.drawForeground(c, { view: s.view, now, tileAt, reduceMotion: false });
  return digest();
}

/** A board with no decor source: every pass draws nothing. */
function noDecor(): string {
  canvasIds = 0;
  const layer = new DecorLayer();
  const world = { tile: () => ({ kind: "floor" }) } as unknown as Board;
  layer.sync(world, 5);
  const c = recorder("none"), v = { left: 0, bottom: 0, n: 17, s: 24 }, tileAt = () => ({ kind: "floor" }) as Tile;
  const f: DecorFrame = { view: v, now: 1000, tileAt, reduceMotion: false };
  layer.update({ dt: 0.016, now: 1000, hx: 3, hy: 3, tileAt, reduceMotion: false });
  note(`${layer.key} ${layer.bakeTile(c, 3, 3)} ${JSON.stringify(layer.glows(v))} ${layer.foregroundBounds(f)}`);
  layer.drawGround(c, f);
  layer.drawGlow(c, f, 1);
  layer.drawForeground(c, f);
  return digest();
}

/** A small planning budget: tiles wait for later frames. */
function budgeted(): string {
  canvasIds = 0;
  const s = towerDecor(11, 7), layer = new DecorLayer(), c = recorder("slow");
  layer.planBudget = 25;
  layer.sync(s.world, s.seed);
  const tileAt = (x: number, y: number) => s.world.tile(x, y);
  for (let k = 0; k < 16; k++) {
    layer.update({ dt: 0.016, now: 1000 + k * 16, hx: 8, hy: 8, tileAt, reduceMotion: false });
    note(`glows ${layer.glows(s.view).length} bake ${layer.bakeTile(c, k, k)}`);
    layer.drawGround(c, { view: s.view, now: 1000 + k * 16, tileAt, reduceMotion: false });
    layer.drawGlow(c, { view: s.view, now: 1000 + k * 16, reduceMotion: false }, 1);
  }
  // A different board swaps the source and clears what was planned.
  const other = towerDecor(11, 8);
  layer.sync(other.world, other.seed);
  note(`swapped ${layer.key} ${layer.glows(other.view).length}`);
  return digest();
}

async function record() {
  const out: Record<string, string> = { ...area1() };
  for (const state of ["loaded", "loading", "broken"] as const) out[`draw ${state}`] = await area1Draws(state);
  for (const seed of [1, 2, 3, 7]) out[`tree ${seed}`] = treeRun(seed);
  out["tree steady"] = treeSteady();
  out["fluid steps"] = fluidSteps();
  const scenes = [
    ...[[1, 0], [7, 3], [42, 8], [5, 14], [99, 27], [3, 41], [8, 55], [13, 66]].map(([seed, room]) => towerDecor(seed, room)),
    ...[[1, 12], [7, 30], [42, 55], [500, 20]].map(([seed, y]) => delveDecor(seed, y)),
  ];
  // Walking into glowing mushrooms puffs spores that glow in the dark.
  for (const [seed, room] of [[2, 17], [1, 51], [2, 64]])
    scenes.push({ ...towerDecor(seed, room), name: `spores ${seed}/${room}`, want: glowcaps });
  for (const s of scenes) out[s.name] = decorRun(s);
  out["no decor"] = noDecor();
  out.budgeted = budgeted();
  return out;
}

test("area-one sprites, skill-tree particles and decor draw the same as the recorded golden", async () => {
  const actual = await record();
  if (process.env.UPDATE_GOLDEN || !existsSync(GOLDEN)) {
    writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + "\n");
    return;
  }
  assert.deepStrictEqual(actual, JSON.parse(readFileSync(GOLDEN, "utf8")));
});
