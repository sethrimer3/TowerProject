// Necrotic Frost's research (docs/agents/arcana.md): Frost Radius, Necrotic Freeze,
// Necrotic Freeze Chance and Necrotic Freeze Time, opened by the Breakthrough skill
// Necrotic Frost Research.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkpoint } from "../src/goals.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../src/progression/archives.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { frostArea, frostEffects, freezes, type FrostField } from "../src/arcana/necrotic-frost.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { necroDecay } from "../src/volley.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import { decodeTrialArcana } from "../src/proving-grounds/trial-arcana.ts";

type Frosty = "frostRadius" | "necroFreeze" | "necroFreezeChance" | "necroFreezeTurns";
const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 1e9, tier: 1, strength: "weak" };
const minutes = (hours: number) => Math.round(hours * 60);
/** A field whose center lies one tile east of the hero's. */
const east = (id = 1, left = 50): FrostField => ({ id, angle: 9000, left });

test("the Breakthrough skill Necrotic Frost Research (5) opens all four projects, down and right of Extra Trainer; Manual Hand moves right of Card Mastery; Tower VIII's floor 60 pays 4 Breakthrough", () => {
  const skill = UPGRADES.find((u) => u.id === "necroticFrostResearch")!;
  assert.deepEqual([skill.base, skill.max, skill.currency], [5, 1, "breakthrough"]);
  const nodes = TREES.find((t) => t.id === "breakthrough")!.nodes, at = (id: string) => nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("extraTrainer").x, at("extraTrainer").y], [50, 213]);
  assert.deepEqual([at("necroticFrostResearch").x, at("necroticFrostResearch").y, at("necroticFrostResearch").requires], [70, 237, ["extraTrainer"]]);
  assert.deepEqual([at("manualHand").x, at("manualHand").y, at("manualHand").requires], [at("cardMastery").x + 20, at("cardMastery").y, ["cardMastery"]]);
  for (const [x, y] of [[70, 213], [90, 189]]) assert.equal(nodes.filter((n) => n.x === x && n.y === y).length, 1, `nothing else at ${x},${y}`);
  for (const id of ["frostRadius", "necroFreeze", "necroFreezeChance", "necroFreezeTurns"] as const) {
    assert.ok(RESEARCH[id].requires.some((r) => "upgrade" in r && r.upgrade === "necroticFrostResearch"), id);
    assert.equal(RESEARCH[id].categories[0], "arcana", id);
  }
  for (const id of ["necroFreezeChance", "necroFreezeTurns"] as const)
    assert.ok(RESEARCH[id].requires.some((r) => "research" in r && r.research === "necroFreeze" && r.level === 1), `${id} waits for Necrotic Freeze`);
  assert.deepEqual(checkpoint(8, 60), { floor: 60, reward: { kind: "breakthrough", amount: 4 }, premium: { kind: "currency", currency: "gems", amount: 70 } });
});

test("all four projects run on the spec's schedules and values", () => {
  const { frostRadius: radius, necroFreeze: freeze, necroFreezeChance: chance, necroFreezeTurns: time } = RESEARCH;
  assert.deepEqual([radius.levels.length, freeze.levels.length, chance.levels.length, time.levels.length], [7, 1, 30, 9]);
  const at = (levels: (typeof radius)["levels"], i: number) => [levels[i]!.gold, minutes(levels[i]!.hours)];
  const dhm = (d: number, h: number, m: number) => (d * 24 + h) * 60 + m;
  assert.deepEqual(at(radius.levels, 0), [2_450_000, dhm(3, 6, 54)]);
  assert.deepEqual(at(radius.levels, 6), [44_290_000_000, dhm(167, 10, 41)]);
  assert.deepEqual(at(freeze.levels, 0), [700_000, dhm(0, 19, 59)]);
  assert.deepEqual(at(chance.levels, 0), [250_000, dhm(0, 19, 59)]);
  assert.deepEqual(at(chance.levels, 2), [496_980, dhm(1, 2, 53)]);
  assert.deepEqual(at(chance.levels, 28), [16_700_000_000, dhm(98, 19, 58)]);
  assert.deepEqual(at(chance.levels, 29), [19_420_000_000, dhm(111, 6, 28)]);
  assert.deepEqual(at(time.levels, 0), [896_980, dhm(2, 2, 53)]);
  assert.deepEqual(at(time.levels, 8), [61_420_000_000, dhm(211, 6, 28)]);

  const values = (id: Frosty, n: number) => Array.from({ length: n + 1 }, (_, i) => {
    const s = defaults();
    s.archives.levels[id] = i;
    return researched(s.archives, id);
  });
  assert.deepEqual(values("frostRadius", 7), [30, 35, 40, 45, 50, 55, 60, 65], "3 tiles, +0.5 a level to 6.5");
  assert.deepEqual(values("necroFreeze", 1), [0, 1]);
  assert.deepEqual(values("necroFreezeChance", 30).filter((_, i) => [0, 1, 2, 30].includes(i)), [50, 75, 100, 800], "5%, then 7.5%, 10% … 80%");
  assert.deepEqual(values("necroFreezeTurns", 9), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const shown = (id: Frosty, n: number) => RESEARCH_TARGETS[id].shown(n);
  assert.deepEqual([shown("frostRadius", 30), shown("frostRadius", 65), shown("necroFreeze", 0), shown("necroFreeze", 1), shown("necroFreezeChance", 75), shown("necroFreezeTurns", 1), shown("necroFreezeTurns", 10)],
    ["3 tiles", "6.5 tiles", "Locked", "Open", "7.5%", "1 turn", "10 turns"]);
});

/** A Tower run at the origin on plain floor holding `tiles`, holding Necrotic Frost, with
 * `research` done, the game's rolls all `roll`. */
function arena(tiles: Record<string, Tile>, research: Partial<Record<Frosty, number>> = {}, roll = 0) {
  const s = defaults();
  const g = new Game(s, () => roll);
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) w.cells.set(`${x},${y}`, tiles[`${x},${y}`] ?? { kind: "floor" });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100_000, maxHp: 100_000 });
  g.save.arcana.owned.necroticFrost = [0, 0, 0];
  Object.assign(g.save.archives.levels, research);
  g.run.necroticFrost = { timer: 500, fields: [east()] };
  return g;
}
const standing = (x: number, y: number, enemy: Enemy = brute): Record<string, Tile> => ({ [`${x},${y}`]: { kind: "enemy", enemy } });
const turn = (g: Game) => assert.ok(g.move(g.run.player.x % 2 ? -1 : 1, 0));

test("Frost Radius widens every field, before its augment boon multiplies it", () => {
  assert.equal(frostEffects(null).radius, 300);
  assert.equal(frostEffects({ radius: 65 }).radius, 650);
  const g = arena({}, { frostRadius: 7 });
  assert.equal(g.arcana.frostRule()!.effects.radius, 650);
  assert.equal(g.arcana.frostRule()!.freeze, undefined, "no Necrotic Freeze before it is researched");
  // An enemy 6 tiles from the field's center (7 from the hero) is reached only with the research.
  for (const [levels, reached] of [[0, false], [6, true]] as const) {
    const at = arena(standing(7, 0), { frostRadius: levels });
    turn(at);
    assert.equal(!!at.world.tile(7, 0).enemy!.necro, reached, `Frost Radius ${levels}`);
  }
});

test("Necrotic Freeze stuns an enemy as it enters a field, once an entry: staying isn't rolled again, leaving and coming back is", () => {
  const g = arena(standing(3, 0), { necroFreeze: 1 });
  assert.deepEqual(g.arcana.frostRule()!.freeze, { chance: 50, turns: 1 });
  turn(g);
  assert.deepEqual([g.world.tile(3, 0).stun, g.world.tile(3, 0).frosted], [1, [1]], "stunned a turn on entering field 1");
  assert.match(g.enemyTitle(g.world.tile(3, 0).enemy!), /^Stunned /);
  turn(g);
  assert.deepEqual([g.world.tile(3, 0).stun, g.world.tile(3, 0).frosted], [undefined, [1]], "its stun worn off, and still in the field: no new roll");
  delete g.run.necroticFrost!.fields;
  turn(g);
  assert.deepEqual([g.world.tile(3, 0).stun, g.world.tile(3, 0).frosted], [undefined, undefined], "out of every field");
  g.run.necroticFrost!.fields = [east()];
  turn(g);
  assert.equal(g.world.tile(3, 0).stun, 1, "back in: rolled again");
  g.run.necroticFrost!.fields = [east(), east(2)];
  turn(g);
  assert.deepEqual([g.world.tile(3, 0).stun, g.world.tile(3, 0).frosted], [1, [1, 2]], "a second field entered is an entry of its own");
});

test("Necrotic Freeze Time sets how long; a roll at or over the chance stuns nothing; a save keeps the fields an enemy stands in", () => {
  const g = arena(standing(3, 0), { necroFreeze: 1, necroFreezeTurns: 2 });
  turn(g);
  assert.equal(g.world.tile(3, 0).stun, 3);
  const back = decode(JSON.stringify(g.save));
  assert.deepEqual(back.tower.run!.changes["3,0"]!.frosted, [1]);
  const missed = arena(standing(3, 0), { necroFreeze: 1, necroFreezeChance: 30 }, 0.8);
  turn(missed);
  assert.deepEqual([missed.world.tile(3, 0).stun, missed.world.tile(3, 0).frosted], [undefined, [1]], "80% misses a roll of 0.8, and the entry is spent");
  const plain = arena(standing(3, 0));
  turn(plain);
  assert.deepEqual([plain.world.tile(3, 0).stun, plain.world.tile(3, 0).frosted], [undefined, undefined], "without the research nothing is kept");
});

test("freezes and necroDecay: a Greater Boss stunned half as long, a longer stun kept, an enemy felled left alone", () => {
  assert.equal(freezes(undefined, [1], { chance: 50 }, () => 0.049), true);
  assert.equal(freezes(undefined, [1], { chance: 50 }, () => 0.05), false);
  assert.equal(freezes([1], [1], { chance: 1000 }, () => 0), false, "a stay");
  const draws: number[] = [];
  freezes([1], [1, 2, 3], { chance: 500 }, (id) => (draws.push(id), 1));
  assert.deepEqual(draws, [2, 3], "one roll an entry");

  const decay = (enemy: Enemy, tile: Partial<Tile> = {}) => {
    const t: Tile = { kind: "enemy", enemy, ...tile }, stuns: number[] = [];
    const board = { tile: (x: number, y: number) => (x === 0 && y === 2 ? t : ({ kind: "floor" } as Tile)), clear() {}, wound() {}, markNecro() {}, markStun: (_x: number, _y: number, n: number) => void stuns.push(n) };
    necroDecay({ board, wrap: 0, hero: { x: 0, y: 0, attack: 100 } as Player, changes: {} }, 1, frostArea([{ id: 1, angle: 0, left: 5 }], frostEffects(null)), { chance: 1000, turns: 5, roll: () => 0 });
    return stuns;
  };
  assert.deepEqual(decay(brute), [5]);
  assert.deepEqual(decay({ ...brute, strength: "greaterBoss" }), [2], "half, rounded down");
  assert.deepEqual(decay(brute, { stun: 7 }), [], "a longer stun on it stands");
  assert.deepEqual(decay({ ...brute, hp: 1, defense: 0 }), [], "felled by the decay");
});

/** An attempt in its arena under a session holding Necrotic Frost with Necrotic Freeze at its height. */
function attempt() {
  const save = defaults();
  save.arcana.owned.necroticFrost = [0, 0, 0];
  Object.assign(save.archives.levels, { necroFreeze: 1, necroFreezeChance: 30, necroFreezeTurns: 3 });
  const base = new Game(save, random(3));
  base.newRun({ seed: 11 });
  const state = startTrial({ maxHp: 100_000, attack: 10, defense: 0 }, "manual", [], 7391, 1, "keymaster");
  state.room = "arena";
  state.player.x = 12;
  state.player.y = 2;
  state.bossHp = state.bossMaxHp = 1e7;
  const session = new TrialSession(base, state);
  return { state, session };
}

test("a trial: an entry may stun the boss for half the time, a stay never, and what it saves is checked", () => {
  const { state, session } = attempt();
  assert.deepEqual(state.arcana!.spells!.necroticFrost!.freeze, { chance: 800, turns: 4 });
  const pin = () => Object.assign(state.elemental, { x: state.player.x + 1, y: state.player.y + 1, incorporeal: false });
  let stunned = 0;
  for (let i = 0; i < 20; i++) {
    pin();
    // Each step a fresh entry: the field newly cast.
    state.arcana!.frost = { timer: 500, fields: [east(i + 1)] };
    delete state.arcana!.stuns;
    session.sync();
    assert.ok(trialStep(state, i % 2 ? 1 : -1, 0).changed);
    assert.deepEqual(state.arcana!.frostIn, { boss: [i + 1] });
    if (state.arcana!.stuns?.boss) {
      assert.equal(state.arcana!.stuns.boss, 2, "half of 4 turns");
      stunned++;
    }
  }
  assert.ok(stunned >= 8 && stunned < 20, `80% of 20 entries: ${stunned}`);
  for (let i = 0; i < 10; i++) {
    pin();
    delete state.arcana!.stuns;
    assert.ok(trialStep(state, i % 2 ? 1 : -1, 0).changed);
    assert.equal(state.arcana!.stuns, undefined, "staying in the same field is never rolled");
  }
  const a = decodeTrialArcana({ run: {}, beamTurns: 0, frostIn: { boss: [1, 2], x: [], y: [0], z: [3, 3], w: "1" } })!;
  assert.deepEqual(a.frostIn, { boss: [1, 2] });
});
