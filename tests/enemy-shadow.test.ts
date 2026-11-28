import { test } from "node:test";
import assert from "node:assert/strict";
import { SHADOW_TONE, shadowRows } from "../src/render/enemy-shadow.ts";

/** A 24x24 alpha channel with a solid block from (l, t) to (r, b). */
function block(l: number, t: number, r: number, b: number) {
  const a = new Uint8Array(576);
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) a[y * 24 + x] = 255;
  return a;
}

test("the shadow is a stepped oval sized and centred on the sprite's feet", () => {
  const rim = shadowRows(block(4, 10, 19, 21)).filter((r) => !r.core);
  assert.deepEqual(rim.map((r) => r.y), [21, 22, 23, 24, 25]);
  assert.equal(Math.min(...rim.map((r) => r.x0)), 1);
  assert.equal(Math.max(...rim.map((r) => r.x1)), 22);
  for (const r of rim) assert.equal(r.x0 + r.x1, 23, "symmetric under the feet");
  const narrow = shadowRows(block(8, 10, 15, 20)).filter((r) => !r.core);
  assert.ok(narrow.length < rim.length);
  assert.equal(Math.max(...narrow.map((r) => r.x1)) - Math.min(...narrow.map((r) => r.x0)) + 1, 14);
});

test("the oval narrows towards its top and bottom without diagonal single steps", () => {
  for (const [l, r] of [[4, 19], [8, 15], [2, 21], [10, 13]]) {
    const rim = shadowRows(block(l, 8, r, 20)).filter((s) => !s.core);
    const mid = Math.floor(rim.length / 2);
    for (let i = 1; i < rim.length; i++) {
      const widen = i <= mid ? rim[i - 1].x0 >= rim[i].x0 : rim[i - 1].x0 <= rim[i].x0;
      assert.ok(widen, `row ${i} of ${l}-${r}`);
    }
  }
});

test("a flying enemy's shadow sits on the floor and is smaller", () => {
  const ground = shadowRows(block(4, 4, 19, 16)), flying = shadowRows(block(4, 4, 19, 16), true);
  const span = (rows: typeof ground) => Math.max(...rows.map((r) => r.x1)) - Math.min(...rows.map((r) => r.x0));
  assert.ok(span(flying) < span(ground));
  assert.ok(Math.max(...flying.map((r) => r.y)) > Math.max(...ground.map((r) => r.y)));
});

test("missing art still gets a shadow, and its core is darker than its rim", () => {
  assert.ok(shadowRows(new Uint8Array(576)).length > 0);
  for (let i = 0; i < 3; i++) assert.ok(SHADOW_TONE.core[i] < SHADOW_TONE.rim[i] && SHADOW_TONE.rim[i] < 255);
});
