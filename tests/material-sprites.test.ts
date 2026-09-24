import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { METALS } from "../src/materials.ts";
import { METAL_BAR_URLS, metalBarSprite } from "../src/material-sprites.ts";

test("every crafting metal has a deployable bar sprite", () => {
  assert.equal(Object.keys(METAL_BAR_URLS).length, METALS.length);
  for (const metal of METALS) {
    const url = METAL_BAR_URLS[metal.id];
    assert.match(url, new RegExp(`/assets/materials/${metal.id}-bar\\.png$`));
    const path = fileURLToPath(new URL(`../public/assets/materials/${metal.id}-bar.png`, import.meta.url));
    assert.ok(existsSync(path), `missing bar sprite for ${metal.name}`);
    assert.match(metalBarSprite(metal.id), /aria-hidden="true"/);
  }
});
