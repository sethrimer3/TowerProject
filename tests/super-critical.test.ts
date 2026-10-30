import { test } from "node:test";
import assert from "node:assert/strict";
import { bout, critAgainst, type CritRule } from "../src/combat.ts";
import { forecast } from "../src/crit-forecast.ts";
import { arrowDamage } from "../src/enemies/ranged.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";
import { checkpoint, goalUnlocked } from "../src/goals.ts";
import { missing, RESEARCH, type ResearchId } from "../src/progression/archives.ts";
import { critRule } from "../src/progression/loadout.ts";
import { TREES } from "../src/progression/skill-trees.ts";
import { TRAINING, trainingDef, trainedAmount } from "../src/progression/training.ts";
import { trainingGold } from "../src/progression/training-jobs.ts";
import { cost } from "../src/progression/upgrades.ts";
import { schedulePrice } from "../src/economy/prices.ts";
import { defaults } from "../src/save/save.ts";
import { Game } from "../src/state.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { playedSave } from "./first-skills.ts";

const hero = (attack = 10): Player => ({ x: 0, y: 0, hp: 1000, maxHp: 1000, attack, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } }) as Player;
const foe = (hp: number, attack = 5): Enemy => ({ name: "Slime", hp, attack, defense: 0, tier: 1, strength: "normal" }) as Enemy;
const near = (actual: number, expected: number, share = 0.002) => assert.ok(Math.abs(actual - expected) <= expected * share, `${actual} is about ${expected}`);

/** A save owning Super Critical, with Crit % and Crit x from Critical. */
function owned(chance = 0, factor = 0) {
  const save = defaults();
  save.upgrades.critical = 1;
  save.upgrades.superCritical = 1;
  save.training.critChance = 50;
  save.training.superCritChance = chance;
  save.training.superCritFactor = factor;
  return save;
}

test("Super Critical is 30 Inspiration, under Bombs in the Inspiration tree", () => {
  assert.equal(cost("superCritical", 0), 30);
  const nodes = TREES.find((t) => t.id === "inspiration")!.nodes, node = nodes.find((n) => n.id === "superCritical")!, bombs = nodes.find((n) => n.id === "bombs")!;
  assert.deepEqual(node.requires, ["bombs"]);
  assert.equal(node.x, bombs.x);
  assert.ok(node.y > bombs.y);
});

test("the two rows reach 20% and ×13, shown as a chance and a multiplier, Offense, once the skill is owned", () => {
  const chance = trainingDef("superCritChance"), factor = trainingDef("superCritFactor");
  assert.deepEqual([chance.short, chance.group, chance.max, chance.unit], ["SCrit %", "offense", 100, "chance"]);
  assert.deepEqual([factor.short, factor.group, factor.max, factor.unit], ["SCrit x", "offense", 120, "×"]);
  const save = owned();
  assert.equal(trainedAmount(save, "superCritChance", 1), 20, "0.2% in hundredths");
  assert.equal(trainedAmount(save, "superCritChance", 100), 2000);
  assert.equal(trainedAmount(save, "superCritFactor", 0), 100);
  assert.equal(trainedAmount(save, "superCritFactor", 1), 110);
  assert.equal(trainedAmount(save, "superCritFactor", 120), 1300);
  save.upgrades.superCritical = 0;
  assert.equal(trainedAmount(save, "superCritChance", 100), 0);
  assert.equal(trainedAmount(save, "superCritFactor", 120), 100);
});

test("trainers' Gold hits the prices asked for, and Silver follows it from 100", () => {
  const chance = TRAINING.find((t) => t.id === "superCritChance")!, factor = TRAINING.find((t) => t.id === "superCritFactor")!;
  const gold = (row: typeof chance | typeof factor, level: number) => trainingGold(row, level - 1);
  assert.equal(gold(chance, 1), 50_000);
  near(gold(chance, 10), 1.5e6);
  near(gold(chance, 25), 158e6);
  near(gold(chance, 100), 255e9);
  assert.equal(gold(factor, 1), 30_000);
  near(gold(factor, 10), 848e3);
  near(gold(factor, 20), 17e6);
  near(gold(factor, 50), 2e9);
  near(gold(factor, 100), 618e9);
  for (const [row, ranks] of [[chance, 100], [factor, 120]] as const) {
    assert.equal(schedulePrice(row.silver, 0), 100);
    for (let r = 1; r < ranks; r++) {
      assert.ok(gold(row, r + 1) > gold(row, r), `${row.id} rises at ${r}`);
      near(schedulePrice(row.silver, r) / 100, gold(row, r + 1) / gold(row, 1), 0.02);
    }
  }
});

test("critRule carries Super Critical only once it would change a strike", () => {
  assert.equal(critRule(owned(0, 0))!.superCrit, undefined);
  assert.equal(critRule(owned(10, 0))!.superCrit, undefined, "×1 changes nothing");
  assert.equal(critRule(owned(0, 10))!.superCrit, undefined, "no chance");
  assert.deepEqual(critRule(owned(10, 10))!.superCrit, { chance: 2, factor: 2 });
  const save = owned(10, 10);
  save.upgrades.superCritical = 0;
  assert.equal(critRule(save)!.superCrit, undefined);
});

test("research adds 0.1% a level to the chance and multiplies the factor by 2% a level", () => {
  assert.equal(RESEARCH.superCritChance.levels.length, 50);
  assert.equal(RESEARCH.superCritFactor.levels.length, 40);
  for (const id of ["superCritChance", "superCritFactor"] as ResearchId[]) {
    const levels = RESEARCH[id].levels;
    assert.equal(levels[0]!.gold, 200_000);
    assert.equal(levels[0]!.hours, 24);
    assert.equal(levels[4]!.gold, 1_680_000);
    assert.equal(levels[4]!.hours * 60, 3000);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i]!.gold > levels[i - 1]!.gold && levels[i]!.hours > levels[i - 1]!.hours);
  }
  const save = owned(100, 120);
  save.archives.levels.superCritChance = 50;
  save.archives.levels.superCritFactor = 40;
  assert.deepEqual(critRule(save)!.superCrit, { chance: 25, factor: 23.4 });
});

test("Tower V's floor 200 unlocks the research, which needs the skill too", () => {
  assert.deepEqual(checkpoint(5, 200)?.reward, { kind: "unlock", unlock: "superCriticalResearch" });
  const save = defaults();
  save.upgrades.archives = 1;
  save.upgrades.superCritical = 1;
  assert.ok(!goalUnlocked(save, "superCriticalResearch"));
  assert.ok(missing(save, "superCritChance").length > 0);
  save.goals.claimed[5] = [200];
  assert.equal(missing(save, "superCritChance").length, 0);
  assert.equal(missing(save, "superCritFactor").length, 0);
  save.upgrades.superCritical = 0;
  assert.ok(missing(save, "superCritFactor").length > 0);
});

test("a fight's Super Critical strike multiplies the critical multiplier, and only lands on a crit", () => {
  const fight = bout(hero(), foe(1000), undefined, { factor: 2, applications: (s) => (s === 1 ? 0 : 1), superFactor: 3, superCrit: () => true });
  const strikes = fight.strikes.filter((s) => s.by === "hero");
  assert.equal(strikes[0]!.damage, 60, "10 × 2 × 3");
  assert.equal(strikes[0]!.superCrit, true);
  assert.equal(strikes[1]!.damage, 10, "no crit: no Super Critical");
  assert.equal(strikes[1]!.superCrit, undefined);
});

test("an arrow's ATK takes the Super Critical factor too", () => {
  assert.equal(arrowDamage(hero(), foe(1000), 1, 2, 1, 0, 3), 60);
  assert.equal(arrowDamage(hero(), foe(1000), 1, 2), 20);
});

test("critAgainst keeps Super Critical when enemy cards raise the rest", () => {
  const rule: CritRule = { chance: 50, factor: 2, superCrit: { chance: 10, factor: 3 } };
  const p = { ...hero(), foeCritChance: { normal: 10 } } as unknown as Player;
  assert.deepEqual(critAgainst(rule, p, foe(10))?.superCrit, rule.superCrit);
});

test("the forecast counts Super Critical: fewer strikes, and the odds match a replay", () => {
  const plain: CritRule = { chance: 50, factor: 2 }, rule: CritRule = { ...plain, superCrit: { chance: 50, factor: 2 } };
  const enemy = foe(100), p = hero();
  const without = forecast(p, enemy, plain), withSuper = forecast(p, enemy, rule);
  assert.ok(withSuper.turns < without.turns);
  assert.ok(withSuper.expected < without.expected);
  assert.equal(withSuper.best.hit, 40, "every roll landing: 10 × 2 × 2");
  assert.equal(withSuper.worst.hit, 10);
  // A strike deals 10 (half), 20 (a quarter) or 40 (a quarter); a fixed stream replays many fights.
  let seed = 12345, turns = 0;
  const roll = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const fights = 40_000;
  for (let f = 0; f < fights; f++) {
    let hp = 100, t = 0;
    while (hp > 0) {
      const r = roll();
      hp -= r < 0.5 ? 10 : r < 0.75 ? 20 : 40;
      t++;
    }
    turns += t;
  }
  near(withSuper.turns, turns / fights, 0.01);
  assert.ok(withSuper.survive === 1);
  assert.equal(withSuper.instakill, 0, "no one strike fells 100 HP");
});

test("a long fight's forecast with Super Critical is approximated, with sane odds", () => {
  const rule: CritRule = { chance: 50, factor: 2, superCrit: { chance: 20, factor: 3 } };
  const f = forecast(hero(1), foe(1000, 0), rule);
  // A strike deals 1 (half), 2 (40%) or 6 (10%): 1.9 on average.
  near(f.turns, 1000 / 1.9, 0.02);
  assert.ok(f.p10 <= f.expected + 1 && f.expected <= f.p90 + 1);
});

test("a fight with thorns and Super Critical still sums to certain odds", () => {
  const rule: CritRule = { chance: 50, factor: 2, superCrit: { chance: 50, factor: 2 } };
  const f = forecast({ ...hero(), thorns: 5 } as Player, foe(300, 1), rule);
  assert.ok(Math.abs(f.survive - 1) < 1e-9);
  assert.ok(f.turns >= f.best.turns && f.turns <= f.worst.turns);
});

test("without Super Critical the forecast is unchanged by the rule's shape", () => {
  const rule: CritRule = { chance: 30, factor: 2 };
  assert.deepEqual(forecast(hero(), foe(100), rule), forecast(hero(), foe(100), { ...rule, superCrit: undefined }));
});

/** A Tower run on seed 7, the hero with ATK 10, with Bombs and certain crits. */
function bomber(superChance: number) {
  const s = playedSave();
  s.upgrades.inspirationUndos = 1;
  s.upgrades.bombs = 1;
  s.upgrades.critical = 1;
  s.upgrades.superCritical = 1;
  s.provisions.bomb = 1;
  s.training.critChance = 80;
  s.archives.levels.critChance = 100;
  s.training.superCritChance = superChance;
  s.training.superCritFactor = 10;
  const g = new Game(s);
  g.newRun({ seed: 7 });
  lay(g);
  Object.assign(g.run.player, { x: 0, y: 0, attack: 10 });
  return g;
}
/** Lays the hero's tile, open floor and a tough enemy at (3, 0): undo builds the floor afresh. */
function lay(g: Game) {
  const tile: Tile = { kind: "enemy", enemy: foe(100000) };
  (g.world as RoomWorld).cells = new Map<string, Tile>([["0,0", { kind: "floor" }], ["1,0", { kind: "floor" }], ["3,0", tile]]);
}

test("a Bomb rolls critical and Super Critical hits, the same again after undo", () => {
  // Crit % 80 × 3 (research): 240%, so two applications are certain.
  const g = bomber(0), { factor, chance } = g.crit!;
  assert.ok(chance >= 200);
  g.arm("bomb");
  assert.equal(g.useArmed(3, 0), "used");
  const left = g.world.tile(3, 0).enemy!.hp, dealt = 100000 - left;
  assert.ok(dealt >= 10 * (1 + 2 * (factor - 1)), `${dealt} counts the certain crits`);
  assert.ok(g.gains.some((gain) => gain.strike === "crit"));

  // Taken back and thrown again, the Bomb's rolls land the same.
  g.undo();
  assert.equal(g.run.bombsUsed ?? 0, 0);
  lay(g);
  g.arm("bomb");
  assert.equal(g.useArmed(3, 0), "used");
  assert.equal(100000 - g.world.tile(3, 0).enemy!.hp, dealt);
});

test("a Bomb with a certain Super Critical chance multiplies by its factor and says so", () => {
  const plain = bomber(0), superHit = bomber(100);
  // Training stops at 20%: a certain roll takes the rule itself.
  const rule = superHit.crit!;
  Object.defineProperty(superHit, "crit", { get: () => ({ ...rule, superCrit: { chance: 100, factor: 2 } }) });
  plain.arm("bomb");
  plain.useArmed(3, 0);
  superHit.arm("bomb");
  superHit.useArmed(3, 0);
  assert.equal(100000 - superHit.world.tile(3, 0).enemy!.hp, 2 * (100000 - plain.world.tile(3, 0).enemy!.hp));
  assert.ok(superHit.gains.some((gain) => gain.strike === "superCrit"));
});
