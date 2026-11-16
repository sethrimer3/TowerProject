// Ricochet Shot's research (docs/agents/arcana.md): Ricochet Shock, Shock Chance
// and Shock Multiplier, opened by the Breakthrough skill Ricochet Shock Research.
import { test } from "node:test";
import assert from "node:assert/strict";
import { attackAgainst } from "../src/combat.ts";
import { checkpoint } from "../src/goals.ts";
import { RESEARCH, RESEARCH_TARGETS, researched } from "../src/progression/archives.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { random } from "../src/random.ts";
import { decode, defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { fightRicochet, type VolleyTurn } from "../src/volley.ts";
import { TrialSession } from "../src/proving-grounds/session.ts";
import { decodeTrial, startTrial } from "../src/proving-grounds/trial.ts";
import { heroAttackOn } from "../src/proving-grounds/trial-spells.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const brute: Enemy = { name: "Brute", hp: 1_000_000, attack: 0, defense: 0, tier: 1, strength: "weak" };
const minutes = (hours: number) => Math.round(hours * 60);
type ShockId = "ricochetShock" | "shockChance" | "shockMultiplier";

test("the Breakthrough skill Ricochet Shock Research opens all three projects, left of Extra Trainer after it; Door Mastery moves left of Key Mastery; Tower IX's floor 30 pays 5 Breakthrough", () => {
  const skill = UPGRADES.find((u) => u.id === "ricochetShockResearch")!;
  assert.deepEqual([skill.base, skill.max, skill.currency], [5, 1, "breakthrough"]);
  const nodes = TREES.find((t) => t.id === "breakthrough")!.nodes, at = (id: string) => nodes.find((n) => n.id === id)!;
  assert.deepEqual([at("ricochetShockResearch").x, at("ricochetShockResearch").y, at("ricochetShockResearch").requires], [30, 189, ["extraTrainer"]]);
  assert.deepEqual([at("doorMastery").x, at("doorMastery").y, at("doorMastery").requires], [50, 163, ["keyMastery"]]);
  assert.deepEqual([at("keyMastery").x, at("keyMastery").y], [70, 163]);
  for (const id of ["ricochetShock", "shockChance", "shockMultiplier"] as const) {
    assert.ok(RESEARCH[id].requires.some((r) => "upgrade" in r && r.upgrade === "ricochetShockResearch"), id);
    assert.equal(RESEARCH[id].categories[0], "arcana", id);
  }
  for (const id of ["shockChance", "shockMultiplier"] as const)
    assert.ok(RESEARCH[id].requires.some((r) => "research" in r && r.research === "ricochetShock" && r.level === 1), `${id} waits on Ricochet Shock`);
  assert.deepEqual(checkpoint(9, 30), { floor: 30, reward: { kind: "breakthrough", amount: 5 }, premium: { kind: "currency", currency: "arcanite", amount: 10 } });
});

test("the projects run on the spec's schedules and values", () => {
  const unlock = RESEARCH.ricochetShock.levels, chance = RESEARCH.shockChance.levels, mult = RESEARCH.shockMultiplier.levels;
  assert.deepEqual([unlock.length, chance.length, mult.length], [1, 30, 14]);
  assert.deepEqual([unlock[0]!.gold, minutes(unlock[0]!.hours)], [950_000, 23 * 60 + 53]);
  assert.deepEqual([chance[0]!.gold, minutes(chance[0]!.hours), chance[29]!.gold, minutes(chance[29]!.hours)], [250_000, 20 * 60, 63_130_000_000, (117 * 24 + 7) * 60 + 28]);
  assert.deepEqual([mult[13]!.gold, minutes(mult[13]!.hours)], [1_520_000_000, (11 * 24 + 18) * 60 + 21]);
  for (let i = 0; i < 14; i++) assert.deepEqual([mult[i]!.gold, mult[i]!.hours], [chance[i]!.gold, chance[i]!.hours], `level ${i + 1} shares its Gold and time`);
  const s = defaults(), shown = (id: ShockId) => RESEARCH_TARGETS[id].shown(researched(s.archives, id));
  assert.deepEqual([shown("ricochetShock"), shown("shockChance"), shown("shockMultiplier")], ["Locked", "2.50%", "×1.10"]);
  s.archives.levels.ricochetShock = 1;
  s.archives.levels.shockChance = 1;
  s.archives.levels.shockMultiplier = 1;
  assert.deepEqual([shown("ricochetShock"), shown("shockChance"), shown("shockMultiplier")], ["Unlocked", "3.00%", "×1.14"]);
  s.archives.levels.shockChance = 30;
  s.archives.levels.shockMultiplier = 14;
  assert.deepEqual([shown("shockChance"), shown("shockMultiplier")], ["17.50%", "×1.66"]);
});

test("a shocked enemy takes the hero's ATK times Shock Multiplier, only from a hero striking with it", () => {
  const hero = { attack: 100 } as Player;
  assert.equal(attackAgainst({ ...hero, shock: 1.1 }, { ...brute, shocked: true }), 110);
  assert.equal(attackAgainst({ ...hero, shock: 1.1 }, brute), 100, "an enemy not shocked");
  assert.equal(attackAgainst(hero, { ...brute, shocked: true }), 100, "the plain hero, as previews count it");
});

test("a ricochet's strike shocks the enemies it hits by Shock Chance's roll, never when unresearched", () => {
  const spots = [[3, 3], [4, 3], [5, 3]] as const;
  const board = (tiles: Record<string, Tile>) => ({
    tile: (x: number, y: number) => tiles[`${x},${y}`] ?? { kind: "floor" },
    clear() {},
    wound() {},
    markShock: (x: number, y: number) => { tiles[`${x},${y}`] = { ...tiles[`${x},${y}`]!, shocked: true }; },
    floorEnemies: () => spots.map(([x, y]) => ({ x, y })),
  }) as unknown as VolleyTurn["board"];
  const enemies = () => Object.fromEntries(spots.map(([x, y]) => [`${x},${y}`, { kind: "enemy", enemy: { ...brute } } as Tile]));
  const hero = { x: 0, y: 3, hp: 10, maxHp: 100, attack: 100, defense: 0, keys: {} } as unknown as Player;
  const sure = enemies();
  fightRicochet({ board: board(sure), wrap: 0, hero, seed: 1, ricochet: { boost: 1, rebounds: 2, chance: 100, shock: 10_000 } }, { x: 3, y: 3 }, 1);
  assert.deepEqual(Object.entries(sure).filter(([, t]) => t.shocked).map(([k]) => k), ["4,3", "5,3"], "the two struck, not the enemy the fight was on");
  const none = enemies();
  fightRicochet({ board: board(none), wrap: 0, hero, seed: 1, ricochet: { boost: 1, rebounds: 2, chance: 100 } }, { x: 3, y: 3 }, 1);
  assert.equal(Object.values(none).filter((t) => t.shocked).length, 0);
});

/** A Tower run on an open floor holding a shocked enemy at (4, 4), holding Thunderbolt, with `research` done. */
function arena(research: Partial<Record<ShockId, number>>) {
  const g = new Game(defaults(), random(5));
  g.newRun({ seed: 7 });
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "enemy", enemy: { ...brute } });
  w.markShock(4, 4);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 100, defense: 0, hp: 100, maxHp: 100 });
  g.save.arcana.owned.thunderbolt = [0, 0, 0];
  g.save.tower.runArcana.timers.thunderbolt = 1;
  Object.assign(g.save.archives.levels, research);
  return g;
}
const bolt = (g: Game) => {
  assert.ok(g.move(g.run.player.x === 0 ? 1 : -1, 0));
  return (g.volley?.shots ?? []).filter((s) => s.thunderbolt).map((s) => s.damage);
};

test("in a run, every hit on a shocked enemy is multiplied, the mark is saved, and the board marks it", () => {
  assert.deepEqual(bolt(arena({})), [1000], "unresearched, a shock counts for nothing");
  const g = arena({ ricochetShock: 1 });
  assert.equal(g.world.tile(4, 4).enemy!.shocked, true);
  assert.deepEqual(g.shockedTiles, [{ x: 4, y: 4 }]);
  assert.deepEqual(bolt(g), [1100], "×1.10 before Shock Multiplier");
  g.save.archives.levels.shockMultiplier = 14;
  assert.deepEqual(bolt(g), [1660], "a level done mid-run counts at once");
  assert.equal(g.fighterAt({ x: 4, y: 4 }).shock, 1.66, "the fight's hero strikes with it too");
  assert.equal(g.run.player.shock, undefined, "the run's own hero never carries it");
  g.save.tower.run = g.towerRun;
  const back = decode(JSON.stringify(g.save));
  assert.equal(back.tower.run!.changes["4,4"]!.shocked, true, "the shock is kept with the wound");
  const bad = decode(JSON.stringify({ ...g.save, tower: { ...g.save.tower, run: { ...g.save.tower.run, changes: { "4,4": { ...g.run.changes["4,4"], shocked: 2 } } } } }));
  assert.equal(bad.tower.run, null, "a broken mark fails the run, as any broken change does");
});

test("in a trial, a shocked foe takes the hero's ATK times Shock Multiplier, and a saved attempt keeps the shock", () => {
  const base = new Game(defaults(), random(5));
  base.newRun({ outside: true, seed: 12 });
  base.save.arcana.owned.ricochetShot = [0, 0, 0];
  base.save.archives.levels.ricochetShock = 1;
  Object.assign(base.run.player, { attack: 100, hp: 1000, maxHp: 1000 });
  const state = startTrial(base.run.player, "manual", [], 12, 1, "light-elemental", {});
  base.save.provingGrounds = state;
  const session = new TrialSession(base, state);
  session.sync();
  assert.equal(state.arcana!.spells!.shock, 1.1);
  assert.equal(state.arcana!.spells!.ricochet!.shock, 250);
  assert.equal(heroAttackOn(state, state.elemental, "boss"), 100);
  state.arcana!.shocked = ["boss"];
  assert.equal(Math.round(heroAttackOn(state, state.elemental, "boss")), 110);
  assert.equal(heroAttackOn(state, state.elemental), 100, "a hit that names no foe");
  assert.deepEqual(decodeTrial(JSON.parse(JSON.stringify(state)))!.arcana!.shocked, ["boss"]);
});
