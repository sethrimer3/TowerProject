import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MATERIALS, METALS } from "../src/materials.ts";
import { METAL_BAR_URLS, MONSTER_PART_URLS, metalBarSprite, monsterPartSprite } from "../src/material-sprites.ts";

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

test("every common and rare monster material has a deployable icon", () => {
  const monsterParts = MATERIALS.filter((material) =>
    material.category === "monster-common" || material.category === "monster-rare");
  assert.equal(monsterParts.length, 28);
  assert.equal(Object.keys(MONSTER_PART_URLS).length, monsterParts.length);
  assert.equal(new Set(Object.values(MONSTER_PART_URLS)).size, monsterParts.length);

  for (const material of monsterParts) {
    const url = MONSTER_PART_URLS[material.id as keyof typeof MONSTER_PART_URLS];
    assert.ok(url, `missing icon URL for ${material.name}`);
    const filename = url.slice(url.lastIndexOf("/") + 1);
    const path = fileURLToPath(new URL(`../public/assets/materials/${filename}`, import.meta.url));
    assert.ok(existsSync(path), `missing icon file for ${material.name}`);
    assert.match(monsterPartSprite(material.id), /aria-hidden="true"/);
  }
});

test("non-monster materials do not render a monster-part icon", () => {
  assert.equal(monsterPartSprite("garnet"), "");
  assert.equal(monsterPartSprite("ironBar"), "");
});
