// Overseer Zap (docs/agents/arcana.md): research opened by Tower III's floor 400
// Goal; once a level is done, every few turns a Thunderbolt strikes a random
// enemy in Overseer's beams, as hard as Thunderbolt, times Overseer's Bonus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeArcanaRun, valuesAt } from "../src/arcana/arcana.ts";
import { checkpoint } from "../src/goals.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../src/progression/archives.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import { random } from "../src/random.ts";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { Enemy } from "../src/entities.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Shot } from "../src/volley.ts";

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };

/** A Tower run on an open floor holding `spots` enemies, holding Overseer, with
 * `level` levels of Overseer Zap researched. Its one beam points up the board. */
function arena(spots: readonly (readonly [number, number])[], level = 1) {
  const g = new Game(defaults(), random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [x, y] of spots) w.cells.set(`${x},${y}`, { kind: "enemy", enemy: { ...brute } });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.overseer = [0, 0, 0];
  g.save.archives.levels.overseerZap = level;
  return g;
}
/** The zap ready on the next turn, the beam straight up the board. */
function ready(g: Game) {
  g.save[g.mode].runArcana.zap = 1;
  g.run.beamTurns = 0;
}
function turn(g: Game) {
  assert.ok(g.move(g.run.player.x === 0 ? 1 : -1, 0));
  return zaps(g.volley?.shots);
}
const zaps = (shots: readonly Shot[] | undefined) => (shots ?? []).filter((s) => s.thunderbolt);

test("Tower III's floor 400 opens it, and the Goals pay the premium rewards asked for", () => {
  assert.deepEqual(checkpoint(3, 400)?.reward, { kind: "unlock", unlock: "overseerZap" });
  assert.deepEqual(checkpoint(3, 400)?.premium, { kind: "currency", currency: "gold", amount: 5_000_000 });
  assert.deepEqual(checkpoint(4, 30)?.premium, { kind: "currency", currency: "gold", amount: 150_000 });
  assert.deepEqual(RESEARCH.overseerZap.requires, [{ upgrade: "archives" }, { goalUnlock: "overseerZap" }]);
});

test("its research holds the spec's 18 levels, and shows a 20-turn cooldown before the first", () => {
  const levels = RESEARCH.overseerZap.levels;
  assert.equal(levels.length, 18);
  assert.deepEqual([levels[0]!.gold, levels[1]!.gold, levels[17]!.gold], [200_000_000, 200_313_514, 5_472_394_380]);
  assert.equal(Math.round(levels[0]!.hours * 60), 6 * 1440 + 16 * 60);
  assert.equal(Math.round(levels[12]!.hours * 60), 15 * 1440 + 16 * 60 + 23);
  assert.equal(Math.round(levels[17]!.hours * 60), 28 * 1440 + 23 * 60 + 32);
  const a = defaults().archives;
  assert.equal(RESEARCH_TARGETS.overseerZapTurns.shown(researched(a, "overseerZapTurns")), "20 turns");
  a.levels.overseerZap = 1;
  assert.equal(researched(a, "overseerZapTurns"), 19);
  a.levels.overseerZap = 18;
  assert.equal(researched(a, "overseerZapTurns"), 2);
});

test("unresearched, it never strikes", () => {
  const g = arena([[1, 8]], 0);
  assert.equal(g.arcana.zapRule(), undefined);
  ready(g);
  assert.equal(turn(g).length, 0);
});

test("researched, it strikes an enemy in the beam every cooldown, never one outside", () => {
  const g = arena([[1, 8], [8, 1]]);
  assert.equal(g.arcana.zapRule()?.turns, 19);
  const counted = [];
  for (let i = 0; i < 18; i++) {
    g.run.beamTurns = 0;
    counted.push(turn(g).length);
  }
  assert.ok(counted.every((n) => n === 0), "nothing for 18 turns");
  g.run.beamTurns = 0;
  const shots = turn(g);
  assert.equal(shots.length, 1, "the 19th strikes once");
  assert.deepEqual(shots[0]!.to, { x: 1, y: 8 }, "the one in the beam, not the one east");
  assert.equal(g.save.tower.runArcana.zap, undefined, "the cooldown starts over");
  assert.equal(g.save.tower.runArcana.zaps, 1);
  turn(g);
  assert.equal(g.save.tower.runArcana.zap, 18);
});

test("it strikes as hard as Thunderbolt, or its first level without it, times Overseer's Bonus", () => {
  const g = arena([[1, 8]]);
  const base = g.arcana.zapRule()!.boost;
  g.save.arcana.owned.thunderbolt = [0, 0, 0];
  assert.equal(g.arcana.zapRule()!.boost, base, "Thunderbolt's first level either way");
  g.save.arcana.owned.thunderbolt = [5, 0, 0];
  const [first] = valuesAt("thunderbolt", [0, 0, 0]), [fifth] = valuesAt("thunderbolt", [5, 0, 0]);
  assert.equal(g.arcana.zapRule()!.boost, (base * fifth) / first);
  g.arcana.toggle("thunderbolt");
  assert.equal(g.arcana.zapRule()!.boost, (base * fifth) / first, "Thunderbolt off still sets it");
  ready(g);
  const [shot] = turn(g);
  assert.equal(shot!.damage, Math.round(100 * g.arcana.zapRule()!.boost * 8 * 1000) / 1000, "100 ATK x its boost x 8 (Bonus)");
});

test("with no enemy in the beams it stays ready, and strikes the first turn one is", () => {
  const g = arena([[8, 1]]);
  ready(g);
  assert.equal(turn(g).length, 0);
  assert.equal(g.save.tower.runArcana.zap, 0, "ready, waiting");
  (g.world as RoomWorld).cells.set("1,8", { kind: "enemy", enemy: { ...brute } });
  g.run.beamTurns = 0;
  assert.equal(turn(g).length, 1);
});

test("Overseer off, it waits and forgets its cooldown", () => {
  const g = arena([[1, 8]]);
  turn(g);
  assert.equal(g.save.tower.runArcana.zap, 18);
  g.arcana.toggle("overseer");
  assert.equal(g.save.tower.runArcana.zap, undefined);
  assert.equal(g.arcana.zapRule(), undefined);
  ready(g);
  assert.equal(turn(g).length, 0);
});

test("a saved run keeps its countdown and strikes, within bounds", () => {
  assert.deepEqual(decodeArcanaRun({ toggles: 0, off: [], timers: {}, zap: 0, zaps: 3 }), { toggles: 0, off: [], timers: {}, zap: 0, zaps: 3 });
  assert.deepEqual(decodeArcanaRun({ zap: -1, zaps: 0 }), { toggles: 0, off: [], timers: {} });
});

test("in a trial it strikes the boss standing in the beam", () => {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.overseer = [0, 0, 0];
  base.save.archives.levels.overseerZap = 1;
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, "light-elemental");
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  state.room = "arena";
  state.player.x = 12;
  state.player.y = 6;
  state.bossHp = state.bossMaxHp = 1_000_000;
  state.arcana!.run.zap = 1;
  session.sync();
  assert.ok(trialStep(state, 0, 0).changed);
  const struck = state.arcana!.strikes!.filter((s) => s.kind === "thunderbolt");
  assert.equal(struck.length, 1);
  assert.deepEqual(struck[0]!.to, { x: 12, y: 12 });
  assert.equal(state.bossHp, 1_000_000 - struck[0]!.damage);
  assert.equal(state.arcana!.run.zaps, 1);
  assert.equal(state.arcana!.run.zap, undefined);
});
