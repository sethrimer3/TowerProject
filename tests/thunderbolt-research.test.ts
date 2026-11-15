// Thunderbolt's research (docs/agents/arcana.md): Thunderbolt Amplifier and
// Thunderbolt Expansion, opened by the Breakthrough skill Thunderbolt Research.
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
import { boltAmplified, inBoltSplash, thunderbolts, type Shot, type VolleyTurn } from "../src/volley.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { decodeTrial, startTrial, trialStep } from "../src/proving-grounds/trial.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };
const minutes = (hours: number) => Math.round(hours * 60);

test("the Breakthrough skill Thunderbolt Research opens both projects, left of Lifespring Research after Extra Trainer; Tower VII's floor 30 pays 5 Breakthrough", () => {
  const skill = UPGRADES.find((u) => u.id === "thunderboltResearch")!;
  assert.deepEqual([skill.base, skill.max, skill.currency], [5, 1, "breakthrough"]);
  const nodes = TREES.find((t) => t.id === "breakthrough")!.nodes, at = (id: string) => nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("thunderboltResearch").x, at("thunderboltResearch").y, at("thunderboltResearch").requires], [30, 213, ["extraTrainer"]]);
  assert.equal(at("lifespringResearch").y, 213);
  for (const id of ["thunderboltAmplify", "thunderboltExpansion"] as const) {
    assert.ok(RESEARCH[id].requires.some((r) => "upgrade" in r && r.upgrade === "thunderboltResearch"), id);
    assert.equal(RESEARCH[id].categories[0], "arcana", id);
  }
  assert.deepEqual(checkpoint(7, 30), { floor: 30, reward: { kind: "breakthrough", amount: 5 }, premium: { kind: "currency", currency: "gold", amount: 10_000_000 } });
});

test("both projects run on the spec's schedules and values", () => {
  const amp = RESEARCH.thunderboltAmplify.levels, exp = RESEARCH.thunderboltExpansion.levels;
  assert.deepEqual([amp.length, exp.length], [25, 5]);
  assert.deepEqual([amp[0]!.gold, minutes(amp[0]!.hours), amp[24]!.gold, minutes(amp[24]!.hours)], [500_000, 19 * 60 + 59, 26_190_000_000, (64 * 24) * 60 + 50]);
  assert.deepEqual([exp[0]!.gold, minutes(exp[0]!.hours), exp[4]!.gold, minutes(exp[4]!.hours)], [900_000, 22 * 60 + 13, 301_670_000, (5 * 24 + 13) * 60 + 42]);
  const s = defaults(), shown = (id: "thunderboltAmplify" | "thunderboltExpansion") => RESEARCH_TARGETS[id].shown(researched(s.archives, id));
  const values = (id: "thunderboltAmplify" | "thunderboltExpansion", n: number) => Array.from({ length: n }, (_, i) => {
    s.archives.levels[id] = i + 1;
    return researched(s.archives, id);
  });
  assert.deepEqual(values("thunderboltAmplify", 25).filter((_, i) => [0, 1, 2, 24].includes(i)), [25, 40, 55, 385], "×2.5, ×4, ×5.5 … ×38.5");
  assert.deepEqual(values("thunderboltExpansion", 5), [10, 15, 20, 25, 30]);
  assert.equal(shown("thunderboltAmplify"), "×38.5 a hit");
  s.archives.levels.thunderboltExpansion = 1;
  assert.equal(shown("thunderboltExpansion"), "1 tile");
  s.archives.levels.thunderboltExpansion = 0;
  assert.equal(shown("thunderboltExpansion"), "None");
});

test("the splash reaches the orthogonal tiles at 1, the diagonals at 1.5, a knight's move at 2.5", () => {
  const reach = (radius: number) => {
    const out: string[] = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inBoltSplash(dx, dy, radius)) out.push(`${dx},${dy}`);
    return out.length;
  };
  assert.deepEqual([10, 15, 20, 25, 30].map(reach), [4, 8, 12, 20, 28]);
  assert.equal(inBoltSplash(0, 0, 30), false, "never the target itself");
  assert.deepEqual([0, 1, 2, 4].map((n) => boltAmplified(25, n)), [1, 2.5, 5, 10], "×1 before any hit, then ×2.5 for each, added");
  assert.equal(boltAmplified(0, 4), 1, "unresearched");
});

/** A Tower run on an open floor holding `spots` enemies, holding Thunderbolt, with `research` done. */
function arena(spots: readonly (readonly [number, number])[], research: Partial<Record<"thunderboltAmplify" | "thunderboltExpansion", number>>) {
  const g = new Game(defaults(), random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  for (const [x, y] of spots) w.cells.set(`${x},${y}`, { kind: "enemy", enemy: { ...brute } });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.thunderbolt = [0, 0, 0];
  Object.assign(g.save.archives.levels, research);
  return g;
}
function turn(g: Game) {
  assert.ok(g.move(g.run.player.x === 0 ? 1 : -1, 0));
  return (g.volley?.shots ?? []).filter((s) => s.thunderbolt);
}

test("Thunderbolt Amplifier raises each bolt on an enemy by every bolt that hit it before, counted on its tile and saved", () => {
  const g = arena([[4, 4]], { thunderboltAmplify: 1 });
  g.save.tower.runArcana.timers.thunderbolt = 1;
  const damage: number[] = [];
  for (let i = 0; i < 5; i++) damage.push(...turn(g).map((s) => s.damage));
  assert.deepEqual(damage, [1000, 2500, 5000, 7500, 10000], "five bolts, one a turn: ×1, then ×2.5 for each earlier hit");
  assert.equal(g.world.tile(4, 4).enemy!.bolted, 5);
  g.save.tower.run = g.towerRun;
  const back = decode(JSON.stringify(g.save));
  assert.equal(back.tower.run!.changes["4,4"]!.bolted, 5, "the count is kept with the wound");
  const bad = decode(JSON.stringify({ ...g.save, tower: { ...g.save.tower, run: { ...g.save.tower.run, changes: { "4,4": { ...g.run.changes["4,4"], bolted: -1 } } } } }));
  assert.equal(bad.tower.run, null, "a broken count fails the run, as any broken change does");
  const plain = arena([[4, 4]], {});
  plain.save.tower.runArcana.timers.thunderbolt = 1;
  turn(plain);
  turn(plain);
  assert.equal(plain.world.tile(4, 4).enemy!.bolted, undefined, "unresearched, nothing is counted");
});

test("Thunderbolt Expansion strikes the floor's enemies round each target at its boost, drawing no bolt of their own", () => {
  const tiles: Record<string, Tile> = {};
  const spots = [[3, 3], [4, 3], [3, 4], [4, 4], [6, 3], [5, 5]] as const;
  for (const [x, y] of spots) tiles[`${x},${y}`] = { kind: "enemy", enemy: { ...brute, defense: x === 4 && y === 3 ? 50 : 0 } };
  const board = {
    tile: (x: number, y: number) => tiles[`${x},${y}`] ?? { kind: "floor" },
    clear() {},
    wound() {},
    floorEnemies: () => spots.map(([x, y]) => ({ x, y })),
  } as unknown as VolleyTurn["board"];
  const hero = { x: 0, y: 3, hp: 10, maxHp: 100, attack: 100, defense: 0, keys: {} } as unknown as Player;
  for (const radius of [10, 15]) {
    const out = thunderbolts({ board, wrap: 0, hero, seed: 1 }, { boost: 10, bolts: 1, strike: 1, radius });
    const [bolt, ...splash] = out.shots as [Shot, ...Shot[]];
    assert.equal(bolt.splash, undefined);
    const expected = spots.filter(([x, y]) => inBoltSplash(x - bolt.to.x, y - bolt.to.y, radius)).map(([x, y]) => `${x},${y}`);
    assert.deepEqual(splash.map((s) => `${s.to.x},${s.to.y}`).sort(), expected.sort(), `radius ${radius / 10}`);
    for (const s of splash) {
      assert.deepEqual([s.splash, s.thunderbolt, s.tick, s.from], [true, true, bolt.tick, bolt.to]);
      assert.equal(s.damage, s.to.x === 4 && s.to.y === 3 ? 950 : 1000, "the bolt's damage, through each one's own DEF");
    }
  }
});

test("in a trial, the boss's bolts amplify by its key and a saved attempt keeps the count", () => {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.thunderbolt = [0, 0, 0];
  base.save.archives.levels.thunderboltAmplify = 1;
  base.save.archives.levels.thunderboltExpansion = 5;
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, "light-elemental", {});
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  state.room = "arena";
  state.player.x = 2;
  state.player.y = 12;
  state.bossHp = state.bossMaxHp = 1_000_000;
  state.arcana!.run.timers.thunderbolt = 1;
  session.sync();
  const hp = [state.bossHp];
  for (let i = 0; i < 3; i++) {
    assert.ok(trialStep(state, 0, 0).changed);
    hp.push(state.bossHp);
  }
  assert.deepEqual(hp.map((n, i) => (i ? hp[i - 1]! - n : 0)).slice(1), [1000, 2500, 5000]);
  assert.equal(state.arcana!.bolted!.boss, 3);
  assert.equal(decodeTrial(JSON.parse(JSON.stringify(state)))!.arcana!.bolted!.boss, 3);
});
