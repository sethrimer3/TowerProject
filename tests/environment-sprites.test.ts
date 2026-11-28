import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { paintKitFlower, paintKitPlant } from "../src/render/decor/decor-bake.ts";
import { recorder, withPropDom } from "./half-prop-dom.ts";
import { ENVIRONMENT_SPRITES, FLOWER_SPRITES, GLOWCAP_SPRITES, MOSS_SPRITES, VINE_SPRITES, WATER_SPRITES } from "../src/sprites/environment.ts";

test("environment PNGs retain native density and distinct material/plant variants", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/assets/style/manifest.json", import.meta.url), "utf8"));
  const hashes = new Set<string>();
  const materials = new Set<string>([...MOSS_SPRITES, ...WATER_SPRITES]), caps = new Set<string>(GLOWCAP_SPRITES);
  for (const id of ENVIRONMENT_SPRITES) {
    const tile = materials.has(id);
    const size = tile ? 24 : caps.has(id) ? 12 : 8;
    const bytes = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [size, size], id);
    assert.equal(!!manifest.assets[id].tile, tile, id);
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(hashes.size, 16, "material tones and plant silhouettes must remain distinct");
  assert.equal(VINE_SPRITES.length, 2);
});

test("flowers and glowing mushroom variants are half-pixel props, outlined, at their planned anchors", () => {
  withPropDom(() => {
    const { c, calls } = recorder();
    FLOWER_SPRITES.forEach((_, color) => {
      assert.equal(paintKitFlower(c, { i: 10, j: 15, color }), true);
      // 16 half pixels and a one-half-pixel rim each side: 9 world pixels, from half a pixel outside the anchor box.
      assert.deepEqual(calls.at(-1), ["18x18", 5.5, 10.5, 9, 9]);
    });
    GLOWCAP_SPRITES.forEach((_, variant) => {
      assert.equal(paintKitPlant(c, { kind: "mushrooms", glow: true, variant, i: 10, j: 20 }), true);
      assert.deepEqual(calls.at(-1), ["26x26", 3.5, 9.5, 13, 13]);
    });
    assert.equal(paintKitFlower(c, { i: 10, j: 15, color: 0 }, false), true);
    assert.deepEqual(calls.at(-1), ["16x16", 6, 11, 8, 8], "the bloom paints the sprite alone");
  });
});
