import { test } from "node:test";
import assert from "node:assert/strict";
import { TowerClimb } from "../src/tower/climb.ts";
import { point, type TowerRun } from "../src/entities.ts";
import { TOWER_SECTION, TOWER_START_X } from "../src/config.ts";

function run(height = 0): TowerRun {
  return {
    seed: 7, height, maxHeight: height, kills: 0, treasures: 0, changes: {}, floor: 0, damaged: false,
    player: { x: TOWER_START_X, y: 0, hp: 10, maxHp: 10, attack: 1, defense: 1, keys: { yellow: 0, blue: 0, red: 0 } },
  };
}
/** Takes every enemy off the run's current floor. */
function clearFloor(r: TowerRun) {
  for (const [k, t] of new TowerClimb(r).board().cells) if (t.kind === "enemy") r.changes[k] = { kind: "floor" };
}

test("climbing stands at the next floor's entrance and forgets the floor left behind", () => {
  const r = run(), climb = new TowerClimb(r);
  r.changes[point(1, 1)] = { kind: "floor" };
  const { board } = climb.up();
  assert.equal(r.height, 1);
  assert.equal(r.maxHeight, 1);
  assert.deepEqual(r.changes, {});
  assert.equal(board.changes, r.changes, "the board edits the run's current floor");
  assert.deepEqual({ x: r.player.x, y: r.player.y }, { x: TOWER_START_X, y: 0 });
  assert.ok(!("floors" in r), "no other floor is kept");
});

test("no floor has stairs down: the hero arrives on open floor", () => {
  const r = run(), climb = new TowerClimb(r);
  for (let h = 0; h < TOWER_SECTION + 2; h++) {
    const board = climb.up().board;
    assert.equal(board.tile(TOWER_START_X, 0).kind, "floor");
    for (const t of board.cells.values()) assert.notEqual(t.kind as string, "stairsDown");
  }
});

test("a section's first floor is a section start", () => {
  const r = run(TOWER_SECTION - 1), climb = new TowerClimb(r);
  assert.equal(climb.up().sectionStart, true);
  assert.equal(climb.up().sectionStart, false);
});

test("climbing past a floor with an enemy on it marks the area not cleared", () => {
  const r = run(), climb = new TowerClimb(r);
  clearFloor(r);
  climb.up();
  assert.equal(r.enemiesLeft, undefined, "a cleared floor leaves nothing behind");
  climb.up();
  assert.equal(r.enemiesLeft, true);
  clearFloor(r);
  climb.up();
  assert.equal(r.enemiesLeft, true, "it stays marked for the rest of the area");
});
