import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { TREES, skillAvailable } from "../src/progression/skill-trees.ts";

test("legacy upgrade description mentions unlocking the legacy skill tree", () => {
  const legacy = UPGRADES.find((u) => u.id === "legacy");
  assert.ok(legacy, "Legacy upgrade should exist");
  assert.match(
    legacy.description,
    /unlock.*legacy.*skill tree/i,
    "Legacy description should mention unlocking the legacy skill tree",
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


test("legacy skill tree is gated by legacy upgrade", () => {
  const legacyTree = TREES.find((t) => t.id === "legacy")!;
  assert.equal(legacyTree.gate, "legacy");

  const g = new Game(defaults());
  // Quality is the root of the legacy tree
  assert.equal(skillAvailable("quality", g.save.upgrades), false);

  g.save.upgrades.legacy = 1;
  assert.equal(skillAvailable("quality", g.save.upgrades), true);
});
