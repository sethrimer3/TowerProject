import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode } from "../src/save/save.ts";
import { playedSave } from "./first-skills.ts";

/** A new hero inside a run on floor 1, the hand playing. */
function inside() {
  const s = playedSave();
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

/** Plays the hand on until the run has taken `steps` steps, or it stops. */
function walk(g: Game, steps: number) {
  for (let turn = 0; turn < 500 && g.auto && (g.run.notes?.steps ?? 0) < steps; turn++) g.autoTurn();
}

test("ten steps into the first floor, the lesson pauses the hand until › reaches 3", () => {
  const g = inside();
  walk(g, 9);
  assert.equal(g.run.notes?.steps, 9);
  assert.equal(g.teachesSpeed, false, "not before the tenth step");
  assert.ok(g.auto);
  walk(g, 10);
  assert.equal(g.run.height, 0, "still on the first floor");
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
  g.newRun({ outside: false });
  walk(g, 20);
  assert.ok(g.auto, "slower again later, no lesson comes back");
});

test("the lesson waits for Door & Key, and comes only on the Tower's first floor", () => {
  const g = inside();
  g.save.upgrades.cardDoorKey = 0;
  walk(g, 10);
  assert.equal(g.teachesSpeed, false, "not without Door & Key");
  g.save.upgrades.cardDoorKey = 1;
  assert.ok(g.teachesSpeed, "owned, the steps already taken count");
  g.advanceTowerRoom();
  assert.equal(g.teachesSpeed, false, "not past the first floor");
});

test("a hero already at 3 on the tenth step passes the lesson by", () => {
  const g = inside();
  g.save.settings.speed = 3;
  walk(g, 10);
  assert.ok(g.save.tutorials.speed);
  assert.ok(g.auto);
  assert.equal(decode(JSON.stringify(g.save)).tutorials.speed, true);
});
