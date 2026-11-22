import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARCANA } from "../src/arcana/arcana.ts";
import { ARCANA_EXAMPLES, ARCANA_RESEARCH_EXAMPLES, arcanaExampleIndex, arcanaExampleStill, ARCANA_LAB_STILL, ARCANUM_PREVIEW_LOOPS, arcanaBurstAge } from "../src/arcana-lab.ts";
import { paintPixelArcana } from "../src/render/effects/arcana-pixel-preview.ts";

function pixels(id: typeof ARCANA_EXAMPLES[number]["id"], time: number) {
  const calls: (string | number)[][] = [];
  const c = { fillStyle: "", save() {}, restore() {}, translate() {}, fillRect(...box: number[]) { calls.push([this.fillStyle, ...box]); } };
  paintPixelArcana(c as unknown as CanvasRenderingContext2D, id, time);
  return calls;
}

test("every arcanum has a named comparison and navigation wraps", () => {
  assert.deepEqual(ARCANA_EXAMPLES.filter(e => !ARCANA_RESEARCH_EXAMPLES.some(r => r.id === e.id)).map(e => e.id).sort(), Object.keys(ARCANA).sort());
  assert.equal(new Set(ARCANA_EXAMPLES.map(e => e.id)).size, 17);
  assert.equal(arcanaExampleIndex(-1), 16); assert.equal(arcanaExampleIndex(17), 0);
  assert.equal(arcanaBurstAge(ARCANA_LAB_STILL), 50);
  assert.equal(arcanaBurstAge(ARCANA_LAB_STILL + 2400), 50);
  for (const ex of ARCANA_RESEARCH_EXAMPLES) {
    const age = arcanaBurstAge(arcanaExampleStill(ex.id));
    assert.ok(age >= 90 && age < 330, "research opens on a visible impact frame, including with reduced motion");
  }
});

test("all proposals use deterministic opaque palette pixels on the native grid", () => {
  const values = readFileSync(new URL("../assets/ui-sprites/palette.ppm", import.meta.url), "utf8").replace(/#[^\n]*/g, "").trim().split(/\s+/).slice(4).map(Number);
  const palette = new Set(Array.from({ length: values.length / 3 }, (_, i) => `#${values.slice(i * 3, i * 3 + 3).map(n => n.toString(16).padStart(2, "0")).join("")}`));
  for (const ex of ARCANA_EXAMPLES.filter(e => !["ricochetShock", "dilationGuard"].includes(e.id))) {
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

// Research visuals must add feedback beyond their parent effect.
test("research previews add visible feedback and animate independently", () => {
  for (const ex of ARCANA_RESEARCH_EXAMPLES.filter(e => !["ricochetShock", "dilationGuard"].includes(e.id))) {
    assert.notDeepEqual(pixels(ex.id, 150), pixels(ex.id, 650), ex.id);
  }
  assert.notDeepEqual(pixels("thunderboltExpansion", 450), pixels("thunderbolt", 450));
  assert.notDeepEqual(pixels("overseerZap", 450), pixels("thunderbolt", 450));
});

test("every arcanum's purchase preview loops on a whole number of its painters' periods", () => {
  const whole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9;
  for (const id of Object.keys(ARCANA) as (keyof typeof ARCANA)[]) assert.ok(ARCANUM_PREVIEW_LOOPS[id] > 0, id);
  for (const id of ["thunderbolt", "ricochetShot", "aurumBloom"] as const) assert.ok(whole(ARCANUM_PREVIEW_LOOPS[id] / 2400), id);
  assert.ok(whole(ARCANUM_PREVIEW_LOOPS.necroticFrost / 1500));
  assert.ok(whole(ARCANUM_PREVIEW_LOOPS.voidwell / 9000));
  for (const id of ["overseer", "phantasm"] as const) assert.ok(whole(ARCANUM_PREVIEW_LOOPS[id] / 12000), id);
  for (const spin of [0.09, 0.13, 0.17]) assert.ok(whole((spin * ARCANUM_PREVIEW_LOOPS.lifespring) / 1000), `${spin}`);
});
