import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { paintKitFlower, paintKitPlant } from "../src/render/decor/decor-bake.ts";
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

test("flowers and glowing mushroom variants use native pixels at their planned anchors", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ReadyImage { src = ""; complete = true; naturalWidth = 12; }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ReadyImage });
  const draws: unknown[][] = [];
  const c = { save() {}, restore() {}, drawImage(image: ReadyImage, ...args: number[]) { draws.push([image.src.split("/").at(-1), ...args]); } } as unknown as CanvasRenderingContext2D;
  try {
    FLOWER_SPRITES.forEach((id, color) => {
      assert.equal(paintKitFlower(c, { i: 10, j: 15, color }), true);
      assert.deepEqual(draws.at(-1), [`${id}.png`, 6, 11, 8, 8]);
    });
    GLOWCAP_SPRITES.forEach((id, variant) => {
      assert.equal(paintKitPlant(c, { kind: "mushrooms", glow: true, variant, i: 10, j: 20 }), true);
      assert.deepEqual(draws.at(-1), [`${id}.png`, 4, 10, 12, 12]);
    });
  } finally {
    if (original) Object.defineProperty(globalThis, "Image", original);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});
