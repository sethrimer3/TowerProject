import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { chargesLeft, chargesPerRun, climbFloor, floorsToRegain, regainEvery } from "../src/run-charges.ts";
import { RESEARCH, researched } from "../src/archives.ts";
import { cost, REGAIN_FLOORS } from "../src/config.ts";
import { skillAvailable } from "../src/skill-trees.ts";
import type { Run } from "../src/entities.ts";

/** A Tower floor of open tiles, `size` a side, the hero in the corner and
 * the stairs opposite, with the skills `owned`. */
function arena(size: number, ...owned: ("ignore" | "target" | "focus" | "refocus")[]) {
  const g = new Game(defaults());
  for (const id of owned) g.save.upgrades[id] = 1;
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set(`${size - 1},${size - 1}`, { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  return g;
}

test("the five new Courage skills cost 20 Courage each and sit below Interest's row", () => {
  const save = defaults();
  for (const id of ["refocus", "ignore", "ignoreMore", "target", "targetMore"] as const) {
    assert.equal(cost(id, 0), 20, id);
    assert.equal(skillAvailable(id, save.upgrades), false, `${id} waits on the skills above it`);
  }
  Object.assign(save.upgrades, { delve: 1, moveSpeed: 1, focus: 1, findYellowKey: 1, keyEfficiency: 1, interest: 1 });
  assert.ok(skillAvailable("ignore", save.upgrades));
  assert.equal(skillAvailable("ignoreMore", save.upgrades), false);
  save.upgrades.ignore = 1;
  assert.ok(skillAvailable("ignoreMore", save.upgrades));
});

test("the charges' research: counts to 10 and 5 uses, and regains down to every 10 floors in about 2.8 years", () => {
  const years = (id: keyof typeof RESEARCH) => RESEARCH[id].levels.reduce((h, l) => h + l.hours, 0) / 24 / 365;
  for (const [id, target, growth, cubic] of [["refocus", "refocusFloors", 1, 8], ["ignoreMore", "ignoreFloors", 1.05, 0], ["targetMore", "targetFloors", 1.1, 0]] as const) {
    const levels = RESEARCH[id].levels;
    assert.equal(levels.length, 90, id);
    assert.equal(researched({ ...defaults().archives, levels: { [id]: 90 } }, target, REGAIN_FLOORS), 10, `${id} reaches every 10 floors`);
    assert.ok(Math.abs(years(id) - 2.82) < 0.01, `${id} takes about 2.8 years`);
    assert.deepEqual([levels[0].hours, levels[89].hours], [0.1, 810], `${id}: n² / 10 hours`);
    assert.equal(levels[0].gold, 500);
    assert.equal(levels[2].gold, Math.round(((2000 + cubic * 27) * growth * growth) / 100) * 100, `${id} grows ${growth} a level`);
  }
  assert.deepEqual(RESEARCH.targetCount.levels.map((l) => l.gold), [10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000]);
  assert.equal(researched({ ...defaults().archives, levels: { targetCount: 4 } }, "targetPerRun", 1), 5);
  assert.equal(researched({ ...defaults().archives, levels: { ignoreCount: 9 } }, "ignorePerRun", 1), 10);
  const ignore = RESEARCH.ignoreCount.levels.map((l) => l.gold), focus = RESEARCH.focusCount.levels.map((l) => l.gold);
  for (let i = 1; i < ignore.length; i++) {
    assert.ok(ignore[i] / ignore[i - 1] > focus[i] / focus[i - 1], "steeper than Focus Count");
    assert.ok(ignore[i] / ignore[i - 1] < 10, "less steep than Target Count");
  }
});

test("a charge regains a use every so many new floors while below full, its count waiting while full", () => {
  const save = defaults(), run = { focusUsed: 1 } as Run;
  save.upgrades.focus = 1;
  assert.equal(regainEvery(save, "focus"), 0, "nothing regains without Refocus");
  assert.deepEqual(climbFloor(save, run), []);
  assert.equal(run.regain, undefined);
  save.upgrades.refocus = 1;
  save.archives.levels.refocus = 88; // every 12 floors
  assert.equal(regainEvery(save, "focus"), 12);
  for (let i = 0; i < 11; i++) assert.deepEqual(climbFloor(save, run), []);
  assert.equal(floorsToRegain(save, run, "focus"), 1);
  assert.deepEqual(climbFloor(save, run), ["focus"]);
  assert.equal(chargesLeft(save, run, "focus"), 1);
  assert.equal(run.regain?.focus, undefined);
  climbFloor(save, run);
  assert.equal(run.regain?.focus, undefined, "a full charge counts no floors");
  assert.equal(floorsToRegain(save, run, "focus"), null);
  // Ignore and Target regain the same way, with their own skills.
  save.upgrades.ignore = 1;
  save.upgrades.ignoreMore = 1;
  run.ignoreUsed = 1;
  climbFloor(save, run);
  assert.equal(run.regain?.ignore, 1);
  assert.equal(chargesPerRun(save, "target"), 0, "no Target uses without the skill");
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
  assert.deepEqual([...loaded.ignored], ["1,0"], "the mark is saved with the run");
  for (let i = 0; i < 6 && g.run.height === 0; i++) {
    g.autoTurn();
    assert.notDeepEqual([g.run.player.x, g.run.player.y], [1, 0]);
  }
  assert.equal(g.run.height, 1, "STAIRS goes round it");
  assert.equal(g.ignored.size, 0, "the mark stays on its floor");
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

test("climbing a new floor counts toward Refocus once a Focus use is spent", () => {
  const g = arena(3, "focus", "refocus");
  g.run.focusUsed = 1;
  for (let i = 0; i < 6 && g.run.height === 0; i++) g.autoTurn();
  assert.equal(g.run.height, 1);
  assert.equal(g.run.regain?.focus, 1);
});
