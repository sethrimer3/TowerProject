import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { outsideWeather } from "../src/outside.ts";

/** A game with Warp claimed and `floor`'s area mastered in Tower I. */
function warpable(floor: number) {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.tower.reached = 44;
  g.save.tower.tiersOpen = 2;
  g.save.tower.tierRecords["2"] = { best: 44, reached: 44 };
  g.claimGoal(1, 40, false);
  g.claimGoal(2, 40, false);
  g.save.goals.mastered[1] = [floor];
  return g;
}

test("Retry starts a new run, with a new seed, on floor 1 after a run begun there", () => {
  const g = warpable(40);
  g.enterRun();
  assert.equal(g.retryHeight, 0);
  const seed = g.run.seed;
  assert.ok(g.retry("Run ended"));
  assert.ok(!g.run.outside);
  assert.equal(g.run.height, 0);
  assert.notEqual(g.run.seed, seed);
});

test("Retry after a Warp starts on the floor the run warped to, and it survives a reload", () => {
  const g = warpable(40);
  assert.ok(g.warp(1, 40));
  assert.equal(g.retryHeight, 40);
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(reloaded.retryHeight, 40);
  const seed = g.run.seed;
  assert.ok(g.retry("Run ended"));
  assert.ok(!g.run.outside);
  assert.equal(g.run.height, 40);
  assert.equal(g.towerRun.start, 40);
  assert.notEqual(g.run.seed, seed);
});

test("Retry isn't offered in the forest", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  assert.equal(g.retryHeight, null);
  assert.equal(g.retry("x"), false);
});

test("each tower's forest keeps its weather while the player switches between towers, until a run begins", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.tower.tiersOpen = 3;
  const weatherOne = outsideWeather(g.run.seed), seedOne = g.run.seed;
  g.selectTier(2);
  const seedTwo = g.run.seed;
  g.selectTier(3);
  const seedThree = g.run.seed;
  g.selectTier(1);
  assert.equal(g.run.seed, seedOne);
  assert.equal(outsideWeather(g.run.seed), weatherOne);
  g.selectTier(2);
  assert.equal(g.run.seed, seedTwo);
  g.selectTier(3);
  assert.equal(g.run.seed, seedThree);
  // Beginning a run forgets them: after it, each forest is rolled afresh.
  g.enterRun();
  g.finish("Run ended");
  g.selectTier(1);
  assert.notEqual(g.run.seed, seedOne);
});
