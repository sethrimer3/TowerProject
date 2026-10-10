import { test } from "node:test";
import assert from "node:assert/strict";
import { DamagePredictions, damageLabel, drawDamageLabels, relativeColor } from "../src/damage-labels.ts";
import { predict } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import type { FrameContext } from "../src/render-frame.ts";
import { compactAmount } from "../src/whole.ts";

const hero = (over: Partial<Player> = {}): Player =>
  ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 10, defense: 2, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const enemy = (hp: number, attack: number, defense: number): Enemy => ({ name: "Slime", hp, attack, defense, tier: 1, strength: "normal" });

test("amounts shorten to fit a tile's corner, rounded down", () => {
  const shown = [0, 999, 1000, 1299, 9999, 12_345, 999_999, 1_500_000, 2.34e9, 5e12, 1e15].map(compactAmount);
  assert.deepEqual(shown, ["0", "999", "1K", "1.2K", "9.9K", "12K", "999K", "1.5M", "2.3B", "5T", "1e15"]);
});

test("a prediction is worked out once per kind of enemy until the hero's ATK, DEF or shroud changes", () => {
  const p = new DamagePredictions(), slime = enemy(30, 8, 1);
  assert.equal(p.cost(hero(), slime).damage, predict(hero(), slime).damage);
  p.cost(hero(), enemy(30, 8, 1));
  p.cost(hero({ hp: 5 }), slime);
  assert.equal(p.computed, 1, "the same stats, and HP alone changing, reuse it");
  p.cost(hero(), enemy(40, 8, 1));
  assert.equal(p.computed, 2, "another enemy's stats are their own");
  for (const changed of [{ attack: 11 }, { defense: 3 }, { shroud: 4 }]) {
    const before = p.computed;
    assert.equal(p.cost(hero(changed), slime).damage, predict(hero(changed), slime).damage);
    assert.equal(p.computed, before + 1, `recomputed after ${Object.keys(changed)[0]} changes`);
  }
});

test("with critical strikes a label is the inspect panel's expected damage, which follows the hero's HP", () => {
  const crit = { chance: 50, factor: 2 }, p = new DamagePredictions(), slime = enemy(60, 20, 1);
  for (const hp of [100, 12, 100]) {
    const h = hero({ hp, attack: 8 }), expected = forecast(h, slime, crit).expected;
    assert.equal(p.cost(h, slime, crit).damage, expected, `at ${hp} HP`);
  }
  assert.notEqual(forecast(hero({ hp: 12, attack: 8 }), slime, crit).expected, forecast(hero({ hp: 100, attack: 8 }), slime, crit).expected, "the HP cap matters here");
});

test("a label is red when lethal or the enemy can't be hurt, gray for an Instakill, white when struck for no HP, gold otherwise", () => {
  assert.deepEqual(damageLabel({ damage: 26, turns: 3 }, 100), { text: "26", color: "#ffe08a" });
  assert.deepEqual(damageLabel({ damage: 26, turns: 3 }, 26), { text: "26", color: "#ff5a5a" });
  assert.deepEqual(damageLabel({ damage: 0, turns: 1 }, 100), { text: "0", color: "#9aa3b2" });
  assert.deepEqual(damageLabel({ damage: 0, turns: 4 }, 100), { text: "0", color: "#ffffff" });
  assert.deepEqual(damageLabel({ damage: 12_345, turns: 9 }, 1e6).text, "12K");
  assert.deepEqual(damageLabel({ damage: Infinity, turns: Infinity }, 100), { text: "∞", color: "#ff5a5a" });
  // From real fights: one strike fells it; it strikes, but DEF and the shroud take it all.
  const p = new DamagePredictions();
  assert.equal(damageLabel(p.cost(hero({ attack: 50 }), enemy(30, 8, 1)), 100).color, "#9aa3b2");
  assert.equal(damageLabel(p.cost(hero({ shroud: 100 }), enemy(30, 8, 1)), 100).color, "#ffffff");
  const impervious = new DamagePredictions().cost(hero({ attack: 1 }), enemy(30, 8, 5));
  assert.equal(damageLabel(impervious, 100).text, "∞");
});

test("with Relative Damage Color, a label slides from green below 1% of the hero's HP through yellow and orange to red from 50%", () => {
  assert.deepEqual([0, 0.005, 0.01, 0.1, 0.25, 0.5, 0.9].map(relativeColor), ["#4dff6a", "#4dff6a", "#4dff6a", "#ffe14d", "#ff9a3d", "#ff5a5a", "#ff5a5a"]);
  assert.equal(relativeColor(0.055), "#a6f05c", "halfway from green to yellow");
  const label = (damage: number, hp: number, turns = 3) => damageLabel({ damage, turns }, hp, true).color;
  assert.deepEqual([label(0, 100), label(10, 100), label(25, 1000), label(60, 100)], ["#4dff6a", "#ffe14d", relativeColor(0.025), "#ff5a5a"]);
  assert.deepEqual([label(50, 200), label(50, 100)], ["#ff9a3d", "#ff5a5a"], "the same fight is redder the less HP is left");
  assert.equal(label(0, 100, 1), "#9aa3b2", "an Instakill stays gray");
  assert.equal(label(100, 100), "#ff5a5a", "a lethal fight stays red");
  assert.equal(damageLabel({ damage: 10, turns: 3 }, 100).color, "#ffe08a", "gold without it");
});

test("each enemy in view is labelled at its lower-left corner, but not the one being fought", () => {
  const texts: [string, number, number][] = [];
  const c = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, k) => (k === "fillText" ? (s: string, x: number, y: number) => texts.push([s, x, y]) : () => {}),
    set: () => true,
  });
  const at = (x: number, y: number): Tile => ((x === 1 && y === 1) || (x === 3 && y === 2) ? { kind: "enemy", enemy: enemy(30, 8, 1) } : { kind: "floor" }) as Tile;
  const f = { c, s: 20, n: 5, left: 0, bottom: 0, world: { tile: at } } as unknown as FrameContext;
  drawDamageLabels(f, new DamagePredictions(), hero(), null);
  const text = damageLabel(new DamagePredictions().cost(hero(), enemy(30, 8, 1)), 100).text;
  // Tile (1, 1)'s bottom edge is 4 rows down a 5-tile view of 20px tiles.
  assert.deepEqual(texts, [[text, 20 + 1.2, 80 - 1.2], [text, 60 + 1.2, 60 - 1.2]]);
  texts.length = 0;
  drawDamageLabels(f, new DamagePredictions(), hero(), { to: { x: 3, y: 2 } });
  assert.deepEqual(texts.map(([, x]) => x), [20 + 1.2]);
});
