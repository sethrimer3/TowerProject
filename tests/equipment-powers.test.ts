import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { log10, snap } from "../src/exact.ts";
import type { Enemy, Player } from "../src/entities.ts";
import { bout, chainedCrits, type Crits } from "../src/combat.ts";
import { regenerate, resolveStep, BASE_RULES } from "../src/step-effects.ts";
import { loadout } from "../src/progression/loadout.ts";
import { TRAINING, trained, type TrainingId } from "../src/progression/training.ts";
import { rollFreeTraining } from "../src/progression/free-training.ts";
import { shieldCapacity } from "../src/hero-shield.ts";
import { woundMore, wounded } from "../src/enemies/ranged.ts";
import { beamsDirection, inBeams } from "../src/arcana/overseer.ts";
import { goldMultipliers } from "../src/economy/gold-multipliers.ts";
import { addItem, equip, type EquipItem, type EquipmentSave } from "../src/equipment/inventory.ts";
import { arcanaWithGear, equipmentEffects, noEffects } from "../src/equipment/effects.ts";
import { uniquesOf, STARTER_CATEGORIES } from "../src/equipment/catalog.ts";
import {
  AMBER_MOST, hoardFactor, jackpotFactor, POWER_IDS, POWER_TEXT, POWERS, powerOf, powerTier, tetherRank, validGearRun, yieldFactor,
} from "../src/equipment/powers.ts";
import type { EquipRarity } from "../src/equipment/balance.ts";

const opened = () => { const s = defaults(); s.equipment.unlocked = true; return s; };
function wear(e: EquipmentSave, def: string, rarity: EquipRarity = "epic", mode: "tower" | "delve" = "tower"): EquipItem {
  const item = addItem(e, def, rarity)!;
  equip(e, mode, item.id);
  return item;
}
const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 50, attack: 20, defense: 0, tier: 0, strength: "normal" };
const row = (id: TrainingId) => TRAINING.find((t) => t.id === id)!;

test("every starting category's three Uniques have a power, its words at each tier", () => {
  const uniques = STARTER_CATEGORIES.flatMap((c) => uniquesOf(c).map((d) => d.id));
  assert.deepEqual([...uniques].sort(), [...POWER_IDS].sort());
  for (const id of POWER_IDS) for (const t of [1, 2, 3, 4]) assert.ok(POWER_TEXT[id](t).length > 10, id);
  assert.deepEqual((["epic", "legendary", "mythic", "ancestral"] as const).map(powerTier), [1, 2, 3, 4]);
});

test("a worn Unique puts its power's tier into the worn effects; Stars don't raise it", () => {
  const e = opened().equipment;
  const blade = wear(e, "raptorBlade", "ancestral");
  blade.stars = 5;
  const worn = equipmentEffects(e, "tower");
  assert.equal(worn.raptorBlade, 4);
  assert.equal(powerOf(worn, "raptorBlade", "superCrit"), 14);
  assert.equal(worn.superCritChance, 14, "Raptor Blade's Super Crit chance joins the substats'");
  assert.equal(powerOf(worn, "soulReaper", "chance"), 0, "a power not worn is 0");
  assert.equal(equipmentEffects(e, "delve").raptorBlade, 0, "only the loadout wearing it");
});

test("the exact log10 matches Math.log10 closely and lands whole powers of ten exactly", () => {
  for (const x of [1, 10, 100, 1000, 0.1]) assert.equal(snap(log10(x)), Math.round(Math.log10(x)));
  for (const x of [2, 3, 7.5, 42, 999, 12345.6, 0.37]) assert.ok(Math.abs(log10(x) - Math.log10(x)) < 1e-12, String(x));
});

test("Hoarder Greaves: ATK × k × (1 + log10 keys), ×1 with none, at least k with a key's fraction", () => {
  assert.equal(hoardFactor(2.5, 0), 1);
  assert.equal(hoardFactor(0, 50), 1, "unworn");
  assert.equal(snap(hoardFactor(2, 10)), 4);
  assert.equal(snap(hoardFactor(1.25, 100)), 3.75);
  assert.equal(hoardFactor(1.5, 0.5), 1.5);
  const s = opened(), g = new Game(s);
  g.newRun({ seed: 4 });
  wear(s.equipment, "hoarderGreaves", "epic");
  g.run.player.keys = { yellow: 6, blue: 3, red: 1 };
  const at = { x: g.run.player.x + 1, y: g.run.player.y };
  assert.equal(g.fighterAt(at).attack, snap(g.run.player.attack * 1.25 * 2), "10 keys: ×1.25 × 2");
});

test("Raptor Blade's chain: a Super Crit makes the next strikes Super Crits, owed on; a chained one starts none", () => {
  const base: Crits = { factor: 2, applications: (k) => (k === 0 || k === 8 ? 1 : 0), superFactor: 3, superCrit: (k) => k === 0 || k === 3 || k === 8 };
  const c = chainedCrits(base, 5, 0);
  assert.deepEqual([...Array(10).keys()].map((k) => c.applications(k) > 0 && c.superCrit!(k)), [true, true, true, true, true, true, false, false, true, true]);
  assert.equal(c.chainLeft!(3), 3, "after three strikes, three still owed");
  assert.equal(c.chainLeft!(6), 0);
  assert.equal(c.chainLeft!(10), 4, "strike 8 starts a new chain");
  const carried = chainedCrits({ ...base, applications: () => 0, superCrit: () => false }, 5, 2);
  assert.deepEqual([0, 1, 2].map((k) => carried.applications(k) > 0 && carried.superCrit!(k)), [true, true, false], "owed from the fight before");
  const fight = bout(hero(), { ...brute, hp: 200 }, undefined, chainedCrits(base, 5, 0));
  assert.ok(fight.strikes.filter((s) => s.by === "hero").slice(0, 6).every((s) => s.superCrit));
});

test("Mirror Vault: the first strike takes Retribution off after its own damage, up to the HP left", () => {
  const fight = bout(hero({ retribution: 12 }), brute), first = fight.strikes[0]!;
  assert.deepEqual([first.damage, first.retribution, first.hp], [22, 12, 28]);
  assert.equal(fight.strikes.filter((s) => s.retribution).length, 1, "the first strike only");
  const most = bout(hero({ retribution: 500 }), brute).strikes[0]!;
  assert.deepEqual([most.retribution, most.hp], [40, 0], "never past the HP left");
});

test("Amber Prison: each strike that doesn't kill weakens the enemy's blows, up to the most", () => {
  const plain = bout(hero({ hp: 1000, maxHp: 1000, attack: 1 }), { ...brute, hp: 30 }), amber = bout(hero({ hp: 1000, maxHp: 1000, attack: 1, amber: 2.5 }), { ...brute, hp: 30 });
  const hits = (b: typeof plain) => b.strikes.filter((s) => s.by === "enemy").map((s) => s.damage);
  assert.ok(hits(amber).reduce((a, b) => a + b, 0) < hits(plain).reduce((a, b) => a + b, 0));
  assert.ok(hits(amber).length < hits(plain).length, "and slows them: some strikes skipped");
  const capped = bout(hero({ hp: 1000, maxHp: 1000, attack: 1, amber: 2.5 }), { ...brute, hp: 30, amber: AMBER_MOST });
  assert.equal(capped.strikes.find((s) => s.by === "enemy")!.damage, snap(20 * (100 - AMBER_MOST) / 100), "at most half off");
  const tile = woundMore({ kind: "enemy", enemy: brute }, 5, 0, 30), more = woundMore(tile, 5, 0, 30);
  assert.equal(more.amber, AMBER_MOST, "an arrow's mark caps too");
  assert.equal(wounded(more).enemy!.amber, AMBER_MOST, "the board reads it onto the enemy");
});

test("Zenith Guard: Regen heals on into Overheal, its share of the way to the ceiling", () => {
  const rules = { ...BASE_RULES, regen: 30, overheal: 2000 };
  assert.equal(regenerate(100, 100, rules), 100, "without it, no further than max HP");
  assert.equal(regenerate(100, 100, { ...rules, regenOverheal: 50 }), 130);
  assert.equal(regenerate(140, 100, { ...rules, regenOverheal: 50 }), 150, "up to half the way to 200");
});

test("Cradle of Life multiplies the Aether Shield's HP", () => {
  const s = opened();
  Object.assign(s.upgrades, { heroShield: 1 });
  const before = shieldCapacity(s, s.training, 1000, "tower");
  wear(s.equipment, "cradleOfLife", "mythic");
  assert.equal(shieldCapacity(s, s.training, 1000, "tower"), snap(before * 2));
});

test("Kinetic Mallet keeps a Dash Combo going more turns without a fight", () => {
  const s = opened(), g = new Game(s);
  g.newRun({ seed: 4 });
  g.run.combo = { next: 2, idle: 1 };
  (g as any).comboTurn(false, false);
  assert.equal(g.run.combo, undefined, "two turns end it");
  wear(s.equipment, "kineticMallet", "legendary");
  g.run.combo = { next: 2, idle: 1 };
  (g as any).comboTurn(false, false);
  (g as any).comboTurn(false, false);
  assert.deepEqual(g.run.combo, { next: 2, idle: 3 }, "two more turns with a Legendary");
});

test("Mobius Cipher: each pickup of a kind raises the next of that kind for the run", () => {
  assert.equal(yieldFactor(0.02, 5), 1.1);
  assert.equal(yieldFactor(0, 5), 1);
  const s = opened(), g = new Game(s);
  g.newRun({ seed: 4 });
  wear(s.equipment, "mobiusCipher", "ancestral");
  (g as any).pickedUp({ kind: "potion" });
  (g as any).pickedUp({ kind: "potion" });
  (g as any).pickedUp({ kind: "key", color: "blue" });
  assert.deepEqual(g.run.gear?.yields, { potion: 2, blue: 1 });
  const rules = g.stepRules;
  assert.deepEqual(rules.yields, { potion: 1.04, blue: 1.02 });
  const key = resolveStep(hero(), { kind: "key", color: "blue" }, rules);
  assert.equal(key.player.keys.blue, 1.02, "a key's fraction kept");
  const shard = resolveStep(hero(), { kind: "attack", amount: 10 } as never, rules);
  assert.equal(shard.player.attack, resolveStep(hero(), { kind: "attack", amount: 10 } as never, { ...rules, yields: {} }).player.attack, "no ATK shard picked yet");
});

test("Chrono Strider: Haste cuts every cooldown, Golden Chance adds points, a potion takes turns off", () => {
  const worn = { ...noEffects(), chronoStrider: 4 };
  assert.deepEqual(arcanaWithGear(worn, "thunderbolt", [1, 2, 100] as const), [1, 2, 85]);
  assert.deepEqual(arcanaWithGear(worn, "aurumBloom", [5, 10, 1] as const), [5, 30, 1]);
  assert.deepEqual(arcanaWithGear(noEffects(), "thunderbolt", [1, 2, 100] as const), [1, 2, 100]);
});

test("Jackpot Spurs: Gold found × (1 + rolls won on the floor × its percent), its own line", () => {
  assert.equal(jackpotFactor({ jackpotSpurs: 4 }, { frees: 3 }), 1.3);
  assert.equal(jackpotFactor({ jackpotSpurs: 1 }, undefined), 1);
  assert.equal(jackpotFactor({}, { frees: 3 }), undefined);
  const s = opened(), lines = (jackpot?: number) => goldMultipliers({ save: s, mode: "tower", tier: 1, now: 0, ...(jackpot === undefined ? {} : { jackpot }) }).filter((m) => m.id === "jackpot");
  assert.deepEqual(lines(), []);
  assert.deepEqual(lines(1.3).map((m) => m.factor), [1.3]);
  // A roll won counts even when no row is left to take its level.
  const won = { rolls: 0 }, run = { seed: 7, hand: [] } as never;
  rollFreeTraining(s, run, 0, undefined, { offense: 10_000, defense: 10_000, utility: 10_000 }, won);
  assert.equal(won.rolls, 3);
});

test("Equilibrium Tether: ATK, DEF, max HP and Regen each count a quarter of their ranks together", () => {
  const s = opened();
  s.training.attack = 40;
  assert.equal(tetherRank(s.training), 10);
  assert.equal(tetherRank(s.training, 3), 11, "the run's ranks add, rounded up");
  const plain = loadout(s);
  wear(s.equipment, "equilibriumTether", "epic");
  const tied = loadout(s), worn = equipmentEffects(s.equipment, "tower");
  assert.ok(tied.attack < plain.attack && tied.defense > plain.defense && tied.maxHp > plain.maxHp);
  const shifted = loadout(s, "tower", worn, 4);
  assert.equal(snap(shifted.defense - tied.defense), snap(trained(row("defense"), 11) - trained(row("defense"), 10)), "four ranks more in the pool: one rank more each");
  // Far past the highest rank, the curve carries on.
  s.training.attack = 1000 * 4 + 40;
  assert.ok(loadout(s).defense > 0);
});

test("Challenger's Defiance holds Overseer's beams on a boss", () => {
  const beams = { count: 1, width: 30, bonus: 2, turns: 7 };
  assert.equal(beamsDirection(beams), 2800);
  assert.equal(beamsDirection({ ...beams, aim: 9000 }), 9000);
  assert.ok(inBeams({ ...beams, aim: 9000 }, 0, 5, 0), "straight east");
  assert.ok(!inBeams({ ...beams, aim: 9000 }, 0, 0, 5));
});

test("Soul Reaper marks the same enemies however often it is asked, never a boss", () => {
  const s = opened(), g = new Game(s);
  g.newRun({ seed: 11 });
  wear(s.equipment, "soulReaper", "ancestral");
  const world = (g as any).world, p = g.run.player;
  const enemies = (world.floorEnemies?.(p.x, p.y) ?? []) as { x: number; y: number }[];
  const marks = enemies.map(({ x, y }) => g.doomedAt(x, y));
  assert.deepEqual(enemies.map(({ x, y }) => g.doomedAt(x, y)), marks);
  for (const [i, { x, y }] of enemies.entries()) if (world.tile(x, y).enemy?.strength === "boss") assert.equal(marks[i], false);
  assert.equal(POWERS.soulReaper.chance[3], 15);
});

test("a run's GearRun is checked as it loads", () => {
  assert.ok(validGearRun({ chain: 3, retribution: 12.5, frees: 2, yields: { potion: 4, red: 1 }, rushed: ["3,4", "1,2"] }));
  assert.ok(!validGearRun({ chain: 0 }));
  assert.ok(!validGearRun({ yields: { gems: 1 } }));
  assert.ok(!validGearRun({ other: 1 }));
});
