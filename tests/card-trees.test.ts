import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { CARD_LEVEL_XP, MAX_CARD_LEVEL, MAX_CARD_XP } from "../src/card-levels.ts";
import { CARD_TREES, RESPEC_GEMS, decodeCardTrees, raiseRefusal, runExtras, treeBonus, treeFactor, treeOverheal, type CardTreeLevels } from "../src/card-trees.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { facing, predict } from "../src/combat.ts";
import { doorDiscount } from "../src/doors.ts";
import { extraEnemies } from "../src/more-enemies.ts";
import { rollFreeTraining } from "../src/free-training.ts";
import { BASE_RULES, potionRestores } from "../src/step-effects.ts";
import { snap } from "../src/exact.ts";
import type { CardId } from "../src/cards.ts";
import type { Enemy, Player, Tile } from "../src/entities.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 100, defense: 10, shroud: 20, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (strength: Enemy["strength"]): Enemy => ({ name: "Slime", hp: 100, attack: 30, defense: 0, tier: 1, strength });
/** A save whose cards in `xp` stand at that XP. */
function saveWith(xp: Partial<Record<CardId, number>>) {
  const s = defaults();
  s.cardXp = { ...xp };
  return s;
}
/** `card`'s nodes filled in tree order with `points` points, each node to its fill. */
function filled(card: CardId, points: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const node of CARD_TREES[card]!) {
    const n = Math.min(node.levels, points);
    if (n) out[node.id] = n;
    points -= n;
  }
  return out;
}

test("every card tree spends exactly a card's points, each node after one of its own tree", () => {
  assert.deepEqual(Object.keys(CARD_TREES), ["stairs", "heal", "door", "key", "monster", "atkUp", "defUp", "torch", "chest"]);
  for (const [card, nodes] of Object.entries(CARD_TREES)) {
    assert.equal(nodes!.reduce((a, n) => a + n.levels, 0), MAX_CARD_LEVEL, `${card} spends 25 points`);
    const ids = nodes!.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `${card}'s node ids are its own`);
    nodes!.forEach((n, i) => n.after === undefined || assert.ok(ids.slice(0, i).includes(n.after), `${card}.${n.id} comes after its parent`));
  }
});

test("a point goes on a track's first node from level 0, on a child once its parent is full, while the card has one left", () => {
  const s = saveWith({ stairs: CARD_LEVEL_XP[0] + CARD_LEVEL_XP[1] });
  assert.equal(raiseRefusal(s, "stairs", "nope"), "unknown");
  assert.equal(raiseRefusal(s, "stairs", "goldBonus"), "locked", "its parent holds no levels");
  assert.equal(raiseRefusal(s, "stairs", "floorPay"), null);
  s.cardTrees = { stairs: { floorPay: 2 } };
  assert.equal(raiseRefusal(s, "stairs", "freeOffense"), "points", "level 2: both points spent");
  s.cardXp.stairs = MAX_CARD_XP;
  assert.equal(raiseRefusal(s, "stairs", "goldBonus"), "locked", "2 of 5 levels");
  s.cardTrees = { stairs: { floorPay: 5 } };
  assert.equal(raiseRefusal(s, "stairs", "goldBonus"), null);
  assert.equal(raiseRefusal(s, "stairs", "floorPay"), "maxed");
  assert.equal(raiseRefusal(s, "stairs", "overheal2"), "locked", "the second Overheal waits on the second HP restore node");
  s.cardTrees = { stairs: { floorHeal: 5 } };
  assert.equal(raiseRefusal(s, "stairs", "overheal"), null, "the first branches off the middle");
  assert.equal(raiseRefusal(s, "stairs", "floorHeal2"), null);
});

test("the Game's desk spends points in the forest only, and a respec gives them back for 20 Gems", () => {
  const g = new Game(saveWith({ door: MAX_CARD_XP }));
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.cardTrees.pointsLeft("door"), 25);
  for (let i = 0; i < 10; i++) assert.equal(g.cardTrees.raise("door", "doorCost"), null);
  assert.equal(g.cardTrees.raise("door", "doorCost"), "maxed");
  assert.equal(g.cardTrees.raise("door", "silverBonus"), null);
  assert.deepEqual(g.save.cardTrees, { door: { doorCost: 10, silverBonus: 1 } });
  assert.equal(g.cardTrees.pointsLeft("door"), 14);
  assert.equal(g.cardTrees.respecRefusal("door"), "short", "no Gems");
  g.save.gems = RESPEC_GEMS;
  assert.equal(g.cardTrees.respecRefusal("key"), "none", "nothing spent on KEY");
  assert.equal(g.cardTrees.respec("door"), null);
  assert.equal(g.save.gems, 0);
  assert.deepEqual(g.save.cardTrees, {});
  assert.equal(g.cardTrees.pointsLeft("door"), 25);
  g.cardTrees.raise("door", "doorGold");
  g.newRun({ seed: 1 });
  assert.equal(g.cardTrees.raise("door", "doorGold"), "inside");
  g.save.gems = 100;
  assert.equal(g.cardTrees.respec("door"), "inside");
});

test("a saved tree keeps known nodes, whole and in order, no child before its parent is full, and no more points than the card has", () => {
  const xp = { stairs: CARD_LEVEL_XP[0] + CARD_LEVEL_XP[1] + CARD_LEVEL_XP[2], key: MAX_CARD_XP };
  assert.deepEqual(decodeCardTrees({ stairs: { floorPay: 5 } }, xp), { stairs: { floorPay: 3 } }, "three levels, three points");
  assert.deepEqual(decodeCardTrees({ key: { keyFind: 4, keyGold: 1.5, nope: 2, silverBonus: 9 } }, xp), { key: { keyFind: 4 } });
  assert.deepEqual(decodeCardTrees({ key: { keyFind: 4 }, stairs: { goldBonus: 1 }, heal: { goldBonus: 1 }, bogus: { a: 1 } }, xp), { key: { keyFind: 4 } }, "a child without its parent, and a card without points");
  assert.deepEqual(decodeCardTrees("x", xp), {});
  const s = defaults();
  s.cardXp = { torch: MAX_CARD_XP };
  s.cardTrees = { torch: { attack: 5, cells: 5 } };
  assert.deepEqual(decode(JSON.stringify(s)).cardTrees, { torch: { attack: 5, cells: 5 } }, "it saves");
});

test("the trees' stats add up over the hand's cards: Silver Bonus from DOOR, KEY, ATK UP and DEF UP together", () => {
  const levels: CardTreeLevels = { door: { silverBonus: 5 }, key: { silverBonus: 5 }, atkUp: { silverBonus: 5 }, defUp: { silverBonus: 3 }, stairs: { floorPay: 5, silverBonus: 1 } };
  const b = treeBonus(levels);
  assert.equal(b.silverBonus, 10 + 10 + 5 + 3 + 10);
  assert.equal(b.floorGold, 50);
  assert.equal(treeFactor(b, "silverBonus"), 1.38);
  assert.equal(treeFactor(b, "goldBonus"), 1, "none raised");
  const full = treeBonus({ chest: filled("chest", 25), atkUp: filled("atkUp", 25), torch: filled("torch", 25), heal: filled("heal", 25) });
  assert.equal(full.supplyChance, 2, "1.5% with the card's base: 3.5%");
  assert.equal(full.equipmentChance, 1, "0.5% with the card's base: 1.5%");
  assert.equal(full.attackShardGold, 1, "a Gold a shard at the top");
  assert.equal(full.bossCells, 5);
  assert.equal(full.potionMaxHp, 0.05);
});

test("a run copies the trees of its hand's cards as it goes inside, keeping its floors and bonuses for the run", () => {
  const s = saveWith({ stairs: MAX_CARD_XP, monster: MAX_CARD_XP, torch: MAX_CARD_XP, chest: MAX_CARD_XP });
  s.cardTrees = { stairs: { floorPay: 5 }, monster: filled("monster", 25), torch: filled("torch", 25), chest: { gold: 5 } };
  s.hand = ["stairs", "monster", "torch"];
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.cardTrees, { stairs: { floorPay: 5 }, monster: filled("monster", 25), torch: filled("torch", 25) }, "CHEST isn't in the hand");
  assert.deepEqual(g.run.player.foeAttack, { monster: 5, torch: 5 });
  assert.deepEqual(g.run.player.foeDefense, { monster: 5, torch: 5 });
  assert.deepEqual(g.run.player.foeShroud, { torch: 10 });
  assert.deepEqual(runExtras(g.run), extraEnemies(undefined, 10), "ENEMY's 10% more of every strength");
  const saved = decode(JSON.stringify(g.save)).tower.run!;
  assert.deepEqual(saved.cardTrees, g.run.cardTrees, "and saves them");
  assert.deepEqual(saved.player.foeShroud, { torch: 10 });
  s.hand = ["stairs"];
  g.newRun({ seed: 3 });
  assert.equal(g.run.player.foeAttack, undefined);
  assert.equal(runExtras(g.run), undefined);
});

test("ENEMY's and TORCH's DEF and shroud hold against the enemies they cover in fights", () => {
  const armed = { ...hero, foeDefense: { monster: 10, torch: 10 }, foeShroud: { torch: 50 } };
  assert.deepEqual([facing(armed, foe("normal")).defense, facing(armed, foe("normal")).shroud], [11, 20]);
  assert.deepEqual([facing(armed, foe("greaterBoss")).defense, facing(armed, foe("greaterBoss")).shroud], [12, 30]);
  assert.equal(facing(hero, foe("normal")), hero, "unchanged with none");
  const boss = { ...foe("greaterBoss"), hp: 1000 }, plain = predict(hero, boss), raised = predict(armed, boss);
  assert.ok(raised.damage < plain.damage, `${raised.damage} < ${plain.damage}`);
});

test("DOOR's tree cuts every door's cost, adding to a door card's percent", () => {
  const keyed = (keys: ("yellow" | "blue")[]): Tile => ({ kind: "door", door: { type: "keys", keys, mode: "all" } });
  const yellow = keyed(["yellow"]), blue = keyed(["blue"]);
  assert.deepEqual(doorDiscount(blue, { all: 10 }), { keys: 0.9, toll: 1 });
  assert.deepEqual(doorDiscount(yellow, { yellow: 5, all: 10 }), { keys: 0.85, toll: 1 });
});

test("STAIRS' Free Up nodes multiply each group's chance a floor", () => {
  const s = defaults();
  s.upgrades.freeTraining = 1;
  s.training.freeOffense = 10;
  const draws = (factors?: Record<"offense" | "defense" | "utility", number>) => {
    const run = { seed: 9, hand: ["stairs"] as CardId[] };
    let hits = 0;
    for (let f = 0; f < 2000; f++) hits += rollFreeTraining(s, run, 0, factors).length;
    return hits;
  };
  const plain = draws(), raised = draws({ offense: 2, defense: 1, utility: 1 });
  assert.ok(raised > plain * 1.5, `${raised} vs ${plain}`);
});

test("HEAL's tree raises each potion's HP; STAIRS' and HEAL's raise the Overheal ceiling only with the skill", () => {
  const potion = { kind: "potion" } as never;
  assert.equal(potionRestores(potion, 100, { ...BASE_RULES, potionCard: 50 }), snap(35 * 1.5));
  const b = treeBonus({ stairs: { floorHeal: 5, overheal: 1 }, heal: { overheal: 2 } });
  assert.equal(treeOverheal(2000, { upgrades: { overheal: 0 } }, b), 2000, "the trees never open Overheal");
  assert.equal(treeOverheal(2000, { upgrades: { overheal: 1 } }, b), 2400, "+10% and +10%");
});

test("the trees' Gold and Silver: Gold Bonus, Silver Bonus, a chest's Gold, ENEMY's kill Gold and TORCH's Cells", () => {
  const purse = (trees?: CardTreeLevels) => {
    const g = new Game(defaults());
    g.newRun({ seed: 7 });
    if (trees) g.run.cardTrees = trees;
    return new RunPurse(g.save, g.mode, g.run, () => 0.5);
  };
  const plain = purse(), raised = purse({ heal: { goldBonus: 5 }, chest: { gold: 5 }, monster: { gold: 5 }, torch: { cells: 3 }, key: { silverBonus: 5 } });
  assert.equal(raised.treasureGoldPreview(3, 3), snap(snap(plain.treasureGoldPreview(3, 3) * 1.5) * 1.1));
  assert.equal(raised.killGoldOf(foe("normal")), snap(snap(plain.killGoldOf(foe("normal")) * 1.5) * 1.05));
  assert.equal(raised.silver(10), snap(plain.silver(10) * 1.1));
  assert.equal(raised.enemyLoot(foe("greaterBoss"), 2, 2).cells, 4, "1 in tower I, and TORCH's 3");
});
