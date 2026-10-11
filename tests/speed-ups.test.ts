import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelResearch, jobProgress, settleArchives, startResearch, decodeArchives } from "../src/archives.ts";
import { CELLS_PER_HOUR, SPEED_UP_FACTORS, jobAt, speedUpCells, startSpeedUp } from "../src/speed-ups.ts";
import { decode, defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import type { Enemy } from "../src/entities.ts";

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 11, 12);

/** A profile researching Focus Count's first level (8 hours) from T0,
 * holding `cells` Cells. */
function researching(cells = 10_000) {
  const save = defaults();
  save.upgrades.archives = 1;
  save.upgrades.focus = 1;
  save.gold = 1_000_000;
  save.cells = cells;
  assert.ok(startResearch(save, 0, "focusCount", T0));
  return save;
}

test("Speed Ups cost 15, 75, 450 and 3,150 Cells an hour by factor", () => {
  assert.deepEqual(SPEED_UP_FACTORS.map((f) => CELLS_PER_HOUR[f]), [15, 75, 450, 3150]);
  assert.equal(speedUpCells(4, 24), 75_600);
  assert.equal(speedUpCells(1.5, 8), 120);
});

test("a Speed Up makes the research left count down that much faster while it lasts", () => {
  const save = researching();
  const slot = save.archives.slots[0];
  assert.ok(startSpeedUp(save, slot, 2, 1, false, T0));
  assert.equal(save.cells, 10_000 - 75);
  // Half an hour in, an hour of research is done: 7 hours left of 8.
  const half = jobAt(slot, T0 + HOUR / 2)!;
  assert.equal(half.completesAt - (T0 + HOUR / 2), 7 * HOUR);
  assert.equal(jobProgress(half, T0 + HOUR / 2), 1 / 8);
  // The hour gained comes off the end: done at 7 hours, not 8.
  assert.deepEqual(settleArchives(save, T0 + 7 * HOUR - 1), []);
  assert.equal(slot.speedUp, undefined, "it ended after its hour");
  const done = settleArchives(save, T0 + 7 * HOUR);
  assert.deepEqual(done.map((r) => [r.research, r.level, r.at]), [["focusCount", 1, T0 + 7 * HOUR]]);
});

test("research done within a Speed Up completes at the faster rate, and the next level auto-continued keeps it", () => {
  const save = researching(20_000);
  const slot = save.archives.slots[0];
  slot.autoContinue = true;
  assert.ok(startSpeedUp(save, slot, 4, 4, false, T0));
  // 8 hours at 4x take 2; level 2's 16 hours then have 2 hours of 4x (8 hours' research) and 8 more at 1x, done at 12.
  const done = settleArchives(save, T0 + 2 * HOUR);
  assert.deepEqual(done.map((r) => r.at), [T0 + 2 * HOUR]);
  assert.equal(slot.job!.level, 2);
  assert.equal(slot.job!.completesAt, T0 + 18 * HOUR, "settled to now, its times read as they would with no boost from here");
  settleArchives(save, T0 + 3 * HOUR);
  assert.equal(slot.job!.completesAt, T0 + 15 * HOUR);
  assert.deepEqual(settleArchives(save, T0 + 12 * HOUR - 1), []);
  assert.deepEqual(settleArchives(save, T0 + 12 * HOUR).map((r) => r.level), [2]);
});

test("one Speed Up at a time, only on a busy archivist, and only with the Cells", () => {
  const save = researching(100);
  const slot = save.archives.slots[0];
  assert.equal(startSpeedUp(save, slot, 2, 4, false, T0), false, "300 Cells needed");
  assert.equal(save.cells, 100);
  assert.ok(startSpeedUp(save, slot, 1.5, 1, false, T0));
  assert.equal(startSpeedUp(save, slot, 1.5, 1, false, T0), false, "one is in progress");
  assert.equal(save.cells, 85);
  cancelResearch(save, 0, T0);
  delete slot.speedUp;
  assert.equal(startSpeedUp(save, slot, 1.5, 1, false, T0), false, "an idle archivist");
});

test("a queued Speed Up buys itself again as it ends, while the Cells are there", () => {
  const save = researching(160);
  const slot = save.archives.slots[0];
  assert.ok(startSpeedUp(save, slot, 2, 1, true, T0));
  settleArchives(save, T0 + HOUR);
  assert.equal(save.cells, 10, "bought again at its end");
  assert.equal(slot.speedUp?.endsAt, T0 + 2 * HOUR);
  settleArchives(save, T0 + 2 * HOUR);
  assert.equal(slot.speedUp, undefined, "10 Cells can't buy another");
  // 2 hours at 2x: 4 hours' research in 2, so 4 more to go.
  assert.equal(slot.job!.completesAt, T0 + 6 * HOUR);
});

test("stopping research under a Speed Up keeps the research done, not the time passed", () => {
  const save = researching();
  startSpeedUp(save, save.archives.slots[0], 3, 1, false, T0);
  settleArchives(save, T0 + HOUR);
  cancelResearch(save, 0, T0 + HOUR);
  assert.equal(save.archives.progress.focusCount, 3 / 8);
});

test("a Speed Up survives a save round trip, and a malformed one is dropped", () => {
  const save = researching();
  startSpeedUp(save, save.archives.slots[0], 3, 8, true, T0);
  const back = decode(JSON.stringify(save));
  assert.deepEqual(back.archives.slots[0].speedUp, save.archives.slots[0].speedUp);
  assert.equal(back.cells, save.cells);
  const raw = JSON.parse(JSON.stringify(save.archives));
  raw.slots[0].speedUp.factor = 5;
  assert.equal(decodeArchives(raw).slots[0].speedUp, undefined);
});

const enemy = (strength: Enemy["strength"]): Enemy => ({ name: "Test", hp: 10, attack: 1, defense: 0, strength });

test("a Greater Boss drops 1 Cell in Tower I, from 1 to the tower's number later, scaled by a badge, once per kill", () => {
  const purse = (tier: number, draws: number[]) => {
    const g = new Game(defaults());
    g.newRun({ seed: 3, height: 9 });
    (g.run as any).tier = tier;
    let i = 0;
    return { save: g.save, purse: new RunPurse(g.save, "tower", g.run, () => draws[i++] ?? 0) };
  };
  const one = purse(1, []);
  assert.equal(one.purse.enemyLoot(enemy("greaterBoss"), 4, 4).cells, 1);
  assert.equal(one.purse.enemyLoot(enemy("greaterBoss"), 4, 4).cells, 0, "undo and fight it again: nothing more");
  assert.equal(one.purse.enemyLoot(enemy("boss"), 5, 5).cells, 0, "only a Greater Boss");
  assert.equal(one.save.cells, 1);
  const fifth = purse(5, [0.99]);
  assert.equal(fifth.purse.enemyLoot(enemy("greaterBoss"), 4, 4).cells, 5);
  assert.equal(purse(5, [0]).purse.enemyLoot(enemy("greaterBoss"), 4, 4).cells, 1);
  assert.equal(purse(5, [0.5]).purse.enemyLoot(enemy("greaterBoss"), 4, 4, 1.2).cells, 3.6, "Effective's 20%");
});
