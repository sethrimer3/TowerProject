import { trainNow } from "./train-now.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { random } from "../src/random.ts";
import { trainingPoints } from "../src/loadout.ts";
import { xpForLevel } from "../src/config.ts";
import type { Board } from "../src/board.ts";
import type { Tile } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import {
  AD_COOLDOWN_MS, AD_GEMS, GEM_COOLDOWN_MS, GEM_MISSED_FLOORS, TRAINING_RESET_GEMS,
  collectedGem, decodeGemDrop, defaultGemDrop, gemSpot, reachFloor,
} from "../src/gems.ts";

const MINUTE = 60 * 1000;

test("a Gem appears on the next new floor, then waits out its cooldown after it is collected", () => {
  const d = defaultGemDrop();
  assert.ok(reachFloor(d, "tower", 7, 0, 0), "the first new floor");
  d.out = { mode: "tower", seed: 7, floor: 0, x: 3, y: 3 };
  collectedGem(d, 1000);
  assert.equal(d.readyAt, 1000 + GEM_COOLDOWN_MS);
  assert.equal(GEM_COOLDOWN_MS, 30 * MINUTE);
  assert.equal(reachFloor(d, "tower", 7, 1, 1000 + 29 * MINUTE), false, "still cooling down");
  assert.equal(reachFloor(d, "tower", 7, 1, 1000 + 31 * MINUTE), false, "floor 1 is no longer new");
  assert.ok(reachFloor(d, "tower", 7, 2, 1000 + 31 * MINUTE), "the next new floor after the cooldown");
});

test("a Gem left behind is missed, and another comes three new floors on until one is collected", () => {
  const d = defaultGemDrop();
  assert.ok(reachFloor(d, "tower", 7, 0, 0));
  d.out = { mode: "tower", seed: 7, floor: 0, x: 3, y: 3 };
  assert.equal(reachFloor(d, "tower", 7, 0, 0), false, "standing on its floor keeps it");
  assert.ok(d.out);
  const found: number[] = [];
  for (let floor = 1; floor <= 9; floor++) {
    if (reachFloor(d, "tower", 7, floor, 0)) {
      found.push(floor);
      d.out = { mode: "tower", seed: 7, floor, x: 3, y: 3 };
    }
  }
  assert.equal(GEM_MISSED_FLOORS, 3);
  assert.deepEqual(found, [3, 6, 9], "every third floor while each is missed");
  // Going back down a floor leaves it behind too, and counts no new floor.
  assert.equal(reachFloor(d, "tower", 7, 8, 0), false);
  assert.equal(d.out, null);
  assert.equal(d.wait, GEM_MISSED_FLOORS);
  // The other mode's run doesn't miss it, and a Gem out keeps others away.
  d.out = { mode: "tower", seed: 7, floor: 8, x: 3, y: 3 };
  d.wait = 0;
  assert.equal(reachFloor(d, "delve", 9, 0, 0), false);
  assert.ok(d.out);
});

test("a saved GemDrop decodes field by field, and a malformed one starts afresh", () => {
  const d = defaultGemDrop();
  d.readyAt = 1.7e12;
  d.adReadyAt = 1.8e12;
  d.wait = 2;
  d.out = { mode: "delve", seed: 4, floor: 3, x: 29, y: 140 };
  d.reached.delve = { seed: 4, floor: 3 };
  assert.deepEqual(decodeGemDrop(JSON.parse(JSON.stringify(d))), d);
  assert.deepEqual(decodeGemDrop({ readyAt: -5, wait: 9, out: { mode: "forest", seed: 1, floor: 0, x: 0, y: 0 }, reached: { tower: { seed: "x" } } }), defaultGemDrop());
  assert.deepEqual(decodeGemDrop(null), defaultGemDrop());
  assert.deepEqual(decode(JSON.stringify({ version: 3, gems: 12, gemDrop: d })).gemDrop, d);
  assert.equal(decode(JSON.stringify({ version: 3, gems: 12 })).gems, 12);
});

/** A board of `rows`, one string a row from y = 0 up: `.` floor, `#` wall,
 * `D` a door, `k` a key. */
function board(rows: string[]): Board {
  const kinds: Record<string, Tile> = { ".": { kind: "floor" }, "#": { kind: "wall" }, D: { kind: "door", color: "yellow" }, k: { kind: "key", color: "yellow" } };
  return {
    width: rows[0].length, floor: 0,
    tile: (x, y) => kinds[rows[y]?.[x] ?? "#"],
    step: (x, y, dx, dy) => (rows[y + dy]?.[x + dx] === undefined ? null : { x: x + dx, y: y + dy }),
    clear: () => {},
  };
}

test("a Gem lies on a plain floor tile the hero can walk to, past items but not doors", () => {
  const b = board([
    ".k.D..",
    "####..",
  ]);
  const spots = new Set<string>();
  const rng = random(5);
  for (let i = 0; i < 200; i++) {
    const s = gemSpot(b, { x: 0, y: 0 }, 0, Infinity, rng)!;
    spots.add(`${s.x},${s.y}`);
  }
  assert.deepEqual([...spots].sort(), ["2,0"], "not the hero's tile, the key's, or past the door");
  assert.equal(gemSpot(board(["."]), { x: 0, y: 0 }, 0, Infinity, rng), null, "none where nothing is free");
  const rows = board(["...", "...", "..."]);
  for (let i = 0; i < 50; i++) assert.ok(gemSpot(rows, { x: 1, y: 1 }, 0, 2, rng)!.y > 1, "rows above the hero first");
});

test("a Gem lies out of the way: off the paths between the hero and the targets, tucked into a nook", () => {
  const rng = random(9);
  // A corridor from the hero to a key, a door beyond, and a nook off it.
  const b = board([
    "#######",
    "......k",
    "#.##D##",
    "#.#####",
  ]);
  for (let i = 0; i < 30; i++) assert.deepEqual(gemSpot(b, { x: 0, y: 1 }, 0, Infinity, rng), { x: 1, y: 3 }, "the nook's end");
  // An open room: a corner away from the line between hero and key.
  const room = board([
    ".....",
    ".....",
    "k....",
  ]);
  const spots = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const s = gemSpot(room, { x: 0, y: 0 }, 0, Infinity, rng)!;
    spots.add(`${s.x},${s.y}`);
  }
  assert.deepEqual([...spots], ["4,2"], "the far corner");
});

/** A Tower run on an open 5×5 floor, stairs in the far corner. */
function arena(edit?: (g: Game) => void) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  edit?.(g);
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  g.clock = () => 1_000_000;
  return g;
}

test("in a run, a Gem turns up on the floor, and touching it pays one and starts the cooldown; undo can't bring it back", () => {
  const g = arena();
  g.move(1, 0);
  const gem = g.gem!;
  assert.ok(gem, "a Gem on the run's first floor");
  assert.equal(g.world.tile(gem.x, gem.y).kind, "floor");
  assert.notDeepEqual([gem.x, gem.y], [g.run.player.x, g.run.player.y]);
  // Walk onto it: along the bottom row, then up its column.
  const path = (dx: number, dy: number, n: number) => { for (let i = 0; i < n; i++) assert.ok(g.move(dx, dy)); };
  path(gem.x > 1 ? 1 : -1, 0, Math.abs(gem.x - 1));
  path(0, 1, gem.y);
  assert.equal(g.save.gems, 1);
  assert.equal(g.gem, null);
  assert.equal(g.save.gemDrop.readyAt, 1_000_000 + GEM_COOLDOWN_MS);
  assert.ok(g.gemSparkle && g.gains.some((x) => x.text === "+1 Gem"));
  assert.ok(g.undo());
  assert.equal(g.save.gems, 1, "undo leaves the Gem paid");
  assert.equal(g.gem, null, "and doesn't put it back");
});

test("a Gem is collected by tapping it from anywhere on the board", () => {
  const g = arena();
  g.move(0, 1);
  const gem = g.gem!;
  assert.equal(g.collectGemAt(gem.x === 2 ? 3 : 2, 2), false, "no Gem there");
  assert.ok(g.collectGemAt(gem.x, gem.y));
  assert.equal(g.save.gems, 1);
  assert.equal(g.collectGemAt(gem.x, gem.y), false, "only once");
});

test("a Gem left on a floor or in an ended run is missed, and owed three new floors on", () => {
  const g = arena();
  g.move(1, 0);
  assert.ok(g.gem);
  g.finish("Ended");
  assert.equal(g.save.gemDrop.out, null);
  assert.equal(g.save.gemDrop.wait, GEM_MISSED_FLOORS, "owed into the next run");
  assert.equal(decode(JSON.stringify(g.save)).gemDrop.wait, GEM_MISSED_FLOORS);
});

test("the ad's Gems: seven, then ten minutes before the next", () => {
  const g = arena();
  let now = 5_000_000;
  g.clock = () => now;
  assert.ok(g.adReady, "ready on a new profile");
  assert.ok(g.claimAdGems());
  assert.equal(g.save.gems, AD_GEMS);
  assert.equal(AD_GEMS, 7);
  assert.equal(g.claimAdGems(), false);
  now += AD_COOLDOWN_MS - 1;
  assert.equal(g.adReady, false);
  now += 1;
  assert.ok(g.claimAdGems());
  assert.equal(g.save.gems, 14);
  assert.equal(AD_COOLDOWN_MS, 10 * MINUTE);
});

test("resetting a Training stat costs two Gems and returns every point spent on it, inside a run too", () => {
  const g = arena((g) => { g.save.xp = xpForLevel(10); });
  const left = trainingPoints(g.save).left;
  for (let i = 0; i < 3; i++) assert.ok(trainNow(g, "attack"));
  assert.ok(trainNow(g, "hp"));
  const attack = g.run.player.attack;
  assert.equal(trainingPoints(g.save).left, left - 10);
  assert.equal(g.resetTraining("attack"), false, "no Gems");
  g.save.gems = TRAINING_RESET_GEMS;
  assert.equal(g.resetTraining("defense"), false, "no ranks to reset");
  assert.ok(g.resetTraining("attack"));
  assert.equal(g.save.gems, 0);
  assert.equal(g.save.training.attack, 0);
  assert.equal(g.save.training.hp, 1, "other stats keep their ranks");
  assert.equal(trainingPoints(g.save).left, left - 1, "9 points back");
  assert.ok(g.run.player.attack < attack, "the run inside loses what those ranks gave");
  // Dev free purchases: free ranks paid nothing, so a reset returns nothing.
  g.save.settings.freePurchases = true;
  assert.ok(trainNow(g, "attack") && trainNow(g, "attack"));
  assert.deepEqual(g.save.trainingPaid.attack, { points: 0, gold: 0, ms: 0 });
  assert.ok(g.resetTraining("attack"));
  assert.equal(trainingPoints(g.save).left, left - 1, "no points made from nothing");
});

test("Larger Hand opens hand slots for Gems, each dearer than the last", () => {
  const g = arena();
  g.save.gems = 2000;
  assert.equal(g.buyHandSlot(), false, "not before Larger Hand");
  g.save.upgrades.largerHand = 1;
  const paid: number[] = [];
  while (g.buyHandSlot()) paid.push(2000 - g.save.gems - paid.reduce((a, b) => a + b, 0));
  assert.deepEqual(paid, [50, 200, 400, 600], "as far as 2000 Gems go");
  assert.equal(g.save.handSlots, paid.length);
  g.save.gems = 10_000;
  while (g.buyHandSlot());
  assert.equal(g.save.handSlots, 6, "six slots to buy in all");
});
