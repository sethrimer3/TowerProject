import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { ENEMY_GOLD, FAST_GOLD, WIDTH } from "../src/config.ts";
import { bout, heroHpAfter, instakill, predict, replies, summarize } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import { DamagePredictions, damageLabel } from "../src/damage-labels.ts";
import { FAST_CARRY, fastCarry, fastCells, fastShare } from "../src/fast-enemies.ts";
import { enemyStats } from "../src/enemy-curves.ts";
import { enemyTitle } from "../src/scaling.ts";
import { tierCells } from "../src/tiers.ts";
import { generateTowerRoom, RoomWorld } from "../src/tower/room-world.ts";
import { World } from "../src/delve/world.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const fast = (e: Enemy): Enemy => ({ ...e, fast: true });

test("Fast enemies start at 8% in the second tier, grow 1% every 200 floors to 20%, half a point more each tier after; none in the first", () => {
  assert.deepEqual([1, 100, 5000].map((f) => fastShare(1, f)), [0, 0, 0]);
  assert.deepEqual([1, 2, 101, 201, 2401, 9000].map((f) => fastShare(2, f)), [8000, 8005, 8500, 9000, 20_000, 20_000]);
  assert.deepEqual([1, 201, 2401, 9000].map((f) => fastShare(3, f)), [8500, 9500, 20_500, 20_500]);
  assert.deepEqual([fastShare(9, 1), fastShare(9, 9000)], [11_500, 23_500]);
});

test("a Fast enemy strikes with at least 1.75 times the tier below's floor-100 enemy: 700 in the second tier, 3,500 in the third", () => {
  assert.equal(FAST_CARRY, 1.75);
  assert.equal(enemyStats("tower", 1, 99, "normal", "balanced").attack, 400);
  assert.deepEqual([fastCarry("tower", 1), fastCarry("tower", 2), fastCarry("tower", 3)], [0, 700, 3500]);
  assert.deepEqual([fastCarry("delve", 2), fastCarry("delve", 3)], [700, 3500]);
});

test("Tower floors make about 8% of their non-boss enemies Fast from the second tier, raising only their ATK, and none in the first", () => {
  let enemies = 0, fasts = 0, raised = 0;
  for (const seed of [3, 41, 977])
    for (let room = 0; room < 60; room++) {
      for (const t of new RoomWorld(seed, room, {}, 0, 1).cells.values()) assert.ok(!t.enemy?.fast, "none in the first tier");
      const plain = tierCells(generateTowerRoom(seed, room, 2), 2), cells = new RoomWorld(seed, room, {}, 0, 2).cells;
      for (const [k, t] of cells) {
        const was = plain.get(k)!;
        if (!t.enemy?.fast) { assert.deepEqual(t, was, `${seed}/${room} ${k} stands as generated`); continue; }
        assert.notEqual(t.enemy.strength, "boss");
        assert.deepEqual(t, { ...was, enemy: { ...was.enemy!, fast: true, attack: Math.max(was.enemy!.attack, 700) } });
        fasts++;
        if (t.enemy.attack > was.enemy!.attack) raised++;
      }
      enemies += [...cells.values()].filter((t) => t.enemy && t.enemy.strength !== "boss").length;
    }
  const share = fasts / enemies;
  assert.ok(share > 0.06 && share < 0.1, `about 8% Fast: ${share}`);
  assert.ok(raised > 0, "the early floors' Fast enemies strike with the carry");
  // The same run, floor and tile always roll the same.
  assert.deepEqual(new RoomWorld(41, 7, {}, 0, 2).cells, new RoomWorld(41, 7, {}, 0, 2).cells);
});

test("past the floor the curve outgrows the carry, Fast changes no stats", () => {
  const cells = new Map<string, Tile>([["1,1", { kind: "enemy", enemy: { ...brute, attack: 900 } }], ["2,1", { kind: "enemy", enemy: { ...brute, attack: 500 } }]]);
  // A floor every tile rolls Fast on: shares are capped at 20%, so search for tiles that do.
  const all = fastCells(new Map([...Array(400).keys()].map((i) => [`${i % 20},${Math.floor(i / 20)}`, { kind: "enemy", enemy: brute } as Tile])), "tower", 2, 5, () => 1);
  const rolled = [...all].filter(([, t]) => t.enemy?.fast).map(([k]) => k);
  assert.ok(rolled.length > 15 && rolled.length < 50, "about 8% of 400");
  const [k1, k2] = rolled as [string, string];
  const out = fastCells(new Map([[k1, cells.get("1,1")!], [k2, cells.get("2,1")!]]), "tower", 2, 5, () => 1);
  assert.deepEqual([out.get(k1)!.enemy, out.get(k2)!.enemy], [{ ...brute, attack: 900, fast: true }, { ...brute, attack: 700, fast: true }]);
  const boss = fastCells(new Map([[k1, { kind: "enemy", enemy: { ...brute, strength: "boss" } } as Tile]]), "tower", 2, 5, () => 1);
  assert.equal(boss.get(k1)!.enemy!.fast, undefined, "a boss is never Fast");
});

test("Delve caves make Fast enemies from the second delve, none in the first", () => {
  const count = (tier: number) => {
    const w = new World({ seed: 23, changes: {}, floor: 0, milestone: 0, tier, percentPotions: 0 } as never);
    let n = 0;
    for (let y = 0; y < 400; y++) for (let x = 0; x < WIDTH; x++) {
      const e = w.tile(x, y).enemy;
      if (e?.fast) { n++; assert.ok(e.attack >= 700 && e.strength !== "boss"); }
    }
    return n;
  };
  assert.equal(count(1), 0);
  assert.ok(count(2) > 0, "the second delve has Fast enemies");
});

test("a Fast enemy strikes first: even one the hero fells in a strike lands a blow, and it is no Instakill", () => {
  const p = hero({ attack: 100, defense: 10, shroud: 5 }), e = fast(brute);
  const r = predict(p, e), fight = bout(p, e);
  assert.deepEqual([r.turns, replies(r), r.damage, instakill(r)], [1, 1, 15, false]);
  assert.deepEqual(fight.strikes.map((s) => s.by), ["enemy", "hero"]);
  assert.equal(heroHpAfter(fight, p.hp), 85);
  assert.equal(instakill(predict(p, brute)), true, "the same enemy, not Fast, never strikes");
  // Its ATK rises after its own strike, before its second.
  const long = bout(hero({ attack: 31, hp: 1000, maxHp: 1000 }), e);
  assert.deepEqual(long.strikes.filter((s) => s.by === "enemy").map((s) => s.damage), [30, 31]);
});

test("a Fast enemy's opening strike may fell the hero, and Revive may raise it", () => {
  const p = hero({ attack: 1000, hp: 20 }), e = fast(brute);
  assert.equal(predict(p, e).survivable, false);
  const lost = bout(p, e);
  assert.deepEqual(lost.strikes.map((s) => [s.by, s.hp]), [["enemy", 0]]);
  const raised = bout(p, e, () => true);
  assert.deepEqual(raised.strikes.map((s) => [s.by, !!s.revived]), [["enemy", true], ["hero", false]]);
});

test("thorns answer a Fast enemy's opening strike; Lifesteal heals only from the hero's strikes", () => {
  const thorned = bout(hero({ attack: 12, hp: 500, maxHp: 500, thorns: 10 }), fast(brute));
  assert.equal(thorned.strikes[0]!.by, "enemy");
  assert.equal(thorned.strikes[0]!.thorns, 6);
  const healed = bout(hero({ attack: 12, hp: 50, lifesteal: 50 }), fast(brute));
  assert.equal(healed.strikes[0]!.healed, undefined);
  assert.ok(healed.strikes[1]!.healed! > 0, "the hero's first strike heals");
});

test("the played fight and the prediction end the same against a Fast enemy, whatever the stats", () => {
  let checked = 0, thorned = 0, lethal = 0;
  for (const thorns of [0, 7, 50]) for (const parry of [0, 25]) for (const lifesteal of [0, 5]) for (const shroud of [0, 40]) for (const enemyAttack of [4, 20, 55]) for (const enemyHp of [10, 30, 700]) for (const hp of [30, 80]) {
    const p = hero({ attack: 12, hp, maxHp: 100, defense: 2, shroud, ...(thorns ? { thorns } : {}), ...(parry ? { parryChance: 100, parry } : {}), ...(lifesteal ? { lifesteal } : {}) });
    const e = fast({ ...brute, hp: enemyHp, attack: enemyAttack, defense: 1 });
    const r = predict(p, e), fight = bout(p, e), after = heroHpAfter(fight, p.hp);
    const what = JSON.stringify({ thorns, parry, lifesteal, shroud, enemyAttack, enemyHp, hp });
    checked++;
    assert.equal(after > 0, r.survivable, `survives ${what}`);
    if (!r.survivable) lethal++;
    else if (r.hpAfter !== undefined) assert.equal(after, r.hpAfter, `ends on the predicted HP ${what}`);
    else assert.equal(after, Math.max(0, p.hp - r.damage), `takes the predicted damage ${what}`);
    if (r.survivable) {
      assert.equal(fight.strikes.filter((s) => s.by === "hero").length, r.turns, `as many strikes ${what}`);
      assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, replies(r), `as many replies ${what}`);
    }
    if (r.thornKill) thorned++;
    assert.equal(!!r.thornKill && r.survivable, after > 0 && fight.strikes.at(-1)!.thornHp === 0, `felled by thorns ${what}`);
    assert.equal(heroHpAfter(summarize(fight, 1400), p.hp), after, "summary rounds end the same");
  }
  assert.ok(checked > 400 && thorned > 10 && lethal > 10, "the sweep covers thorn kills and losses");
});

test("the crit forecast and Damage Visual count a Fast enemy's opening strike: never an Instakill, never gray", () => {
  const p = hero({ attack: 40, defense: 10 }), e = fast({ ...brute, hp: 70 });
  const f = forecast(p, e, { chance: 50, factor: 2 });
  assert.equal(f.instakill, 0);
  // Two strikes or, with a crit, one: the enemy lands two blows or one.
  assert.ok(f.p10 >= 20 && f.p90 <= 41 && f.expected > 20 && f.expected < 41, JSON.stringify(f));
  const labels = new DamagePredictions(), strong = hero({ attack: 1000 });
  assert.equal(damageLabel(labels.cost(strong, brute), 100).color, "#9aa3b2", "an Instakill is gray");
  const cost = labels.cost(strong, fast(brute));
  assert.deepEqual([cost.damage, damageLabel(cost, 100).text], [30, "30"]);
  assert.notEqual(damageLabel(cost, 100).color, "#9aa3b2");
});

test("Fast enemies say so before their strength and name", () => {
  assert.equal(enemyTitle({ name: "Goblin", strength: "elite", fast: true }), "Fast Elite Goblin");
  assert.equal(enemyTitle({ name: "Goblin", strength: "normal", fast: true }), "Fast Goblin");
  assert.equal(enemyTitle({ name: "Goblin", strength: "normal" }), "Goblin");
});

/** A Tower run inside on an open 5×5 floor, the hero at (0, 0) and `foe` beside it. */
function arena(foe: Enemy, over: Partial<Player>) {
  const g = new Game(defaults());
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("1,0", { kind: "enemy", enemy: foe });
  Object.assign(g.run.player, { x: 0, y: 0, attack: 1000, defense: 0, hp: 100, maxHp: 100, ...over });
  return g;
}

test("a Fast enemy costs the hero its opening strike in play and pays 1 Gold more", () => {
  const foe: Enemy = { name: "Test", hp: 10, attack: 5, defense: 2, tier: 1, strength: "strong" };
  const plain = arena(foe, {}), quick = arena(fast(foe), {});
  assert.ok(plain.move(1, 0) && quick.move(1, 0));
  assert.deepEqual([plain.run.player.hp, quick.run.player.hp], [100, 95]);
  assert.equal(FAST_GOLD, 1);
  assert.deepEqual([plain.save.gold, quick.save.gold], [ENEMY_GOLD.strong, ENEMY_GOLD.strong + 1]);
});
