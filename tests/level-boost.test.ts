import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { goldMultipliers, goldMultiplierTotal } from "../src/economy/gold-multipliers.ts";
import { LEVEL_BOOST_FACTOR, LEVEL_BOOST_MS, levelBoostLeft, levelBoostTime } from "../src/economy/level-boost.ts";
import { xpForLevel, levelForXp } from "../src/progression/xp.ts";

const NOW = 5_000_000;

/** A Tower run inside on a clock fixed at `now`, with no Gold bonus but the tower's ×1. */
function inside(now = NOW) {
  const save = defaults();
  save.themes = [];
  const g = new Game(save);
  g.clock = () => now;
  g.newRun({ seed: 7 });
  return g;
}

/** Gives the hero just enough XP to reach the next level. */
function levelUp(g: Game) {
  g.addXp(xpForLevel(levelForXp(g.save.xp) + 1) - g.save.xp);
}

test("a level reached inside a run starts the Level-up Boost: Gold ×3 for 10 minutes", () => {
  const g = inside();
  assert.equal(goldMultipliers(g.goldContext).some((m) => m.id === "levelUp"), false, "no line before a level-up");
  levelUp(g);
  assert.equal(g.run.levelBoostUntil, NOW + LEVEL_BOOST_MS);
  const line = goldMultipliers(g.goldContext).find((m) => m.id === "levelUp")!;
  assert.deepEqual(line, { id: "levelUp", name: "Level-up Boost", factor: LEVEL_BOOST_FACTOR });
  assert.equal(goldMultiplierTotal(goldMultipliers(g.goldContext)), 3);
  assert.equal(new RunPurse(g.save, g.mode, g.run, () => 0.5, NOW).gold(10), 30, "paying counts it");
  // Once it runs out, the line goes and Gold is paid plain again.
  const later = NOW + LEVEL_BOOST_MS;
  assert.equal(goldMultipliers({ ...g.goldContext, now: later }).some((m) => m.id === "levelUp"), false);
  assert.equal(new RunPurse(g.save, g.mode, g.run, () => 0.5, later).gold(10), 10);
});

test("another level-up starts the boost's time over rather than adding to it", () => {
  const g = inside();
  levelUp(g);
  g.clock = () => NOW + 4 * 60_000;
  levelUp(g);
  assert.equal(levelBoostLeft(g.run, NOW + 4 * 60_000), LEVEL_BOOST_MS);
  assert.equal(goldMultiplierTotal(goldMultipliers(g.goldContext)), 3, "never stacks past ×3");
});

test("XP gained in the forest starts no boost, and a new run starts without one", () => {
  const g = inside();
  levelUp(g);
  g.newRun({ outside: true });
  assert.equal(g.run.levelBoostUntil, undefined);
  levelUp(g);
  assert.equal(g.run.levelBoostUntil, undefined);
});

test("the boost's end is saved with the run", () => {
  const g = inside();
  levelUp(g);
  const back = decode(JSON.stringify(g.save));
  assert.equal(back.tower.run?.levelBoostUntil, NOW + LEVEL_BOOST_MS);
});

test("the portrait's countdown reads minutes and seconds", () => {
  assert.equal(levelBoostTime(LEVEL_BOOST_MS), "10:00");
  assert.equal(levelBoostTime(LEVEL_BOOST_MS - 1), "10:00", "rounded up to the second");
  assert.equal(levelBoostTime(59_001), "1:00");
  assert.equal(levelBoostTime(5_000), "0:05");
});
