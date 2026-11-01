// Lifespring (docs/agents/arcana.md): a cooldown's Effect Waves, then a field the
// width of the hero's shot range whose HP Pool spends itself on what it touches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA } from "../src/arcana/arcana.ts";
import { fieldHit, lifespringEffects, springAmplify, stepLifespring, TINT_TURNS, validLifespring, WAVE_INTERVAL, type LifespringRun } from "../src/arcana/lifespring.ts";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { decodeTrial, startTrial } from "../src/proving-grounds/trial.ts";
import { trialArcanaTurn } from "../src/proving-grounds/trial-arcana.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy } from "../src/entities.ts";
import type { TowerRun } from "../src/runs.ts";

const brute: Enemy = { name: "Brute", hp: 1000, attack: 0, defense: 5000, tier: 1, strength: "weak" };

/** A Tower run on an open floor holding `spots` enemies of `hp` HP, holding Lifespring. */
function arena(spots: readonly (readonly [number, number])[], hp = 1000, defense = brute.defense) {
  const s = defaults();
  s.upgrades.inspirationUndos = 1;
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [x, y] of spots) w.cells.set(`${x},${y}`, { kind: "enemy", enemy: { ...brute, hp, defense } });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.lifespring = [0, 0, 0];
  return g;
}
const turn = (g: Game) => assert.ok(g.move(g.run.player.x % 2 ? -1 : 1, 0));
const hpAt = (g: Game, x: number, y: number) => g.world.tile(x, y).enemy?.hp;

test("its tables hold the spec's ends, sizes and prices", () => {
  const [hp, waves, cooldown] = ARCANA.lifespring.attributes;
  assert.deepEqual([hp.name, hp.steps.length, hp.steps[0], hp.steps[18], hp.steps.at(-1)], ["HP", 31, [2, 0], [723, 254], [9119, 3406]]);
  assert.deepEqual([waves.name, waves.steps.length, waves.steps[0], waves.steps.at(-1)], ["Effect Waves", 5, [1, 0], [5, 1400]]);
  assert.deepEqual([cooldown.name, cooldown.steps.length, cooldown.steps[0], cooldown.steps[19], cooldown.steps.at(-1)], ["Cooldown", 26, [300, 0], [110, 346], [50, 1492]]);
  assert.equal(ARCANA.lifespring.trigger.on, "cooldown");
});

test("a cooldown's waves come every 4 turns, then the field, then its pool adds up, blue", () => {
  const s: LifespringRun = { timer: 1 }, rule = { waves: 2, turns: 300, amount: 50 };
  const steps = Array.from({ length: 2 * WAVE_INTERVAL + 1 }, () => stepLifespring(s, rule));
  assert.deepEqual(steps.map((o) => (o.wave ? "w" : o.formed ? "F" : ".")).join(""), "w...w...F");
  assert.equal(s.pool, 50);
  assert.equal(s.tint, undefined, "a first pool is green");
  assert.equal(s.timer, 300 - 2 * WAVE_INTERVAL);
  s.timer = 1;
  for (let i = 0; i <= 2 * WAVE_INTERVAL; i++) stepLifespring(s, rule);
  assert.equal(s.pool, 100, "the next activation adds to what is left");
  assert.equal(s.tint, TINT_TURNS);
  for (let i = 0; i < TINT_TURNS; i++) stepLifespring(s, rule);
  assert.equal(s.tint, undefined, "and the blue fades");
});

test("the pool pays exactly what felling costs, or all it has, prorated", () => {
  assert.deepEqual(fieldHit(500, 1000, 10), { damage: 1000, pool: 400 });
  assert.deepEqual(fieldHit(40, 1000, 10), { damage: 400, pool: 0 });
  assert.equal(springAmplify(5, 0), 1);
  assert.equal(springAmplify(5, 2), 10, "the spec's two waves: 10x");
});

test("a field strikes as the turn ends, closest first, through DEF, until its pool runs out", () => {
  const g = arena([[1, 2], [2, 0], [15, 15]], 1000);
  g.run.lifespring = { pool: 1500 };
  turn(g); // The hero stands at (1, 0): (2, 0) is 1 off, (1, 2) is 2.
  assert.equal(hpAt(g, 2, 0), undefined, "the closest falls, its DEF no help");
  assert.equal(hpAt(g, 1, 2), 500, "the next takes what is left");
  assert.equal(hpAt(g, 15, 15), 1000, "out of range: untouched");
  assert.equal(g.run.lifespring.pool, undefined, "spent");
  assert.equal(g.run.kills, 1);
});

test("its reach is the hero's shot range, 3 tiles until trained", () => {
  const g = arena([[4, 0]]);
  g.run.lifespring = { pool: 1 };
  assert.equal(g.lifespringReach, 300);
  turn(g); // 3 tiles from (1, 0): the edge counts.
  assert.equal(hpAt(g, 4, 0), 999);
  const far = arena([[5, 0]]);
  far.run.lifespring = { pool: 1 };
  turn(far);
  assert.equal(hpAt(far, 5, 0), 1000);
});

test("Effect Waves hit the whole floor at once, amplify the field and mark without waking anything", () => {
  const g = arena([[15, 15], [2, 0]], 1000);
  g.run.lifespring = { timer: 1 };
  turn(g);
  assert.equal(g.world.tile(15, 15).enemy?.sprung, 1);
  assert.equal(g.world.tile(2, 0).enemy?.sprung, 1);
  assert.equal(g.world.tile(15, 15).enemy?.hp, 1000, "a wave does no damage");
  g.run.lifespring = { pool: 10 };
  turn(g); // Back at (0, 0): (2, 0) is in range.
  assert.equal(hpAt(g, 2, 0), 950, "5x on one wave's hit");
  const back = decode(JSON.stringify(g.save));
  assert.equal((back.tower.run as TowerRun).changes["15,15"]?.sprung, 1, "the mark is saved");
});

test("what the step brings into range meets the field before an arrow; what stood in range waits for the shots", () => {
  const shots = (spots: [number, number][], from: number) => {
    const g = arena(spots, 1000, 0);
    Object.defineProperty(g, "isArcher", { get: () => true });
    Object.assign(g.run.player, { x: from, y: 0 });
    g.run.lifespring = { pool: 2000 };
    (g.run as TowerRun).volleys = { turn: 0 };
    assert.ok(g.move(1, 0));
    return g.volley!.shots.filter((s) => s.by === "hero");
  };
  // From (0, 0) to (1, 0), (4, 0) comes into the 3 tiles' range this turn.
  const entered = shots([[4, 0]], 0);
  assert.ok(entered[0]!.lifespring, "the field strikes first");
  assert.ok(!entered.some((s) => !s.lifespring), "and no arrow is left to fly at what fell");
  // (3, 0) already stood in range, so the arrow flies first.
  const stood = shots([[3, 0]], 0);
  assert.ok(stood.length >= 2 && !stood[0]!.lifespring && stood.at(-1)!.lifespring, "the arrow, then the field");
});

test("Health Bonus pays once an enemy a wave hit falls, up to its limit, and undo takes it back", () => {
  const g = arena([[2, 0]], 1000), { healthPerKill } = lifespringEffects(g.save);
  g.run.lifespring = { timer: 1 };
  turn(g);
  g.run.lifespring.pool = 10_000;
  const hp = g.run.player.maxHp;
  turn(g);
  assert.equal(g.run.lifespring.health, healthPerKill);
  assert.ok(Math.abs(g.run.player.maxHp - hp * (1 + healthPerKill / 100)) < 1e-6);
  assert.equal(g.arcana.lifespringStats!.health, 1 + healthPerKill / 100);
  assert.ok(g.undo());
  assert.equal(g.run.lifespring?.health, undefined);
  assert.equal(g.run.lifespring?.pool, 10_000, "the pool comes back with the enemy");
  assert.equal(hpAt(g, 2, 0), 1000);
  assert.equal(g.run.player.maxHp, hp);

  const capped = arena([[2, 0]], 1);
  capped.run.lifespring = { pool: 100, health: 399.99 };
  capped.world.markSpring?.(2, 0, 1);
  turn(capped);
  assert.equal(capped.run.lifespring.health, 400, "5x at the most");
});

test("Gold and Cell Bonus raise a touched enemy's pay", () => {
  const g = arena([[2, 0]], 1);
  const pay = g.purse.enemyLoot({ ...brute, strength: "greaterBoss" }, 2, 0, 1, false, { gold: 3, cells: 1 });
  const plain = arena([[2, 0]], 1).purse.enemyLoot({ ...brute, strength: "greaterBoss" }, 2, 0);
  assert.equal(pay.gold, 3 * plain.gold);
  assert.equal(pay.cells, 2 * plain.cells);
});

test("switched off, its pool and waves are gone and its Health Bonus stays", () => {
  const g = arena([[2, 0]]);
  g.run.lifespring = { pool: 100, waves: 1, wait: 2, timer: 5, tint: 1, health: 1 };
  assert.ok(g.arcana.toggle("lifespring"));
  assert.deepEqual(g.run.lifespring, { health: 1 });
  turn(g);
  assert.equal(hpAt(g, 2, 0), 1000);
  assert.deepEqual(g.run.lifespring, { health: 1 }, "and nothing runs while off");
  assert.deepEqual(g.arcana.cooldown(g.arcana.held[0]!), { left: 300, turns: 300 });
});

test("hidden by its toggle, the field strikes all the same", () => {
  const g = arena([[2, 0]]);
  g.save.settings.lifespringDamage = false;
  g.run.lifespring = { pool: 10 };
  turn(g);
  assert.equal(hpAt(g, 2, 0), 990);
  assert.ok(!g.volley?.shots.some((s) => s.lifespring));
});

test("the run's state survives a save, and a bad one is dropped", () => {
  const g = arena([]);
  g.run.lifespring = { pool: 12.5, waves: 2, wait: 3, timer: 9, tint: 2, health: 0.05 };
  assert.deepEqual((decode(JSON.stringify(g.save)).tower.run as TowerRun).lifespring, g.run.lifespring);
  assert.ok(!validLifespring({ pool: -1 }));
  (g.run as { lifespring?: unknown }).lifespring = { waves: "x" };
  assert.equal((decode(JSON.stringify(g.save)).tower.run as TowerRun).lifespring, undefined);
});

test("in a trial its waves amplify the field on what stands in the arena", () => {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.lifespring = [0, 0, 0];
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, "light-elemental");
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  assert.ok(state.arcana?.spells?.lifespring);
  assert.equal(state.arcana.spells.lifespring.reach, 300);
  state.room = "arena";
  Object.assign(state.player, { x: 2, y: 12 });
  Object.assign(state, { status: "active", bossHp: 1000 });
  Object.assign(state.elemental, { x: 3, y: 12, incorporeal: false });
  state.arcana.lifespring = { timer: 1 };
  trialArcanaTurn(state, { message: "" });
  assert.equal(state.arcana.springWaves, 1);
  state.arcana.lifespring.pool = 10;
  trialArcanaTurn(state, { message: "" });
  assert.equal(state.bossHp, 950, "5x, through DEF");
  assert.equal(state.arcana.lifespring.pool, undefined);
  session.sync();
  const back = decodeTrial(JSON.parse(JSON.stringify(state)));
  assert.equal(back?.arcana?.springWaves, 1);
});
