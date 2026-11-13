import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARCANA } from "../src/arcana/arcana.ts";
import { ARCANA_EXAMPLES, arcanaExampleIndex, ARCANA_LAB_STILL, arcanaBurstAge } from "../src/arcana-lab.ts";
import { paintPixelArcana } from "../src/render/effects/arcana-pixel-preview.ts";

function pixels(id: typeof ARCANA_EXAMPLES[number]["id"], time: number) {
  const calls: (string | number)[][] = [];
  const c = { fillStyle: "", save() {}, restore() {}, fillRect(...box: number[]) { calls.push([this.fillStyle, ...box]); } };
  paintPixelArcana(c as unknown as CanvasRenderingContext2D, id, time);
  return calls;
}

test("every arcanum has a named comparison and navigation wraps", () => {
  assert.deepEqual(ARCANA_EXAMPLES.map(e => e.id).sort(), Object.keys(ARCANA).sort());
  for (const ex of ARCANA_EXAMPLES) assert.equal(ex.name, ARCANA[ex.id].name);
  assert.equal(arcanaExampleIndex(-1), 8); assert.equal(arcanaExampleIndex(9), 0);
  assert.equal(arcanaBurstAge(ARCANA_LAB_STILL), 50);
  assert.equal(arcanaBurstAge(ARCANA_LAB_STILL + 2400), 50);
});

test("all proposals use deterministic opaque palette pixels on the native grid", () => {
  const values = readFileSync(new URL("../assets/ui-sprites/palette.ppm", import.meta.url), "utf8").replace(/#[^\n]*/g, "").trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({ length: values.length / 3 }, (_, i) => `#${values.slice(i * 3, i * 3 + 3).map(n => n.toString(16).padStart(2, "0")).join("")}`));
  for (const ex of ARCANA_EXAMPLES) {
    const calls = pixels(ex.id, ARCANA_LAB_STILL);
    assert.ok(calls.length > 0, `${ex.id} has a visible representative pose`);
    assert.deepEqual(pixels(ex.id, ARCANA_LAB_STILL), calls);
    for (const [color, ...box] of calls) {
      assert.ok(palette.has(String(color)), `${ex.id}: ${color} belongs to the shared palette`);
      assert.ok(box.every(Number.isInteger), `${ex.id} uses integer pixels`);
      assert.ok(Number(box[2]) > 0 && Number(box[3]) > 0);
    }
  }
});

test("moving proposals advance while fields retain stable boundaries and impacts finish", () => {
  for (const id of ["voidwell", "necroticFrost", "lifespring", "overseer", "phantasm", "aurumBloom"] as const) {
    assert.notDeepEqual(pixels(id, 150), pixels(id, 650), id);
  }
  assert.deepEqual(pixels("timeDilation", 150), pixels("timeDilation", 1800));
  assert.deepEqual(pixels("thunderbolt", 1200), []);
  assert.deepEqual(pixels("ricochetShot", 1200), []);
});
