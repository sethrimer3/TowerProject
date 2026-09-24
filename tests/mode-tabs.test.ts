import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { UPGRADES } from "../src/config.ts";
import { TREES, skillAvailable } from "../src/skill-trees.ts";

test("legacy upgrade description mentions unlocking the legacy skill tree and Defend", () => {
  const legacy = UPGRADES.find((u) => u.id === "legacy");
  assert.ok(legacy, "Legacy upgrade should exist");
  assert.match(
    legacy.description,
    /unlock.*legacy.*skill tree.*unlock.*defend/i,
    "Legacy description should mention unlocking the legacy skill tree and Defend",
  );
});

test("fresh save has delve and legacy locked; dev mode unlocks both", () => {
  const g = new Game(defaults());
  assert.equal(g.save.upgrades.delve ?? 0, 0);
  assert.equal(g.save.upgrades.legacy ?? 0, 0);

  g.setDevMode(true);
  assert.equal(g.save.upgrades.delve, 1);
  assert.equal(g.save.upgrades.legacy, 1);
});

test("dev mode grants unlimited metal bars and monster parts", () => {
  const g = new Game(defaults());

  g.setDevMode(true);

  assert.equal(g.save.materials.ironBar, 999_999_999);
  assert.equal(g.save.materials.voidsteelBar, 999_999_999);
  assert.equal(g.save.materials.cinderSlimeBlob, 999_999_999);
  assert.equal(g.save.materials.celestialAegis, 999_999_999);
  assert.equal(g.save.materials.garnet, 0, "gems are not part of the dev-mode resource grant");
  assert.equal(g.save.materials.emptyVial, 0, "utility materials are not part of the dev-mode resource grant");
});

test("legacy skill tree is gated by legacy upgrade which unlocks Defend", () => {
  const legacyTree = TREES.find((t) => t.id === "legacy")!;
  assert.equal(legacyTree.gate, "legacy");

  const g = new Game(defaults());
  // Quality is the root of the legacy tree
  assert.equal(skillAvailable("quality", g.save.upgrades), false);

  g.save.upgrades.legacy = 1;
  assert.equal(skillAvailable("quality", g.save.upgrades), true);
});
