import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYED_ROUNDS, predict } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import type { Enemy, Player } from "../src/entities.ts";

// Damage Visual's labels play a fight's first PLAYED_ROUNDS rounds and
// estimate the rest: exact for a short fight, close for a long one.

const hero = (o: Partial<Player>): Player => ({ x: 0, y: 0, hp: 1e6, maxHp: 1e6, attack: 20, defense: 10, keys: { yellow: 0, blue: 0, red: 0 }, ...o });
const foe = (o: Partial<Enemy>): Enemy => ({ name: "Slime", hp: 1000, attack: 15, defense: 5, tier: 0, strength: "normal", ...o });

const FIGHTS: [Player, Enemy][] = [
  [hero({}), foe({ hp: 900 })],
  [hero({}), foe({})],
  [hero({ defense: 100 }), foe({ attack: 60, hp: 5000 })],
  [hero({ attack: 7, defense: 300 }), foe({ attack: 250, hp: 600 })],
  [hero({ attack: 6.5, defense: 2 }), foe({ attack: 1.5, hp: 300 })],
  [hero({ attack: 11, defense: 1000, shroud: 500 }), foe({ attack: 900, hp: 2000 })],
  [hero({ attack: 30, defense: 50, lifesteal: 2, hp: 5000, maxHp: 8000 }), foe({ attack: 40, hp: 6000 })],
  [hero({ attack: 300, defense: 200, lifesteal: 3, hp: 1e5, maxHp: 1e5, shroud: 3000 }), foe({ attack: 250, hp: 40000 })],
];

test("a long fight's damage is estimated within 5%, a short one's exactly", () => {
  for (const [p, e] of FIGHTS) {
    const exact = predict(p, e), estimate = predict(p, e, PLAYED_ROUNDS);
    assert.equal(estimate.turns, exact.turns);
    if (exact.turns <= PLAYED_ROUNDS + 1) assert.deepEqual(estimate, exact);
    else assert.ok(Math.abs(estimate.damage - exact.damage) <= 0.05 * exact.damage, `${exact.turns} turns: ${estimate.damage} vs ${exact.damage}`);
    const crits = forecast(p, e, { chance: 30, factor: 2 }), guessed = forecast(p, e, { chance: 30, factor: 2 }, PLAYED_ROUNDS);
    assert.ok(Math.abs(guessed.expected - crits.expected) <= 0.05 * Math.abs(crits.expected), `crits: ${guessed.expected} vs ${crits.expected}`);
  }
});

test("an estimate takes the same time however long the fight", () => {
  const p = hero({ attack: 1.01, defense: 1e6 }), e = foe({ attack: 1, defense: 1, hp: 1e9 });
  assert.ok(predict(p, e).turns > 1e10);
  const start = performance.now();
  for (let i = 0; i < 1000; i++) predict(p, e, PLAYED_ROUNDS);
  assert.ok(performance.now() - start < 200);
});
