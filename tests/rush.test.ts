import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { RESEARCH, missing, research } from "../src/archives.ts";
import { BADGES, drawable, defaultBadges } from "../src/badges.ts";

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
  const g = corridor(3);
  assert.equal(g.rushTiles, 3);
  g.autoTurn();
  assert.deepEqual(at(g), [4, 0], "with no tile left it stops on the tile before the key");
  assert.equal(g.save.tower.history.length, 1, "the rush is one undo");
  assert.deepEqual(g.rush?.tiles, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }], "the tiles it rushed off, in order");
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0], "the key is a step of its own");
  g.autoTurn();
  assert.deepEqual(at(g), [6, 0], "the path to the same target goes on a step at a time");
});

test("a rush with a tile left ends on its target item, taking it", () => {
  const g = toKey(10), keys = g.run.player.keys.yellow;
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0], "onto the key");
  assert.equal(g.run.player.keys.yellow, keys + 1, "the key is taken");
  assert.equal((g.world as RoomWorld).tile(5, 0).kind, "floor");
  assert.deepEqual(g.rush?.tiles.map((t) => t.x), [0, 1, 2, 3, 4]);
  assert.equal(g.save.tower.history.length, 1, "still one undo");
  assert.ok(g.undo());
  assert.deepEqual(at(g), [0, 0], "undo takes the rush and the key back whole");
  assert.equal(g.run.player.keys.yellow, keys);
});

test("a rush ending on its item scales it with Effective, and stops before it with Skip", () => {
  const g = toKey(10);
  g.run.badges = { yellowKey: [{ id: "effective", level: 1, pick: 0 }] };
  const keys = g.run.player.keys.yellow;
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0]);
  assert.ok(g.run.player.keys.yellow > keys + 1, "Effective scales the key taken");
  const skip = toKey(10);
  skip.run.badges = { yellowKey: [{ id: "skip", level: 1, pick: 0 }] };
  skip.autoTurn();
  assert.deepEqual(at(skip), [4, 0], "the item's own step rolls Skip");
});

test("a rush crosses an opened chest, and stops before a monster", () => {
  const g = toKey(10);
  (g.world as RoomWorld).cells.set("2,0", { kind: "openedChest" });
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0], "the opened chest doesn't stop it");
  const m = toKey(10);
  (m.world as RoomWorld).cells.set("5,0", { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength: "normal" } });
  m.run.hand = ["monster"];
  m.autoTurn();
  assert.deepEqual(at(m), [4, 0], "a fight is a step of its own");
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

/** The corridor with the key gone, so STAIRS leads to the stairs at x = 7,
 * with `end` End Rush research levels done (and the skill owned). */
function toStairs(levels: number, end: number) {
  const g = corridor(levels);
  (g.world as RoomWorld).cells.set("5,0", { kind: "floor" });
  if (end) {
    g.save.upgrades.endRush = 1;
    g.save.archives.levels.endRush = end;
  }
  return g;
}

/** The corridor with the stairs gone, so YELLOW KEY leads to the key. */
function toKey(levels: number) {
  const g = corridor(levels);
  (g.world as RoomWorld).cells.set("7,0", { kind: "floor" });
  return g;
}

test("End Rush research needs the End Rush skill and follows Rush's schedule", () => {
  const save = defaults();
  save.upgrades.rush = 1;
  assert.equal(missing(save, "endRush").length, 1);
  save.upgrades.endRush = 1;
  assert.equal(missing(save, "endRush").length, 0);
  const rush = research("rush").levels, end = research("endRush").levels;
  assert.deepEqual(end.map((l) => [l.gold, l.hours]), rush.map((l) => [l.gold, l.hours]));
  assert.ok(end.every((l) => l.effect.target === "endRushTiles" && l.effect.value === 1));
  assert.equal(Object.keys(RESEARCH).indexOf("endRush"), Object.keys(RESEARCH).indexOf("rush") + 1, "listed right after Rush");
});

test("End Rush adds its levels to STAIRS's rush toward the stairs", () => {
  const g = toStairs(2, 3);
  assert.equal(g.rushFor("stairs"), 5);
  g.autoTurn();
  assert.deepEqual(at(g), [6, 0], "2 + 3 tiles after the step's own, stopping before the stairs");
  assert.equal(g.save.tower.history.length, 1, "still one undo");
  assert.ok(g.undo());
  assert.deepEqual(at(g), [0, 0]);
});

test("End Rush works without Rush research, and only on STAIRS", () => {
  const g = toStairs(0, 2);
  g.autoTurn();
  assert.deepEqual(at(g), [3, 0]);
  const key = toKey(0);
  key.save.upgrades.endRush = 1;
  key.save.archives.levels.endRush = 5;
  assert.equal(key.rushFor("yellowKey"), 0);
  key.autoTurn();
  assert.deepEqual(at(key), [1, 0], "the key card doesn't rush");
});

test("End Rush counts for STAIRS's climb in the Delve too", () => {
  const g = toStairs(1, 4);
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  assert.equal(g.mode, "delve");
  assert.equal(g.rushFor("stairs"), 5);
});

test("the Rush badge adds its value to its card's rush, stacking with Rush and End Rush", () => {
  const key = toKey(1);
  key.run.badges = { yellowKey: [{ id: "rush", level: 2, pick: 0 }] };
  assert.equal(key.rushFor("yellowKey"), 3);
  key.autoTurn();
  assert.deepEqual(at(key), [4, 0], "1 + 2 tiles, stopping before the key");
  const onto = toKey(1);
  onto.run.badges = { yellowKey: [{ id: "rush", level: 3, pick: 0 }] };
  onto.autoTurn();
  assert.deepEqual(at(onto), [5, 0], "1 + 3 tiles: a tile left, onto the key");
  const bare = toKey(0);
  bare.run.badges = { yellowKey: [{ id: "rush", level: 1, pick: 0 }] };
  bare.autoTurn();
  assert.deepEqual(at(bare), [2, 0], "the badge rushes with no Rush research");
  const stairs = toStairs(1, 2);
  stairs.run.badges = { stairs: [{ id: "rush", level: 7, pick: 0 }] };
  assert.equal(stairs.rushFor("stairs"), 10);
});

test("the Rush badge joins the draw once the Rush Badge skill is owned", () => {
  const save = defaults();
  assert.equal(BADGES.rush.rarity, "rare");
  assert.ok(!drawable(defaultBadges(), "rush", save.upgrades));
  save.upgrades.rushBadge = 1;
  assert.ok(drawable(defaultBadges(), "rush", save.upgrades));
});
