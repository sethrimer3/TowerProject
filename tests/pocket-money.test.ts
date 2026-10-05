import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { cost } from "../src/config.ts";
import { RESEARCH } from "../src/archives.ts";

test("Pocket Money costs 1 Inspiration after Into the depths, and opens research priced like Gold / Floor", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  assert.equal(cost("pocketMoney", 0), 1);
  for (const id of ["combatStance", "buildout", "trainers", "largerHand", "archives"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("pocketMoney"), false, "waits for Into the depths");
  assert.ok(g.buy("delve"));
  assert.ok(g.buy("pocketMoney"));
  assert.deepEqual(RESEARCH.pocketMoney.requires, [{ upgrade: "pocketMoney" }]);
  const ours = RESEARCH.pocketMoney.levels, theirs = RESEARCH.floorGold.levels;
  assert.deepEqual(ours.map((l) => [l.gold, l.hours]), theirs.map((l) => [l.gold, l.hours]));
  assert.ok(ours.every((l) => l.effect.target === "startingSilver" && l.effect.op === "add" && l.effect.value === 5));
});

test("each Pocket Money level puts 5 Silver in hand as a run goes inside, in both modes", () => {
  for (const mode of ["tower", "delve"] as const) {
    const g = new Game(defaults());
    g.save.upgrades.delve = 1;
    g.switchMode(mode);
    g.newRun({ outside: true, seed: 3 });
    assert.equal(g.silver, 0);
    g.enterRun();
    assert.equal(g.silver, 0, "nothing without research");
    g.save.archives.levels.pocketMoney = 3;
    g.newRun({ outside: true, seed: 3 });
    assert.equal(g.silver, 0, "none in the forest");
    g.enterRun();
    assert.equal(g.silver, 15, mode);
    g.newRun({ seed: 4 });
    assert.equal(g.silver, 15, "a run started inside (a warp) too");
  }
});
