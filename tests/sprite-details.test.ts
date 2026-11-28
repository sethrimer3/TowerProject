import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import { DETAIL_SPRITES } from "../src/sprites/kit.ts";
import { DecorBaker, paintKitPlant } from "../src/render/decor/decor-bake.ts";
import type { DecorSource, TileDecor } from "../src/render/decor/decor.ts";
import { drawCrates } from "../src/render/decor/decor-sprites.ts";
import { recorder, withPropDom, type FakeCanvas } from "./half-prop-dom.ts";

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
    if (id.startsWith("combat-shield-")) {
      assert.ok(right - left >= width - 3 && bottom - top >= height - 3, `${id}: boundary must preserve its full radius`);
      for (let y = Math.ceil(height * 0.2); y < height * 0.8; y++)
        for (let x = Math.ceil(width * 0.2); x < width * 0.8; x++)
          assert.equal(pixels[(y * width + x) * 4 + 3], 0, `${id}: leave the guarded tiles visible`);
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

test("the kit's decor bakes its plants at twice the density, cached until the style changes", () => {
  withPropDom((canvases) => {
    const src = { kind: () => "floor", seed: 1 } as DecorSource;
    const decor = { water: null, moss: null, vines: [], flowers: [], plants: [{ kind: "tuft", i: 12, j: 20, variant: 0 }] } as unknown as TileDecor;
    const baker = new DecorBaker();
    const original = baker.bake(src, 0, 0, decor) as unknown as FakeCanvas;
    assert.equal(original.width, 24, "the procedural plant stays on the native grid");
    const styled = baker.bake(src, 0, 0, decor, true) as unknown as FakeCanvas;
    assert.notEqual(styled, original);
    assert.equal(styled.width, 48);
    assert.equal(styled.draws.length, 2, "the native pixels scaled up, then the outlined tuft");
    assert.deepEqual(styled.draws[1].slice(1), [5.5, 9.5, 13, 13]);
    assert.equal(baker.bake(src, 0, 0, decor, true), styled, "unchanged tiles stay cached");
    const off = baker.bake(src, 0, 0, decor, false) as unknown as FakeCanvas;
    assert.equal(off.width, 24);
    assert.ok(canvases.length > 3);
  });
});

test("plants are half-pixel props, webs follow corners unoutlined, and crates fit their outlined box", () => {
  withPropDom(() => {
    const { c, calls } = recorder();
    paintKitPlant(c, { kind: "fern", i: 10, j: 20, variant: 0 });
    assert.deepEqual(calls.at(-1), ["26x26", 3.5, 9.5, 13, 13]);
    for (let corner = 0; corner < 4; corner++) {
      paintKitPlant(c, { kind: "web", i: 0, j: 0, variant: 0, corner });
      assert.deepEqual(calls.at(-2), ["rotate", corner * Math.PI / 2]);
      assert.deepEqual(calls.at(-1), ["24x24", 0, 0, 12, 12]);
    }
    drawCrates(c, 0, 0, [{ x: 1, y: 2, w: 12, h: 12, lift: 0, tone: 0, kind: "crate" }], true, true);
    assert.deepEqual(calls.at(-1), ["26x26", 0.5, 3.5, 13, 13]);
    drawCrates(c, 0, 0, [{ x: 1, y: 2, w: 9, h: 9, lift: 0, tone: 1, kind: "crate" }], false, true);
    assert.deepEqual(calls.at(-1), ["20x20", 0.5, 1.5, 10, 10], "18 half pixels and its rim, centred on the 9-pixel box");
    drawCrates(c, 0, 0, [{ x: 1, y: 2, w: 9, h: 9, lift: 0, tone: 1, kind: "crate" }], false, true, false);
    assert.deepEqual(calls.at(-1), ["18x18", 1, 2, 9, 9], "shadow casters take the sprite alone");
  });
});
