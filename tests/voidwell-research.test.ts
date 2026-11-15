// Voidwell's research (docs/agents/arcana.md): Voidwell Damage and Voidwell Gold Bonus
// from Tower V's floor 150 Goal, Extra Voidwell from its floor 500 Goal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inVortex, placeVortices, validVoidwell, type FloorBounds, type Vortex } from "../src/arcana/voidwell.ts";
import type { Enemy, Tile } from "../src/entities.ts";
import { checkpoint } from "../src/goals.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../src/progression/archives.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { voidwellDamage } from "../src/volley.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { startTrial, trialStep, type TrialState } from "../src/proving-grounds/trial.ts";
import { voidwellGoldAt } from "../src/proving-grounds/trial-spells.ts";
import { ELEMENTAL } from "../src/proving-grounds/arena.ts";

const brute: Enemy = { name: "Brute", hp: 50, attack: 10, defense: 0, tier: 1, strength: "weak" };
const bounds: FloorBounds = { left: 0, right: 16, bottom: 0, top: 16 };

/** A Tower run at (3, 5), ATK 100, on plain floor holding `tiles`, holding Voidwell with a vortex at (5, 5) of 3 tiles' radius. */
function arena(tiles: Record<string, Tile> = {}, vortex: Vortex | null = { x: 5, y: 5, left: 100 }) {
  const s = defaults();
  const g = new Game(s, random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) w.cells.set(`${x},${y}`, tiles[`${x},${y}`] ?? { kind: "floor" });
  Object.assign(g.run.player, { x: 3, y: 5, attack: 100, defense: 0, hp: 100_000, maxHp: 100_000 });
  g.save.arcana.owned.voidwell = [0, 0, 0];
  g.run.voidwell = { timer: 150, casts: 1, ...(vortex ? { vortex } : {}) };
  return g;
}
const minutes = (hours: number) => Math.round(hours * 60);

test("Tower V's floor 150 Goal opens Voidwell Damage and Gold Bonus, and its floor 500 Extra Voidwell, each with its premium Gold", () => {
  assert.deepEqual(checkpoint(5, 150), { floor: 150, reward: { kind: "unlock", unlock: "voidwellResearch" }, premium: { kind: "currency", currency: "gold", amount: 10_000_000 } });
  assert.deepEqual(checkpoint(5, 500), { floor: 500, reward: { kind: "unlock", unlock: "extraVoidwell" }, premium: { kind: "currency", currency: "gold", amount: 50_000_000 } });
  for (const [id, unlock] of [["voidwellDamage", "voidwellResearch"], ["voidwellGold", "voidwellResearch"], ["extraVoidwell", "extraVoidwell"]] as const) {
    assert.ok(RESEARCH[id].requires.some((r) => "goalUnlock" in r && r.goalUnlock === unlock), id);
    assert.equal(RESEARCH[id].categories[0], "arcana", id);
  }
});

test("the three projects run on the spec's schedules", () => {
  const damage = RESEARCH.voidwellDamage.levels, gold = RESEARCH.voidwellGold.levels, extra = RESEARCH.extraVoidwell.levels;
  assert.deepEqual([damage.length, gold.length, extra.length], [10, 20, 1]);
  assert.deepEqual([damage[0]!.gold, minutes(damage[0]!.hours), damage[9]!.gold, minutes(damage[9]!.hours)], [20_000_000, (24 + 15) * 60 + 59, 300_870_000, (6 * 24 + 13) * 60 + 31]);
  assert.deepEqual([gold[4]!.gold, gold[9]!.gold, gold[19]!.gold, minutes(gold[19]!.hours)], [35_837_838, 623_091_892, 24_800_000_000, (32 * 24 + 11) * 60 + 40]);
  assert.deepEqual(damage.map((l) => minutes(l.hours)), gold.slice(0, 10).map((l) => minutes(l.hours)), "the same times");
  assert.deepEqual([extra[0]!.gold, minutes(extra[0]!.hours)], [15_000_000_000, (17 * 24 + 8) * 60 + 39]);
  const s = defaults();
  assert.deepEqual([researched(s.archives, "voidwellDamage"), researched(s.archives, "voidwellGold"), researched(s.archives, "extraVoidwell")], [0, 10, 0]);
  Object.assign(s.archives.levels, { voidwellDamage: 10, voidwellGold: 20, extraVoidwell: 1 });
  assert.deepEqual([researched(s.archives, "voidwellDamage"), researched(s.archives, "voidwellGold"), researched(s.archives, "extraVoidwell")], [200, 110, 1]);
  assert.deepEqual([RESEARCH_TARGETS.voidwellDamage.shown(20), RESEARCH_TARGETS.voidwellDamage.shown(200), RESEARCH_TARGETS.voidwellGold.shown(15), RESEARCH_TARGETS.voidwellGold.shown(110)], ["0.20%", "2.00%", "×1.5", "×11"]);
});

test("each turn, what stands in the vortex loses its share of its total HP, the boss aside, and dies on the 50th turn at 2%", () => {
  const g = arena({ "5,5": { kind: "enemy", enemy: { ...brute, hp: 987_654.321 } }, "6,5": { kind: "enemy", enemy: { ...brute, strength: "boss" } }, "12,5": { kind: "enemy", enemy: brute } });
  g.save.archives.levels.voidwellDamage = 10;
  for (let turn = 1; turn <= 50; turn++) {
    assert.ok(g.move(turn % 2 ? 1 : -1, 0), `turn ${turn}`);
    const left = g.world.tile(5, 5).enemy?.hp;
    if (turn < 50) assert.ok(left !== undefined && Math.abs(left - 987_654.321 * (1 - turn / 50)) < 1e-3, `turn ${turn}: ${left}`);
    else assert.equal(g.world.tile(5, 5).kind, "floor", "felled");
  }
  assert.equal(g.world.tile(6, 5).enemy!.hp, 50, "the boss is immune");
  assert.equal(g.world.tile(12, 5).enemy!.hp, 50, "outside, untouched");
  assert.match(g.message ?? "", /Voidwell · .* defeated/);
});

test("a level finished mid-run counts at once", () => {
  const g = arena({ "5,5": { kind: "enemy", enemy: brute } });
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(5, 5).enemy!.hp, 50, "no research, no damage");
  g.save.archives.levels.voidwellDamage = 5;
  const edits = structuredClone(g.run.changes);
  assert.ok(g.move(-1, 0));
  assert.equal(g.world.tile(5, 5).enemy!.hp, 49.5, "1% of 50");
  assert.notDeepEqual(g.run.changes, edits, "kept in the run's edits");
  assert.ok(g.volley?.shots.some((s) => s.voidwell && s.damage === 0.5), "shown");
});

test("the Toggles' Voidwell damage hides its numbers; it strikes all the same", () => {
  const g = arena({ "5,5": { kind: "enemy", enemy: brute } });
  g.save.archives.levels.voidwellDamage = 5;
  g.save.settings.voidwellDamage = false;
  assert.ok(g.move(1, 0));
  assert.equal(g.world.tile(5, 5).enemy!.hp, 49.5);
  assert.ok(!g.volley?.shots.some((s) => s.voidwell));
});

test("an enemy in both vortices is struck once, and Shielded's bubble and DEF don't cut it", () => {
  const g = arena({ "5,5": { kind: "enemy", enemy: { ...brute, defense: 1000, guard: 50 } } });
  const out = voidwellDamage({ board: g.world, wrap: 0 }, { x: 5, y: 5, radius: 3, wrap: 0, twin: { x: 5.5, y: 5 } }, 200);
  assert.equal(out.shots.length, 1);
  assert.equal(out.shots[0]!.damage, 1);
});

test("Voidwell Gold Bonus multiplies the Gold of a kill in a vortex, however it was killed, bosses included", () => {
  const killGold = (research: number, at = { x: 4, y: 5 }) => {
    const g = arena({ [`${at.x},${at.y}`]: { kind: "enemy", enemy: brute } });
    Object.assign(g.run.player, { x: at.x - 1, y: at.y });
    if (research) g.save.archives.levels.voidwellGold = research;
    const before = g.save.gold, preview = g.enemyGold(at.x, at.y);
    assert.ok(g.move(1, 0));
    const gold = g.save.gold - before;
    assert.ok(Math.abs(gold - preview) < 1e-6, "the preview pays what the kill does");
    return gold;
  };
  const plain = killGold(0);
  assert.ok(plain > 0);
  assert.ok(Math.abs(killGold(1) - plain * 1.5) < 1e-6, "one level: ×1.5");
  assert.ok(Math.abs(killGold(20) - plain * 11) < 1e-6, "twenty: ×11");
  assert.equal(killGold(20, { x: 12, y: 5 }), killGold(0, { x: 12, y: 5 }), "outside the vortex");
  const g = arena();
  g.save.archives.levels.voidwellGold = 4;
  assert.equal(g.voidwellGold({ x: 6, y: 5 }), 3, "by place alone, so a boss there counts too");
  assert.ok(g.arcana.toggle("voidwell"));
  assert.equal(g.voidwellGold({ x: 6, y: 5 }), 1, "switched off, no vortex");
});

test("Extra Voidwell's twin opens opposite across the hero, or, where the floor stops that, as wide apart as fits", () => {
  const hero = { x: 8, y: 8 };
  for (let i = 0; i < 40; i++) {
    const at = placeVortices({ hero, distance: 3, radius: 3, bounds, roll: i / 40, twin: true });
    assert.deepEqual(at.twin, { x: 16 - at.x, y: 16 - at.y });
  }
  assert.equal(placeVortices({ hero, distance: 3, radius: 3, bounds, roll: 0.5 }).twin, undefined, "none unresearched");
  // Beside the west wall the pair turns until both lie on the floor (centers 1.5 to 14.5).
  const side = { x: 3, y: 8 };
  for (let i = 0; i < 40; i++) {
    const { x, y, twin } = placeVortices({ hero: side, distance: 3, radius: 3, bounds, roll: i / 40, twin: true });
    assert.ok(Math.abs(Math.hypot(x - side.x, y - side.y) - 3) < 1e-9);
    assert.ok(Math.abs(twin!.x - (6 - x)) < 1e-9 && Math.abs(twin!.y - (16 - y)) < 1e-9);
    for (const c of [{ x, y }, twin!]) assert.ok(c.x >= 1.5 - 1e-9 && c.x <= 14.5 + 1e-9, `${c.x}`);
  }
  // In a corner no opposite pair fits: the two take the ends of the corner's arc, both on the floor, at the same distance.
  const corner = { x: 1, y: 1 };
  for (const roll of [0, 0.3, 0.99]) {
    const { x, y, twin } = placeVortices({ hero: corner, distance: 3, radius: 3, bounds, roll, twin: true });
    for (const c of [{ x, y }, twin!]) {
      assert.ok(c.x >= 1.5 - 1e-9 && c.y >= 1.5 - 1e-9, `${c.x},${c.y} on the floor`);
      assert.ok(Math.abs(Math.hypot(c.x - 1, c.y - 1) - 3) < 1e-9);
    }
    const apart = Math.acos(((x - 1) * (twin!.x - 1) + (y - 1) * (twin!.y - 1)) / 9) * 180 / Math.PI;
    assert.ok(apart >= 30 && apart <= 90, `${apart} degrees apart`);
    assert.ok(apart > 69.9, "as wide as the corner allows: 10 to 80 degrees");
  }
  // A corner too tight for 30 degrees at its range draws them in until it isn't.
  const tight = placeVortices({ hero: corner, distance: 3, radius: 4, bounds, roll: 0.5, twin: true });
  const [r1, r2] = [Math.hypot(tight.x - 1, tight.y - 1), Math.hypot(tight.twin!.x - 1, tight.twin!.y - 1)];
  assert.ok(Math.abs(r1 - r2) < 1e-9);
  assert.ok(Math.acos(((tight.x - 1) * (tight.twin!.x - 1) + (tight.y - 1) * (tight.twin!.y - 1)) / (r1 * r2)) * 180 / Math.PI >= 30 - 1e-9);
});

/** A trial attempt in the arena with Voidwell held, its research as given, a vortex
 * of 3 tiles at `vortex`, and the hero at (2, 12). */
function trial(trialId: TrialState["trialId"], research: Record<string, number>, vortex = { x: 5, y: 5, left: 50 }) {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.voidwell = [0, 0, 0];
  Object.assign(base.save.archives.levels, research);
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, trialId);
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  state.room = "arena";
  state.player.x = 2;
  state.player.y = 12;
  state.arcana!.voidwell = { timer: 150, casts: 1, vortex };
  session.sync();
  return { session, state };
}
const wait = (s: TrialState) => assert.ok(trialStep(s, 0, 0).changed);

test("in a trial, Voidwell Damage strikes the boss's minions and parts, mimics and slimes in the vortex, never the boss", () => {
  const { state } = trial("obelisk", { voidwellDamage: 10 });
  const v = state.bossVariant!;
  v.minions.push({ id: 90, name: "Obelisk Sentry", x: 5, y: 5, hp: 120, maxHp: 120, attack: 1, defense: 50 }, { id: 91, name: "Obelisk Sentry", x: 20, y: 12, hp: 120, maxHp: 120, attack: 1, defense: 0 });
  v.spawned = 91;
  state.arcana!.voidwell!.vortex = { x: 5, y: 5, left: 50, twin: { x: ELEMENTAL.x, y: ELEMENTAL.y } };
  const boss = state.bossHp;
  wait(state);
  assert.equal(v.minions.find((m) => m.id === 90)!.hp, 120 - 3, "2% of 120, rounded up, DEF or no DEF");
  assert.equal(v.minions.find((m) => m.id === 91)!.hp, 120, "outside, untouched");
  assert.equal(state.bossHp, boss, "the boss is immune, in the twin or not");
  assert.ok(state.arcana!.strikes!.some((s) => s.kind === "voidwell" && s.damage === 3));
  for (let i = 0; i < 39; i++) wait(state);
  assert.ok(!v.minions.some((m) => m.id === 90), "felled within 50 turns");

  const keymaster = trial("keymaster", { voidwellDamage: 1 }).state, k = keymaster.keymaster!;
  k.mimics.push({ id: 1, x: 5, y: 5, hp: 40, maxHp: 40 });
  k.spawned = 1;
  wait(keymaster);
  assert.equal(k.mimics[0]!.hp, 39, "0.2% of 40, rounded up to 1");

  const none = trial("keymaster", {}).state;
  none.keymaster!.mimics.push({ id: 1, x: 5, y: 5, hp: 40, maxHp: 40 });
  wait(none);
  assert.equal(none.keymaster!.mimics[0]!.hp, 40, "unresearched, it only stuns");
});

test("in a trial, Voidwell Gold Bonus raises the Gold coins Magic Tower drops from within a vortex", () => {
  const goldPopped = (research: Record<string, number>, vortex: { x: number; y: number }) => {
    const { state } = trial("magic-tower", research, { ...vortex, left: 50 });
    Object.assign(state.player, { x: ELEMENTAL.x, y: ELEMENTAL.y - 1 });
    trialStep(state, 0, 1);
    return state.bossVariant!.lastRound!.coins.find((c) => c.kind === "gold")!.amount;
  };
  const plain = goldPopped({}, ELEMENTAL);
  assert.equal(goldPopped({ voidwellGold: 2 }, ELEMENTAL), plain * 2, "×2 with the boss in it");
  assert.equal(goldPopped({ voidwellGold: 2 }, { x: 3, y: 12 }), plain, "the boss outside it");
  const { state } = trial("magic-tower", { voidwellGold: 20 });
  assert.deepEqual([voidwellGoldAt(state, { x: 5, y: 5 }), voidwellGoldAt(state, { x: 20, y: 12 })], [11, 1]);
});

test("researched, each activation opens the twin, which stuns and lasts as the first does, and it survives the save", () => {
  const g = arena({}, null);
  g.save.archives.levels.extraVoidwell = 1;
  g.run.voidwell = { timer: 1 };
  assert.ok(g.move(1, 0));
  const v = g.run.voidwell.vortex!, hero = g.run.player;
  assert.ok(v.twin, "the twin opened");
  assert.ok(Math.abs(v.x + v.twin.x - 2 * hero.x) < 1e-9 && Math.abs(v.y + v.twin.y - 2 * hero.y) < 1e-9);
  const zone = g.vortex!;
  assert.deepEqual(zone.twin, v.twin);
  assert.ok(inVortex(zone, Math.round(v.twin.x), Math.round(v.twin.y)));
  const twinTile = { x: Math.round(v.twin.x), y: Math.round(v.twin.y) };
  (g.world as RoomWorld).cells.set(`${twinTile.x},${twinTile.y}`, { kind: "enemy", enemy: brute });
  assert.ok(g.world.tile(twinTile.x, twinTile.y).enemy!.stunned, "stunned in the twin");
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.voidwell, g.run.voidwell);
  assert.ok(validVoidwell({ vortex: { x: 1, y: 1, left: 3, twin: { x: -1, y: 0.5 } } }));
  assert.ok(!validVoidwell({ vortex: { x: 1, y: 1, left: 3, twin: { x: "a", y: 0 } } }));
});
