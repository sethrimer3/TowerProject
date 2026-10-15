import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { RESEARCH, missing, research } from "../src/archives.ts";
import { BADGES, drawable, defaultBadges } from "../src/badges.ts";
import { DashEchoes, DASH_ECHO_MS } from "../src/dash-echoes.ts";
import type { FrameContext } from "../src/render-frame.ts";

/** A Tower corridor along the bottom row: the hero at its west end, a
 * yellow key on x = 5 and the stairs at x = 7, with the Dash skill owned (or
 * not) and
 * `levels` Dash research levels done. */
function corridor(levels: number, skill = true) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1; // undo needs Rehearsed steps
  if (skill) g.save.upgrades.dash = 1;
  if (levels) g.save.archives.levels.dash = levels;
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

test("Dash research needs the Dash skill: 25 levels, Gold doubling and time growing 20% a level", () => {
  const save = defaults();
  assert.equal(missing(save, "dash").length, 1);
  save.upgrades.dash = 1;
  assert.equal(missing(save, "dash").length, 0);
  const levels = research("dash").levels;
  assert.equal(levels.length, 25);
  assert.deepEqual([levels[0].gold, levels[0].hours], [250, 1.75], "level 1: 250 Gold and 1.75 hours");
  assert.deepEqual([levels[1].gold, levels[1].hours], [250 * 2 * 2, 1.75 * 2 * 1.2]);
  assert.equal(levels[24].gold, 250 * 25 * 2 ** 24);
  assert.ok(levels.every((l) => l.effect.target === "dashTiles" && l.effect.value === 1));
  assert.ok(Object.keys(RESEARCH).indexOf("dash") > Object.keys(RESEARCH).indexOf("moveSpeed"));
});

test("the first step toward a new target dashes across empty tiles, stopping before anything else", () => {
  const g = corridor(3);
  assert.equal(g.dashTiles, 3);
  g.autoTurn();
  assert.deepEqual(at(g), [4, 0], "with no tile left it stops on the tile before the key");
  assert.equal(g.save.tower.history.length, 1, "the dash is one undo");
  assert.deepEqual(g.dash?.tiles, [0, 1, 2, 3].map((x) => ({ x, y: 0, dx: 1, dy: 0 })), "the tiles it dashed off, in order, each with its step");
  assert.deepEqual(g.dash?.end, { x: 4, y: 0, dx: 1, dy: 0 }, "and the empty tile it landed on, with the step onto it");
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0], "the key is a step of its own");
  g.autoTurn();
  assert.deepEqual(at(g), [6, 0], "the path to the same target goes on a step at a time");
});

test("a dash with a tile left ends on its target item, taking it", () => {
  const g = toKey(10), keys = g.run.player.keys.yellow;
  g.autoTurn();
  assert.deepEqual(at(g), [5, 0], "onto the key");
  assert.equal(g.run.player.keys.yellow, keys + 1, "the key is taken");
  assert.equal((g.world as RoomWorld).tile(5, 0).kind, "floor");
  assert.deepEqual(g.dash?.tiles.map((t) => t.x), [0, 1, 2, 3, 4]);
  assert.equal(g.dash?.end, undefined, "no echo on the item's tile");
  assert.equal(g.save.tower.history.length, 1, "still one undo");
  assert.ok(g.undo());
  assert.deepEqual(at(g), [0, 0], "undo takes the dash and the key back whole");
  assert.equal(g.run.player.keys.yellow, keys);
});

test("a dash ending on its item scales it with Effective, and stops before it with Skip", () => {
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

test("a dash crosses an opened chest, and stops before a monster", () => {
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

test("undo takes a dash back whole", () => {
  const g = corridor(10);
  g.autoTurn();
  assert.ok(g.undo());
  assert.deepEqual(at(g), [0, 0]);
});

test("each Dash level adds a tile dashed across, after the step's own", () => {
  const g = corridor(2);
  g.autoTurn();
  assert.deepEqual(at(g), [3, 0]);
});

test("no dash with no research levels, or without the skill", () => {
  for (const g of [corridor(0), corridor(5, false)]) {
    assert.equal(g.dashTiles, 0);
    g.autoTurn();
    assert.deepEqual(at(g), [1, 0]);
    assert.equal(g.dash, null);
  }
});

test("a torch counts as something in the way", () => {
  const g = corridor(10);
  (g.world as RoomWorld).torches = [{ x: 3, y: 0, lightRadius: 4, baseIntensity: 1, active: true }];
  g.autoTurn();
  assert.deepEqual(at(g), [2, 0]);
});

test("a first step onto something other than empty floor doesn't dash", () => {
  const g = corridor(10);
  (g.world as RoomWorld).cells.set("1,0", { kind: "potion", amount: 10 });
  g.autoTurn();
  assert.deepEqual(at(g), [1, 0]);
  assert.equal(g.dash, null);
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

test("End Rush research needs the End Rush skill and follows Dash's schedule", () => {
  const save = defaults();
  save.upgrades.dash = 1;
  assert.equal(missing(save, "endRush").length, 1);
  save.upgrades.endRush = 1;
  assert.equal(missing(save, "endRush").length, 0);
  const dash = research("dash").levels, end = research("endRush").levels;
  assert.deepEqual(end.map((l) => [l.gold, l.hours]), dash.map((l) => [l.gold, l.hours]));
  assert.ok(end.every((l) => l.effect.target === "endRushTiles" && l.effect.value === 1));
  assert.equal(Object.keys(RESEARCH).indexOf("endRush"), Object.keys(RESEARCH).indexOf("dash") + 1, "listed right after Dash");
});

test("Dash Regen research needs the Dash Regen skill, after End Rush, and costs Dash's total Gold and time over 35 cheaper levels", () => {
  const save = defaults();
  save.upgrades.dash = save.upgrades.endRush = 1;
  assert.equal(missing(save, "dashRegen").length, 1);
  save.upgrades.dashRegen = 1;
  assert.equal(missing(save, "dashRegen").length, 0);
  const dash = research("dash").levels, regen = research("dashRegen").levels;
  assert.equal(regen.length, 35);
  assert.ok(regen.every((l) => l.effect.target === "dashRegenSteps" && l.effect.value === 1 && Number.isInteger(l.gold)));
  const total = (ls: typeof dash, key: "gold" | "hours") => ls.reduce((a, l) => a + l[key], 0);
  assert.equal(total(regen, "gold"), total(dash, "gold"), "the same Gold in all");
  assert.ok(Math.abs(total(regen, "hours") - total(dash, "hours")) < 1e-6, "and the same time");
  for (let i = 1; i < dash.length; i++) assert.ok(regen[i]!.gold < dash[i]!.gold && regen[i]!.hours < dash[i]!.hours, `level ${i + 1} cheaper and quicker than Dash's`);
  for (let i = 1; i < regen.length; i++) assert.ok(regen[i]!.gold > regen[i - 1]!.gold && regen[i]!.hours > regen[i - 1]!.hours, "each level dearer and longer than the last");
  assert.equal(Object.keys(RESEARCH).indexOf("dashRegen"), Object.keys(RESEARCH).indexOf("endRush") + 1, "listed right after End Rush");
});

test("End Rush adds its levels to STAIRS's dash toward the stairs", () => {
  const g = toStairs(2, 3);
  assert.equal(g.dashFor("stairs"), 5);
  g.autoTurn();
  assert.deepEqual(at(g), [6, 0], "2 + 3 tiles after the step's own, stopping before the stairs");
  assert.equal(g.save.tower.history.length, 1, "still one undo");
  assert.ok(g.undo());
  assert.deepEqual(at(g), [0, 0]);
});

test("End Rush works without Dash research, and only on STAIRS", () => {
  const g = toStairs(0, 2);
  g.autoTurn();
  assert.deepEqual(at(g), [3, 0]);
  const key = toKey(0);
  key.save.upgrades.endRush = 1;
  key.save.archives.levels.endRush = 5;
  assert.equal(key.dashFor("yellowKey"), 0);
  key.autoTurn();
  assert.deepEqual(at(key), [1, 0], "the key card doesn't dash");
});

test("End Rush counts for STAIRS's climb in the Delve too", () => {
  const g = toStairs(1, 4);
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  assert.equal(g.mode, "delve");
  assert.equal(g.dashFor("stairs"), 5);
});

test("the Dash badge adds its value to its card's dash, stacking with Dash and End Rush", () => {
  const key = toKey(1);
  key.run.badges = { yellowKey: [{ id: "dash", level: 2, pick: 0 }] };
  assert.equal(key.dashFor("yellowKey"), 3);
  key.autoTurn();
  assert.deepEqual(at(key), [4, 0], "1 + 2 tiles, stopping before the key");
  const onto = toKey(1);
  onto.run.badges = { yellowKey: [{ id: "dash", level: 3, pick: 0 }] };
  onto.autoTurn();
  assert.deepEqual(at(onto), [5, 0], "1 + 3 tiles: a tile left, onto the key");
  const bare = toKey(0);
  bare.run.badges = { yellowKey: [{ id: "dash", level: 1, pick: 0 }] };
  bare.autoTurn();
  assert.deepEqual(at(bare), [2, 0], "the badge dashes with no Dash research");
  const stairs = toStairs(1, 2);
  stairs.run.badges = { stairs: [{ id: "dash", level: 7, pick: 0 }] };
  assert.equal(stairs.dashFor("stairs"), 10);
});

test("the Dash badge joins the draw once the Dash Badge skill is owned", () => {
  const save = defaults();
  assert.equal(BADGES.dash.rarity, "rare");
  assert.ok(!drawable(defaultBadges(), "dash", save.upgrades));
  save.upgrades.dashBadge = 1;
  assert.ok(drawable(defaultBadges(), "dash", save.upgrades));
});

test("a save from before Rush became Dash keeps its skills, research and badge under the new names", () => {
  const old: any = JSON.parse(JSON.stringify(defaults()));
  for (const id of ["dash", "dashRegen", "dashBadge"]) delete old.upgrades[id];
  Object.assign(old.upgrades, { rush: 1, rushRegen: 1, rushBadge: 1 });
  delete old.archives.levels.dash;
  delete old.archives.levels.dashRegen;
  Object.assign(old.archives.levels, { rush: 3, rushRegen: 2 });
  old.badges.owned = { rush: { copies: 1, pick: 0 } };
  const save = decode(JSON.stringify(old));
  assert.deepEqual([save.upgrades.dash, save.upgrades.dashRegen, save.upgrades.dashBadge], [1, 1, 1]);
  assert.deepEqual([save.archives.levels.dash, save.archives.levels.dashRegen], [3, 2]);
  assert.deepEqual(save.badges.owned.dash, { copies: 1, pick: 0 });
});

/** The tiles `echoes` paints a hero on at `now`, in the order painted. */
function echoedAt(echoes: DashEchoes, now: number) {
  const painted: number[] = [];
  let x = 0;
  const c = { save() {}, restore() {}, scale() {}, translate(tx: number) { x = tx; }, globalAlpha: 1 };
  const f = { c, now, s: 24, n: 9, left: 0, bottom: 0, look: { reduceMotion: false } } as unknown as FrameContext;
  echoes.draw(f, () => painted.push(x / 24));
  return painted;
}

test("a dash soon after another leaves the first one's echoes playing", () => {
  const echoes = new DashEchoes(), along = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({ x: from + i, y: 0, dx: 1, dy: 0 }));
  echoes.add({ tiles: along(0, 20), at: 0 }, 0);
  echoes.add({ tiles: along(20, 30), at: 100 }, 100);
  assert.deepEqual(echoedAt(echoes, 150).slice(0, 20), along(0, 20).map((t) => t.x), "every tile of the first dash echoes by now");
  assert.ok(!echoes.over(DASH_ECHO_MS + 50) && echoes.over(DASH_ECHO_MS + 100), "over once the last dash's echoes fade");
  echoes.add({ tiles: along(30, 32), at: 900 }, 900);
  assert.deepEqual(echoedAt(echoes, 900), [30], "faded dashes are dropped");
  echoes.add({ tiles: along(40, 42), end: { x: 42, y: 0, dx: 1, dy: 0 }, at: 1000 }, 1000);
  assert.deepEqual(echoedAt(echoes, 1200).slice(-3), [40, 41, 42], "the empty tile landed on echoes last");
  echoes.clear();
  assert.deepEqual(echoedAt(echoes, 900), [], "another board drops them all");
});
