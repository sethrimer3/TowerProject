import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFEND_WIDTH,
  DEFEND_HEIGHT,
  DEFEND_STARTING_WALL_CAPACITY,
  createDefendState,
  isBuildable,
  placeBuilding,
  removeBuilding,
  moveKeep,
  damageKeep,
  tileAt,
  wallsPlaced,
  wallsRemaining,
  cityInterior,
  isInsideCityLimits,
  wallEdgesAt,
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
  assert.equal(placeBuilding(s, 1, 1, "barracks_swordsman"), false);
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

test("the player starts with nine city-wall tiles and can't place more than that", () => {
  const s = createDefendState();
  assert.equal(s.wallCapacity, DEFEND_STARTING_WALL_CAPACITY);
  assert.equal(wallsPlaced(s), 0);
  assert.equal(wallsRemaining(s), 9);
  for (let x = 0; x < 9; x++) assert.equal(placeBuilding(s, x, 1, "wall"), true);
  assert.equal(wallsPlaced(s), 9);
  assert.equal(wallsRemaining(s), 0);
  assert.equal(placeBuilding(s, 0, 2, "wall"), false, "no walls left to place");
});

test("without any enclosing walls, nothing counts as inside the city limits", () => {
  const s = createDefendState();
  assert.equal(cityInterior(s).size, 0);
  assert.equal(isInsideCityLimits(s, s.keep.x, s.keep.y), false);
  assert.equal(placeBuilding(s, 1, 1, "barracks_swordsman"), false, "no enclosed ground yet");
});

test("a closed ring of walls encloses its interior and adjacent walls merge their shared edge", () => {
  const s = createDefendState();
  s.wallCapacity = 20;
  const ring: [number, number][] = [[3, 5], [4, 5], [5, 5], [3, 6], [5, 6], [3, 7], [4, 7], [5, 7]];
  for (const [x, y] of ring) assert.equal(placeBuilding(s, x, y, "wall"), true);

  assert.equal(isInsideCityLimits(s, 4, 6), true, "the keep's tile is enclosed by the ring");
  assert.equal(isInsideCityLimits(s, 0, 1), false, "ground outside the ring is still open to the approach lane");

  const left = wallEdgesAt(s, 3, 5);
  const right = wallEdgesAt(s, 4, 5);
  assert.equal(left.right, false, "the shared edge between two adjacent walls merges away");
  assert.equal(right.left, false, "the shared edge between two adjacent walls merges away");
  assert.equal(left.top, true, "outer edges of the ring still render as wall");
});

test("troops and traps can only be placed on ground fully enclosed by the walls", () => {
  const s = createDefendState();
  s.wallCapacity = 20;
  const ring: [number, number][] = [
    [2, 4], [3, 4], [4, 4], [5, 4], [6, 4],
    [2, 5], [6, 5],
    [2, 6], [6, 6],
    [2, 7], [6, 7],
    [2, 8], [3, 8], [4, 8], [5, 8], [6, 8],
  ];
  for (const [x, y] of ring) assert.equal(placeBuilding(s, x, y, "wall"), true);
  assert.equal(placeBuilding(s, 3, 5, "barracks_swordsman"), true, "inside the walled area");
  assert.equal(placeBuilding(s, 0, 1, "barracks_swordsman"), false, "outside the walled area");
});

test("opening a gap in the wall exposes the interior back to the outside", () => {
  const s = createDefendState();
  s.wallCapacity = 20;
  const ring: [number, number][] = [[3, 5], [4, 5], [5, 5], [3, 6], [5, 6], [3, 7], [4, 7], [5, 7]];
  for (const [x, y] of ring) placeBuilding(s, x, y, "wall");
  assert.equal(isInsideCityLimits(s, 4, 6), true);

  assert.equal(removeBuilding(s, 4, 5), true);
  assert.equal(isInsideCityLimits(s, 4, 6), false, "a gap in the wall leaks the interior back outside");
});
