import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";

/** A new hero inside a run on floor 1, the hand playing. */
function inside() {
  const s = defaults();
  s.tutorials.climb = true;
  const g = new Game(s);
  if (g.run.outside) g.enterRun();
  assert.ok(!g.run.outside && g.auto);
  return g;
}

test("a new hero walks at 2 steps a second, and the forest at least 3", () => {
  const g = inside();
  assert.equal(g.save.settings.speed, 2);
  assert.equal(g.stepsPerSecond, 2);
  g.newRun({ outside: true });
  assert.equal(g.stepsPerSecond, 3, "the forest walks at 3 when the run's speed was slower");
  g.save.archives.levels.moveSpeed = 2;
  g.save.settings.speed = 5;
  assert.equal(g.stepsPerSecond, 5, "faster than 3, the forest keeps the run's speed");
  assert.equal(g.changeSpeed(1), false, "the arrows are the run's alone");
});

test("the arrows slow to 0, pausing the hand, and play starts again at 1", () => {
  const g = inside();
  assert.ok(g.changeSpeed(-1));
  assert.equal(g.stepsPerSecond, 1);
  assert.ok(g.auto, "1 step a second still plays");
  assert.ok(g.changeSpeed(-1));
  assert.equal(g.stepsPerSecond, 0);
  assert.equal(g.auto, false, "0 pauses the hand");
  assert.equal(g.changeSpeed(-1), false, "no slower than 0");
  g.toggleAuto();
  assert.ok(g.auto);
  assert.equal(g.stepsPerSecond, 1, "play brings the speed back to 1");
  g.changeSpeed(-1);
  g.changeSpeed(1);
  assert.ok(g.auto && g.stepsPerSecond === 1, "speeding up from 0 plays the hand");
});

test("the arrows go no faster than research allows", () => {
  const g = inside();
  g.save.tutorials.speed = true;
  assert.ok(g.changeSpeed(1));
  assert.equal(g.stepsPerSecond, 3);
  assert.equal(g.changeSpeed(1), false, "3 is the most without research");
  g.save.archives.levels.moveSpeed = 1;
  assert.ok(g.changeSpeed(1));
  assert.equal(g.stepsPerSecond, 4);
  assert.equal(decode(JSON.stringify(g.save)).settings.speed, 4);
  g.save.settings.speed = 0;
  assert.equal(decode(JSON.stringify(g.save)).settings.speed, 0, "a save keeps the hand slowed to 0");
});

test("the second floor's lesson pauses the hand until › reaches 3", () => {
  const g = inside();
  assert.equal(g.teachesSpeed, false, "not on the first floor");
  g.advanceTowerRoom();
  assert.equal(g.run.height, 1);
  assert.ok(g.teachesSpeed);
  assert.equal(g.auto, false, "the lesson pauses the hand");
  g.toggleAuto();
  assert.equal(g.auto, false, "play waits for the arrow");
  assert.equal(g.changeSpeed(-1), false, "‹ waits too");
  assert.ok(g.changeSpeed(1));
  assert.equal(g.stepsPerSecond, 3);
  assert.ok(g.save.tutorials.speed, "the lesson is done for good");
  assert.ok(g.auto, "the hand plays on");
  assert.equal(g.teachesSpeed, false);
  g.changeSpeed(-1);
  g.advanceTowerRoom();
  assert.ok(g.auto, "slower again later, no lesson comes back");
});

test("a hero already at 3 on the second floor passes the lesson by", () => {
  const g = inside();
  g.save.settings.speed = 3;
  g.advanceTowerRoom();
  assert.ok(g.save.tutorials.speed);
  assert.ok(g.auto);
  assert.equal(decode(JSON.stringify(g.save)).tutorials.speed, true);
});
