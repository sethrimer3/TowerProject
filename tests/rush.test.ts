import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { RESEARCH, missing, research } from "../src/archives.ts";

/** A Tower corridor along the bottom row: the hero at its west end, a
 * yellow key on x = 5 and the stairs at x = 7, with the Rush skill owned (or
 * not) and
 * `levels` Rush research levels done. */
function corridor(levels: number, skill = true) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  if (skill) g.save.upgrades.rush = 1;
  if (levels) g.save.archives.levels.rush = levels;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 8; x++) w.cells.set(`${x},0`, { kind: "floor" });
  w.cells.set("5,0", { kind: "key", color: "yellow" });
  w.cells.set("7,0", { kind: "stairs" });
  // An enemy out of reach, off the corridor.
  w.cells.set("7,1", { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength: "normal" } });
  w.torches = [];
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}
const at = (g: Game) => [g.run.player.x, g.run.player.y];

test("Rush research needs the Rush skill: 25 levels, Gold doubling and time growing 20% a level", () => {
  const save = defaults();
  assert.equal(missing(save, "rush").length, 1);
  save.upgrades.rush = 1;
  assert.equal(missing(save, "rush").length, 0);
  const levels = research("rush").levels;
  assert.equal(levels.length, 25);
  assert.deepEqual([levels[0].gold, levels[0].hours], [250, 1.75], "level 1 is Faster Trainers' level 1");
  assert.deepEqual([levels[1].gold, levels[1].hours], [250 * 2 * 2, 1.75 * 2 * 1.2]);
  assert.equal(levels[24].gold, 250 * 25 * 2 ** 24);
  assert.ok(levels.every((l) => l.effect.target === "rushTiles" && l.effect.value === 1));
  assert.ok(Object.keys(RESEARCH).indexOf("rush") > Object.keys(RESEARCH).indexOf("moveSpeed"));
});

test("the first step toward a new target rushes across empty tiles, stopping before anything else", () => {
  const g = corridor(10);
  assert.equal(g.rushTiles, 10);
  g.autoTurn();
  assert.deepEqual(at(g), [4, 0], "it stops on the tile before the key");
  assert.equal(g.save.tower.history.length, 1, "the rush is one undo");
  assert.deepEqual(g.rush?.tiles, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], "the tiles it rushed off, in order");
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0], "the key is a step of its own");
  g.autoTurn();
  assert.deepEqual(at(g), [6, 0], "the path to the same target goes on a step at a time");
});

test("undo takes a rush back whole", () => {
  const g = corridor(10);
  g.autoTurn();
  assert.ok(g.undo());
  assert.deepEqual(at(g), [0, 0]);
});

test("each Rush level adds a tile rushed across, after the step's own", () => {
  const g = corridor(2);
  g.autoTurn();
  assert.deepEqual(at(g), [3, 0]);
});

test("no rush with no research levels, or without the skill", () => {
  for (const g of [corridor(0), corridor(5, false)]) {
    assert.equal(g.rushTiles, 0);
    g.autoTurn();
    assert.deepEqual(at(g), [1, 0]);
    assert.equal(g.rush, null);
  }
});

test("a torch counts as something in the way", () => {
  const g = corridor(10);
  (g.world as RoomWorld).torches = [{ x: 3, y: 0, lightRadius: 4, baseIntensity: 1, active: true }];
  g.autoTurn();
  assert.deepEqual(at(g), [2, 0]);
});

test("a first step onto something other than empty floor doesn't rush", () => {
  const g = corridor(10);
  (g.world as RoomWorld).cells.set("1,0", { kind: "potion", amount: 10 });
  g.autoTurn();
  assert.deepEqual(at(g), [1, 0]);
  assert.equal(g.rush, null);
});
