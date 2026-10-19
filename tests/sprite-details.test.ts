import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import { DETAIL_SPRITES } from "../src/sprite-kit.ts";
import { DecorBaker, paintKitPlant } from "../src/decor-bake.ts";
import type { DecorSource, TileDecor } from "../src/decor.ts";
import { drawCrates } from "../src/decor-sprites.ts";

test("all shared PNGs obey the shared palette, binary transparency and native grid", () => {
  const values = readFileSync(new URL("../assets/ui-sprites/palette.ppm", import.meta.url), "utf8")
    .replace(/#[^\n]*/g, "").trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({ length: values.length / 3 }, (_, i) => values.slice(i * 3, i * 3 + 3).join(",")));
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
  for (const [id, asset] of Object.entries(manifest.assets) as [string, { width: number; height: number; tile?: boolean }][]) {
    const png = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width, asset.width, id);
    assert.equal(height, asset.height, id);
    const detail = (DETAIL_SPRITES as readonly string[]).indexOf(id);
    if (detail >= 0) assert.equal(width, detail < 8 ? 24 : 12, id);
    assert.equal(png[24], 8, "8-bit channels");
    assert.equal(png[25], 6, "RGBA");
    const chunks: Buffer[] = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
      const predictor = a <= b && a <= c ? left : b <= c ? up : corner;
      const filter = raw[y * (stride + 1)];
      assert.ok(filter <= 4);
      pixels[y * stride + x] = raw[y * (stride + 1) + x + 1] + [0, left, up, Math.floor((left + up) / 2), predictor][filter];
    }
    let opaque = 0, transparent = 0;
    let left = width, right = -1, top = height, bottom = -1;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      assert.ok(alpha === 0 || alpha === 255, `${id}: soft alpha ${alpha}`);
      if (alpha) {
        const x = i / 4 % width, y = Math.floor(i / 4 / width);
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        opaque++;
        assert.ok(palette.has([...pixels.subarray(i, i + 3)].join(",")), `${id}: off-palette pixel`);
      } else transparent++;
    }
    if (id.startsWith("badge-frame-")) {
      assert.ok(right - left >= 21 && bottom - top >= 21, `${id}: frame alpha must reach all four sides`);
    }
    if (id.startsWith("ui-equip-frame-")) {
      assert.equal(width, 24, id); assert.equal(height, 24, id);
      assert.ok(right - left >= 21 && bottom - top >= 21, `${id}: keep the square frame footprint`);
      for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) {
        const at = (y * width + x) * 4;
        if (id.endsWith("selection")) assert.equal(pixels[at + 3], 0, "selection corners must leave live content clear");
        else assert.deepEqual([...pixels.subarray(at, at + 4)], [27, 36, 48, 255], "Equipment centers stay flat slate behind item art");
      }
    }
    assert.ok(opaque > 10 && (asset.tile || transparent > 10), `${id}: visible subject on transparency`);
  }
});

test("decor keeps loading fallbacks and refreshes cached pixels after load and toggles", () => {
  const originals = ["Image", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const made: LoadingImage[] = [];
  class LoadingImage {
    src = ""; complete = false; naturalWidth = 0; onload?: () => void;
    constructor() { made.push(this); }
  }
  const canvases: { draws: string[]; getContext: () => unknown }[] = [];
  Object.defineProperty(globalThis, "Image", { configurable: true, value: LoadingImage });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement() {
    const draws: string[] = [];
    const ctx = { createImageData: () => ({ data: new Uint8ClampedArray(24 * 24 * 4) }), putImageData() {}, save() {}, restore() {},
      drawImage: (img: LoadingImage) => draws.push(img.src) };
    const canvas = { draws, getContext: () => ctx };
    canvases.push(canvas);
    return canvas;
  } } });
  try {
    const src = { kind: () => "floor", seed: 1 } as DecorSource;
    const decor = { water: null, moss: null, vines: [], flowers: [], plants: [{ kind: "tuft", i: 12, j: 20, variant: 0 }] } as unknown as TileDecor;
    const baker = new DecorBaker();
    const original = baker.bake(src, 0, 0, decor);
    assert.equal(made.length, 0, "off never requests a replacement");
    const loading = baker.bake(src, 0, 0, decor, true);
    assert.notEqual(loading, original);
    assert.equal(canvases.at(-1)?.draws.length, 0, "loading keeps procedural pixels");
    assert.equal(baker.bake(src, 0, 0, decor, true), loading, "unchanged tiles stay cached");
    made[0].complete = true; made[0].naturalWidth = 12; made[0].onload?.();
    const ready = baker.bake(src, 0, 0, decor, true);
    assert.notEqual(ready, loading);
    assert.ok(canvases.at(-1)?.draws[0].endsWith("/tuft.png"));
    const off = baker.bake(src, 0, 0, decor, false);
    assert.notEqual(off, ready);
    assert.equal(canvases.at(-1)?.draws.length, 0);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test("plants keep 1:1 pixels, webs follow corners and broken crates use their PNG", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 12; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const calls: unknown[][] = [];
  const c = { save() {}, restore() {}, translate(...args: number[]) { calls.push(["translate", ...args]); }, rotate(angle: number) { calls.push(["rotate", angle]); },
    drawImage(img: ReadyImage, ...args: number[]) { calls.push([img.src.split("/").at(-1), ...args]); } } as unknown as CanvasRenderingContext2D;
  try {
    paintKitPlant(c, { kind: "fern", i: 10, j: 20, variant: 0 });
    assert.deepEqual(calls.at(-1), ["fern.png", 4, 10, 12, 12]);
    for (let corner = 0; corner < 4; corner++) {
      paintKitPlant(c, { kind: "web", i: 0, j: 0, variant: 0, corner });
      assert.deepEqual(calls.at(-2), ["rotate", corner * Math.PI / 2]);
      assert.deepEqual(calls.at(-1), ["web.png", 0, 0, 12, 12]);
    }
    drawCrates(c, 0, 0, [{ x: 1, y: 2, w: 12, h: 12, lift: 0, tone: 0, kind: "crate" }], true, true);
    assert.deepEqual(calls.at(-1), ["crate-broken.png", 1, 4, 12, 12]);
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});
