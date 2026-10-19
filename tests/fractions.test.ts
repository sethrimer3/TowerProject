import { test } from "node:test";
import assert from "node:assert/strict";
import { bout, heroHpAfter, predict } from "../src/combat.ts";
import { snap } from "../src/exact.ts";
import { random } from "../src/random.ts";
import { enemyStat, popupAmount, whole, wholeChange, wholeHp } from "../src/whole.ts";
import type { Enemy, Player } from "../src/entities.ts";

const hero = (over: Partial<Player>): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const foe = (over: Partial<Enemy>): Enemy => ({ name: "Test", hp: 10, attack: 5, defense: 0, tier: 1, strength: "normal", ...over });

test("held amounts show whole and rounded down, changes to the nearest whole, enemy stats to two decimals (one from 100, none from 1,000)", () => {
  assert.deepEqual([whole(1.02), whole(30.9999999999), whole(7.99), whole(0)], [1, 31, 7, 0]);
  assert.deepEqual([wholeHp(0.3), wholeHp(0), wholeHp(99.6)], [1, 0, 99]);
  assert.deepEqual([wholeChange(0.4), wholeChange(2.5), wholeChange(Infinity)], [0, 3, Infinity]);
  assert.deepEqual([enemyStat(12), enemyStat(1.02), enemyStat(3.14159), enemyStat(2.5)], ["12", "1.02", "3.14", "2.5"]);
  assert.deepEqual([enemyStat(99.456), enemyStat(100.25), enemyStat(345.67), enemyStat(999.94), enemyStat(1000.4), enemyStat(12345.6), enemyStat(150)], ["99.46", "100.3", "345.7", "999.9", "1000", "12346", "150"]);
  assert.equal(snap(0.1 + 0.2), 0.3);
});

test("the board's rising numbers show whole below 100,000, then to three figures, rounded down", () => {
  assert.deepEqual([12.5, 99_999.4, 99_999.6, 100_000, 123_456, 4_567_890, 98_765_432_100].map(popupAmount), ["13", "99999", "100K", "100K", "123K", "4.56M", "98.7B"]);
});

test("fractional ATK strikes for its fraction: 1.02 ATK fells 10.2 HP in exactly 10 strikes", () => {
  const p = hero({ attack: 1.02 }), e = foe({ hp: 10.2, attack: 0 });
  assert.equal(predict(p, e).turns, 10);
  const fight = bout(p, e);
  const hits = fight.strikes.filter((s) => s.by === "hero");
  assert.equal(hits.length, 10);
  assert.deepEqual(hits.map((s) => s.damage), Array(10).fill(1.02));
  assert.equal(hits.at(-1)!.hp, 0);
});

test("over fractional stats, every forecast agrees with the fight played out", () => {
  const rng = random(41);
  const r = (max: number) => snap(Math.floor(rng() * max * 100) / 100);
  for (let i = 0; i < 2000; i++) {
    const p = hero({ hp: snap(20 + r(200)), maxHp: 400, attack: snap(1 + r(30)), defense: r(15), ...(rng() < 0.3 ? { shroud: r(10) } : {}) });
    const e = foe({ hp: snap(1 + r(150)), attack: r(40), defense: r(10) });
    const forecast = predict(p, e);
    if (forecast.impervious) continue;
    const fight = bout(p, e);
    assert.equal(fight.strikes.filter((s) => s.by === "hero").length, forecast.survivable ? forecast.turns : fight.strikes.filter((s) => s.by === "hero").length, `case ${i}: strikes`);
    assert.equal(heroHpAfter(fight, p.hp), forecast.survivable ? snap(p.hp - forecast.damage) : 0, `case ${i}: HP left`);
  }
});
