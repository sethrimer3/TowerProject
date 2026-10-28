import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { chargesLeft, chargesPerRun, climbFloor, floorsToRegain, regainEvery } from "../src/run-charges.ts";
import { RESEARCH, researched } from "../src/progression/archives.ts";
import { cost } from "../src/progression/upgrades.ts";
import { skillAvailable } from "../src/progression/skill-trees.ts";
import type { Run } from "../src/runs.ts";
import { playedSave } from "./first-skills.ts";

/** A Tower floor of open tiles, `size` a side, the hero in the corner and
 * the stairs opposite, with the skills `owned`. */
function arena(size: number, ...owned: ("ignore" | "target")[]) {
  const g = new Game(playedSave());
  for (const id of owned) g.save.upgrades[id] = 1;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set(`${size - 1},${size - 1}`, { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("the four charge skills cost 20 Breakthrough each and sit below Key Mastery", () => {
  const save = defaults();
  for (const id of ["ignore", "ignoreMore", "target", "targetMore"] as const) {
    assert.equal(cost(id, 0), 20, id);
    assert.equal(skillAvailable(id, save.upgrades), false, `${id} waits on the skills above it`);
  }
  Object.assign(save.upgrades, { trainers: 1, breakthrough: 1, moveSpeed: 1, physician: 1, overheal: 1, keyMastery: 1 });
  assert.ok(skillAvailable("ignore", save.upgrades));
  assert.equal(skillAvailable("ignoreMore", save.upgrades), false);
  assert.equal(skillAvailable("target", save.upgrades), false, "Target follows Ignore");
  save.upgrades.ignore = 1;
  assert.ok(skillAvailable("ignoreMore", save.upgrades) && skillAvailable("target", save.upgrades));
});

test("the charges' research: counts to 10 and 5 uses, and regains down to every 10 floors in about 2.8 years", () => {
  const years = (id: keyof typeof RESEARCH) => RESEARCH[id].levels.reduce((h, l) => h + l.hours, 0) / 24 / 365;
  for (const [id, target, growth, cubic] of [["ignoreMore", "ignoreFloors", 1.05, 0], ["targetMore", "targetFloors", 1.1, 0]] as const) {
    const levels = RESEARCH[id].levels;
    assert.equal(levels.length, 90, id);
    assert.equal(researched({ ...defaults().archives, levels: { [id]: 90 } }, target), 10, `${id} reaches every 10 floors`);
    assert.ok(Math.abs(years(id) - 2.82) < 0.01, `${id} takes about 2.8 years`);
    assert.deepEqual([levels[0].hours, levels[89].hours], [0.1, 810], `${id}: n² / 10 hours`);
    assert.equal(levels[0].gold, 500);
    assert.equal(levels[2].gold, Math.round(((2000 + cubic * 27) * growth * growth) / 100) * 100, `${id} grows ${growth} a level`);
  }
  assert.deepEqual(RESEARCH.targetCount.levels.map((l) => l.gold), [10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000]);
  assert.equal(researched({ ...defaults().archives, levels: { targetCount: 4 } }, "targetPerRun"), 5);
  assert.equal(researched({ ...defaults().archives, levels: { ignoreCount: 9 } }, "ignorePerRun"), 10);
  const ignore = RESEARCH.ignoreCount.levels.map((l) => l.gold), undo = RESEARCH.undoCount.levels.map((l) => l.gold);
  for (let i = 1; i < ignore.length; i++) {
    if (i < undo.length) assert.ok(ignore[i] / ignore[i - 1] > undo[i] / undo[i - 1], "steeper than Undo Count");
    assert.ok(ignore[i] / ignore[i - 1] < 10, "less steep than Target Count");
  }
});

test("a charge regains a use every so many new floors while below full, its count waiting while full", () => {
  const save = defaults(), run = { ignoreUsed: 1 } as Run;
  save.upgrades.ignore = 1;
  assert.equal(regainEvery(save, "ignore"), 0, "nothing regains without Ignore More");
  assert.deepEqual(climbFloor(save, run), []);
  assert.equal(run.regain, undefined);
  save.upgrades.ignoreMore = 1;
  save.archives.levels.ignoreMore = 88; // every 12 floors
  assert.equal(regainEvery(save, "ignore"), 12);
  for (let i = 0; i < 11; i++) assert.deepEqual(climbFloor(save, run), []);
  assert.equal(floorsToRegain(save, run, "ignore"), 1);
  assert.deepEqual(climbFloor(save, run), ["ignore"]);
  assert.equal(chargesLeft(save, run, "ignore"), 1);
  assert.equal(run.regain?.ignore, undefined);
  climbFloor(save, run);
  assert.equal(run.regain?.ignore, undefined, "a full charge counts no floors");
  assert.equal(floorsToRegain(save, run, "ignore"), null);
  // Target regains the same way, with its own skills.
  assert.equal(chargesPerRun(save, "target"), 0, "no Target uses without the skill");
  save.upgrades.target = 1;
  save.upgrades.targetMore = 1;
  run.targetUsed = 1;
  climbFloor(save, run);
  assert.equal(run.regain?.target, 1);
});

test("Ignore marks a tile no card steps on for the rest of the floor, for one use", () => {
  const g = arena(3, "ignore");
  assert.equal(g.chargesLeft("ignore"), 1);
  assert.equal(g.useArmed(1, 0), "unavailable", "it must be readied first");
  assert.equal(g.arm("ignore"), "armed");
  assert.equal(g.useArmed(0, 0), "invalid", "not the hero's own tile");
  assert.equal(g.chargesLeft("ignore"), 1, "a refused tile costs nothing");
  assert.equal(g.useArmed(1, 0), "used");
  assert.equal(g.chargesLeft("ignore"), 0);
  assert.equal(g.armed, null);
  assert.equal(g.arm("ignore"), "spent");
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.deepEqual([...loaded.handRules.ignored], ["1,0"], "the mark is saved with the run");
  for (let i = 0; i < 6 && g.run.height === 0; i++) {
    g.autoTurn();
    assert.notDeepEqual([g.run.player.x, g.run.player.y], [1, 0]);
  }
  assert.equal(g.run.height, 1, "STAIRS goes round it");
  assert.equal(g.handRules.ignored.size, 0, "the mark stays on its floor");
});

test("Target sends the hero to the tile tapped, then the hand leads again", () => {
  const g = arena(5, "target");
  assert.equal(g.arm("target"), "armed");
  assert.equal(g.arm("target"), "disarmed", "pressing it again puts it away");
  g.arm("target");
  (g.world as RoomWorld).cells.set("2,2", { kind: "wall" });
  assert.equal(g.useArmed(2, 2), "noPath", "a wall can't be reached");
  assert.equal(g.chargesLeft("target"), 1);
  assert.equal(g.useArmed(0, 4), "used");
  assert.equal(g.chargesLeft("target"), 0);
  assert.equal(g.run.targeted, "0,4");
  for (let i = 0; i < 4; i++) g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 4]);
  assert.equal(g.run.targeted, undefined);
  g.autoTurn();
  assert.equal(g.hand[g.activeCard!], "stairs", "the hand's order leads again");
});

test("Target loses a tile it can no longer reach and the hand leads that turn", () => {
  const g = arena(5, "target");
  g.arm("target");
  g.useArmed(0, 4);
  (g.world as RoomWorld).cells.set("0,4", { kind: "wall" });
  g.autoTurn();
  assert.equal(g.run.targeted, undefined);
  assert.match(g.message, /^Target lost/);
});

test("Target follows the path it committed to, and goes round a monster that appears on it", () => {
  const g = arena(5, "target");
  g.arm("target");
  g.useArmed(0, 4);
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 1], "straight up the column");
  const hp = g.run.player.hp;
  (g.world as RoomWorld).cells.set("0,2", { kind: "enemy", enemy: { name: "Rat", hp: 1, attack: 1, defense: 0, tier: 0, strength: "normal" } });
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [1, 1], "the path is planned again, round the monster");
  assert.equal(g.run.player.hp, hp, "no fight");
  for (let i = 0; i < 4; i++) g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [0, 4]);
  assert.equal(g.run.targeted, undefined);
});

test("Target goes round a tile ignored on the path it committed to", () => {
  const g = arena(5, "target", "ignore");
  g.arm("target");
  g.useArmed(0, 4);
  g.autoTurn();
  g.arm("ignore");
  assert.equal(g.useArmed(0, 2), "used");
  g.autoTurn();
  assert.deepEqual([g.run.player.x, g.run.player.y], [1, 1]);
});

test("climbing a new floor counts toward Ignore More once an Ignore use is spent", () => {
  const g = arena(3, "ignore");
  g.save.upgrades.ignoreMore = 1;
  g.run.ignoreUsed = 1;
  for (let i = 0; i < 6 && g.run.height === 0; i++) g.autoTurn();
  assert.equal(g.run.height, 1);
  assert.equal(g.run.regain?.ignore, 1);
});
