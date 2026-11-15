// Phantasm's research (docs/agents/arcana.md): Phantasm Drain Radius, Phantasm
// Rotation Speed and Phantasm Stun, opened by the Breakthrough skill Phantasm Research.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkpoint } from "../src/goals.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../src/progression/archives.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { ghostStrikes, type VolleyTurn } from "../src/volley.ts";
import { phantasmEffects, stunFor } from "../src/arcana/phantasm.ts";
import { bout, heroHpAfter, instakill, predict, replies } from "../src/combat.ts";
import { shoots } from "../src/enemies/ranged.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { decodeTrial, startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import { bossClock, bossTurn, foeActs } from "../src/proving-grounds/trial-spells.ts";

type Phantasmic = "phantasmBlast" | "phantasmSpin" | "phantasmStun";
const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };
const minutes = (hours: number) => Math.round(hours * 60);
const hero = { x: 4, y: 4, attack: 100, defense: 0, hp: 100, maxHp: 100 } as Player;

/** A board of one enemy per spot, for `ghostStrikes` itself, keeping the stuns it marks. */
function board(spots: readonly (readonly [number, number])[], over: Partial<Enemy> = {}) {
  const cells = new Map<string, Tile>(spots.map(([x, y]) => [`${x},${y}`, { kind: "enemy", enemy: { ...brute, ...over } }]));
  return {
    tile: (x: number, y: number): Tile => cells.get(`${x},${y}`) ?? { kind: "floor" },
    clear: (x: number, y: number) => void cells.delete(`${x},${y}`),
    wound: (x: number, y: number, damage: number) => {
      const t = cells.get(`${x},${y}`)!;
      t.enemy = { ...t.enemy!, hp: t.enemy!.hp - damage };
    },
    markStun: (x: number, y: number, turns: number) => {
      const t = cells.get(`${x},${y}`)!;
      t.stun = turns;
      t.enemy = { ...t.enemy!, stun: turns };
    },
    floorEnemies: () => [],
  } as unknown as VolleyTurn["board"] & { markStun(x: number, y: number, turns: number): void };
}
const struckAt = (out: ReturnType<typeof ghostStrikes>) => out.shots.map((s) => `${s.to.x},${s.to.y}`).sort();

test("the Breakthrough skill Phantasm Research opens all three projects, down and left of Lifespring Research; Tower VIII's floor 30 pays 5 Breakthrough", () => {
  const skill = UPGRADES.find((u) => u.id === "phantasmResearch")!;
  assert.deepEqual([skill.base, skill.max, skill.currency], [5, 1, "breakthrough"]);
  const nodes = TREES.find((t) => t.id === "breakthrough")!.nodes, at = (id: string) => nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("phantasmResearch").x, at("phantasmResearch").y, at("phantasmResearch").requires], [30, 237, ["lifespringResearch"]]);
  assert.deepEqual([at("lifespringResearch").x, at("lifespringResearch").y], [50, 213]);
  assert.equal(nodes.filter((n) => n.x === 30 && n.y === 237).length, 1, "nothing else stands there");
  for (const id of ["phantasmBlast", "phantasmSpin", "phantasmStun"] as const) {
    assert.ok(RESEARCH[id].requires.some((r) => "upgrade" in r && r.upgrade === "phantasmResearch"), id);
    assert.equal(RESEARCH[id].categories[0], "arcana", id);
  }
  assert.deepEqual(checkpoint(8, 30), { floor: 30, reward: { kind: "breakthrough", amount: 5 }, premium: { kind: "currency", currency: "arcanite", amount: 10 } });
});

test("all three projects run on the spec's schedules and values", () => {
  const blast = RESEARCH.phantasmBlast.levels, spin = RESEARCH.phantasmSpin.levels, stun = RESEARCH.phantasmStun.levels;
  assert.deepEqual([blast.length, spin.length, stun.length], [7, 20, 3]);
  const at = (levels: typeof blast, i: number) => [levels[i]!.gold, minutes(levels[i]!.hours)];
  assert.deepEqual(at(blast, 0), [900_000, 22 * 60 + 13]);
  assert.deepEqual(at(blast, 3), [77_430_000, (3 * 24 + 21) * 60 + 42]);
  assert.deepEqual(at(blast, 5), [2_140_000_000, (6 * 24 + 20) * 60 + 49]);
  assert.deepEqual(at(blast, 6), [6_880_000_000, (8 * 24 + 5) * 60 + 30]);
  assert.deepEqual(at(spin, 0), [250_000, 20 * 60]);
  assert.deepEqual(at(spin, 9), [276_620_000, (5 * 24 + 17) * 60 + 31]);
  assert.deepEqual(at(spin, 19), [8_840_000_000, (31 * 24 + 15) * 60 + 40]);
  assert.deepEqual([at(stun, 0), at(stun, 1), at(stun, 2)], [[50_000_000, (3 * 24 + 19) * 60 + 5], [250_000_000, (7 * 24 + 5) * 60 + 25], [1_250_000_000, (13 * 24 + 21) * 60 + 19]]);
  const s = defaults();
  const values = (id: Phantasmic, n: number) => Array.from({ length: n }, (_, i) => {
    s.archives.levels[id] = i + 1;
    return researched(s.archives, id);
  });
  const shown = (id: Phantasmic, level: number) => {
    s.archives.levels[id] = level;
    return RESEARCH_TARGETS[id].shown(researched(s.archives, id));
  };
  assert.deepEqual(values("phantasmBlast", 7), [10, 15, 20, 25, 30, 35, 40]);
  assert.deepEqual(values("phantasmSpin", 20).filter((_, i) => [0, 1, 2, 19].includes(i)), [150, 200, 250, 1100], "1.5°, 2°, 2.5° … 11°");
  assert.deepEqual(values("phantasmStun", 3), [1, 2, 3]);
  assert.deepEqual([shown("phantasmBlast", 0), shown("phantasmBlast", 1), shown("phantasmBlast", 7)], ["None", "1 tile", "4 tiles"]);
  assert.deepEqual([shown("phantasmSpin", 0), shown("phantasmSpin", 20)], ["1° a turn", "11° a turn"]);
  assert.deepEqual([shown("phantasmStun", 0), shown("phantasmStun", 1), shown("phantasmStun", 3)], ["None", "1 turn", "3 turns"]);
});

test("the rule reads the research as it strikes: the blast in tiles, the spin and the stun", () => {
  assert.deepEqual(phantasmEffects(), { blast: 0.1, drain: 0, spin: 100, cooldown: 0, stun: 0 }, "untrained, as before");
  const g = new Game(defaults(), random(5));
  g.newRun({ seed: 7 });
  g.save.arcana.owned.phantasm = [0, 0, 0];
  assert.deepEqual([g.arcana.phantasmRule()!.blast, g.arcana.phantasmRule()!.drain, g.arcana.phantasmRule()!.spin, g.arcana.phantasmRule()!.stun], [0.1, undefined, 100, undefined]);
  Object.assign(g.save.archives.levels, { phantasmBlast: 2, phantasmSpin: 20, phantasmStun: 3 });
  const rule = g.arcana.phantasmRule()!;
  assert.deepEqual([rule.blast, rule.drain, rule.spin, rule.stun], [0.1, 1.5, 1100, 3]);
});

test("Drain Radius: a ghost's strike damages every enemy within its radius of the tile it touched, 1 tile the orthogonal ones, 1.5 the diagonals too", () => {
  // The ghost at rest rides one tile above the hero, over (4, 5).
  const spots = [[4, 5], [3, 5], [5, 5], [4, 6], [3, 6], [5, 6], [4, 7], [2, 5]] as const;
  const reach = ({ blast, drain }: { blast: number; drain: number }) => struckAt(ghostStrikes({ board: board(spots), wrap: 0, hero, beams: undefined }, { boost: 10, blast, drain, spin: 100 }, { turns: 1, ring: 1, ghosts: [0] }));
  assert.deepEqual(reach(phantasmEffects()), ["4,5"]);
  assert.deepEqual(reach(phantasmEffects({ drain: 10 })), ["3,5", "4,5", "4,6", "5,5"]);
  assert.deepEqual(reach(phantasmEffects({ drain: 15 })), ["3,5", "3,6", "4,5", "4,6", "5,5", "5,6"]);
  assert.deepEqual(reach(phantasmEffects({ drain: 20 })), ["2,5", "3,5", "3,6", "4,5", "4,6", "4,7", "5,5", "5,6"]);
});

test("Rotation Speed: a fast ring strikes what it sweeps over between one turn and the next", () => {
  // The ghost turns from 11° to 22° this turn; it touches (5, 5) from past 14.5°.
  const spots = [[5, 5]] as const, s = () => ({ turns: 2, ring: 1, ghosts: [0] });
  const slow = ghostStrikes({ board: board(spots), wrap: 0, hero, beams: undefined }, { boost: 10, blast: 0.1, spin: 100 }, { ...s(), turns: 12 });
  assert.deepEqual(slow.shots, [], "at 1° a turn it sits at 11° to 12°, short of the tile");
  const fast = ghostStrikes({ board: board(spots), wrap: 0, hero, beams: undefined }, { boost: 10, blast: 0.1, spin: 1100 }, s());
  assert.deepEqual(struckAt(fast), ["5,5"]);
  const tick = fast.struck[0]!.tick;
  assert.ok(tick > 1 && tick < 100, `struck part way along the arc, at tick ${tick}`);
  assert.ok(fast.struck[0]!.direction > 1100 && fast.struck[0]!.direction < 2200);
});

test("Stun: what a ghost's strike leaves standing is stunned, a Greater Boss half as long, rounded down", () => {
  assert.deepEqual([1, 2, 3].map((n) => stunFor(n, "greaterBoss")), [0, 1, 1]);
  assert.deepEqual([1, 2, 3].map((n) => stunFor(n, "boss")), [1, 2, 3]);
  const spots = [[4, 5], [3, 5]] as const, rule = { boost: 10, blast: 0.1, drain: 1, spin: 100, stun: 3 };
  const b = board(spots);
  ghostStrikes({ board: b, wrap: 0, hero, beams: undefined }, rule, { turns: 1, ring: 1, ghosts: [0] });
  assert.deepEqual([b.tile(4, 5).stun, b.tile(3, 5).stun], [3, 3]);
  const great = board(spots, { strength: "greaterBoss" });
  ghostStrikes({ board: great, wrap: 0, hero, beams: undefined }, rule, { turns: 1, ring: 1, ghosts: [0] });
  assert.equal(great.tile(4, 5).stun, 1);
  const none = board(spots);
  ghostStrikes({ board: none, wrap: 0, hero, beams: undefined }, { ...rule, stun: undefined }, { turns: 1, ring: 1, ghosts: [0] });
  assert.equal(none.tile(4, 5).stun, undefined, "unresearched, nothing is stunned");
  const fell = board(spots, { hp: 1 });
  ghostStrikes({ board: fell, wrap: 0, hero, beams: undefined }, rule, { turns: 1, ring: 1, ghosts: [0] });
  assert.equal(fell.tile(4, 5).kind, "floor", "a kill leaves nothing to stun");
});

/** A Tower run on an open floor holding `spots` enemies, holding Phantasm with `research` done, the hero at (4, 4). */
function arena(spots: readonly (readonly [number, number])[], research: Partial<Record<Phantasmic, number>>, over: Partial<Enemy> = {}) {
  const g = new Game(defaults(), random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [x, y] of spots) w.cells.set(`${x},${y}`, { kind: "enemy", enemy: { ...brute, ...over } });
  Object.assign(g.run.player, { x: 4, y: 4, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.phantasm = [0, 0, 0];
  Object.assign(g.save.archives.levels, research);
  return g;
}

test("in a run, a stun counts down a turn at a time, is saved with the run's changes, and a bad one fails the run", () => {
  // The ghost at rest over (5, 5) as the hero steps right to (5, 4).
  const g = arena([[5, 5]], { phantasmStun: 2 });
  g.run.phantasm = { timer: 100, turns: 1, ring: 1, ghosts: [0] };
  assert.ok(g.move(1, 0));
  assert.equal(g.run.phantasm.ghosts, undefined, "the ghost struck");
  assert.equal(g.world.tile(5, 5).enemy!.stun, 1, "stunned for 2, the turn it was struck sat out");
  g.save.tower.run = g.towerRun;
  const back = decode(JSON.stringify(g.save));
  assert.equal(back.tower.run!.changes["5,5"]!.stun, 1, "kept with the run's changes");
  const bad = decode(JSON.stringify({ ...g.save, tower: { ...g.save.tower, run: { ...g.save.tower.run, changes: { "5,5": { ...g.run.changes["5,5"], stun: 0.5 } } } } }));
  assert.equal(bad.tower.run, null, "a broken stun fails the run, as any broken change does");
  assert.ok(g.move(-1, 0));
  assert.equal(g.world.tile(5, 5).enemy!.stun, undefined, "worn off");
  assert.equal(g.run.changes["5,5"]!.stun, undefined);
});

test("a stunned enemy doesn't shoot", () => {
  const archer: Enemy = { ...brute, ranged: true };
  assert.deepEqual([shoots(archer), shoots({ ...archer, stun: 1 }), shoots({ ...archer, stunned: true })], [true, false, false]);
});

const fighter = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 1000, maxHp: 1000, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;

test("a fight with a stunned enemy skips as many of its strikes as its stun has turns left, as predicted", () => {
  // Four strikes of 12 fell 48 HP: the enemy has three chances to strike back, a Fast one four.
  const e: Enemy = { ...brute, hp: 48, attack: 30, strength: "normal" };
  for (const fast of [false, true]) for (const stun of [0, 1, 2, 3, 5]) for (const over of [{}, { lifesteal: 10 }, { thorns: 3 }, { slowdown: 40 }] as Partial<Player>[]) {
    const p = fighter(over), foe: Enemy = { ...e, ...(fast ? { fast: true } : {}), ...(stun ? { stun } : {}) };
    const r = predict(p, foe), fight = bout(p, foe), taken = fight.strikes.filter((s) => s.by === "enemy").length;
    const what = JSON.stringify({ fast, stun, over });
    assert.equal(taken, replies(r), `as many strikes as predicted ${what}`);
    if (r.hpAfter !== undefined) assert.equal(heroHpAfter(fight, p.hp), r.hpAfter, `ends as predicted ${what}`);
    else assert.equal(heroHpAfter(fight, p.hp), p.hp - r.damage, `takes the predicted damage ${what}`);
    if (!over.slowdown && !over.thorns) assert.equal(taken, Math.max(0, 3 + (fast ? 1 : 0) - stun), what);
  }
  const fastOne = { ...e, hp: 12, fast: true as const };
  assert.equal(instakill(predict(fighter(), fastOne)), false);
  assert.equal(instakill(predict(fighter(), { ...fastOne, stun: 1 })), true, "a stun sits out a Fast enemy's opening");
});

/** A Light Elemental trial in its arena, holding Phantasm with `research` done, the hero at `at` and one ghost out. */
function trialArena(research: Partial<Record<Phantasmic, number>>, at: { x: number; y: number }, trial: "light-elemental" | "keymaster" = "light-elemental") {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.phantasm = [0, 0, 0];
  Object.assign(base.save.archives.levels, research);
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, trial, {});
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  state.room = "arena";
  Object.assign(state.player, at);
  Object.assign(state.elemental, { x: at.x, y: at.y + 1 });
  state.bossHp = state.bossMaxHp = 1_000_000;
  session.sync();
  state.arcana!.phantasm = { timer: 100, turns: 1, ring: 1, ghosts: [0] };
  return state;
}

test("in a trial, a ghost's strike stuns lesser foes for the full stun and the boss half as long, holding their turns and the boss clock", () => {
  // The ghost at rest rides a tile above the hero, onto the Keymaster at (12, 12); a mimic stands beside it.
  const state = trialArena({ phantasmStun: 3, phantasmBlast: 1 }, { x: 12, y: 11 }, "keymaster");
  Object.assign(state.keymaster!, { spawned: 1, mimics: [{ id: 1, x: 13, y: 12, hp: 1_000_000, maxHp: 1_000_000 }] });
  assert.ok(trialStep(state, 0, 0).changed);
  assert.deepEqual(state.arcana!.stuns, { boss: 1, "mimic:1": 3 }, "3 turns, the boss half of it, rounded down");
  assert.equal(foeActs(state, state.elemental, "boss"), false, "no counter");
  assert.equal(foeActs(state, state.elemental, "move:boss"), false, "no step");
  assert.equal(foeActs(state, state.keymaster!.mimics[0]!, "mimic:1"), false, "no bite");
  assert.equal(foeActs(state, state.keymaster!.mimics[0]!, "move:mimic:1"), false, "no step");
  const clock = bossClock(state);
  bossTurn(state, state.elemental);
  assert.equal(bossClock(state), clock - 100, "the boss clock stands still for the turn");
  assert.deepEqual(decodeTrial(JSON.parse(JSON.stringify(state)))!.arcana!.stuns, { boss: 1, "mimic:1": 3 }, "saved with the attempt");
  assert.ok(trialStep(state, 0, 0).changed);
  assert.deepEqual(state.arcana!.stuns, { "mimic:1": 2 }, "each a turn shorter, the boss's gone");
  assert.equal(foeActs(state, state.elemental, "boss"), true);
});

test("in a trial, the 1-turn stun leaves the boss free, and unresearched nothing is stunned", () => {
  const one = trialArena({ phantasmStun: 1 }, { x: 12, y: 11 });
  assert.ok(trialStep(one, 0, 0).changed);
  assert.equal(one.arcana!.stuns, undefined);
  const none = trialArena({}, { x: 12, y: 11 });
  assert.ok(trialStep(none, 0, 0).changed);
  assert.equal(none.arcana!.phantasm!.ghosts, undefined, "the ghost struck");
  assert.equal(none.arcana!.stuns, undefined);
});
