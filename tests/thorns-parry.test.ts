import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { point, type Enemy, type Player, type Tile } from "../src/entities.ts";
import { PARRY_CAP, bout, heroHpAfter, instakill, parryCut, predict, summarize, thornDamage } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import { loadout, trainingStep } from "../src/loadout.ts";
import { startingHero } from "../src/game/hero-sync.ts";
import { trainingGold } from "../src/training-jobs.ts";
import { silverPrice } from "../src/run-training.ts";
import { TRAINING, UPGRADES, isStatRow, trained, type TrainingId } from "../src/config.ts";
import { TREES } from "../src/skill-trees.ts";
import { BoardPopups, lunges } from "../src/board-popups.ts";
import { countsParries, unlockAt } from "../src/goals.ts";
import { DamagePredictions, damageLabel } from "../src/damage-labels.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const row = (id: TrainingId) => TRAINING.find((t) => t.id === id)!;
const node = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;

test("Thorns sits between Buy Quantity and Key Siphon, Evade between Regen Research and Revive, 10 Inspiration each", () => {
  for (const id of ["thorns", "evade"] as const) {
    const u = UPGRADES.find((u) => u.id === id)!;
    assert.deepEqual([u.currency, u.base, u.max], ["inspiration", 10, 1], id);
  }
  assert.deepEqual([node("thorns").requires, node("keySiphon").requires], [["buyQuantity"], ["thorns"]]);
  assert.deepEqual([node("evade").requires, node("revive").requires], [["regenResearch"], ["evade"]]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["combatStance", "buildout", "trainers", "shroud", "critical", "archives", "delve", "greaterHeal"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("evade"), false, "waits for Regen Research");
  assert.ok(g.buy("regenResearch"));
  assert.equal(g.buy("revive"), false, "waits for Evade");
  assert.ok(g.buy("evade"));
  assert.ok(g.buy("revive"));
});

test("Thorn Damage adds 1% a rank to 99; Parry Chance 1% and Parry % 0.5% a rank to 100; all Defense rows the skills open", () => {
  for (const [id, requires, max, per] of [["thorns", "thorns", 99, 1], ["parryChance", "evade", 100, 1], ["parry", "evade", 100, 0.5]] as const) {
    const r = row(id);
    if (!isStatRow(r)) throw new Error(`${id} is a stat row`);
    assert.deepEqual([r.group, r.max, r.cost, r.requires], ["defense", max, 1, requires], id);
    assert.deepEqual([trained(r, 0), trained(r, 1), trained(r, 10), trained(r, max)], [0, per, 10 * per, max * per], id);
  }
  const s = defaults();
  Object.assign(s.upgrades, { thorns: 1, evade: 1 });
  Object.assign(s.training, { thorns: 50, parryChance: 30, parry: 41 });
  const l = loadout(s);
  assert.deepEqual([l.thorns, l.parryChance, l.parry], [50, 30, 20.5]);
  const p = startingHero(s, "tower").player;
  assert.deepEqual([p.thorns, p.parryChance, p.parry], [50, 30, 20.5], "the hero carries them into a run");
  assert.equal(startingHero(defaults(), "tower").player.thorns, undefined, "a hero without them carries none");
  const step = trainingStep(s, "parry");
  assert.deepEqual([step.unit, step.now, step.next], ["%", 20.5, 21]);
});

test("a rank of Thorn Damage costs 60, about 1k at the 13th, 10k at the 41st and over 75k at the 99th; a parry rank 40, under 600 at the 12th, under 5k at the 36th and over 40k at the 80th", () => {
  const price = (id: TrainingId, n: number) => {
    const gold = trainingGold(row(id), n - 1);
    assert.equal(silverPrice(id, n - 1), gold, `${id} rank ${n}: the same in Silver and Gold`);
    return gold;
  };
  assert.deepEqual([1, 13, 41, 99].map((n) => price("thorns", n)), [60, 993, 9901, 113781]);
  for (const id of ["parryChance", "parry"] as const) assert.deepEqual([1, 12, 36, 80].map((n) => price(id, n)), [40, 590, 4775, 40953]);
});

test("thorns take a share of the enemy's max HP each strike it lands, half from a boss, whatever its HP", () => {
  const p = hero({ hp: 1e9, maxHp: 1e9, thorns: 50 });
  for (const hp of [60, 6e6]) {
    const e = { ...brute, hp }, fight = bout(p, e), r = predict(p, e);
    assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, 2, "two strikes fell it");
    assert.deepEqual(fight.strikes.at(-1)!, { ...fight.strikes.at(-1)!, by: "enemy", thorns: hp / 2, thornHp: 0 });
    assert.deepEqual([r.turns, r.thornKill], [2, true], "the prediction ends the same way");
  }
  assert.equal(thornDamage(p, { ...brute, strength: "boss" }), 15);
  assert.equal(thornDamage(p, { ...brute, strength: "greaterBoss" }), 15);
  assert.equal(thornDamage(hero(), brute), 0, "none without Thorn Damage");
});

test("the played fight and the prediction end the same with thorns and certain parries, whatever the stats", () => {
  let checked = 0, thorned = 0, lethal = 0;
  for (const thorns of [0, 1, 7, 50]) for (const parry of [0, 25]) for (const lifesteal of [0, 5]) for (const enemyAttack of [4, 20, 55]) for (const enemyHp of [30, 700]) for (const strength of ["normal", "boss"] as const) {
    const p = hero({ attack: 12, hp: 80, maxHp: 100, defense: 2, shroud: 3, ...(thorns ? { thorns } : {}), ...(parry ? { parryChance: 100, parry } : {}), ...(lifesteal ? { lifesteal } : {}) });
    const e: Enemy = { ...brute, hp: enemyHp, attack: enemyAttack, defense: 1, strength };
    const r = predict(p, e), fight = bout(p, e), after = heroHpAfter(fight, p.hp), taken = fight.strikes.filter((s) => s.by === "enemy");
    const what = JSON.stringify({ thorns, parry, lifesteal, enemyAttack, enemyHp, strength });
    checked++;
    assert.equal(after > 0, r.survivable, `survives ${what}`);
    if (!r.survivable) lethal++;
    else if (r.hpAfter !== undefined) assert.equal(after, r.hpAfter, `ends on the predicted HP ${what}`);
    else assert.equal(after, Math.max(0, p.hp - r.damage), `takes the predicted damage ${what}`);
    if (r.survivable) assert.equal(fight.strikes.filter((s) => s.by === "hero").length, r.turns, `as many strikes ${what}`);
    if (r.thornKill) thorned++;
    assert.equal(!!r.thornKill && r.survivable, after > 0 && fight.strikes.at(-1)!.thornHp === 0, `felled by thorns ${what}`);
    assert.ok(taken.every((s) => !!s.parried === !!parry), "a certain parry parries every strike");
    assert.equal(heroHpAfter(summarize(fight, 1400), p.hp), after, "summary rounds end the same");
  }
  assert.ok(checked > 100 && thorned > 10 && lethal > 10, "the sweep covers thorn kills and losses");
});

test("a strike that fells the hero costs the enemy no thorns; a revived one does", () => {
  const p = hero({ hp: 30, thorns: 10 });
  const lost = bout(p, brute);
  assert.equal(lost.strikes.at(-1)!.hp, 0);
  assert.equal(lost.strikes.at(-1)!.thorns, undefined);
  const won = bout(p, brute, () => true);
  const revived = won.strikes.find((s) => s.revived)!;
  assert.equal(revived.thorns, 6);
});

test("a parried strike's ATK is cut by Parry % before DEF; a thorn kill is no Instakill", () => {
  const p = hero({ hp: 1000, maxHp: 1000, defense: 10, parryChance: 50, parry: 40 });
  const e = { ...brute, hp: 1000, attack: 50 };
  const fight = bout(p, e, undefined, undefined, (strike) => strike === 0);
  const [first, second] = fight.strikes.filter((s) => s.by === "enemy");
  assert.deepEqual([first!.parried, first!.damage], [true, 50 * 0.6 - 10]);
  assert.deepEqual([second!.parried, second!.damage], [undefined, 51 - 10], "the enemy's ATK rises from its own");
  assert.equal(predict(p, e).damage > predict({ ...p, parryChance: 100 }, e).damage, true, "only a certain parry counts in a prediction");
  const r = predict(hero({ attack: 30, thorns: 50 }), brute);
  assert.deepEqual([r.turns, r.thornKill, instakill(r)], [1, true, false]);
});

test("a forecast that counts parries expects less damage than the worst case, and a certain parry needs no forecast", () => {
  const p = hero({ hp: 1000, maxHp: 1000, defense: 5, parryChance: 50, parry: 50 }), e = { ...brute, hp: 200 };
  const worst = predict(p, e), sure = predict({ ...p, parryChance: 100 }, e), f = forecast(p, e, undefined, true);
  assert.equal(f.worst.damage, worst.damage);
  assert.ok(f.expected < worst.damage && f.expected > sure.damage, "between no parries and every parry");
  assert.ok(f.p10 <= f.expected && f.expected <= f.p90 && f.p10 < f.p90);
  assert.equal(f.survive, 1);
  const risky = forecast({ ...p, hp: Math.round(f.expected) }, e, undefined, true);
  assert.ok(risky.survive > 0.2 && risky.survive < 0.8, "about even odds at the HP the fight is expected to cost");
  assert.equal(forecast(p, e, undefined, false).expected, worst.damage, "without Evade Prediction, no parry counts");
  const certain = { ...p, parryChance: 100 };
  assert.equal(forecast(certain, e, undefined, true).expected, sure.damage);
  const cache = new DamagePredictions();
  assert.equal(cache.cost(p, e, undefined, true).damage, f.expected, "Damage Visual's label expects the same");
  assert.equal(cache.cost(p, e).damage, worst.damage);
  const thorned = cache.cost(hero({ attack: 30, thorns: 50 }), brute);
  assert.notEqual(damageLabel(thorned, 100).color, "#9aa3b2", "a thorn kill's label isn't an Instakill's gray");
});

test("a parry cuts a strike's ATK by at most 98%, however Parry % is raised", () => {
  assert.equal(PARRY_CAP, 98);
  assert.equal(parryCut(hero({ parry: 120 })), 98);
  assert.equal(parryCut(hero({ parry: 60 })), 60);
  const s = defaults();
  s.upgrades.evade = 1;
  s.training.parry = 100;
  s.archives.levels.parry = 50;
  // Training's 50% and research's 10% stay under the cap; a run's own Parry % past it still cuts by 98%.
  assert.equal(loadout(s).parry, 60);
  const e = { ...brute, attack: 100 };
  assert.equal(predict(hero({ parry: 99, parryChance: 100 }), e).damage, predict(hero({ parry: 98, parryChance: 100 }), e).damage);
  assert.ok(predict(hero({ parry: 98, parryChance: 100 }), e).damage < predict(hero({ parry: 97, parryChance: 100 }), e).damage);
});

test("Evade Prediction is Tower II's floor 50 Goal, and counts parries once Evade is owned", () => {
  assert.deepEqual(unlockAt("evadePrediction"), { tower: 2, floor: 50 });
  const s = defaults();
  assert.equal(countsParries(s), false);
  s.goals.claimed[2] = [50];
  assert.equal(countsParries(s), false, "Evade first");
  s.upgrades.evade = 1;
  assert.equal(countsParries(s), true);
});

// On the board: thorns rise in yellow over the enemy with the strike's
// damage over the hero, and the hero gives way from a strike it parries.
const shown = (player: Player, enemy: Enemy, summary: boolean, parries?: (strike: number) => boolean) => {
  const played = bout(player, enemy, undefined, undefined, parries);
  return { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, bout: summary ? summarize(played, 1400) : played, start: 0, hp: enemy.hp, summary };
};
const rising = (fight: ReturnType<typeof shown>, until: number) => {
  const popups = new BoardPopups();
  popups.update({ run: { seed: 1 }, gains: [], fight, lastHeal: null }, until);
  return (popups as unknown as { numbers: { x: number; start: number; text: string; color: string }[] }).numbers.map((n) => `${n.x}@${n.start}:${n.text}:${n.color}`);
};
const YELLOW = "#ffd83d";

test("an animated fight raises each strike's thorns in yellow over the enemy as its damage rises over the hero", () => {
  const fight = shown(hero({ thorns: 25 }), { ...brute, hp: 100, attack: 20 }, false);
  const strike = fight.bout.strikes.find((s) => s.by === "enemy")!;
  assert.deepEqual(rising(fight, strike.at), [`1@${fight.bout.strikes[0]!.at}:12:#ff4040`, `0@${strike.at}:20:#b3121f`, `1@${strike.at}:25:${YELLOW}`]);
});

test("in summary rounds the thorns rise beside the hero's damage, and none when they fell the enemy", () => {
  const fight = shown(hero({ thorns: 25 }), { ...brute, hp: 100, attack: 20 }, true);
  assert.ok(rising(fight, fight.bout.duration).some((n) => n.endsWith(`:${YELLOW}`)) === false, "thorns felled it: nothing rises for them");
  const lasting = shown(hero({ thorns: 10, attack: 50 }), { ...brute, hp: 100, attack: 20 }, true);
  assert.deepEqual(rising(lasting, lasting.bout.duration).filter((n) => n.endsWith(YELLOW)), [`1.22@0:10:${YELLOW}`]);
});

test("the hero gives way from a strike it parries in an animated fight; summary rounds show no parry", () => {
  const p = hero({ hp: 1000, maxHp: 1000, parryChance: 50, parry: 40 });
  const fight = shown(p, brute, false, (strike) => strike === 0);
  const [parried, plain] = fight.bout.strikes.filter((s) => s.by === "enemy");
  const mid = (s: typeof parried) => (s!.start + s!.end) / 2;
  const encounter = fight as unknown as Parameters<typeof lunges>[0];
  const atParry = lunges(encounter, mid(parried), false), atPlain = lunges(encounter, mid(plain), false);
  assert.ok(atParry.hero.dx < 0 && atParry.hero.dx > -0.3, "a little back, away from the enemy");
  assert.deepEqual(atPlain.hero, { dx: 0, dy: 0 });
  assert.ok(atParry.enemy.dx < 0, "the enemy still lunges");
  assert.deepEqual(lunges(encounter, mid(parried), true).hero, { dx: 0, dy: 0 }, "still with Reduce Motion");
  assert.ok(shown(p, brute, true, (strike) => strike === 0).bout.strikes.every((s) => !s.parried));
});

/** A Delve run with the hero two tiles below a Brute in a walled corridor,
 * parrying `chance`% of strikes by 40%. */
function arena(seed: number, chance: number) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.newRun({ seed });
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: x === 15 && y < 10 ? "floor" : "wall" };
  Object.assign(g.run.player, { ...hero({ hp: 500, maxHp: 500, parryChance: chance, parry: 40 }), x: 15, y: 0 });
  guard(g);
  g.move(0, 1);
  return g;
}
function guard(g: Game) {
  const tile = g.world.tile.bind(g.world);
  const foe: Tile = { kind: "enemy", enemy: { ...brute, hp: 120 } };
  g.world.tile = (x, y) => (x === 15 && y === 2 && g.run.kills === 0 ? foe : tile(x, y));
}

test("in play, parries roll a fixed number per run, tile and strike: undo can't fish for them, and more Parry Chance only adds some", () => {
  let helped = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const hp = [0, 30, 70].map((chance) => {
      const g = arena(seed, chance);
      g.move(0, 1);
      const after = g.run.player.hp;
      assert.ok(g.undo());
      guard(g);
      g.move(0, 1);
      assert.equal(g.run.player.hp, after, `seed ${seed}: the same parries again`);
      return after;
    });
    assert.ok(hp[0]! <= hp[1]! && hp[1]! <= hp[2]!, `seed ${seed}: more chance, no less HP`);
    if (hp[2]! > hp[0]!) helped++;
  }
  assert.ok(helped > 6, "parries save HP");
});
