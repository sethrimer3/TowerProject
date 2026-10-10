import { test } from "node:test";
import assert from "node:assert/strict";
import { attackForFewerHits, predict } from "../src/combat.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { tileInfo } from "../src/ui/tile-info.ts";
import type { Enemy, Player } from "../src/entities.ts";
import { enemyTitle } from "../src/scaling.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import { wholeChange } from "../src/whole.ts";

const hero = (attack: number): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } });
const foe = (hp: number, defense: number): Enemy => ({ name: "Slime", hp, attack: 5, defense, tier: 0, strength: "normal" });

test("Attack Lore finds the fewest whole points of ATK that take one hit fewer", () => {
  // The search it stands in for: from no more, one point at a time.
  const slow = (p: Player, e: Enemy) => {
    const turns = predict(p, e).turns;
    for (let more = 1; ; more++) if (predict({ ...p, attack: p.attack + more }, e).turns < turns) return more;
  };
  for (const attack of [1, 2.5, 7, 10.02, 13])
    for (const defense of [0, 0.4, 3, 6])
      for (const hp of [1, 9, 10, 10.2, 37, 100, 1234.5]) {
        const p = hero(attack), e = foe(hp, defense), r = predict(p, e);
        const want = r.impervious || r.turns <= 1 ? null : slow(p, e);
        assert.equal(attackForFewerHits(p, e), want, `ATK ${attack} vs HP ${hp} DEF ${defense}`);
      }
  // 50 HP at 10 a hit takes 5; 13 a hit takes 4 (12 still takes 5).
  assert.equal(attackForFewerHits(hero(10), foe(50, 0)), 3);
});

test("the enemy panel adds Damage Prediction, Combat Forecast's hits and Attack Lore's ATK once each Goal is claimed", () => {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map([["1,0", { kind: "enemy", enemy: foe(50, 0) }], ["2,0", { kind: "enemy", enemy: foe(5, 0) }]]);
  Object.assign(g.run.player, { attack: 10, defense: 0 });
  const body = (x: number) => tileInfo(g, x, 0).body;
  assert.doesNotMatch(body(1), /damage|hits|Instakill|ATK:/);
  g.save.goals.claimed["1"] = [10];
  assert.match(body(1), /26 damage · Survivable/);
  assert.match(body(2), /0 damage · Instakill/, "the hero's first strike fells it");
  g.run.player.defense = 1000;
  assert.match(body(1), /0 damage · Harmless/, "a fight that costs no HP");
  g.run.player.defense = 0;
  assert.doesNotMatch(body(1), /hits|ATK:/);
  g.save.goals.claimed["1"] = [20];
  assert.doesNotMatch(body(1), /damage/);
  assert.match(body(1), /5 hits to defeat/);
  assert.match(body(2), /Instakill/);
  g.save.goals.claimed["1"] = [10, 20];
  assert.equal(body(2).match(/Instakill/g)!.length, 1, "said once");
  g.save.goals.claimed["1"] = [30];
  assert.match(body(1), /\+3 ATK: 4 hits/);
  assert.doesNotMatch(body(2), /ATK:/, "nothing fewer than one hit");
});

test("a fight Lifesteal heals the hero by on balance says Healing in the enemy panel", () => {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  // Five strikes of 10 heal 50 in all; the slime strikes back 5, 6, 7 and 8.
  w.cells = new Map([["1,0", { kind: "enemy", enemy: foe(50, 0) }]]);
  Object.assign(g.run.player, { attack: 10, defense: 0, hp: 50, lifesteal: 100 });
  g.save.goals.claimed["1"] = [10];
  const r = predict(g.run.player, foe(50, 0));
  assert.match(tileInfo(g, 1, 0).body, new RegExp(`${wholeChange(r.hpAfter! - 50)} Healing · Survivable`));
  const crits = { world: g.world, run: g.run, mode: g.mode, save: g.save, stepRules: { ...g.stepRules, crit: { chance: 50, factor: 2 } } };
  assert.match(tileInfo(crits, 1, 0).body, /~\d+ Healing · Survivable/);
  assert.match(tileInfo(crits, 1, 0).body, /Usually \d+–\d+ Healing/);
});

test("an enemy's title puts its strength before its name, unless it is a normal one", () => {
  const e = (strength: Enemy["strength"]) => ({ name: "Slime", strength });
  assert.equal(enemyTitle(e("weak")), "Weak Slime");
  assert.equal(enemyTitle(e("normal")), "Slime");
  assert.equal(enemyTitle(e("strong")), "Strong Slime");
  assert.equal(enemyTitle(e("elite")), "Elite Slime");
  assert.equal(enemyTitle(e("boss")), "Boss Slime");
});

test("the door panel shows what opening it takes under Key Efficiency and Heart Door Resilience", () => {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map([
    ["1,0", { kind: "door", door: { type: "wood", durability: 30 } }],
    ["2,0", { kind: "door", door: { type: "keys", keys: ["yellow"], mode: "all" } }],
    ["3,0", { kind: "door", door: { type: "fullHp" } }],
  ]);
  Object.assign(g.run.player, { hp: 100, maxHp: 100, keys: { yellow: 2, blue: 0, red: 0 } });
  const body = (x: number) => tileInfo(g, x, 0).body;
  assert.match(body(1), /Amber key: 2 → 1/);
  assert.match(body(2), /Amber key: 2 → 1/);
  assert.match(body(3), /HP 100 → 1/);
  // Key Efficiency's two levels: each key costs 99% of one.
  g.save.archives.levels.keyEfficiency = 2;
  assert.match(body(1), /Amber key: 2 → 1\.01/, "a Wooden Door's key too");
  assert.match(body(2), /Amber key: 2 → 1\.01/);
  // Heart Door Resilience's two levels: 10% less of the toll.
  g.save.archives.levels.heartDoorResilience = 2;
  assert.match(body(3), /HP 100 → 10\b/);
  // With no key, a Wooden Door is broken for its durability.
  g.run.player.keys.yellow = 0;
  assert.match(body(1), /Break: HP 100 → 70/);
});
