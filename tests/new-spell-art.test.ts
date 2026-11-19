import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodePng } from "../tools/ui-atlas-png.mjs";
import { spellFrame } from "../src/sprites/spell-art.ts";

const icons = ["gem-golden", "gem-stellar", "respec-training", "respec-arcana", "status-shock", "status-dilation-guard", "phoenix-spark"];
const strips = ["ambient-phoenix-spark", "ambient-stellar-twinkles", "ambient-ricochet-shock", "ambient-dilation-guard"];
const frames = ["epic", "legendary", "mythic", "ancestral"].map(r => `ui-equip-frame-${r}`);
const read = (id: string) => decodePng(readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url)));

test("new item/effect art has native dimensions, binary alpha and shared palette colours", () => {
  const values = readFileSync(new URL("../assets/ui-sprites/palette.ppm", import.meta.url), "utf8").replace(/#[^\n]*/g, "").trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({ length: values.length / 3 }, (_, i) => values.slice(i * 3, i * 3 + 3).join(",")));
  for (const id of [...icons, ...strips, ...frames]) {
    const { width, height, pixels } = read(id);
    assert.deepEqual([width, height], [strips.includes(id) ? 144 : 24, 24]);
    let visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      assert.ok(pixels[i + 3] === 0 || pixels[i + 3] === 255, id);
      if (pixels[i + 3]) { visible++; assert.ok(palette.has([...pixels.subarray(i, i + 3)].join(",")), id); }
    }
    assert.ok(visible > 15, `${id} contains visible art`);
  }
  assert.notDeepEqual(read(icons[0]).pixels, read(icons[1]).pixels);
  assert.notDeepEqual(read(icons[2]).pixels, read(icons[3]).pixels);
});

test("rarity frames have flat slate centers and distinct borders on every side", () => {
  const art = frames.map(id => read(id).pixels);
  assert.equal(new Set(art.map(p => p.toString("base64"))).size, 4);
  for (const p of art) {
    assert.deepEqual([...p.subarray((12 * 24 + 12) * 4, (12 * 24 + 12) * 4 + 4)], [27, 36, 48, 255]);
    for (const side of [0, 1, 2, 3]) {
      let count = 0;
      for (let i = 0; i < 24; i++) for (let d = 0; d < 5; d++) {
        const x = side === 0 ? d : side === 1 ? 23 - d : i;
        const y = side === 2 ? d : side === 3 ? 23 - d : i;
        if (p[(y * 24 + x) * 4 + 3]) count++;
      }
      assert.ok(count > 12, "all border edges survive export");
    }
  }
});

test("six distinct animation frames freeze deterministically with motion off", () => {
  for (const id of strips) {
    const { pixels } = read(id), images: string[] = [];
    for (let frame = 0; frame < 6; frame++) {
      const rows = Array.from({ length: 24 }, (_, y) => pixels.subarray((y * 144 + frame * 24) * 4, (y * 144 + frame * 24 + 24) * 4));
      images.push(Buffer.concat(rows).toString("base64"));
    }
    assert.equal(new Set(images).size, 6, id);
  }
  assert.deepEqual([0, 200, 400, 600, 800, 1000].map(t => spellFrame(t, true)), [0, 1, 2, 3, 4, 5]);
  assert.equal(spellFrame(1200, true), 0);
  assert.ok([0, 900, 1200].every(t => spellFrame(t, false) === 2));
});
