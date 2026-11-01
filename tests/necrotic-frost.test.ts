// Necrotic Frost (docs/agents/arcana.md): a cooldown's fields, off center round the
// hero and stacking, which slow what stands in them and leave a decay on what they
// touch, growing every turn until it falls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, arcanumBoost } from "../src/arcana/arcana.ts";
import { clearFrost, decayed, fieldsOn, frostArea, frostEffects, frostSlowAt, stepFrost, validFrost, validNecro, type FrostField, type FrostRun } from "../src/arcana/necrotic-frost.ts";
import { SLOWDOWN_CAP, togetherSlow } from "../src/arcana/time-dilation.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { aggroTurn } from "../src/enemies/flying.ts";
import { enemyTitle } from "../src/enemies/scaling.ts";
import { random } from "../src/random.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import { decodeTrialArcana } from "../src/proving-grounds/trial-arcana.ts";
import { slowedAt } from "../src/proving-grounds/trial-spells.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { tileInfo } from "../src/ui/tile-info.ts";
import { landsAt, necroDecay, volleyTurn } from "../src/volley.ts";

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 1e9, tier: 1, strength: "weak" };
/** A field whose center lies one tile east of the hero's (90°), its next to the west (270°). */
const east = (id = 1, left = 50): FrostField => ({ id, angle: 9000, left });
const west = (id = 2, left = 50): FrostField => ({ id, angle: 27000, left });
const area = (...fields: FrostField[]) => frostArea(fields, frostEffects(null));

/** A Tower run at the origin, ATK 100, on plain floor holding `tiles`, holding Necrotic Frost. */
function arena(tiles: Record<string, Tile> = {}, levels: [number, number, number] = [0, 0, 0]) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  lay(g, tiles);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100_000, maxHp: 100_000 });
  g.save.arcana.owned.necroticFrost = levels;
  return g;
}
function lay(g: Game, tiles: Record<string, Tile> = {}) {
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) w.cells.set(`${x},${y}`, tiles[`${x},${y}`] ?? { kind: "floor" });
}
const standing = (x: number, y: number, enemy: Enemy = brute): Record<string, Tile> => ({ [`${x},${y}`]: { kind: "enemy", enemy } });
const turn = (g: Game) => assert.ok(g.move(g.run.player.x % 2 ? -1 : 1, 0));
const hpAt = (g: Game, x: number, y: number) => g.world.tile(x, y).enemy?.hp;

test("its tables are the spec's, level by level", () => {
  const [atk, duration, cooldown] = ARCANA.necroticFrost.attributes;
  assert.deepEqual(atk.steps, [[10, 0], [11, 5], [13, 11], [16, 17], [20, 23], [26, 29], [34, 35], [43, 41], [55, 47], [69, 53], [87, 61], [108, 71], [134, 84], [164, 100], [200, 120], [243, 144], [293, 174], [352, 210], [421, 252], [502, 302], [597, 362], [708, 434], [838, 525], [989, 636], [1165, 772], [1370, 938], [1608, 1134], [1886, 1360], [2209, 1616], [2585, 1902], [3021, 2228], [3776, 2594], [4720, 2800], [5900, 3006], [7375, 3212], [9219, 3418]]);
  assert.deepEqual(duration.steps, [[30, 0], [35, 10], [40, 20], [45, 35], [50, 55], [55, 100], [60, 120], [65, 150], [70, 200], [75, 260], [80, 330], [85, 410], [90, 500], [95, 600], [100, 710]]);
  assert.deepEqual(cooldown.steps, [[125, 0], [120, 8], [115, 26], [110, 44], [105, 62], [100, 80], [95, 98], [90, 116], [85, 134], [80, 152], [75, 170], [70, 188], [65, 206], [60, 224], [55, 242], [50, 260]]);
  assert.deepEqual([atk.name, duration.name, cooldown.name], ["ATK Mult", "Duration", "Cooldown"]);
  assert.equal(ARCANA.necroticFrost.trigger.on, "cooldown");
});

test("the cooldown sets a field at an angle of its own; fields stack and end by their own turns", () => {
  const s: FrostRun = { timer: 2 }, rule = { duration: 3, turns: 2 };
  assert.deepEqual([stepFrost(s, rule, 7), stepFrost(s, rule, 7)], [false, true]);
  assert.deepEqual(s.fields!.map((f) => [f.id, f.left]), [[1, 3]]);
  stepFrost(s, rule, 7);
  stepFrost(s, rule, 7);
  assert.deepEqual(s.fields!.map((f) => [f.id, f.left]), [[1, 1], [2, 3]], "the second stands beside the first");
  stepFrost(s, rule, 7);
  assert.deepEqual(s.fields!.map((f) => f.id), [2]);

  const angles = (seed: number) => {
    const run: FrostRun = {};
    return Array.from({ length: 12 }, () => (stepFrost(run, { duration: 1, turns: 1 }, seed), run.fields![0]!.angle));
  };
  assert.deepEqual(angles(7), angles(7), "the same run rolls the same");
  assert.notDeepEqual(angles(7), angles(8));
  assert.ok(new Set(angles(7)).size > 6, "each its own");
  assert.ok(angles(7).every((a) => Number.isInteger(a) && a >= 0 && a < 36_000));

  const constant: FrostRun = { timer: 1 };
  stepFrost(constant, { duration: 50, turns: 50 }, 7);
  for (let i = 0; i < 200; i++) {
    stepFrost(constant, { duration: 50, turns: 50 }, 7);
    assert.equal(constant.fields?.length, 1, "a Duration as long as the Cooldown is constant");
  }
});

test("a field reaches by Euclidean distance from its own center, 3 tiles at first", () => {
  assert.deepEqual([frostEffects(null).radius, frostEffects(null).offset], [300, 100]);
  const a = area(east());
  assert.deepEqual([a.fields[0]!.id, a.fields[0]!.x, a.fields[0]!.y + 0], [1, 1, 0]);
  assert.deepEqual([fieldsOn(a, 4, 0), fieldsOn(a, 5, 0), fieldsOn(a, -2, 0), fieldsOn(a, -3, 0)], [[1], [], [1], []], "off center by a tile");
  assert.deepEqual(fieldsOn(a, 3, 3), [], "corners are farther");
  assert.deepEqual(fieldsOn(a, 3, 2), [1]);
});

test("slowdown: 25% in a field, 50% in two or more, multiplying Time Dilation's up to its cap", () => {
  const two = area(east(), west());
  assert.equal(frostSlowAt(two, 4, 0), 25);
  assert.equal(frostSlowAt(two, 0, 0), 50);
  assert.equal(frostSlowAt(two, 9, 0), 0);
  assert.equal(frostSlowAt(area(east(1), west(2), east(3)), 0, 0), 50, "three no more than two");
  assert.equal(togetherSlow(0, 25), 25);
  assert.equal(togetherSlow(30, 0), 30);
  assert.equal(togetherSlow(50, 50), 75);
  assert.equal(togetherSlow(75, 50), 87.5);
  assert.equal(togetherSlow(85, 50), SLOWDOWN_CAP);
});

test("the ramp: each effect climbs a step a turn, and two fields ramp apart", () => {
  let on = decayed(undefined, [1]);
  assert.deepEqual(on, { necro: { 1: 1 }, units: 1 });
  on = decayed(on.necro, [1]);
  assert.deepEqual(on, { necro: { 1: 2 }, units: 2 });
  on = decayed(on.necro, []);
  assert.deepEqual(on, { necro: { 1: 3 }, units: 3 }, "it goes on out of the field");
  on = decayed(on.necro, [2]);
  assert.deepEqual(on, { necro: { 1: 4, 2: 1 }, units: 5 });
});

test("a run: decay ramps 10x, 20x, 30x of ATK through DEF, and tags the enemy Necro", () => {
  const g = arena(standing(3, 0));
  g.run.necroticFrost = { timer: 500, fields: [east()] };
  const start = hpAt(g, 3, 0)!;
  turn(g);
  assert.equal(hpAt(g, 3, 0), start - 1000);
  assert.deepEqual(g.world.tile(3, 0).enemy!.necro, { 1: 1 });
  assert.equal(enemyTitle(g.world.tile(3, 0).enemy!), "Necro Weak Brute");
  turn(g);
  assert.equal(hpAt(g, 3, 0), start - 3000);
  turn(g);
  assert.equal(hpAt(g, 3, 0), start - 6000);
  assert.equal(g.world.tile(3, 0).enemy!.necro![1], 3);
});

test("the enemy's panel says it is Necro, only once it is", () => {
  const g = arena(standing(3, 0));
  assert.doesNotMatch(tileInfo(g, 3, 0).body + tileInfo(g, 3, 0).title, /Necro/);
  g.run.necroticFrost = { timer: 500, fields: [east()] };
  turn(g);
  const info = tileInfo(g, 3, 0);
  assert.equal(info.title, "Necro Weak Brute");
  assert.match(info.body, /Necro: it takes more decay every turn until it falls/);
});

test("a run: the card's bar and Arcanum Damage; the first field when the cooldown runs out", () => {
  const g = arena({}, [1, 2, 3]), held = g.arcana.held[0]!;
  assert.deepEqual(g.arcana.cooldown(held), { left: 110, turns: 110 });
  assert.deepEqual(g.arcana.cardValue(held), { damage: 1100 });
  const rule = g.arcana.frostRule()!;
  assert.deepEqual([rule.duration, rule.turns, rule.boost], [40, 110, 11]);
  g.run.necroticFrost = { timer: 2 };
  turn(g);
  assert.equal(g.frostArea, undefined);
  assert.equal(g.arcana.cooldown(held)!.left, 1);
  turn(g);
  assert.equal(g.frostArea!.fields.length, 1);
  assert.equal(g.run.necroticFrost.fields![0]!.left, 40);
});

test("crits average into its boost, and a Shielded enemy's bubble and Overseer's beams count", () => {
  const crit = { chance: 50, factor: 3, superCrit: { chance: 20, factor: 10 } } as never;
  assert.equal(arcanumBoost(10, crit), 10 * (1 + 3 * 0.5) * (1 + 10 * 0.2 * 0.5));

  const tile = (e: Enemy): Tile => ({ kind: "enemy", enemy: e });
  const hero = { x: 0, y: 0, attack: 100 } as Player;
  const once = (enemy: Enemy, beams?: never) => {
    const board = { tile: (x: number, y: number) => (x === 0 && y === 2 ? tile(enemy) : ({ kind: "floor" } as Tile)), clear() {}, wound() {}, markNecro() {} };
    return necroDecay({ board, wrap: 0, hero, changes: {}, ...(beams ? { beams } : {}) }, 25, area({ id: 1, angle: 0, left: 5 })).shots[0]!.damage;
  };
  assert.equal(once(brute), 2500);
  assert.equal(once({ ...brute, guard: 50 } as Enemy), 1250);
  assert.equal(once(brute, { bonus: 4, width: 40, count: 1, turns: 0 } as never), 10_000);
});

test("once applied it goes on out of the field, even with no field at all, until the enemy falls", () => {
  const g = arena(standing(3, 0));
  g.run.necroticFrost = { timer: 500, fields: [east()] };
  const start = hpAt(g, 3, 0)!;
  turn(g);
  g.run.necroticFrost.fields = undefined;
  delete g.run.necroticFrost.fields;
  turn(g);
  assert.equal(hpAt(g, 3, 0), start - 3000, "the second tick, 20x, with no field");
  // A far enemy marked long ago ticks on, wherever it is.
  (g.world as RoomWorld).markNecro(15, 15, { 4: 2 });
  assert.equal(g.world.tile(15, 15).enemy, undefined, "only where one stands");
  const far = arena({ ...standing(15, 15), ...standing(3, 0) });
  (far.world as RoomWorld).markNecro(15, 15, { 4: 2 });
  turn(far);
  assert.equal(hpAt(far, 15, 15), brute.hp - 3000);
  assert.equal(hpAt(far, 3, 0), brute.hp, "and none of it on what no field touched");
});

test("two fields: an enemy in both takes both, and is slowed 50%", () => {
  const g = arena(standing(1, 1));
  g.run.necroticFrost = { timer: 500, fields: [east(1), west(2)] };
  const start = hpAt(g, 1, 1)!;
  turn(g);
  assert.equal(hpAt(g, 1, 1), start - 2000);
  assert.deepEqual(g.world.tile(1, 1).enemy!.necro, { 1: 1, 2: 1 });
  turn(g);
  assert.equal(hpAt(g, 1, 1), start - 6000, "20x from each");
});

test("what stands in a field fights slower, by how many reach it; previews count the plain hero", () => {
  const g = arena();
  g.run.necroticFrost = { timer: 500, fields: [east(1), west(2)] };
  assert.equal(g.fighterAt({ x: 0, y: 0 }).slowdown, 50);
  assert.equal(g.fighterAt({ x: 4, y: 0 }).slowdown, 25);
  assert.equal(g.fighterAt({ x: 9, y: 0 }).slowdown, undefined);
  assert.equal(g.fighter.slowdown, undefined);
  g.save.arcana.owned.timeDilation = [0, 6, 0];
  g.run.timeDilation = { timer: 500, left: 5 };
  assert.equal(g.fighterAt({ x: 1, y: 0 }).slowdown, 75, "50% and 50% multiply");
});

test("a Ranged enemy's cooldown runs slower by the fields reaching it, as the hero stands", () => {
  const enemy: Enemy = { ...brute, ranged: true, attack: 1 };
  const charge = (frost?: ReturnType<typeof area>) => {
    const board = { tile: (x: number, y: number): Tile => (x === 3 && y === 0 ? { kind: "enemy", enemy } : { kind: "floor" }), clear() {}, wound() {}, floorEnemies: () => [] };
    const hero = { x: 0, y: 0, hp: 1000, maxHp: 1000, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } } as Player;
    const out = volleyTurn({ board: board as never, wrap: 0, floorOf: () => 1, hero, seed: 1, volleys: { turn: 1, foes: { "3,0": 100 } }, archer: false, ranks: { upgrades: {}, training: {}, archives: {} } as never, ...(frost ? { frost } : {}) });
    return out.volleys.foes!["3,0"];
  };
  assert.equal(charge(), 600);
  assert.equal(charge(area(east())), 475, "25% of 500 less");
  assert.equal(charge(area({ id: 1, angle: 27000, left: 5 })), 600, "its center too far");
  assert.equal(charge(area(east(1), east(2))), 350, "two fields, 50%");
});

test("an Aggroed enemy keeps what is on it as it moves, slower in a field", () => {
  const flyer: Enemy = { ...brute, flying: true, aggro: true };
  const changes: Record<string, Tile> = { "8,0": { kind: "floor", flyer, necro: { 1: 3 } } };
  const board = { tile: (x: number, y: number): Tile => changes[`${x},${y}`] ?? { kind: "floor" }, step: (x: number, y: number, dx: number, dy: number) => (x + dx >= 0 && x + dx < 12 && y + dy >= 0 && y + dy < 3 ? { x: x + dx, y: y + dy } : undefined), floor: 0 };
  let moves = 0;
  for (let i = 0; i < 40; i++) moves += aggroTurn({ board: board as never, changes, hero: { x: 0, y: 0 }, floorOf: () => 1, lit: new Set(), slowAt: () => 25 }).steps.length;
  assert.equal(moves, 3, "a move every 13⅓ turns");
  assert.deepEqual(changes["5,0"]!.necro, { 1: 3 });
});

test("round the Delve's wrap, a field reaches across the seam", () => {
  const enemy = { ...brute, hp: 1000 };
  const wounds: number[] = [];
  const board = { tile: (x: number, y: number): Tile => (x === 18 && y === 0 ? { kind: "enemy", enemy } : { kind: "floor" }), clear() {}, wound: (_x: number, _y: number, d: number) => void wounds.push(d), markNecro() {} };
  const out = necroDecay({ board, wrap: 20, hero: { x: 0, y: 0, attack: 10 } as Player, changes: {} }, 1, area(west()));
  assert.deepEqual(wounds, [10]);
  assert.deepEqual(out.shots[0]!.to, { x: 18, y: 0 });
});

test("a kill pays like any other, off the tile, and the toggle only hides its numbers", () => {
  const g = arena(standing(3, 0, { ...brute, hp: 500 }));
  g.run.necroticFrost = { timer: 500, fields: [east()] };
  const kills = g.run.kills;
  turn(g);
  assert.equal(g.world.tile(3, 0).kind, "floor");
  assert.equal(g.run.kills, kills + 1);
  assert.match(g.message, /^Necrotic Frost · Necro Weak Brute defeated/);
  assert.equal(g.world.tile(3, 0).necro, undefined);
  assert.ok(g.volley!.shots.some((s) => s.necro && s.fell), "its number shows");
  assert.equal(landsAt({ at: 10, ms: 100, shots: [] }, { necro: true, tick: 100 } as never), 110, "at once");

  const hidden = arena(standing(3, 0));
  hidden.save.settings.necroDamage = false;
  hidden.run.necroticFrost = { timer: 500, fields: [east()] };
  const start = hpAt(hidden, 3, 0)!;
  turn(hidden);
  assert.equal(hpAt(hidden, 3, 0), start - 1000, "dealt all the same");
  assert.ok(!hidden.volley?.shots.some((s) => s.necro));
});

test("undo takes back the field, the decay and the mark; a refight comes out the same", () => {
  const g = arena(standing(3, 0));
  g.run.necroticFrost = { timer: 1 };
  turn(g);
  const fields = g.run.necroticFrost!.fields!;
  assert.equal(fields.length, 1);
  const after = hpAt(g, 3, 0);
  g.undo();
  lay(g, standing(3, 0));
  assert.deepEqual(g.run.necroticFrost, { timer: 1 });
  assert.equal(hpAt(g, 3, 0), brute.hp);
  assert.equal(g.world.tile(3, 0).enemy!.necro, undefined);
  turn(g);
  assert.deepEqual(g.run.necroticFrost!.fields, fields, "the same angle");
  assert.equal(hpAt(g, 3, 0), after);
});

test("switching it off loses the fields and cooldown; the decay waits, and goes on when it is back", () => {
  const g = arena(standing(3, 0));
  g.run.necroticFrost = { timer: 500, casts: 1, fields: [east()] };
  const start = hpAt(g, 3, 0)!;
  turn(g);
  g.arcana.toggle("necroticFrost");
  assert.equal(g.frostArea, undefined);
  assert.deepEqual(g.run.necroticFrost, { casts: 1 });
  turn(g);
  assert.equal(hpAt(g, 3, 0), start - 1000, "no tick while off");
  assert.equal(g.fighterAt({ x: 3, y: 0 }).slowdown, undefined);
  g.arcana.toggle("necroticFrost");
  assert.equal(g.arcana.cooldown(g.arcana.held[0]!)!.left, 125, "it starts over");
  turn(g);
  assert.equal(hpAt(g, 3, 0), start - 3000, "the ramp where it was");
});

test("a reload keeps the fields and what is on the enemies; the rest is checked", () => {
  const g = arena(standing(3, 0));
  g.run.necroticFrost = { timer: 500, casts: 1, fields: [east()] };
  turn(g);
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run!.necroticFrost!.fields, [{ ...east(), left: 49 }]);
  assert.deepEqual(back.tower.run!.changes["3,0"]!.necro, { 1: 1 });
  assert.ok(validFrost({ timer: 3, casts: 2, fields: [east()] }));
  for (const bad of [{ timer: 0 }, { fields: [] }, { fields: [{ id: 1, angle: 36_000, left: 1 }] }, { fields: [{ id: 0, angle: 0, left: 1 }] }, { fields: [{ id: 1, angle: 0, left: 0 }] }, 3]) assert.ok(!validFrost(bad), JSON.stringify(bad));
  assert.ok(validNecro({ 3: 2 }));
  for (const bad of [{}, { 3: 0 }, { x: 1 }, { 3: 1.5 }, []]) assert.ok(!validNecro(bad), JSON.stringify(bad));
  clearFrost(g.run.necroticFrost);
  assert.deepEqual(g.run.necroticFrost, { casts: 1 });
});

/** An attempt in its arena under a session holding Necrotic Frost, the hero's ATK 10. */
function attempt(trial: Parameters<typeof startTrial>[5] = "keymaster") {
  const save = defaults();
  save.arcana.owned.necroticFrost = [0, 0, 0];
  const base = new Game(save, random(3));
  base.newRun({ seed: 11 });
  const state = startTrial({ maxHp: 100_000, attack: 10, defense: 0 }, "manual", [], 7391, 1, trial);
  state.room = "arena";
  state.player.x = 12;
  state.player.y = 2;
  state.bossHp = state.bossMaxHp = 1e7;
  const session = new TrialSession(base, state);
  return { base, state, session };
}

test("a trial: the session's desk fills it in, its decay ramps through DEF, and the run outside is left alone", () => {
  const { base, state, session } = attempt();
  assert.equal(state.arcana!.spells!.necroticFrost!.turns, 125);
  state.arcana!.frost = { timer: 500, fields: [east()] };
  session.sync();
  assert.equal(session.game.run.necroticFrost, state.arcana!.frost, "the card reads the attempt's");
  Object.assign(state.elemental, { x: state.player.x + 1, y: state.player.y + 1, incorporeal: false });
  const start = state.bossHp;
  assert.equal(slowedAt(state, state.elemental), 25);
  // A step away from the boss, so only the field strikes it.
  assert.ok(trialStep(state, -1, 0).changed);
  assert.equal(start - state.bossHp, 100, "10x ATK");
  assert.deepEqual(state.arcana!.necro, { boss: { 1: 1 } });
  assert.deepEqual(state.arcana!.strikes!.map((s) => [s.kind, s.damage]), [["necro", 100]]);
  assert.equal(base.run.necroticFrost, undefined);
  session.sync();
  delete state.arcana!.frost!.fields;
  const next = state.bossHp;
  assert.ok(trialStep(state, 1, 0).changed);
  assert.equal(next - state.bossHp, 200, "20x, out of any field");
});

test("a trial: a boss gone incorporeal can't be struck, so its decay waits", () => {
  const { state, session } = attempt();
  state.arcana!.frost = { timer: 500 };
  state.arcana!.necro = { boss: { 1: 4 } };
  session.sync();
  Object.assign(state.elemental, { x: state.player.x + 9, y: state.player.y, incorporeal: true });
  const start = state.bossHp;
  assert.ok(trialStep(state, -1, 0).changed);
  assert.equal(state.bossHp, start);
  assert.deepEqual(state.arcana!.necro, { boss: { 1: 4 } });
});

test("what an attempt saves of it is checked", () => {
  const a = decodeTrialArcana({ run: {}, beamTurns: 0, frost: { timer: 5, casts: 1, fields: [east()] }, necro: { boss: { 1: 2 }, x: { 1: -1 }, y: 3 } })!;
  assert.deepEqual(a.frost, { timer: 5, casts: 1, fields: [east()] });
  assert.deepEqual(a.necro, { boss: { 1: 2 } });
  const b = decodeTrialArcana({ run: {}, beamTurns: 0, frost: { timer: 0 }, necro: 3 })!;
  assert.deepEqual([b.frost, b.necro], [undefined, undefined]);
});
