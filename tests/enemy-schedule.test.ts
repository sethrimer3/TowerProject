import test from "node:test";
import assert from "node:assert/strict";
import { PROFILES, RANKED_STRENGTHS, enemyCountPercent, enemyFirstFloor, enemyShare, profileShare } from "../src/enemy-schedule.ts";
import { STRENGTH_FROM_FLOOR } from "../src/scaling.ts";
import { addSchedule, averaged, enemyWeight, rankedEnemies, strengthShare, type Counts } from "../src/tower/census.ts";

/** The shares at floor `f` (counting from 1) of tower `t`: weak, normal, strong, elite. */
const shares = (t: number, f: number) => RANKED_STRENGTHS.map((k) => enemyShare(k, f - 1, t));

test("strong and elite enemies come earlier each tower; the first tower's are the generators' floors", () => {
  assert.deepEqual([1, 5, 9].map((t) => enemyFirstFloor("strong", t)), [11, 7, 3]);
  assert.deepEqual([1, 5, 9].map((t) => enemyFirstFloor("elite", t)), [41, 25, 9]);
  assert.deepEqual(STRENGTH_FROM_FLOOR, { strong: 11, elite: 41 });
});

test("weak enemies fade with floor and tower, strong and elite rise to their caps, normal takes the rest", () => {
  assert.deepEqual(shares(1, 1), [40, 60, 0, 0]);
  assert.deepEqual(shares(1, 11), [40, 40, 20, 0]);
  assert.deepEqual(shares(1, 41), [40, 37, 20, 3]);
  assert.deepEqual(shares(1, 101), [36, 40, 20, 4]);
  assert.deepEqual(shares(1, 1000), [4, 38, 38, 20]);
  assert.deepEqual(shares(1, 6000), [0, 35, 45, 20]);
  assert.deepEqual(shares(9, 1), [16, 84, 0, 0]);
  assert.deepEqual(shares(9, 9), [16, 61, 20, 3]);
  for (const t of [1, 2, 5, 9])
    for (let f = 1; f <= 6000; f += 37) {
      const s = shares(t, f);
      assert.equal(s.reduce((a, b) => a + b, 0), 100, `Tower ${t} floor ${f}`);
      assert.ok(s.every((v) => v >= 0), `Tower ${t} floor ${f}: ${s}`);
    }
});

test("balanced enemies fade with floor and tower to a fifth, attack- and defense-heavy splitting the rest", () => {
  const profiles = (t: number, f: number) => PROFILES.map((p) => profileShare(p, f - 1, t));
  assert.deepEqual(profiles(1, 1), [20, 60, 20]);
  assert.deepEqual(profiles(1, 101), [21, 58, 21]);
  assert.deepEqual(profiles(1, 2001), [40, 20, 40]);
  assert.deepEqual(profiles(2, 1), [21, 57, 22]);
  assert.deepEqual(profiles(9, 1), [32, 36, 32]);
  assert.deepEqual(profiles(9, 801), [40, 20, 40]);
  for (const t of [1, 2, 5, 9])
    for (let f = 1; f <= 6000; f += 37) assert.equal(profiles(t, f).reduce((a, b) => a + b, 0), 100, `Tower ${t} floor ${f}`);
});

test("a floor's enemy count grows a point every 30 floors, to three times the baseline by floor 6,000", () => {
  assert.deepEqual([1, 29, 30, 300, 1000, 5999, 6000, 9000].map((f) => enemyCountPercent(f - 1)), [100, 100, 101, 110, 133, 299, 300, 300]);
});

test("the census sets the shares wanted beside those found, and weighs the enemies", () => {
  const sum: Counts = { "enemy:weak": 2, "enemy:normal": 4, "enemy:strong": 3, "enemy:elite": 1, "enemy:boss": 1 };
  addSchedule(sum, 40, 1);
  const c = averaged(sum, 1);
  assert.equal(rankedEnemies(c), 10);
  assert.equal(strengthShare(c, "strong"), 30);
  assert.deepEqual(RANKED_STRENGTHS.map((k) => c[`share:${k}`]), [40, 37, 20, 3]);
  assert.equal(c["target:count"], 101);
  assert.equal(enemyWeight(c), 2 * 0.75 + 4 * 1.5 + 3 * 2.5 + 4 + 6);
});
