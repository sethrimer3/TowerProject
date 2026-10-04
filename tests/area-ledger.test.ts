import { test } from "node:test";
import assert from "node:assert/strict";
import { AreaLedger, CLEARED_INSPIRATION } from "../src/tower/area-ledger.ts";
import { TowerClimb } from "../src/tower/climb.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { ENTRY } from "../src/tower/embedder.ts";
import { defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { areaCleared, areaMastered, canWarp, decodeGoals } from "../src/goals.ts";
import { TOWER_START_X } from "../src/config.ts";
import type { Tile, TowerRun } from "../src/entities.ts";

/** Takes every enemy off the run's current floor. */
function clearFloor(run: TowerRun) {
  const board = new TowerClimb(run).board(run.height);
  for (const [k, t] of board.cells) if (t.kind === "enemy") run.changes[k] = { kind: "floor" };
}
/** A run climbed from floor 1 (height 0) onto `to`, its floors cleared of
 * enemies unless `leave` names one left as generated. */
function climbed(to: number, { leave = -1, damaged = false, seed = 7, tier }: { leave?: number; damaged?: boolean; seed?: number; tier?: number } = {}) {
  const run = { seed, height: 0, damaged, changes: {}, floors: {}, player: { x: TOWER_START_X, y: 0 }, ...(tier ? { tier } : {}) } as unknown as TowerRun;
  const climb = new TowerClimb(run);
  let board!: RoomWorld;
  while (run.height < to) {
    if (run.height !== leave) clearFloor(run);
    board = climb.up().board;
    // A real climb starts the new area undamaged, so a test marks damage per area.
    if (run.height % 10 === 0 && run.height < to) new AreaLedger(defaults()).enter(run, board);
  }
  return { run, board };
}
const entry = (run: TowerRun): Tile | undefined => run.changes[`${ENTRY[0]},${ENTRY[1]}`];

test("an area climbed without damage and cleared earns both rewards, with their chests in front of the hero", () => {
  const save = defaults(), { run, board } = climbed(10);
  const before = save.tower.inspiration;
  assert.deepEqual(new AreaLedger(save).enter(run, board), ["mastered", "cleared"]);
  assert.ok(areaMastered(save, 1, 10) && areaCleared(save, 1, 10));
  assert.equal(save.tower.inspiration - before, CLEARED_INSPIRATION);
  assert.equal(save.tower.runCurrency, CLEARED_INSPIRATION);
  assert.deepEqual(entry(run), { kind: "reward", tier: "gold" });
  const chests = Object.values(run.changes).filter((t) => t.kind === "reward");
  assert.deepEqual(chests.map((t) => t.tier).sort(), ["gold", "silver"]);
  assert.equal(run.damaged, false);
});

test("damage anywhere in the area costs its mastery, and an enemy left costs its clearing", () => {
  const hurt = defaults(), a = climbed(10, { damaged: true });
  assert.deepEqual(new AreaLedger(hurt).enter(a.run, a.board), ["cleared"]);
  assert.equal(a.run.damaged, false, "the next area starts undamaged");
  assert.deepEqual(entry(a.run), { kind: "reward", tier: "silver" });

  const left = defaults(), b = climbed(10, { leave: 6 });
  assert.deepEqual(new AreaLedger(left).enter(b.run, b.board), ["mastered"]);
  assert.equal(left.tower.inspiration, 0);
});

test("only an area's first floor judges it, and each reward pays once per tower", () => {
  const save = defaults(), ledger = new AreaLedger(save);
  const mid = climbed(7);
  assert.deepEqual(ledger.enter(mid.run, mid.board), []);
  const first = climbed(10);
  assert.equal(ledger.enter(first.run, first.board).length, 2);
  const again = climbed(10, { seed: 9 });
  assert.deepEqual(ledger.enter(again.run, again.board), [], "already earned in Tower I");
  assert.equal(entry(again.run), undefined, "no chest for a reward already had");
  const otherTower = climbed(10, { tier: 2 });
  assert.equal(ledger.enter(otherTower.run, otherTower.board).length, 2, "each tower's areas are its own");
});

test("an area past the last checkpoint can be cleared but not mastered", () => {
  const save = defaults(), { run, board } = climbed(110);
  assert.deepEqual(new AreaLedger(save).enter(run, board), ["cleared"]);
  assert.deepEqual(save.goals.cleared[1], [110]);
  assert.equal(save.goals.mastered[1], undefined);
});

test("warping to a checkpoint takes Warp and its area mastered", () => {
  const save = defaults();
  save.goals.claimed[1] = [40];
  save.tower.reached = 45;
  assert.ok(!canWarp(save, 1, 20), "completed but not mastered");
  save.goals.mastered[1] = [20];
  assert.ok(canWarp(save, 1, 20));
  save.goals.claimed[1] = [];
  assert.ok(!canWarp(save, 1, 20), "mastered, but Warp not claimed");
});

test("the Goals save keeps areas by tower: mastered at checkpoints, cleared on any tenth floor", () => {
  const goals = decodeGoals({ mastered: { 1: [10, 10, 15, 110], x: [10] }, cleared: { 1: [120, 10, 7, -10], 2: "no" } });
  assert.deepEqual(goals.mastered, { 1: [10] });
  assert.deepEqual(goals.cleared, { 1: [10, 120] });
});

test("climbing onto an area's first floor pays at once; opening the chest shows it and pays nothing more", () => {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  g.loadMode();
  const run = g.towerRun;
  // Floors 1 to 9 behind the hero, cleared; floor 10 cleared under it.
  for (let h = 0; h < 9; h++) {
    clearFloor(run);
    new TowerClimb(run).up();
  }
  clearFloor(run);
  g.loadMode();
  const before = g.save.tower.inspiration;
  g.advanceTowerRoom();
  assert.equal(g.run.height, 10);
  assert.equal(g.save.tower.inspiration - before, CLEARED_INSPIRATION + 1, "and +1 for the new floor");
  assert.deepEqual(entry(g.towerRun), { kind: "reward", tier: "gold" });
  assert.match(g.message, /mastered and cleared/);
  const paid = g.save.tower.inspiration;
  assert.ok(g.move(0, 1, true));
  assert.equal(g.areaBurst?.reward, "mastered");
  assert.equal(g.save.tower.inspiration, paid, "the chest pays nothing more");
  g.undo();
  assert.equal(g.areaBurst, null);
  assert.equal(g.save.tower.inspiration, paid, "undo never takes an area's reward back");
  assert.ok(areaMastered(g.save, 1, 10));
});

test("fight damage costs the area's mastery; a Heart Door's toll does not", () => {
  const g = new Game(defaults()), w = g.world as RoomWorld, p = g.run.player;
  w.cells.set(`${p.x},${p.y + 1}`, { kind: "door", door: { type: "fullHp" } });
  assert.ok(g.move(0, 1, true));
  assert.equal(g.run.player.hp, 1, "the Heart Door drained the hero to 1 HP");
  assert.equal(g.towerRun.damaged, false);
  g.run.player.hp = 1000;
  w.cells.set(`${p.x},${p.y + 1}`, { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 50, defense: 0, tier: 0, strength: "normal" } });
  g.run.player.attack = 0.5;
  assert.ok(g.move(0, 1, true));
  assert.equal(g.towerRun.damaged, true);
});
