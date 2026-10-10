import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { bout, heroHpAfter, heroHpDuring, predict, summarize } from "../src/combat.ts";
import { resolveStep } from "../src/step-effects.ts";
import { forecast } from "../src/crit-forecast.ts";
import { loadout, trainingStep } from "../src/loadout.ts";
import { startingHero } from "../src/game/hero-sync.ts";
import { trainingGold } from "../src/training-jobs.ts";
import { silverPrice } from "../src/run-training.ts";
import { TRAINING, UPGRADES, isStatRow, trained } from "../src/config.ts";
import { TREES } from "../src/skill-trees.ts";
import { DamagePredictions } from "../src/damage-labels.ts";
import { snap } from "../src/exact.ts";

const hero = (over: Partial<Player> = {}): Player => ({ hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const row = TRAINING.find((t) => t.id === "lifesteal")!;
if (!isStatRow(row)) throw new Error("Lifesteal is a stat row");

test("Lifesteal is a 10 Inspiration skill under Into the depths, and Buy Quantity and Key Siphon follow it", () => {
  const u = UPGRADES.find((u) => u.id === "lifesteal")!;
  assert.deepEqual([u.currency, u.base, u.max], ["inspiration", 10, 1]);
  const node = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;
  assert.deepEqual(node("lifesteal").requires, ["delve"]);
  assert.deepEqual(node("buyQuantity").requires, ["lifesteal"]);
  assert.deepEqual(node("keySiphon").requires, ["buyQuantity"]);
  assert.ok(node("lifesteal").y < node("buyQuantity").y && node("buyQuantity").y < node("keySiphon").y);
});

test("Lifesteal training adds 0.1% for the first rank, each rank 0.001% less, 80 ranks in all", () => {
  assert.deepEqual([row.group, row.max, row.cost, row.requires], ["defense", 80, 1, "lifesteal"]);
  assert.equal(trained(row, 0), 0);
  assert.equal(trained(row, 1), 0.1);
  assert.equal(snap(trained(row, 2) - trained(row, 1)), 0.099);
  assert.equal(snap(trained(row, 80) - trained(row, 79)), 0.021);
  assert.equal(trained(row, 80), 4.84);
});

test("a rank costs 60 Gold and 60 Silver first, about 1k at the 13th, 10k at the 37th and over 60k at the 80th", () => {
  const near = (n: number, low: number, high: number) => {
    const gold = trainingGold(row, n - 1), silver = silverPrice("lifesteal", n - 1);
    assert.ok(gold >= low && gold <= high, `Gold for rank ${n}: ${gold}`);
    assert.equal(silver, gold, `Silver for rank ${n} follows Gold`);
  };
  near(1, 60, 60);
  near(13, 900, 1200);
  near(37, 8000, 11000);
  near(80, 60000, 80000);
  let last = 0;
  for (let n = 1; n <= 80; n++) {
    const price = trainingGold(row, n - 1);
    assert.ok(price > last);
    last = price;
  }
});

test("a hero with Lifesteal heals by its share of each strike's damage before the enemy's reply", () => {
  // 12 per strike, 60 HP: five strikes; 10% heals 1.2 a strike.
  const plain = predict(hero({ hp: 50 }), brute), steal = predict(hero({ hp: 50, lifesteal: 10 }), brute);
  assert.equal(plain.turns, 5);
  assert.equal(plain.damage, 126, "30 + 31 + 32 + 33");
  assert.equal(plain.survivable, false);
  // Every strike but the last is answered: 126 against 50 HP, and 1.2 × 4 healed does not save it.
  assert.equal(steal.survivable, false);
  const strong = predict(hero({ hp: 130, maxHp: 150, lifesteal: 10 }), brute);
  assert.equal(strong.survivable, true);
  assert.equal(strong.hpAfter, snap(130 - 126 + 1.2 * 5));
  assert.equal(strong.damage, snap(130 - strong.hpAfter!));
  assert.equal(predict(hero({ hp: 130, maxHp: 150 }), brute).hpAfter, undefined, "no Lifesteal, no ending to carry");
});

test("healing stops at max HP", () => {
  const p = hero({ hp: 98, maxHp: 100, lifesteal: 50 });
  const r = predict(p, { ...brute, hp: 12 });
  assert.equal(r.hpAfter, 100, "6 healed, 2 of it kept");
  assert.equal(r.damage, 0);
  const second = predict(hero({ hp: 100, maxHp: 100, lifesteal: 50 }), { ...brute, hp: 24, attack: 20 });
  assert.equal(second.hpAfter, 86, "the first heal finds no room, the second adds 6 to the 80 left");
  assert.equal(second.damage, 14);
});

test("the played fight and the prediction end the same, whatever the stats", () => {
  let checked = 0, lethal = 0;
  for (const attack of [5, 12, 40.5]) for (const hp of [20, 80, 300]) for (const lifesteal of [0.1, 0.9, 4.84, 20]) for (const enemyAttack of [4, 20, 55]) for (const enemyHp of [30, 150, 700]) {
    const p = hero({ attack, hp, maxHp: hp + 25, lifesteal, shroud: 3, defense: 2 }), e: Enemy = { ...brute, hp: enemyHp, attack: enemyAttack, defense: 1 };
    const r = predict(p, e), fight = bout(p, e), after = heroHpAfter(fight, p.hp);
    if (r.impervious) continue;
    checked++;
    assert.equal(after > 0, r.survivable, `survives ${JSON.stringify({ attack, hp, lifesteal, enemyAttack, enemyHp })}`);
    if (r.survivable) assert.equal(after, r.hpAfter, `ends on the predicted HP ${JSON.stringify({ attack, hp, lifesteal, enemyAttack, enemyHp })}`);
    else lethal++;
    assert.equal(heroHpAfter(summarize(fight, 1400), p.hp), after, "summary rounds end the same");
  }
  assert.ok(checked > 100 && lethal > 10, "the sweep covers wins and losses");
});

test("the HP shown rises as each strike lands", () => {
  const p = hero({ hp: 90, maxHp: 100, lifesteal: 50, attack: 20 }), e: Enemy = { ...brute, hp: 60, attack: 4 };
  const fight = bout(p, e), first = fight.strikes[0]!;
  assert.equal(first.by, "hero");
  assert.equal(first.heroHp, 100, "10 healed, capped at 100");
  assert.equal(heroHpDuring(fight, 90, 0), 90);
  assert.equal(heroHpDuring(fight, 90, first.at), 100);
});

test("a step into an enemy ends on the HP the fight leaves, heals counted, and a scale's damage comes off that", () => {
  const tile = { kind: "enemy", enemy: { ...brute } } as Tile;
  const p = hero({ hp: 130, maxHp: 150, lifesteal: 10 });
  const out = resolveStep(p, tile);
  assert.equal(out.blocked, undefined);
  assert.equal((out as any).player.hp, 10, "130 less 126 taken, 6 healed");
  const scaled = resolveStep(p, tile, { potionHeal: 100, percentPotion: 0, regen: 0, scale: 1.05 }) as any;
  assert.equal(scaled.player.hp, 4, "the net 120 lost, 6 more");
});

test("Lifesteal reaches the hero and the forecast", () => {
  const save = defaults();
  save.training.lifesteal = 80;
  const l = loadout(save);
  assert.equal(l.lifesteal, 4.84);
  assert.equal(startingHero(save, "tower").player.lifesteal, 4.84);
  assert.equal(startingHero(defaults(), "tower").player.lifesteal, undefined, "a hero without it carries none");
  const next = trainingStep(defaults(), "lifesteal");
  assert.deepEqual([next.unit, next.now, next.next], ["%", 0, 0.1]);
  const crit = { chance: 50, factor: 2 };
  const p = hero({ hp: 130, maxHp: 150 }), s = hero({ hp: 130, maxHp: 150, lifesteal: 10 });
  assert.ok(forecast(s, brute, crit).expected < forecast(p, brute, crit).expected, "Lifesteal lowers the damage to expect");
});

test("Damage Visual's label follows Lifesteal", () => {
  const cache = new DamagePredictions();
  const plain = cache.cost(hero({ hp: 130, maxHp: 150 }), brute).damage, steal = cache.cost(hero({ hp: 130, maxHp: 150, lifesteal: 10 }), brute).damage;
  assert.equal(plain, 126);
  assert.equal(steal, 120, "six of it healed back");
});
