import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFEND_WIDTH,
  DEFEND_HEIGHT,
  createDefendState,
  isBuildable,
  placeBuilding,
  removeBuilding,
  moveKeep,
  damageKeep,
  tileAt,
} from "../src/defend.ts";

test("board is 9 wide and 13 tall", () => {
  const s = createDefendState();
  assert.equal(DEFEND_WIDTH, 9);
  assert.equal(DEFEND_HEIGHT, 13);
  assert.equal(s.tiles.length, 13);
  assert.equal(s.tiles[0].length, 9);
});

test("top row can never be built on", () => {
  for (let x = 0; x < DEFEND_WIDTH; x++) {
    assert.equal(isBuildable(x, 0), false);
  }
  const s = createDefendState();
  assert.equal(placeBuilding(s, 3, 0, "wall"), false);
  assert.equal(tileAt(s, 3, 0)!.kind, "empty");
});

test("every other row is buildable", () => {
  for (let y = 1; y < DEFEND_HEIGHT; y++) {
    for (let x = 0; x < DEFEND_WIDTH; x++) {
      assert.equal(isBuildable(x, y), true);
    }
  }
});

test("keep starts centered and can be moved but never deleted", () => {
  const s = createDefendState();
  assert.equal(s.keep.x, 4);
  assert.equal(s.keep.y, 6);
  assert.equal(tileAt(s, 4, 6)!.kind, "keep");

  assert.equal(removeBuilding(s, 4, 6), false);
  assert.equal(tileAt(s, 4, 6)!.kind, "keep");

  assert.equal(moveKeep(s, 5, 6), true);
  assert.equal(tileAt(s, 4, 6)!.kind, "empty");
  assert.equal(tileAt(s, 5, 6)!.kind, "keep");
  assert.deepEqual(s.keep, { x: 5, y: 6 });

  assert.equal(moveKeep(s, 0, 0), false, "cannot move keep onto the reserved top row");
});

test("cannot build on top of an existing building or the keep", () => {
  const s = createDefendState();
  assert.equal(placeBuilding(s, 1, 1, "wall"), true);
  assert.equal(placeBuilding(s, 1, 1, "barracks"), false);
  assert.equal(placeBuilding(s, s.keep.x, s.keep.y, "wall"), false);
});

test("buildings can be removed but the keep cannot", () => {
  const s = createDefendState();
  placeBuilding(s, 2, 2, "wall");
  assert.equal(removeBuilding(s, 2, 2), true);
  assert.equal(tileAt(s, 2, 2)!.kind, "empty");
  assert.equal(removeBuilding(s, s.keep.x, s.keep.y), false);
});

test("keep falling loses the game", () => {
  const s = createDefendState();
  assert.equal(s.lost, false);
  damageKeep(s, s.keepMaxHp - 1);
  assert.equal(s.lost, false);
  damageKeep(s, 1);
  assert.equal(s.keepHp, 0);
  assert.equal(s.lost, true);
});
