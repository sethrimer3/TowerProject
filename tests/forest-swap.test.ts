import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { OUTSIDE_START_Y, OutsideWorld } from "../src/outside.ts";
import { MODES } from "../src/modes.ts";
import { xpForLevel } from "../src/config.ts";
import { trainNow } from "./train-now.ts";

// The forest's sign down the path to the other mode's forest, the run paused
// behind the Research page, and training bought mid-run surviving undo.

/** A game in the Tower's forest, its lessons done. */
function forest(delve = true) {
  const s = defaults();
  s.tutorials.climb = true;
  s.tutorials.enter = true;
  if (delve) s.upgrades.delve = 1;
  const g = new Game(s);
  g.finish("again");
  return g;
}

test("a forest run's hero starts partway up the path", () => {
  const g = forest();
  assert.ok(g.run.outside);
  assert.deepEqual([g.run.player.x, g.run.player.y], [MODES.tower.entranceX, OUTSIDE_START_Y]);
});

test("the sign leads to the other mode's forest only once the Delve is open", () => {
  const locked = forest(false);
  assert.ok(!locked.canSwapForest);
  assert.equal(locked.swapForest(), false);
  assert.equal(locked.mode, "tower");

  const g = forest();
  assert.ok(g.canSwapForest);
  assert.ok(g.swapForest());
  // The Delve's first visit starts in its forest, not inside a run.
  assert.equal(g.mode, "delve");
  assert.ok(g.run.outside && g.world instanceof OutsideWorld);
  assert.deepEqual([g.run.player.x, g.run.player.y], [MODES.delve.entranceX, OUTSIDE_START_Y]);
  assert.ok(g.save.tutorials.delve, "the Delve lesson is done");
  assert.ok(g.swapForest());
  assert.equal(g.mode, "tower");
  assert.ok(g.run.outside);
});

test("walking down onto the foot of the path swaps forests, arriving at the start", () => {
  const g = forest();
  for (let i = 0; i < OUTSIDE_START_Y - 1; i++) assert.ok(g.move(0, -1, true));
  assert.equal(g.mode, "tower");
  assert.ok(g.move(0, -1, true));
  assert.equal(g.mode, "delve");
  assert.equal(g.run.player.y, OUTSIDE_START_Y);
  // The forest left behind keeps its hero at the start too, not on the exit.
  assert.equal(g.save.tower.run?.player.y, OUTSIDE_START_Y);
});

test("a reload mid-Delve-run opens the Delve, where it was", () => {
  const g = forest();
  g.swapForest();
  g.enterRun();
  assert.ok(g.mode === "delve" && !g.run.outside);
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(loaded.mode, "delve");
  assert.ok(!loaded.run.outside);
  // A Tower run inside keeps the Tower first.
  const tower = forest();
  tower.enterRun();
  assert.equal(new Game(decode(JSON.stringify(tower.save))).mode, "tower");
});

test("a page over the board pauses the hand, and leaving it plays on as it was", () => {
  const g = forest();
  g.enterRun();
  assert.ok(!g.run.outside && g.auto);
  g.changeSpeed(1);
  const speed = g.save.settings.speed;
  g.pauseForPage();
  assert.ok(!g.auto, "paused behind the page");
  g.resumeFromPage();
  assert.ok(g.auto);
  assert.equal(g.save.settings.speed, speed);

  // A hand paused when the page opened stays paused.
  g.toggleAuto();
  assert.ok(!g.auto);
  g.pauseForPage();
  g.resumeFromPage();
  assert.ok(!g.auto);
  // In the forest there is nothing to hold.
  g.finish("again");
  g.pauseForPage();
  g.resumeFromPage();
  assert.ok(!g.auto);
});

test("training bought mid-run reaches the run's hero and undo keeps it", () => {
  const s = defaults();
  s.tutorials.climb = true;
  s.upgrades.inspirationUndos = 1;
  s.xp = xpForLevel(10);
  const g = new Game(s);
  // A step to undo, then a rank of ATK bought while the run goes on.
  const step = [[0, 1], [1, 0], [-1, 0]].find(([dx, dy]) => g.world.tile(g.run.player.x + dx, g.run.player.y + dy).kind === "floor")!;
  assert.ok(g.move(step[0], step[1], true));
  const attack = g.run.player.attack;
  assert.ok(trainNow(g, "attack"));
  const trained = g.run.player.attack;
  assert.ok(trained > attack, "the rank reaches the run at once");
  assert.ok(g.undo());
  assert.equal(g.run.player.attack, trained, "undo takes back the step, not the rank");
});
