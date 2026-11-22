import { test } from "node:test";
import assert from "node:assert/strict";
import type { Point } from "../src/entities.ts";
import { FAMILIAR_IDS, familiarValues, type FamiliarId } from "../src/familiars/catalog.ts";
import { endFamiliarsTurn, familiarAt, inArea, stepFamiliars, wolfArea, falconArea, wispBoost, type FamiliarValues, type Room } from "../src/familiars/rules.ts";
import type { FamiliarsRun } from "../src/familiars/save.ts";
import { pathOffset, ROOM_MIDDLE } from "../src/familiars/paths.ts";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import type { Mode } from "../src/entities.ts";

const ROOM: Room = { middle: { x: 8, y: 8 }, wrap: 0, seed: 99 };
const values = (...ids: FamiliarId[]) => Object.fromEntries(ids.map((id) => [id, familiarValues(id, [0, 0, 0, 0])])) as FamiliarValues;
/** Plays `turns` turns of the rules, saying on which each burst came. */
function play(run: FamiliarsRun, v: FamiliarValues, turns: number, room = ROOM) {
  const bursts: { turn: number; id: string; at: Point; boost: number }[] = [];
  for (let turn = 1; turn <= turns; turn++) {
    for (const { id, area, boost } of stepFamiliars(run, v, room)) bursts.push({ turn, id, at: { x: area.x, y: area.y }, boost });
    endFamiliarsTurn(run, v);
  }
  return bursts;
}

test("a cooldown is start to start, the first a whole one", () => {
  const bursts = play({}, values("dragon", "slime"), 360);
  assert.deepEqual(bursts.filter((b) => b.id === "dragon").map((b) => b.turn), [75, 150, 225, 300]);
  assert.deepEqual(bursts.filter((b) => b.id === "slime").map((b) => b.turn), [120, 240, 360]);
});

test("a burst strikes from where the familiar was as its turn began", () => {
  const [burst] = play({}, values("dragon"), 75), offset = pathOffset("dragon", 74);
  assert.deepEqual(burst!.at, { x: 8 + offset.x, y: 8 + offset.y });
});

test("a lasting effect stands for its Duration's turns, the one it came on included", () => {
  const run: FamiliarsRun = {}, v = values("falcon"), stood: number[] = [];
  for (let turn = 1; turn <= 160; turn++) {
    stepFamiliars(run, v, ROOM);
    if (falconArea(run, v, ROOM)) stood.push(turn);
    endFamiliarsTurn(run, v);
  }
  assert.deepEqual([stood[0], stood.at(-1), stood.length], [120, 139, 20]);
});

test("a cooldown shortened while it runs counts down from no more than the new length", () => {
  const run: FamiliarsRun = {}, v = values("dragon");
  play(run, v, 10);
  assert.equal(run.dragon!.timer, 65);
  v.dragon!.cooldown = 30;
  assert.deepEqual(play(run, v, 30).map((b) => b.turn), [30]);
});

test("a switched-off familiar's clock and path hold still", () => {
  const run: FamiliarsRun = {};
  play(run, values("dragon", "slime"), 10);
  const held = { ...run.dragon };
  play(run, values("slime"), 50);
  assert.deepEqual(run.dragon, held);
  assert.equal(run.slime!.turns, 60);
});

test("the Wolf plants on the square, stays there for its Duration, then follows again", () => {
  const run: FamiliarsRun = {}, v = values("wolf");
  play(run, v, 119);
  assert.equal(wolfArea(run, v, ROOM), undefined);
  play(run, v, 1);
  const at = { ...run.wolf!.at! };
  assert.equal(Math.round(Math.max(Math.abs(at.x - 8), Math.abs(at.y - 8)) * 1e6) / 1e6, 4.5);
  assert.equal(wolfArea(run, v, ROOM)!.factor, 3.5);
  play(run, v, 18);
  assert.deepEqual(run.wolf!.at, at);
  play(run, v, 1);
  assert.equal(run.wolf!.at, undefined);
  assert.equal(familiarAt("wolf", run.wolf, ROOM), undefined);
});

test("the Wolf's point lies on the Delve's wrap", () => {
  const room: Room = { middle: { x: 1, y: 40 }, wrap: 30, seed: 7 };
  for (let seed = 0; seed < 60; seed++) {
    const run: FamiliarsRun = { wolf: { turns: 0, timer: 1 } };
    stepFamiliars(run, values("wolf"), { ...room, seed });
    assert.ok(run.wolf!.at!.x >= 0 && run.wolf!.at!.x < 30, `seed ${seed}`);
  }
});

test("an area takes its edge in, and the short way round the wrap", () => {
  const area = { x: 8, y: 8, reach: 300, wrap: 0 };
  assert.ok(inArea(area, 11, 8) && inArea(area, 8, 5) && !inArea(area, 11, 9));
  assert.ok(inArea({ x: 29, y: 8, reach: 300, wrap: 30 }, 2, 8) && inArea({ x: -1, y: 8, reach: 300, wrap: 30 }, 28, 8));
  assert.ok(!inArea({ x: 29, y: 8, reach: 300, wrap: 0 }, 2, 8));
});

test("the Wisp multiplies a familiar's whole value while that familiar is in its range", () => {
  const v = values("wisp", "wolf", "falcon"), run: FamiliarsRun = { wisp: { turns: 0, left: 5 }, wolf: { turns: 0, left: 5, at: { x: 8, y: 8 } } };
  assert.equal(wispBoost(run, v, ROOM, { x: 8, y: 8 }), 105);
  assert.equal(wolfArea(run, v, ROOM)!.factor, 3.675);
  run.wolf!.at = { x: 15, y: 15 };
  assert.equal(wolfArea(run, v, ROOM)!.factor, 3.5);
  delete run.wisp!.left;
  assert.equal(wispBoost(run, v, ROOM, { x: 8, y: 8 }), 100);
});

test("the Wisp counts for what fires on the turn it does", () => {
  const v = values("wisp", "dragon");
  v.wisp!.range = 2000;
  assert.equal(stepFamiliars({ wisp: { turns: 0, timer: 1 }, dragon: { turns: 0, timer: 1 } }, v, ROOM)[0]!.boost, 105);
});

// --- In the game ---

function game(mode: Mode = "tower", tier = 1, ids: readonly FamiliarId[] = FAMILIAR_IDS) {
  const save = defaults();
  for (const id of ids) save.familiars[id] = { levels: [0, 0, 0, 0] };
  const g = new Game(save, random(11));
  if (mode === "delve") g.switchMode("delve");
  g.save[mode].tier = tier;
  g.newRun({ seed: 11 });
  Object.assign(g.run.player, { attack: 1e6, defense: 1e6, hp: 1e6, maxHp: 1e6 });
  return g;
}
/** A turn taken standing still, as FLYING ENEMY holds its ground. */
const hold = (g: Game, turns = 1) => {
  for (let i = 0; i < turns; i++) (g as any).holdTurn();
};
/** A step onto the open floor beside the hero. */
function step(g: Game) {
  const p = g.run.player;
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
    const to = g.world.step(p.x, p.y, dx, dy);
    if (to && g.world.tile(to.x, to.y).kind === "floor" && g.move(dx, dy)) return true;
  }
  return false;
}
const turnsOf = (g: Game) => FAMILIAR_IDS.map((id) => g.run.familiars?.[id]?.turns);

test("a run with no familiar keeps nothing of them", () => {
  const g = game("tower", 1, []);
  hold(g, 3);
  assert.equal(g.run.familiars, undefined);
});

test("every way a turn ends moves them on once", () => {
  // Below Tower III the turn ends early; from it on, through the volley; the Delve alike.
  for (const [mode, tier] of [["tower", 1], ["tower", 3], ["delve", 1], ["delve", 3]] as const) {
    const g = game(mode, tier);
    hold(g, 4);
    assert.deepEqual(turnsOf(g), [4, 4, 4, 4, 4], `${mode} ${tier}`);
    assert.ok(step(g), `${mode} ${tier} steps`);
    assert.deepEqual(turnsOf(g), [5, 5, 5, 5, 5], `${mode} ${tier}`);
  }
});

test("a climb interrupts nothing, counting the turn that climbed", () => {
  for (const tier of [1, 3]) {
    const g = game("tower", tier);
    hold(g, 2);
    g.run.familiars!.falcon!.left = 6;
    (g as any).turnFrom = { x: g.run.player.x, y: g.run.player.y, height: g.run.height - 1 };
    (g as any).endTurn();
    assert.equal(g.run.familiars!.falcon!.turns, 3, `tier ${tier}`);
    assert.equal(g.run.familiars!.falcon!.left, 5, `tier ${tier}`);
  }
});

test("the forest and a fallen hero take no turn", () => {
  const forest = game();
  forest.newRun({ outside: true, seed: 3 });
  hold(forest, 2);
  assert.equal(forest.run.familiars, undefined);
  const fallen = game();
  hold(fallen);
  fallen.run.player.hp = 0;
  hold(fallen, 3);
  assert.deepEqual(turnsOf(fallen), [1, 1, 1, 1, 1]);
});

test("the room is the floor's in the Tower and the hero's, as the turn began, in the Delve", () => {
  assert.deepEqual(game().familiarRoom, { middle: ROOM_MIDDLE, wrap: 0, seed: 11 });
  const g = game("delve"), { x, y } = g.run.player;
  assert.deepEqual(g.familiarRoom.middle, { x, y });
  (g as any).turnFrom = { x: x + 1, y, height: 0 };
  assert.deepEqual(g.familiarRoom.middle, { x: x + 1, y });
});

test("a reload plays on the same", () => {
  const straight = game(), saved = game();
  hold(straight, 130);
  hold(saved, 121);
  const back = new Game(decode(JSON.stringify(saved.save)), random(11));
  hold(back, 9);
  assert.deepEqual(back.run.familiars, straight.run.familiars);
});

test("one hatched mid-run starts with a whole cooldown", () => {
  const g = game("tower", 1, ["slime"]);
  hold(g, 10);
  g.save.familiars.dragon = { levels: [0, 0, 0, 0] };
  hold(g);
  assert.deepEqual(g.run.familiars!.dragon, { turns: 1, timer: 74 });
  assert.equal(g.run.familiars!.slime!.turns, 11);
});

test("switching off ends the effect and neither skips nor restarts the wait", () => {
  const g = game();
  hold(g, 121);
  const before = g.run.familiars!.falcon!;
  assert.ok(before.left);
  const { timer, turns } = before;
  g.familiars.toggle("falcon");
  assert.equal(g.run.familiars!.falcon!.left, undefined);
  hold(g, 30);
  g.familiars.toggle("falcon");
  assert.deepEqual(g.run.familiars!.falcon, { turns, timer });
});

test("a new run starts every path and cooldown over", () => {
  const g = game();
  hold(g, 5);
  g.newRun({ seed: 12 });
  assert.equal(g.run.familiars, undefined);
});
