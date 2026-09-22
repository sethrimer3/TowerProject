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

test("delve interiors cycle every thousand depth with stable organic boundaries", () => {
  for (let band = 0; band < 30; band++)
    for (let x = 0; x < 30; x++)
      assert.equal(themeAt("delve", 0, x, band * 100 + 50, 42).decor, band % 10);
  const crossings = new Set<number>();
  let blended = 0;
  for (let x = 0; x < 30; x++) {
    for (let y = 65; y < 135; y++) {
      const region = themeAt("delve", 0, x, y, 42);
      assert.deepEqual(region, themeAt("delve", 999, x, y, 42));
      if (region.mix > 0 && region.mix < 1) blended++;
      if (region.to === 1 && region.mix >= 0.5) { crossings.add(y); break; }
    }
  }
  assert.ok(crossings.size > 5, "boundaries must vary horizontally");
  assert.ok(blended > 30, "transition must span multiple rows");
});
