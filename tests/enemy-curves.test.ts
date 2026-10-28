import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CURVE, ENEMY_CURVES, GREATER_BOSS_OVER_BOSS, STEPS_PER_FLOOR, curveAt, enemyStats, type CurveMode } from "../src/enemies/curves.ts";
import type { EnemyStrength, EnemyProfile } from "../src/entities.ts";
import { intPow, root } from "../src/exact.ts";
import { getTowerGateEnemy } from "../src/enemies/scaling.ts";
import { region } from "../src/delve/labyrinth.ts";

const MODES: CurveMode[] = ["tower", "delve"];
const STRENGTHS: EnemyStrength[] = ["weak", "normal", "strong", "elite", "boss", "greaterBoss"];
const PROFILES: EnemyProfile[] = ["attackHeavy", "balanced", "defenseHeavy"];
/** Step `floor` (counted from 1) of `mode`. */
const stepOf = (mode: CurveMode, floor: number) => (floor - 1) * STEPS_PER_FLOOR[mode];
const near = (a: number, b: number, share: number) => Math.abs(a / b - 1) <= share;

test("root is the n-th root, found the same way everywhere", () => {
  for (const [x, n] of [[2, 2], [1300 / 32, 90], [742e6 / 323e3, 7000], [0.21 / 0.17, 9990], [0.5, 3]] as const) {
    const r = root(x, n);
    assert.ok(near(intPow(r, n), x, 1e-9), `${x} ${n}`);
  }
  assert.equal(root(4, 2), 2);
  assert.equal(root(5, 1), 5);
});

test("a normal, balanced enemy meets its anchors in both modes", () => {
  for (const mode of MODES) {
    const curve = DEFAULT_CURVE[mode];
    for (const stat of ["hp", "attack"] as const)
      for (const [floor, value] of curve[stat]) {
        const e = enemyStats(mode, 1, stepOf(mode, floor), "normal", "balanced");
        assert.ok(near(e[stat], value, 0.001), `${mode} ${stat} floor ${floor}: ${e[stat]} vs ${value}`);
      }
  }
  // The old first zone's 32 HP / 12 ATK / 2 DEF on floor 10, weaker below it.
  assert.deepEqual(enemyStats("tower", 1, 9, "normal", "balanced"), { hp: 32, attack: 12, defense: 2.04 });
  assert.deepEqual(enemyStats("tower", 1, 0, "normal", "balanced"), { hp: 22, attack: 8.4, defense: 1.43 });
});

test("growth curves carry on at their last rate; multiplier curves hold", () => {
  const growth = [[1, 1], [11, 1024]] as const, rate = root(1024, 10);
  assert.ok(near(curveAt(growth, 20, 1), 1024 * intPow(rate, 10), 1e-12));
  assert.equal(curveAt([[1, 0.17], [1000, 0.21]], 5000, 1, true), 0.21);
  assert.equal(curveAt([[1, 2.5]], 77, 10), 2.5);
});

/** Floors to sample: every one to 120, then spread out to 10,000. */
const FLOORS = [...Array.from({ length: 120 }, (_, i) => i + 1), 150, 199, 200, 201, 299, 300, 301, 450, 999, 1000, 1001, 2500, 10_000];

test("every stat only rises with the floor, in every mode, strength and profile", () => {
  for (const mode of MODES)
    for (const strength of STRENGTHS)
      for (const profile of PROFILES) {
        let last = enemyStats(mode, 1, 0, strength, profile);
        for (const floor of FLOORS.slice(1)) {
          const e = enemyStats(mode, 1, stepOf(mode, floor), strength, profile);
          for (const stat of ["hp", "attack", "defense"] as const)
            assert.ok(e[stat] >= last[stat], `${mode} ${strength} ${profile} ${stat} floor ${floor}`);
          last = e;
        }
      }
  // The Delve grows with every depth, not every ten.
  const a = enemyStats("delve", 1, 501, "normal", "balanced"), b = enemyStats("delve", 1, 502, "normal", "balanced");
  assert.ok(b.hp > a.hp && b.attack > a.attack);
});

test("DEF stays at most half of ATK for every enemy, and the balanced share rises from 0.17 to 0.21", () => {
  for (const mode of MODES)
    for (const tier of [1, ...Object.keys(ENEMY_CURVES[mode]).map(Number)])
      for (const strength of STRENGTHS)
        for (const profile of PROFILES)
          for (const floor of FLOORS) {
            const e = enemyStats(mode, tier, stepOf(mode, floor), strength, profile);
            assert.ok(e.defense <= e.attack / 2, `${mode} ${tier} ${strength} ${profile} floor ${floor}: ${JSON.stringify(e)}`);
          }
  let share = 0;
  for (let floor = 1; floor <= 1200; floor++) {
    const next = curveAt(DEFAULT_CURVE.tower.defenseOfAttack, floor - 1, 1, true);
    assert.ok(next >= share);
    share = next;
  }
  assert.equal(curveAt(DEFAULT_CURVE.tower.defenseOfAttack, 0, 1, true), 0.17);
  assert.equal(share, 0.21);
});

test("bosses are a multiplier on their own floor's curve, and a Greater Boss twice a boss", () => {
  // Floor 10's Tower boss: 3.5 times the normal enemy's 32 HP, 1.3 times its 12 ATK.
  assert.deepEqual(enemyStats("tower", 1, 9, "boss", "balanced"), { hp: 112, attack: 15.6, defense: 2.04 });
  for (const mode of MODES)
    for (const floor of [1, 7, 10, 55, 300]) {
      const step = stepOf(mode, floor), boss = enemyStats(mode, 1, step, "boss", "balanced");
      const normal = enemyStats(mode, 1, step, "normal", "balanced"), shape = DEFAULT_CURVE[mode].strength.boss;
      // Each is rounded to hundredths on its own.
      for (const stat of ["hp", "attack", "defense"] as const) assert.ok(Math.abs(boss[stat] - normal[stat] * shape[stat]) <= 0.02 + boss[stat] * 1e-9, `${mode} ${floor} ${stat}`);
      const greater = enemyStats(mode, 1, step, "greaterBoss", "balanced");
      assert.deepEqual(greater, { hp: boss.hp * GREATER_BOSS_OVER_BOSS, attack: boss.attack * GREATER_BOSS_OVER_BOSS, defense: boss.defense * GREATER_BOSS_OVER_BOSS });
    }
});

test("a Delve enemy of each strength matches a default-curve Tower's on the same equivalent floor, its elite ten floors ahead", () => {
  for (const floor of [0, 9, 40, 99, 299])
    for (const strength of ["weak", "normal", "strong", "elite", "boss"] as const) {
      const delve = enemyStats("delve", 1, floor * 10, strength, "balanced"), tower = enemyStats("tower", 5, floor, strength, "balanced");
      for (const stat of ["hp", "attack", "defense"] as const)
        assert.ok(near(delve[stat], tower[stat], 0.01), `floor ${floor + 1} ${strength} ${stat}: ${delve[stat]} against ${tower[stat]}`);
    }
});

test("Towers I to IV raise ATK from floor 11 to 45, 110 and 220 on floors 25, 50 and 75 (HP to 124, 320 and 677), back to the default by floor 100; Tower V on is the default", () => {
  const stat = (tier: number, floor: number, key: "hp" | "attack") => enemyStats("tower", tier, floor - 1, "normal", "balanced")[key];
  const atk = (tier: number, floor: number) => stat(tier, floor, "attack"), hp = (tier: number, floor: number) => stat(tier, floor, "hp");
  for (const tier of [1, 2, 3, 4]) {
    for (let floor = 1; floor <= 10; floor++) {
      assert.equal(atk(tier, floor), atk(5, floor), `tower ${tier} floor ${floor}`);
      assert.equal(hp(tier, floor), hp(5, floor), `tower ${tier} floor ${floor}`);
    }
    for (let floor = 11; floor < 100; floor++) {
      assert.ok(atk(tier, floor) > atk(5, floor), `tower ${tier} floor ${floor}`);
      assert.ok(hp(tier, floor) > hp(5, floor), `tower ${tier} floor ${floor}`);
    }
    assert.equal(atk(tier, 25), 45);
    assert.equal(hp(tier, 25), 124);
    assert.equal(atk(tier, 50), 110);
    assert.equal(hp(tier, 50), 320);
    assert.equal(atk(tier, 75), 220);
    assert.equal(hp(tier, 75), 677);
    for (const floor of [100, 101, 250, 1200]) {
      assert.equal(atk(tier, floor), atk(5, floor), `tower ${tier} floor ${floor}`);
      assert.equal(hp(tier, floor), hp(5, floor), `tower ${tier} floor ${floor}`);
    }
  }
  assert.equal(atk(5, 25), 21.53);
});

test("a tower or delve given its own curve generates its enemies from it", () => {
  const custom = { ...DEFAULT_CURVE.tower, hp: [[1, 1000], [2, 2000]] as const }, own = ENEMY_CURVES.tower[2];
  ENEMY_CURVES.tower[2] = custom;
  ENEMY_CURVES.delve[2] = { ...DEFAULT_CURVE.delve, hp: [[1, 1000], [2, 2000]] };
  try {
    assert.equal(getTowerGateEnemy(0, "normal", "balanced", 2).hp, 1000);
    assert.equal(getTowerGateEnemy(0, "normal", "balanced", 1).hp, 22);
    assert.equal(getTowerGateEnemy(0, "normal", "balanced", 3).hp, 22);
    const hps = (tier: number) => [...region(91, 0, tier).cells.values()].flatMap((t) => (t.enemy ? [t.enemy.hp] : []));
    assert.ok(Math.min(...hps(2)) >= 750, "every tier-2 Delve enemy has at least weak × 1000 HP");
    assert.ok(Math.max(...hps(1)) < 750);
  } finally {
    ENEMY_CURVES.tower[2] = own;
    delete ENEMY_CURVES.delve[2];
  }
});
