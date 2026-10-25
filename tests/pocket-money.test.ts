import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { cost } from "../src/progression/upgrades.ts";
import { RESEARCH } from "../src/progression/archives.ts";
import { playedSave } from "./first-skills.ts";

test("Pocket Money costs 1 Inspiration after Into the depths, and opens research priced like Potion HP", () => {
  const g = new Game(playedSave());
  g.save.tower.inspiration = 1000;
  assert.equal(cost("pocketMoney", 0), 1);
  for (const id of ["combatStance", "buildout", "trainers", "largerHand", "shroud", "critical", "archives"] as const) assert.ok(g.skills.buy(id));
  assert.equal(g.skills.buy("pocketMoney"), false, "waits for Into the depths");
  assert.ok(g.skills.buy("delve"));
  assert.ok(g.skills.buy("pocketMoney"));
  assert.deepEqual(RESEARCH.pocketMoney.requires, [{ upgrade: "pocketMoney" }]);
  const ours = RESEARCH.pocketMoney.levels, theirs = RESEARCH.potionHp.levels;
  assert.deepEqual(ours.map((l) => [l.gold, l.hours]), theirs.map((l) => [l.gold, l.hours]));
  assert.ok(ours.every((l) => l.effect.target === "startingSilver" && l.effect.op === "add" && l.effect.value === 5));
});

test("each Pocket Money level puts 5 Silver in hand as a run goes inside, in both modes", () => {
  for (const mode of ["tower", "delve"] as const) {
    const g = new Game(playedSave());
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
