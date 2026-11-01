// Thunderbolt (docs/agents/arcana.md): a cooldown's bolts on random enemies of
// the floor, the leftovers striking again a turn at a time; and the arcana in
// the Proving Grounds' trials, where all but Aurum Bloom work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCANA, arcanumBoost, boltTargets, decodeArcanaRun, tickCooldowns } from "../src/arcana/arcana.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { random } from "../src/random.ts";
import { landsAt, leavesAt, THUNDERBOLT_FALL_MS, THUNDERBOLT_FLASH_MS, thunderbolts, volleyOver, type Shot, type VolleyTurn } from "../src/volley.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { decodeTrial, startTrial, trialStep, type TrialState } from "../src/proving-grounds/trial.ts";
import { heroAttackOn } from "../src/proving-grounds/trial-spells.ts";
import { TRIALS } from "../src/proving-grounds/catalog.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };

/** A Tower run on an open floor holding `spots` enemies, holding Thunderbolt at `levels`. */
function arena(spots: readonly (readonly [number, number])[], levels: [number, number, number] = [0, 0, 0], hp = 1_000_000) {
  const g = new Game(defaults(), random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [x, y] of spots) w.cells.set(`${x},${y}`, { kind: "enemy", enemy: { ...brute, hp } });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.thunderbolt = levels;
  return g;
}
/** The cooldown about to run out, on the next turn. */
function ready(g: Game) {
  g.save[g.mode].runArcana.timers.thunderbolt = 1;
}
function turn(g: Game) {
  assert.ok(g.move(g.run.player.x === 0 ? 1 : -1, 0));
  return g.volley;
}
const bolts = (shots: readonly Shot[] | undefined) => (shots ?? []).filter((s) => s.thunderbolt);

test("its tables hold the spec's ends, sizes and prices", () => {
  const [mult, quantity, cooldown] = ARCANA.thunderbolt.attributes;
  assert.deepEqual([mult.steps.length, mult.steps[0], mult.steps[3], mult.steps.at(-1)], [36, [10, 0], [16, 17], [9219, 3166]]);
  assert.deepEqual([quantity.steps.length, quantity.steps[0], quantity.steps[7], quantity.steps.at(-1)], [16, [5, 0], [12, 275], [20, 1500]]);
  assert.deepEqual([cooldown.steps.length, cooldown.steps[0], cooldown.steps[8], cooldown.steps.at(-1)], [17, [180, 0], [100, 120], [20, 750]]);
  assert.equal(ARCANA.thunderbolt.trigger.on, "cooldown");
});

test("its targets are distinct and fixed by run and strike, whatever order they come in", () => {
  const all = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 2 * i }));
  const chosen = boltTargets(all, 5, 11, 3);
  assert.equal(new Set(chosen).size, 5);
  assert.deepEqual(boltTargets([...all].reverse(), 5, 11, 3), chosen);
  assert.notDeepEqual(boltTargets(all, 5, 11, 4), chosen);
  assert.equal(boltTargets(all, 20, 11, 3).length, 8);
  const hits = new Map<number, number>();
  for (let strike = 1; strike <= 800; strike++) for (const t of boltTargets(all, 1, 11, strike)) hits.set(t.x, (hits.get(t.x) ?? 0) + 1);
  for (const [x, n] of hits) assert.ok(n > 60 && n < 150, `enemy ${x}: ${n} of 800, about 100 expected`);
});

test("the cooldown runs a turn at a time, strikes as it runs out and starts over at once", () => {
  const g = arena([[4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [3, 7], [7, 3]]);
  assert.deepEqual(g.arcana.cooldown(g.arcana.held[0]!), { left: 180, turns: 180 });
  turn(g);
  assert.deepEqual(g.arcana.cooldown(g.arcana.held[0]!), { left: 179, turns: 180 });
  ready(g);
  const shots = bolts(turn(g)?.shots);
  assert.equal(shots.length, 5, "the Quantity's bolts");
  assert.equal(new Set(shots.map((s) => `${s.to.x},${s.to.y}`)).size, 5, "each on its own enemy");
  assert.deepEqual(g.arcana.cooldown(g.arcana.held[0]!), { left: 180, turns: 180 });
  assert.equal(g.save.tower.runArcana.bolts, undefined, "none left over");
  const next = g.volley;
  turn(g);
  assert.equal(g.volley, next, "no strike until it runs out again");
});

test("a cooldown upgraded while it runs counts down from no more than its new length", () => {
  const timers = { thunderbolt: 150 };
  tickCooldowns([{ id: "thunderbolt", turns: 100 }], timers);
  assert.equal(timers.thunderbolt, 99);
});

test("with fewer enemies than bolts, the rest strike again a turn at a time, each enemy once a turn", () => {
  const g = arena([[4, 4], [5, 5]]);
  ready(g);
  const counts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const shots = bolts(turn(g)?.shots);
    assert.equal(new Set(shots.map((s) => `${s.to.x},${s.to.y}`)).size, shots.length, "once a turn each");
    counts.push(shots.length);
  }
  assert.deepEqual(counts, [2, 2, 1]);
  assert.equal(g.save.tower.runArcana.bolts, undefined);
  const last = g.volley;
  turn(g);
  assert.equal(g.volley, last, "all used up");
  const wounds = [g.world.tile(4, 4), g.world.tile(5, 5)].map((t) => t.wound ?? 0);
  assert.equal(wounds[0]! + wounds[1]!, 5 * 1000, "five hits of ten times ATK");
});

test("the bolts left are wasted once no enemies remain on the floor", () => {
  const g = arena([[4, 4]], [0, 0, 0], 500);
  ready(g);
  const shots = bolts(turn(g)?.shots);
  assert.equal(shots.length, 1);
  assert.equal(g.world.tile(4, 4).kind, "floor");
  assert.equal(g.run.kills, 1);
  assert.match(g.message, /Thunderbolt · /);
  assert.equal(g.save.tower.runArcana.bolts, undefined, "wasted at once");
});

test("a new trigger adds to the bolts still to strike", () => {
  const g = arena([[4, 4]]);
  ready(g);
  turn(g);
  assert.equal(g.save.tower.runArcana.bolts, 4);
  ready(g);
  turn(g);
  assert.equal(g.save.tower.runArcana.bolts, 8);
});

test("a bolt deals Arcanum Damage less DEF, with the beams', and heals and breaks nothing", () => {
  const tiles: Record<string, Tile> = { "3,3": { kind: "enemy", enemy: { ...brute, defense: 50 } } };
  const board = {
    tile: (x: number, y: number) => tiles[`${x},${y}`] ?? { kind: "floor" },
    clear() {},
    wound() {},
    floorEnemies: () => [{ x: 3, y: 3 }],
  } as unknown as VolleyTurn["board"];
  const hero = { x: 0, y: 3, hp: 10, maxHp: 100, attack: 100, defense: 0, keys: {}, lifesteal: 50, armorBreak: 5 } as unknown as Player;
  const plain = thunderbolts({ board, wrap: 0, hero, seed: 1 }, { boost: arcanumBoost(10, { chance: 50, factor: 2 }), bolts: 1, strike: 1 });
  assert.equal(plain.shots[0]!.damage, 2000 - 50, "100 x 10 x (1 + 2 x 50%), less DEF");
  assert.equal(hero.hp, 10);
  assert.equal(plain.left, 0);
  const beamed = thunderbolts({ board, wrap: 0, hero, seed: 1, beams: { count: 4, width: 90, bonus: 8, turns: 0 } }, { boost: 10, bolts: 1, strike: 1 });
  assert.equal(beamed.shots[0]!.damage, 8000 - 50);
});

test("it falls from its tick, and the board waits out its flash", () => {
  const shot: Shot = { by: "hero", thunderbolt: true, from: { x: 1, y: 1 }, to: { x: 1, y: 1 }, damage: 1, tick: 50 };
  const volley = { at: 1000, ms: 200, shots: [shot] };
  assert.equal(leavesAt(volley, shot), 1100);
  assert.equal(landsAt(volley, shot), 1100 + THUNDERBOLT_FALL_MS);
  assert.equal(volleyOver(volley, landsAt(volley, shot) + THUNDERBOLT_FLASH_MS - 1), false);
  assert.equal(volleyOver(volley, landsAt(volley, shot) + THUNDERBOLT_FLASH_MS), true);
});

test("off, it strikes nothing and forgets its cooldown and bolts", () => {
  const g = arena([[4, 4]]);
  ready(g);
  turn(g);
  assert.equal(g.save.tower.runArcana.bolts, 4);
  assert.ok(g.arcana.toggle("thunderbolt"));
  assert.equal(g.save.tower.runArcana.bolts, undefined);
  assert.equal(g.save.tower.runArcana.timers.thunderbolt, undefined);
  assert.equal(g.arcana.cooldown(g.arcana.held[0]!)!.left, 180);
  const wound = g.world.tile(4, 4).wound;
  turn(g);
  assert.equal(g.world.tile(4, 4).wound, wound);
  assert.equal(g.save.tower.runArcana.timers.thunderbolt, undefined);
});

test("the Toggles hide its animation, and it strikes all the same", () => {
  const g = arena([[4, 4]]);
  g.save.settings.thunderboltAnimation = false;
  ready(g);
  g.volley = null;
  turn(g);
  assert.equal(g.volley, null);
  assert.equal(g.world.tile(4, 4).wound, 1000);
});

test("undo takes its strike back, and the cooldown stays where it went", () => {
  const g = arena([[4, 4]]);
  g.save.upgrades.inspirationUndos = 1;
  ready(g);
  turn(g);
  assert.ok(g.run.changes["4,4"]);
  assert.ok(g.undo());
  assert.equal(g.run.changes["4,4"], undefined);
  assert.equal(g.save.tower.runArcana.timers.thunderbolt, 180);
});

test("it works in the Delve too, on the hero's area of its equivalent floor", () => {
  const g = new Game(defaults(), random(5));
  g.save.arcana.owned.thunderbolt = [0, 0, 0];
  g.save.delve.run = null;
  g.switchMode("delve");
  g.newRun({ seed: 9 });
  const p = g.run.player;
  assert.equal(g.arcana.held.length, 1);
  const listed = g.world.floorEnemies!(p.x, p.y);
  assert.ok(listed.length > 0, "enemies on the floor");
  g.save.delve.runArcana.timers.thunderbolt = 1;
  // Any open direction: the hero has one at the entrance.
  const moved = [[0, 1], [1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => g.world.tile(p.x + dx!, p.y + dy!).kind === "floor" && g.move(dx!, dy!));
  assert.ok(moved);
  const shots = bolts(g.volley?.shots);
  assert.ok(shots.length > 0);
  for (const s of shots) assert.ok(listed.some((o) => o.x === s.to.x && o.y === s.to.y), "from the area's list");
});

test("a saved run keeps its bolts and strikes, within bounds", () => {
  assert.deepEqual(decodeArcanaRun({ toggles: 1, off: [], timers: { thunderbolt: 7 }, bolts: 3, strikes: 2 }), { toggles: 1, off: [], timers: { thunderbolt: 7 }, bolts: 3, strikes: 2 });
  assert.deepEqual(decodeArcanaRun({ bolts: -1, strikes: "x" }), { toggles: 0, off: [], timers: {} });
});

// --- The trials ---

function trial(trialId: TrialState["trialId"], owned: Record<string, [number, number, number]>, options: { multiPart?: boolean } = {}) {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  Object.assign(base.save.arcana.owned, owned);
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, trialId, options);
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  // Inside the arena, clear of everything, as its first turn.
  state.room = "arena";
  state.player.x = 2;
  state.player.y = 12;
  return { base, session, state };
}
const wait = (s: TrialState) => assert.ok(trialStep(s, 0, 0).changed);

test("a trial holds every arcanum owned but Aurum Bloom", () => {
  const { session } = trial("light-elemental", { thunderbolt: [0, 0, 0], ricochetShot: [0, 0, 0], overseer: [0, 0, 0], aurumBloom: [0, 0, 0] });
  assert.deepEqual(session.game.arcana.held.map((h) => h.id).sort(), ["overseer", "ricochetShot", "thunderbolt"]);
  assert.equal(session.game.arcana.aurumBloom(), undefined);
});

test("a trial with no arcana holds none and adds nothing to its attempt", () => {
  const { state } = trial("light-elemental", { aurumBloom: [0, 0, 0] });
  assert.equal(state.arcana, undefined);
});

test("bolts strike the boss, a turn at a time, without making it teleport", () => {
  const { session, state } = trial("light-elemental", { thunderbolt: [0, 0, 0] });
  state.bossHp = state.bossMaxHp = 1_000_000;
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  const hp = [state.bossHp];
  for (let i = 0; i < 6; i++) {
    wait(state);
    hp.push(state.bossHp);
  }
  assert.deepEqual(hp.map((n, i) => (i ? hp[i - 1]! - n : 0)), [0, 1000, 1000, 1000, 1000, 1000, 0], "five bolts of ten times ATK, one a turn, on the one enemy");
  assert.equal(state.elemental.incorporeal, false);
  assert.equal(state.arcana!.strikes!.length, 0, "the last turn struck nothing");
});

test("an incorporeal boss can't be struck, and with nothing else there the bolts are wasted", () => {
  const { session, state } = trial("light-elemental", { thunderbolt: [0, 0, 0] });
  state.steps = 11;
  state.elemental = { x: 12, y: 12, incorporeal: true, teleport: { from: { x: 6, y: 6 }, step: 1 } };
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  const hp = state.bossHp;
  wait(state);
  assert.equal(state.bossHp, hp);
  assert.equal(state.arcana!.run.bolts, undefined);
});

test("a bolt that fells the boss wins the attempt", () => {
  const { session, state } = trial("light-elemental", { thunderbolt: [0, 0, 0] });
  state.bossHp = 500;
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  const outcome = trialStep(state, 0, 0);
  assert.equal(state.status, "won");
  assert.equal(state.bossHp, 0);
  assert.equal(state.playing, false);
  assert.match(outcome.message, new RegExp(TRIALS[state.trialId].name));
  assert.ok(decodeTrial(JSON.parse(JSON.stringify(state))), "a state a save can hold");
});

test("bolts strike a variant's boss, parts and minions, counting toward its damage; its parts knock out", () => {
  const { session, state } = trial("obelisk", { thunderbolt: [0, 15, 0] }, { multiPart: true });
  const v = state.bossVariant!;
  v.minions.push({ id: 90, name: "Obelisk Sentry", x: 5, y: 5, hp: 1, maxHp: 1, attack: 1, defense: 0 });
  v.spawned = 90;
  v.parts[0]!.hp = 1;
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  const silver = state.purchases!.silver;
  wait(state);
  assert.equal(v.minions.some((m) => m.id === 90), false, "the minion fell");
  assert.ok(state.purchases!.silver > silver, "its Silver paid");
  assert.equal(v.parts[0]!.hp, 0, "the part knocked out");
  assert.ok(state.bossHp < state.bossMaxHp);
  assert.ok(v.damageThisRun > 0);
  assert.equal(state.player.hp, 1000, "no counter from an arcanum's hit");
});

test("bolts strike the Keymaster and his mimics, and drop no keys", () => {
  const { session, state } = trial("keymaster", { thunderbolt: [0, 0, 0] });
  const k = state.keymaster!;
  k.mimics.push({ id: 1, x: 5, y: 5, hp: 1, maxHp: 1 });
  k.spawned = 1;
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  const hp = state.bossHp;
  wait(state);
  assert.equal(k.mimics.length, 0);
  assert.equal(state.bossHp, hp - 1000);
  assert.equal(k.hits, 0);
  assert.deepEqual(k.drops, []);
  assert.equal(state.elemental.incorporeal, false);
});

test("Overseer multiplies the hero's hit on what stands in a beam, and turns each turn, on or off", () => {
  const { session, state } = trial("light-elemental", { overseer: [0, 0, 0] });
  session.sync();
  assert.equal(heroAttackOn(state, { x: 2, y: 20 }), 800, "straight up the board: 8x");
  assert.equal(heroAttackOn(state, { x: 20, y: 12 }), 100, "east: plain");
  state.player.x = 12;
  state.player.y = 11;
  state.bossHp = state.bossMaxHp = 100_000;
  trialStep(state, 0, 1);
  assert.equal(state.bossHp, 100_000 - 800);
  assert.equal(state.arcana!.beamTurns, 1);
  session.game.arcana.toggle("overseer");
  session.sync();
  assert.equal(heroAttackOn(state, { x: 2, y: 20 }), 100);
  wait(state);
  assert.equal(state.arcana!.beamTurns, 2);
});

test("Ricochet Shot springs from the hero's hit to the closest others, at its chance", () => {
  const seen = { fired: 0 };
  for (let steps = 0; steps < 200; steps++) {
    const { session, state } = trial("keymaster", { ricochetShot: [0, 1, 15] });
    const k = state.keymaster!;
    k.mimics.push({ id: 1, x: 12, y: 4, hp: 1_000_000, maxHp: 1_000_000 }, { id: 2, x: 12, y: 5, hp: 1_000_000, maxHp: 1_000_000 }, { id: 3, x: 20, y: 20, hp: 1_000_000, maxHp: 1_000_000 });
    k.spawned = 3;
    k.useKeys = false;
    // A mimic moves on even turns: these end on an odd one, so they stand still.
    state.steps = steps * 2;
    state.elemental = { x: 20, y: 4, incorporeal: true, teleport: { from: { x: 6, y: 6 }, step: 1 } };
    state.player.x = 12;
    state.player.y = 3;
    session.sync();
    trialStep(state, 0, 1);
    const strikes = state.arcana!.strikes ?? [];
    if (!strikes.length) continue;
    seen.fired++;
    assert.deepEqual(strikes.map((s) => [s.kind, s.from, s.to]), [["ricochet", { x: 12, y: 4 }, { x: 12, y: 5 }], ["ricochet", { x: 12, y: 4 }, { x: 20, y: 20 }]]);
    assert.equal(strikes[0]!.damage, 200, "twice ATK");
  }
  assert.ok(seen.fired > 30 && seen.fired < 85, `27.5% of 200: ${seen.fired}`);
});

test("an attempt's arcana survive a reload: cooldown, bolts and toggles", () => {
  const { session, state } = trial("light-elemental", { thunderbolt: [0, 0, 0] });
  state.bossHp = state.bossMaxHp = 1_000_000;
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  wait(state);
  session.game.arcana.toggle("thunderbolt");
  session.game.arcana.toggle("thunderbolt");
  state.arcana!.run.bolts = 3;
  const back = decodeTrial(JSON.parse(JSON.stringify(state)))!;
  assert.deepEqual(back.arcana, { run: { toggles: 2, off: [], timers: {}, bolts: 3, strikes: 1 }, beamTurns: 0 });
  assert.equal(decodeTrial(JSON.parse(JSON.stringify({ ...state, arcana: undefined })))!.arcana, undefined);
});

test("the attempt's Arcana are its own: the run outside keeps its toggles and cooldowns", () => {
  const { base, session, state } = trial("light-elemental", { thunderbolt: [0, 0, 0] });
  const before = JSON.stringify(base.save.tower.runArcana);
  state.arcana!.run.timers.thunderbolt = 2;
  session.sync();
  wait(state);
  session.game.arcana.toggle("thunderbolt");
  assert.equal(JSON.stringify(base.save.tower.runArcana), before);
  assert.equal(base.save.arcana.owned.thunderbolt?.length, 3, "and the bought levels stay");
});
