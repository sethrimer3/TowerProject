import { test } from "node:test";
import assert from "node:assert/strict";
import type { Board, Position } from "../src/board.ts";
import type { AutomoveMemory, DelveRun, Tile } from "../src/entities.ts";
import { routeTo } from "../src/pathfinding.ts";
import { capabilities, chooseDelveStep, DelvePlan } from "../src/delve/automove.ts";
import { defaults } from "../src/save.ts";

// The planners work from a Position (a board and the run standing on it), so
// they can be driven on a hand-built board with no Game.

/** A corridor running up from the player at (2, 0), with a potion at its end
 * and walls everywhere else. */
function corridor(): Position {
  const tiles = new Map<string, Tile>([
    ["2,0", { kind: "floor" }], ["2,1", { kind: "floor" }], ["2,2", { kind: "floor" }], ["2,3", { kind: "potion" }],
  ]);
  const world: Board = {
    width: 5,
    floor: 0,
    tile: (x, y) => tiles.get(`${x},${y}`) ?? { kind: "wall" },
    step: (x, y, dx, dy) => ({ x: x + dx, y: y + dy }),
    clear: (x, y) => { tiles.set(`${x},${y}`, { kind: "floor" }); },
  };
  const run = {
    player: { x: 2, y: 0, hp: 10, maxHp: 20, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } },
  } as unknown as DelveRun;
  return { world, run };
}

test("routes are planned on a hand-built board", () => {
  const at = corridor();
  assert.deepEqual(routeTo(at, 2, 3)?.map((s) => [s.dx, s.dy]), [[0, 1], [0, 1], [0, 1]]);
  assert.equal(routeTo(at, 3, 3), null);
});

test("of two equally long routes, one through a yellow door and one through a blue, the route spends the yellow key", () => {
  // Two lanes up from (2, 0) round a pillar at (2, 1) to (2, 2), a door in each.
  for (const [left, right] of [["yellow", "blue"], ["blue", "yellow"]] as const) {
    const tiles = new Map<string, Tile>([
      ["1,0", { kind: "floor" }], ["2,0", { kind: "floor" }], ["3,0", { kind: "floor" }],
      ["1,1", { kind: "door", color: left }], ["3,1", { kind: "door", color: right }],
      ["1,2", { kind: "floor" }], ["2,2", { kind: "floor" }], ["3,2", { kind: "floor" }],
    ]);
    const at = corridor();
    at.world.tile = (x, y) => tiles.get(`${x},${y}`) ?? { kind: "wall" };
    at.run.player.keys = { yellow: 1, blue: 1, red: 0 };
    const route = routeTo(at, 2, 2)!;
    assert.equal(route.length, 4);
    assert.ok(route.some((s) => at.world.tile(s.x, s.y).color === "yellow"), `${left} left, ${right} right`);
  }
});

test("Delve Automove plans on a hand-built board, keeping what it saw and chose", () => {
  const at = corridor(), memory: AutomoveMemory = { known: {}, visited: {} }, plan = new DelvePlan();
  const step = chooseDelveStep(at, { memory, plan, capabilities: capabilities(defaults().upgrades) });
  assert.deepEqual([step?.dx, step?.dy], [0, 1]);
  assert.equal(plan.commitment?.target, "2,3");
  assert.equal(plan.decisions?.[0].x, 2);
  assert.equal(plan.decisions?.[0].y, 3);
  assert.ok(memory.known["2,3"]);
});

test("a route goes round an item when an equally short way does, and over it when none does", () => {
  const tiles = new Map<string, Tile>();
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) tiles.set(`${x},${y}`, { kind: "floor" });
  tiles.set("1,1", { kind: "key", color: "yellow" });
  const world: Board = {
    width: 3,
    floor: 0,
    tile: (x, y) => tiles.get(`${x},${y}`) ?? { kind: "wall" },
    step: (x, y, dx, dy) => ({ x: x + dx, y: y + dy }),
    clear: () => {},
  };
  const run = { player: { x: 0, y: 1, hp: 10, maxHp: 20, attack: 1, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } } } as unknown as DelveRun;
  // Straight across is the one shortest way, so it takes the key.
  assert.deepEqual(routeTo({ world, run }, 2, 1)!.map((s) => [s.x, s.y]), [[1, 1], [2, 1]]);
  // To the far corner, of the equally short ways, one goes round it.
  const corner = routeTo({ world, run }, 2, 2)!;
  assert.equal(corner.length, 3);
  assert.ok(!corner.some((s) => s.x === 1 && s.y === 1));
});
