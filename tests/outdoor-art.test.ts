import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, type Hash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { random } from "../src/generation.ts";
import { OutdoorWeather } from "../src/weather.ts";
import { OutsideWorld, OUTSIDE_SIZE, drawEntrance, drawForestTile, outsideSpriteKind, outsideWeather } from "../src/outside.ts";
import { glowColor, torchLightField } from "../src/torch-light.ts";
import { computeVisibilityPolygon } from "../src/lighting.ts";
import type { Tile } from "../src/entities.ts";

// Characterization hashes of the outdoor art: seeded runs of OutdoorWeather
// through every weather (frame steps, pauses, reduced motion, sound toggles,
// seed changes) drawn on a recording canvas along with its thunder timing and
// sound calls; the forest clearing's tiles, steps, sprite choices, fallback
// tile art and entrances; and torch light fields over seeded wall maps.
// Regenerate (only when an outdoor art or torch light change is intended)
// with UPDATE_GOLDEN=1.
const GOLDEN = new URL("./fixtures/outdoor-art.golden.json", import.meta.url);

const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (ArrayBuffer.isView(v) ? Array.from(v as Float32Array) : v)))
    .digest("hex")
    .slice(0, 12);

/** A stand-in 2D context that feeds every call and property write to `h`;
 * gradients are recorded too. */
function recorder(h: Hash): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  let gradients = 0;
  const gradient = (kind: string, args: unknown[]) => {
    const name = `${kind}#${gradients++}`;
    h.update(`${name}(${args.join(",")})\n`);
    return { addColorStop: (o: number, c: string) => h.update(`${name}.stop(${o},${c})\n`), toString: () => name };
  };
  return new Proxy(state, {
    get: (_, key: string) => {
      if (key in state) return state[key];
      if (key === "createLinearGradient" || key === "createRadialGradient") return (...a: unknown[]) => gradient(key, a);
      return (...args: unknown[]) => void h.update(`${key}(${args.join(",")})\n`);
    },
    set: (_, key: string, value) => {
      state[key] = value;
      h.update(`${key}=${value}\n`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Seeds whose weather is each kind, first ones found. */
function seedsByWeather() {
  const found = new Map<string, number[]>();
  for (let s = 1; [...found.values()].reduce((n, l) => n + l.length, 0) < 8 && s < 5000; s++) {
    const list = found.get(outsideWeather(s)) ?? [];
    if (list.length < 2) found.set(outsideWeather(s), [...list, s]);
  }
  return [...found.values()].flat();
}

function weatherRun(seed: number) {
  const rnd = random(seed * 7 + 3);
  const h = createHash("sha256");
  const c = recorder(h);
  const w = new OutdoorWeather();
  const calls: string[] = [];
  w.rumble = (s: number) => void calls.push(`rumble ${s}`);
  const silence = w.silence.bind(w);
  w.silence = () => {
    calls.push("silence");
    silence();
  };
  const seeds = seedsByWeather();
  let current = seed;
  const frames: unknown[] = [];
  for (let f = 0; f < 700; f++) {
    if (rnd() < 0.01) current = seeds[Math.floor(rnd() * seeds.length)];
    const roll = rnd();
    const dt = roll < 0.03 ? 20 + rnd() * 30 : roll < 0.05 ? 0 : rnd() * 0.5;
    const size = [240, 480, 1400][Math.floor(rnd() * 3)];
    const reduce = rnd() < 0.08, active = rnd() > 0.06, sound = rnd() > 0.2;
    w.draw(c, size, current, { dt, reduceMotion: reduce, active, sound });
    if (f % 25 === 0)
      frames.push([f, current, w.seed, w.elapsed, w.nextThunder, w.lightningStart, w.sounded, h.copy().digest("hex").slice(0, 12)]);
  }
  return { frames: digest(frames), calls: digest(calls), rumbles: calls.filter((s) => s.startsWith("rumble")).length, canvas: h.digest("hex").slice(0, 12) };
}

function forest(seed: number, mode: "tower" | "delve") {
  const world = new OutsideWorld(seed, mode);
  const tiles: string[] = [];
  const steps: unknown[] = [];
  const h = createHash("sha256");
  const c = recorder(h);
  const drawn: unknown[] = [];
  for (let y = -2; y < OUTSIDE_SIZE + 2; y++)
    for (let x = -2; x < world.width + 2; x++) {
      const t = world.tile(x, y);
      tiles.push(t.kind[0]);
      for (const [dx, dy] of [[1, 0], [0, -1], [-1, 1]]) steps.push(world.step(x, y, dx, dy));
      if (x < 0 || y < 0 || x >= world.width || y >= OUTSIDE_SIZE) continue;
      for (const kind of new Set([t.kind, "wall", "floor", "stairs"])) {
        const tile = { kind } as Tile;
        h.update(`tile ${x},${y},${kind}\n`);
        const spot = { x, y, seed, center: world.entranceX };
        drawn.push(drawForestTile(c, tile, spot, (x + y) % 2 === 0), outsideSpriteKind(tile, spot));
      }
    }
  for (const center of [world.entranceX, 3, 11]) drawEntrance(c, mode, center);
  return { entranceX: world.entranceX, tiles: digest(tiles.join("")), steps: digest(steps), drawn: digest(drawn), canvas: h.digest("hex").slice(0, 12) };
}

function torchFields(seed: number) {
  const rnd = random(seed * 13 + 1);
  const W = 24, H = 20;
  const walls = new Set<string>();
  const density = 0.12 + rnd() * 0.3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rnd() < density) walls.add(`${x},${y}`);
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || walls.has(`${x},${y}`);
  const out: unknown[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 1 + Math.floor(rnd() * (W - 2)), y = 1 + Math.floor(rnd() * (H - 2));
    walls.delete(`${x},${y}`);
    const lightRadius = 1.5 + rnd() * 6;
    const polygon = rnd() < 0.85 ? computeVisibilityPolygon({ x, y, lightRadius }, isWall) : undefined;
    const res = 1 + Math.floor(rnd() * 4);
    const offsetX = rnd() < 0.5 ? 0 : (rnd() - 0.5) * 0.3;
    const field = torchLightField({ x, y, lightRadius, visibilityPolygon: polygon }, isWall, res, offsetX);
    out.push([x, y, lightRadius, res, offsetX, field.cols, field.rows, field.left, field.top, field.tiles, digest(field.values)]);
  }
  return digest(out);
}

/** Torches in an open field, where light reaches the edge of its window. */
function openFields() {
  const isWall = (x: number, y: number) => x === 100 && y === 100;
  const out: unknown[] = [];
  for (const [lightRadius, res, offsetX] of [[2.5, 2, 0], [6, 3, 0.1], [9.3, 1, -0.07]]) {
    const polygon = computeVisibilityPolygon({ x: 100, y: 101, lightRadius }, isWall);
    out.push(digest(torchLightField({ x: 100, y: 101, lightRadius, visibilityPolygon: polygon }, isWall, res, offsetX).values));
  }
  return out;
}

/** Forest tiles drawn from their sprites, with a stand-in Image that has
 * already loaded. */
function forestSprites(seed: number, mode: "tower" | "delve") {
  const g = globalThis as { Image?: unknown };
  const saved = g.Image;
  g.Image = class { src = ""; complete = true; naturalWidth = 24; toString() { return this.src; } };
  try {
    const world = new OutsideWorld(seed, mode);
    const h = createHash("sha256");
    const c = recorder(h);
    const drawn: boolean[] = [];
    for (let y = 0; y < OUTSIDE_SIZE; y++)
      for (let x = 0; x < world.width; x++) drawn.push(drawForestTile(c, world.tile(x, y), { x, y, seed, center: world.entranceX }));
    return { drawn: digest(drawn), canvas: h.digest("hex").slice(0, 12) };
  } finally {
    g.Image = saved;
  }
}

test("outdoor weather, forest and torch light match the golden", () => {
  const actual: Record<string, unknown> = {};
  for (let s = 1; s <= 8; s++) actual[`weather ${s}`] = weatherRun(seedsByWeather()[s - 1]);
  for (const seed of [1, 7, 42, 1234])
    for (const mode of ["tower", "delve"] as const) actual[`forest ${seed} ${mode}`] = forest(seed, mode);
  for (let s = 1; s <= 12; s++) actual[`torch ${s}`] = torchFields(s);
  actual["torch open"] = openFields();
  for (const seed of [1, 42]) for (const mode of ["tower", "delve"] as const) actual[`sprites ${seed} ${mode}`] = forestSprites(seed, mode);
  actual.glow = digest(Array.from({ length: 41 }, (_, i) => glowColor(i / 40 - 0.25 + i * 0.01)));

  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(actual, null, 2) + "\n");
  assert.ok(existsSync(GOLDEN), "golden missing; run with UPDATE_GOLDEN=1");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  for (const key of Object.keys(golden)) assert.deepEqual(actual[key], golden[key], `${key} diverges`);
  assert.deepEqual(Object.keys(actual), Object.keys(golden));
});
