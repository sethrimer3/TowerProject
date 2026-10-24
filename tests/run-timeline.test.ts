import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { RunTimeline } from "../src/run-timeline.ts";
import type { MoveSnapshot, TowerRun } from "../src/runs.ts";

/** A Tower run inside, on floor `height`, and its timeline with `undos`. */
function towerAt(height: number, undos = 5) {
  const g = new Game(defaults());
  g.newRun({ seed: 3 });
  const run = g.run as TowerRun;
  run.height = height;
  return { g, run, timeline: new RunTimeline<TowerRun>(g.save, "tower", () => undos) };
}

/** A snapshot of the live run as it stands, marked quiet when asked. */
const moment = (timeline: RunTimeline<TowerRun>, quiet = false): MoveSnapshot<TowerRun> => ({ ...timeline.snapshot(), ...(quiet ? { quiet: true as const } : {}) });

test("undo never restores a snapshot taken on another floor", () => {
  const { g, run, timeline } = towerAt(4);
  timeline.remember(moment(timeline));
  run.height = 5;
  assert.equal(timeline.undo(false, () => assert.fail("restored across floors")), null);
  assert.equal(g.save.tower.history.length, 0, "the other floor's history is forgotten");
  assert.equal(run.undosUsed ?? 0, 0, "no undo spent");
});

test("stepping onto another floor forgets the history; staying keeps it", () => {
  const { g, run, timeline } = towerAt(4);
  timeline.remember(moment(timeline));
  timeline.standOn();
  assert.equal(g.save.tower.history.length, 1);
  run.height = 5;
  timeline.standOn();
  assert.equal(g.save.tower.history.length, 0);
});

test("undo goes back past quiet steps to the last that did something, and spends one", () => {
  const { g, run, timeline } = towerAt(2);
  const restored: number[] = [];
  for (const [x, quiet] of [[1, false], [2, true], [3, true]] as const) {
    run.player.x = x;
    timeline.remember(moment(timeline, quiet));
  }
  assert.equal(timeline.undo(false, (s) => { restored.push(s.run.player.x); g.save.tower.run = s.run; }), "move");
  assert.deepEqual(restored, [1]);
  assert.equal(g.save.tower.run!.undosUsed, 1);
  assert.equal(timeline.undosLeft, 4);
});

test("a step that pays out is no quiet step for undo to pass", () => {
  const { g, run, timeline } = towerAt(2);
  run.player.x = 1;
  timeline.remember(moment(timeline));
  run.player.x = 2;
  timeline.remember(moment(timeline, true));
  timeline.eventful();
  let back = -1;
  timeline.undo(false, (s) => { back = s.run.player.x; g.save.tower.run = s.run; });
  assert.equal(back, 2);
});

test("a fallen hero's undo takes back the fight it fell in", () => {
  const { g, run, timeline } = towerAt(2);
  run.player.x = 7;
  const before = moment(timeline);
  timeline.remember(before);
  timeline.fall(before, "a Bat");
  let back = -1;
  assert.equal(timeline.undo(true, (s) => { back = s.run.player.x; g.save.tower.run = s.run; }), "fall");
  assert.equal(back, 7);
  assert.equal(g.save.tower.fall, null);
});

test("the timeline holds no more moves than undos are left, and none once they are spent", () => {
  const { g, timeline } = towerAt(1, 2);
  for (let i = 0; i < 4; i++) timeline.remember(moment(timeline));
  assert.equal(g.save.tower.history.length, 2);
  g.save.tower.run!.undosUsed = 2;
  assert.equal(timeline.canUndo, false);
  assert.equal(timeline.undo(false, () => assert.fail("no undo left")), null);
});

test("every copy undo may restore is reached: the live run, each snapshot and a fall's", () => {
  const { g, timeline } = towerAt(1);
  const before = moment(timeline);
  timeline.remember(moment(timeline));
  timeline.remember(moment(timeline));
  timeline.fall(before, "a Bat");
  const runs = timeline.runs();
  assert.equal(runs.length, 4);
  assert.equal(runs[0], g.save.tower.run);
  assert.equal(new Set(runs).size, 4, "each a copy of its own");
});

test("a Tower run reloaded under a newer layout forgets its undo history, as a Delve run does", () => {
  const { g, timeline } = towerAt(1);
  timeline.remember(g.snapshot());
  g.run.layoutVersion = -1;
  g.loadMode();
  assert.equal(g.save.tower.history.length, 0);
  assert.equal(g.canUndo, false);
});
