import assert from "node:assert/strict";
import test from "node:test";
import { ARROW_DIRECTIONS, arrowSprite, shieldSprite } from "../src/sprites/combat.ts";
import { drawVolley } from "../src/volley-art.ts";
import { drawShields } from "../src/shield-art.ts";
import { drawChestMarks } from "../src/chest-marks.ts";
import { paintContents } from "../src/tile-painters.ts";
import type { FrameContext } from "../src/render-frame.ts";
import type { Volley } from "../src/volley.ts";

test("arrow facings wrap cleanly and shields choose a native density", () => {
  for (let i = -16; i <= 16; i++) for (const charged of [false, true])
    assert.equal(arrowSprite(i * Math.PI / 4, charged), `combat-${charged ? "charged" : "arrow"}-${ARROW_DIRECTIONS[(i % 8 + 8) % 8]}`);
  assert.deepEqual([48, 60, 80, 100, 125, 144].map(shieldSprite), [48, 48, 96, 96, 144, 144].map(n => `combat-shield-${n}`));
});

test("combat PNGs preserve flight, wrapped reach, opened-chest marks and late-load fallbacks", () => {
  const originals = ["Image", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const images: LoadingImage[] = [], calls: { method: string; args: any[]; blur: unknown; smoothing: unknown }[] = [];
  class LoadingImage {
    src = ""; complete = false; naturalWidth = 0; onload?: () => void;
    constructor() { images.push(this); }
    load() { this.complete = true; this.naturalWidth = 24; this.onload?.(); }
  }
  const context = () => new Proxy({} as CanvasRenderingContext2D, {
    get(target, method: string) {
      if (method in target) return target[method];
      return (...args: unknown[]) => {
        calls.push({ method, args, blur: target.shadowBlur, smoothing: target.imageSmoothingEnabled });
        if (method === "createRadialGradient") return { addColorStop() {} };
      };
    },
  });
  let canvases = 0;
  Object.defineProperty(globalThis, "Image", { configurable: true, value: LoadingImage });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement() {
    canvases++; return { width: 0, height: 0, getContext: context };
  } } });
  const c = context(), f = { c, s: 24, n: 17, left: 0, bottom: 0, now: 350, dt: 0,
    playerX: 0.5, playerY: 0.25, look: { styledSprites: true },
    world: { tile: (x: number, y: number) => y === 1 && [1, 2].includes(x) ? { kind: x === 1 ? "treasure" : "floor", chest: x === 1 ? "supply" : "equipment" } : { kind: "floor" } },
  } as unknown as FrameContext;
  const volley: Volley = { at: 0, ms: 1000, shots: [
    { by: "hero", from: { x: 15, y: 0 }, to: { x: 0, y: 0 }, tick: 10, damage: 0 },
    { by: "enemy", from: { x: 15, y: 0 }, to: { x: 0, y: 0 }, tick: 10, damage: 0 },
  ] };
  const draws = () => calls.filter(c => c.method === "drawImage");
  const arcCount = () => calls.filter(c => c.method === "arc").length;
  try {
    drawVolley(f, [volley], 16);
    assert.equal(draws().length, 0); assert.ok(calls.some(c => c.method === "rotate"), "loading arrows keep their original art");
    images.forEach(i => i.load()); calls.length = 0;
    drawVolley(f, [volley], 16);
    assert.deepEqual(draws().map(c => c.args.slice(1)), [[376, 388, 16, 16], [386, 389, 8, 8]], "same shortest wrapped flight; enemy aims at drawn hero");
    assert.ok(draws().every(c => c.smoothing === false));
    f.look.styledSprites = false; calls.length = 0; drawVolley(f, [volley], 16);
    assert.equal(draws().length, 0); assert.equal(arcCount(), 1, "off keeps the original enemy shot");
    f.look.styledSprites = true;
    calls.length = 0; drawShields(f, [{ x: 0, y: 0, floor: 4000 }], 16);
    assert.equal(arcCount(), 3, "a missing ring keeps all wrapped bubbles");
    images.forEach(i => i.load()); calls.length = 0;
    drawShields(f, [{ x: 0, y: 0, floor: 4000 }], 16);
    assert.deepEqual(draws().map(c => c.args.slice(1)), [[-444, 324, 144, 144], [-60, 324, 144, 144], [324, 324, 144, 144]]);
    assert.ok(draws().every(c => c.blur === 0 && c.smoothing === false));
    calls.length = 0; drawChestMarks(f);
    assert.ok(calls.some(c => c.method === "createRadialGradient"), "loading chest marks retain the original stars and glow");
    images.forEach(i => i.load()); calls.length = 0; drawChestMarks(f);
    assert.deepEqual(draws().map(c => [c.args[0].src.split("/").at(-1), ...c.args.slice(1)]), [
      ["combat-chest-supply.png", 24, 360, 10, 10], ["combat-chest-equipment.png", 48, 360, 20, 10],
    ], "an opened chest keeps the same semantic mark");

    const tile = { kind: "enemy" as const, enemy: { name: "Goblin", tier: 0, strength: "elite" as const, hp: 10, attack: 1, defense: 0, fast: true, ranged: true } };
    const art = { x: 0, y: 0, time: 0, spritesOff: false, reduceMotion: true, area1: false, styledSprites: true };
    paintContents(c, tile, art); images.forEach(i => { if (i.src.endsWith("/enemy-goblin.png")) i.load(); });
    paintContents(c, tile, art);
    const before = canvases; paintContents(c, tile, art); assert.equal(canvases, before, "unchanged enemies reuse their bake");
    images.forEach(i => i.load()); calls.length = 0; paintContents(c, tile, art);
    assert.ok(canvases > before, "late mark arrival invalidates the cached enemy");
    for (const id of ["combat-rank-up", "combat-fast", "combat-ranged"])
      assert.ok(draws().some(c => c.args[0].src?.endsWith(`/${id}.png`)), id);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
