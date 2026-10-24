import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save/save.ts";
import { point, type Enemy, type Player, type Tile } from "../src/entities.ts";
import { PARRY_CAP, bout, heroHpAfter, instakill, parryCut, predict, summarize, thornDamage } from "../src/combat.ts";
import { loadout, trainingStep } from "../src/progression/loadout.ts";
import { startingHero } from "../src/game/hero-sync.ts";
import { trainingGold } from "../src/progression/training-jobs.ts";
import { silverPrice } from "../src/progression/run-training.ts";
import { TRAINING, isStatRow, trained, type TrainingId } from "../src/progression/training.ts";
import { UPGRADES } from "../src/progression/upgrades.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { BoardPopups, enemyBar, lunges } from "../src/render/board-popups.ts";
import { checkpoint, UNLOCK_NAMES } from "../src/goals.ts";
import { DamagePredictions, damageLabel } from "../src/render/effects/damage-labels.ts";
import { wounded, woundMore } from "../src/enemies/ranged.ts";

const hero = (over: Partial<Player> = {}): Player => ({ x: 0, y: 0, hp: 100, maxHp: 100, attack: 12, defense: 0, keys: { yellow: 0, blue: 0, red: 0 }, ...over }) as Player;
const brute: Enemy = { name: "Brute", hp: 60, attack: 30, defense: 0, tier: 0, strength: "normal" };
const row = (id: TrainingId) => TRAINING.find((t) => t.id === id)!;
const node = (id: string) => TREES[0].nodes.find((n) => n.id === id)!;

test("Thorns sits between Buy Quantity and GK Siphon, Parry between Regen Research and Revive, 10 Inspiration each", () => {
  for (const id of ["thorns", "parry"] as const) {
    const u = UPGRADES.find((u) => u.id === id)!;
    assert.deepEqual([u.currency, u.base, u.max], ["inspiration", 10, 1], id);
  }
  assert.deepEqual([node("thorns").requires, node("keySiphon").requires], [["buyQuantity"], ["thorns"]]);
  assert.deepEqual([node("parry").requires, node("revive").requires], [["regenResearch"], ["parry"]]);
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  for (const id of ["combatStance", "buildout", "trainers", "shroud", "critical", "archives", "delve", "greaterHeal"] as const) assert.ok(g.skills.buy(id));
  assert.equal(g.skills.buy("parry"), false, "waits for Regen Research");
  assert.ok(g.skills.buy("regenResearch"));
  assert.equal(g.skills.buy("revive"), false, "waits for Parry");
  assert.ok(g.skills.buy("parry"));
  assert.ok(g.skills.buy("revive"));
});

test("Thorn Damage adds 1% a rank to 99 and Parry % 0.5% a rank to 100, Defense rows the skills open; no Parry Chance row", () => {
  assert.equal(TRAINING.some((t) => (t.id as string) === "parryChance"), false);
  for (const [id, requires, max, per] of [["thorns", "thorns", 99, 1], ["parry", "parry", 100, 0.5]] as const) {
    const r = row(id);
    if (!isStatRow(r)) throw new Error(`${id} is a stat row`);
    assert.deepEqual([r.group, r.max, r.cost, r.requires], ["defense", max, 1, requires], id);
    assert.deepEqual([trained(r, 0), trained(r, 1), trained(r, 10), trained(r, max)], [0, per, 10 * per, max * per], id);
  }
  const s = defaults();
  Object.assign(s.upgrades, { thorns: 1, parry: 1 });
  Object.assign(s.training, { thorns: 50, parry: 41 });
  const l = loadout(s);
  assert.deepEqual([l.thorns, l.parry], [50, 20.5]);
  const p = startingHero(s, "tower").player;
  assert.deepEqual([p.thorns, p.parry], [50, 20.5], "the hero carries them into a run");
  assert.equal(startingHero(defaults(), "tower").player.thorns, undefined, "a hero without them carries none");
  const step = trainingStep(s, "parry");
  assert.deepEqual([step.unit, step.now, step.next], ["%", 20.5, 21]);
});

test("a rank of Thorn Damage costs 60, about 1k at the 13th, 10k at the 41st and over 75k at the 99th; a Parry % rank 40, under 600 at the 12th, under 5k at the 36th and over 40k at the 80th", () => {
  const price = (id: TrainingId, n: number) => {
    const gold = trainingGold(row(id), n - 1);
    assert.equal(silverPrice(id, n - 1), gold, `${id} rank ${n}: the same in Silver and Gold`);
    return gold;
  };
  assert.deepEqual([1, 13, 41, 99].map((n) => price("thorns", n)), [60, 993, 9901, 113781]);
  assert.deepEqual([1, 12, 36, 80].map((n) => price("parry", n)), [40, 590, 4775, 40953]);
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

test("an enemy the arrows wounded takes thorns of its full HP, however often wounded: the fight, the prediction and the label agree", () => {
  const p = hero({ hp: 1e9, maxHp: 1e9, attack: 1, thorns: 50 });
  const once = woundMore({ kind: "enemy", enemy: brute }, 20), twice = woundMore(once, 10);
  for (const [raw, hp, strikes] of [[once, 40, 2], [twice, 30, 1]] as const) {
    const e = wounded(raw).enemy!;
    assert.deepEqual([e.hp, e.fullHp, thornDamage(p, e)], [hp, 60, 30]);
    const fight = bout(p, e), r = predict(p, e);
    // Each of its strikes costs it 30, half its full HP, not half of what is left.
    assert.equal(fight.strikes.filter((s) => s.by === "enemy").length, strikes);
    assert.deepEqual([fight.strikes.at(-1)!.thorns, r.turns, r.thornKill], [30, strikes, true]);
  }
  const labels = new DamagePredictions();
  assert.notDeepEqual(labels.cost(p, { ...brute, hp: 30 }), labels.cost(p, wounded(twice).enemy!), "a label keys by the full HP");
});

test("the played fight and the prediction end the same with thorns and parries, whatever the stats", () => {
  let checked = 0, thorned = 0, lethal = 0;
  for (const thorns of [0, 1, 7, 50]) for (const parry of [0, 25]) for (const lifesteal of [0, 5]) for (const enemyAttack of [4, 20, 55]) for (const enemyHp of [30, 700]) for (const strength of ["normal", "boss"] as const) {
    const p = hero({ attack: 12, hp: 80, maxHp: 100, defense: 2, shroud: 3, ...(thorns ? { thorns } : {}), ...(parry ? { parry } : {}), ...(lifesteal ? { lifesteal } : {}) });
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
    assert.ok(taken.every((s) => !!s.parried === !!parry), "Parry % parries every strike");
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

test("every strike's damage after DEF is cut by Parry %, and predictions count it; a thorn kill is no Instakill", () => {
  const p = hero({ hp: 1000, maxHp: 1000, defense: 10, parry: 40 });
  const e = { ...brute, hp: 1000, attack: 50 };
  const fight = bout(p, e);
  const [first, second] = fight.strikes.filter((s) => s.by === "enemy");
  assert.deepEqual([first!.parried, first!.damage], [true, (50 - 10) * 0.6]);
  assert.deepEqual([second!.parried, second!.damage], [true, 24.6], "the enemy's ATK rises from its own");
  assert.equal(predict(p, e).damage < predict({ ...p, parry: 0 }, e).damage, true, "a prediction counts every parry");
  assert.ok(bout(hero(), e).strikes.every((s) => !s.parried), "no Parry %, no parry");
  const r = predict(hero({ attack: 30, thorns: 50 }), brute);
  assert.deepEqual([r.turns, r.thornKill, instakill(r)], [1, true, false]);
});

test("Damage Visual's label counts every parry", () => {
  const p = hero({ hp: 1000, maxHp: 1000, defense: 5, parry: 50 }), e = { ...brute, hp: 200 };
  const cache = new DamagePredictions();
  assert.equal(cache.cost(p, e).damage, predict(p, e).damage);
  assert.ok(cache.cost(p, e).damage < cache.cost({ ...p, parry: 0 }, e).damage);
  const thorned = cache.cost(hero({ attack: 30, thorns: 50 }), brute);
  assert.notEqual(damageLabel(thorned, 100).color, "#9aa3b2", "a thorn kill's label isn't an Instakill's gray");
});

test("a parry cuts a strike's damage by at most 98%, however Parry % is raised", () => {
  assert.equal(PARRY_CAP, 98);
  assert.equal(parryCut(hero({ parry: 120 })), 98);
  assert.equal(parryCut(hero({ parry: 60 })), 60);
  const s = defaults();
  s.upgrades.parry = 1;
  s.training.parry = 100;
  s.archives.levels.parry = 50;
  // Training's 50% and research's 10% stay under the cap; a run's own Parry % past it still cuts by 98%.
  assert.equal(loadout(s).parry, 60);
  const e = { ...brute, attack: 100 };
  assert.equal(predict(hero({ parry: 99 }), e).damage, predict(hero({ parry: 98 }), e).damage);
  assert.ok(predict(hero({ parry: 98 }), e).damage < predict(hero({ parry: 97 }), e).damage);
});

test("Tower II's floor 50 Goal pays Gems, and no Goal unlocks a parry prediction", () => {
  assert.deepEqual(checkpoint(2, 50)!.reward, { kind: "currency", currency: "gems", amount: 25 });
  assert.equal("evadePrediction" in UNLOCK_NAMES, false);
});

// On the board: thorns rise in yellow over the enemy with the strike's
// damage over the hero, and the hero gives way from a strike it parries.
const shown = (player: Player, enemy: Enemy, summary: boolean) => {
  const played = bout(player, enemy);
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

test("summary rounds raise no thorns, which would only cover the drops", () => {
  const felled = shown(hero({ thorns: 25 }), { ...brute, hp: 100, attack: 20 }, true);
  const lasting = shown(hero({ thorns: 10, attack: 50 }), { ...brute, hp: 100, attack: 20 }, true);
  for (const fight of [felled, lasting]) assert.ok(!rising(fight, fight.bout.duration).some((n) => n.endsWith(YELLOW)));
});

test("a played-out fight's drops wait until its last numbers fade; summary rounds' rise at once", () => {
  const drops = (fight: ReturnType<typeof shown>, now: number) => {
    const popups = new BoardPopups(), gains = [
      { x: 1, y: 0, text: "+5 Gold", art: null, drop: { row: 1, with: false } },
      { x: 1, y: 0, text: "+3 Silver", art: null, drop: { row: 0, with: true } },
    ];
    popups.update({ run: { seed: 1 }, gains, fight, lastHeal: null }, now);
    return (popups as unknown as { rewards: { start: number }[] }).rewards.map((r) => r.start);
  };
  const played = shown(hero({ attack: 50 }), { ...brute, hp: 100, attack: 20 }, false), last = played.bout.strikes.at(-1)!.at;
  assert.deepEqual(drops(played, played.bout.duration), [last + 750, last + 750]);
  const summary = shown(hero({ attack: 50 }), { ...brute, hp: 100, attack: 20 }, true);
  assert.deepEqual(drops(summary, summary.bout.duration), [summary.bout.duration, summary.bout.duration]);
});

test("in summary rounds the bar of an enemy thorns struck but the hero felled drains to nothing and fades", () => {
  const lasting = shown(hero({ thorns: 10, attack: 50 }), { ...brute, hp: 100, attack: 20 }, true);
  assert.ok(lasting.bout.strikes.some((s) => (s.thornHp ?? 0) > 0), "the thorns left it HP before the hero felled it");
  assert.equal(enemyBar(lasting, 400)!.hp, 0, "drained to nothing");
  assert.equal(enemyBar(lasting, 60_000), null, "and gone");
});

test("the hero gives way from a strike it parries in an animated fight; summary rounds show no parry", () => {
  const p = hero({ hp: 1000, maxHp: 1000, parry: 40 });
  const fight = shown(p, brute, false), unparried = shown({ ...p, parry: 0 }, brute, false);
  const [parried] = fight.bout.strikes.filter((s) => s.by === "enemy"), [plain] = unparried.bout.strikes.filter((s) => s.by === "enemy");
  const mid = (s: typeof parried) => (s!.start + s!.end) / 2;
  const encounter = fight as unknown as Parameters<typeof lunges>[0];
  const atParry = lunges(encounter, mid(parried), false), atPlain = lunges(unparried as unknown as Parameters<typeof lunges>[0], mid(plain), false);
  assert.ok(atParry.hero.dx < 0 && atParry.hero.dx > -0.3, "a little back, away from the enemy");
  assert.deepEqual(atPlain.hero, { dx: 0, dy: 0 });
  assert.ok(atParry.enemy.dx < 0, "the enemy still lunges");
  assert.deepEqual(lunges(encounter, mid(parried), true).hero, { dx: 0, dy: 0 }, "still with Reduce Motion");
  assert.ok(shown(p, brute, true).bout.strikes.every((s) => !s.parried));
});

/** A Delve run with the hero two tiles below a Brute in a walled corridor,
 * parrying every strike by `parry`%. */
function arena(parry: number) {
  const g = new Game(defaults());
  g.save.upgrades.delve = 1;
  g.switchMode("delve");
  g.newRun({ seed: 1 });
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 30; x++) g.run.changes[point(x, y)] = { kind: x === 15 && y < 10 ? "floor" : "wall" };
  Object.assign(g.run.player, { ...hero({ hp: 500, maxHp: 500, ...(parry ? { parry } : {}) }), x: 15, y: 0 });
  const tile = g.world.tile.bind(g.world);
  const foe: Tile = { kind: "enemy", enemy: { ...brute, hp: 120 } };
  g.world.tile = (x, y) => (x === 15 && y === 2 && g.run.kills === 0 ? foe : tile(x, y));
  g.move(0, 1);
  return g;
}

test("in play, Parry % cuts every strike, costing what the prediction says", () => {
  const hp = [0, 40].map((parry) => {
    const g = arena(parry), p = { ...g.run.player };
    g.move(0, 1);
    assert.equal(g.run.player.hp, p.hp - predict(p, { ...brute, hp: 120 }).damage, `Parry % ${parry}`);
    return g.run.player.hp;
  });
  assert.ok(hp[1]! > hp[0]!, "parries save HP");
});
