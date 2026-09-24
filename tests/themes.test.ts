import { region } from "../src/delve/labyrinth.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { THEMES, themeAt } from "../src/themes.ts";

test("ten Tower themes cover ten rooms each and repeat", () => {
  assert.equal(THEMES.length, 10);
  for (let h = 0; h < 300; h++) {
    assert.equal(themeAt("tower", h, 0, 0, 42).decor, Math.floor(h / 10) % 10);
    assert.deepEqual(themeAt("tower", h, 0, 0, 42), themeAt("tower", h, 19, 19, 99));
  }
});

test("Delve themes follow regional graph ownership with mixed milestone surroundings", () => {
  let mixed = 0;
  for (let seed = 0; seed < 12; seed++) for (let area = 0; area < 10; area++) {
    const r = region(seed, area);
    for (const n of r.nodes) {
      const t = themeAt('delve', 0, n.x, n.y, seed);
      assert.deepEqual(t, themeAt('delve', 999, n.x, n.y, seed));
      if (t.mix > 0.1 && t.mix < 0.9) mixed++;
      if (n.influence === area) assert.ok(t.from === area % 10 || t.to === area % 10);
    }
  }
  assert.ok(mixed > 500);
});
