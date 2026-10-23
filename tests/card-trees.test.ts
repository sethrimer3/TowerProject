import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { BASE_MAX_LEVEL, CARD_LEVEL_XP, MAX_CARD_LEVEL, MAX_CARD_XP } from "../src/card-levels.ts";
import { CARD_TREES, RESPEC_GEMS, cardLook, cardMaxLevel, decodeCardTrees, pointsLeft, raiseRefusal, runExtras, freeUpChances, treeBonus, treeFactor, treeOverheal, type CardOpened, type CardTreeLevels } from "../src/card-trees.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { facing, parryCut, predict } from "../src/combat.ts";
import { extraEnemies } from "../src/more-enemies.ts";
import { rollFreeTraining } from "../src/free-training.ts";
import { BASE_RULES, potionRestores } from "../src/step-effects.ts";
import { snap } from "../src/exact.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { CardId } from "../src/cards.ts";
import type { Enemy, Player } from "../src/entities.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 100, defense: 10, shroud: 20, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (strength: Enemy["strength"]): Enemy => ({ name: "Slime", hp: 100, attack: 30, defense: 0, tier: 1, strength });
/** A save whose cards in `xp` stand at that XP. */
function saveWith(xp: Partial<Record<CardId, number>>) {
  const s = defaults();
  s.cardXp = { ...xp };
  return s;
}
/** `card`'s nodes filled in tree order with `points` points, each node to
 * the most levels card buys can open on it. */
function filled(card: CardId, points: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const node of CARD_TREES[card]!) {
    const n = Math.min(node.max, points);
    if (n) out[node.id] = n;
    points -= n;
  }
  return out;
}
/** Every level card buys can open on `card`'s tree, opened. */
function allOpened(card: CardId): CardOpened {
  return { [card]: Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, n.max - n.levels])) };
}

test("every card tree holds 10 levels from the start and opens to 60 with card buys, each node after one of its own tree", () => {
  assert.deepEqual(Object.keys(CARD_TREES), ["stairs", "heal", "door", "key", "yellowKey", "blueKey", "redKey", "monster", "atkUp", "defUp", "torch", "chest"]);
  for (const [card, nodes] of Object.entries(CARD_TREES)) {
    assert.equal(nodes!.reduce((a, n) => a + n.levels, 0), BASE_MAX_LEVEL, `${card} starts at 10`);
    assert.equal(nodes!.reduce((a, n) => a + n.max, 0), MAX_CARD_LEVEL, `${card}'s whole tree`);
    const ids = nodes!.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `${card}'s node ids are its own`);
    nodes!.forEach((n, i) => n.after === undefined || assert.ok(ids.slice(0, i).includes(n.after), `${card}.${n.id} comes after its parent`));
    for (const n of nodes!) assert.equal(n.levels > 0, n.rarity === "common", `${card}.${n.id}: only common nodes hold levels from the start`);
  }
  const stairs = CARD_TREES.stairs!;
  assert.deepEqual(stairs.map((n) => [n.id, n.rarity, n.after ?? null]), [
    ["floorGold", "common", null], ["floorHealGold", "uncommon", "floorGold"], ["goldBonus", "rare", "floorHealGold"], ["freeOffense", "epic", "goldBonus"], ["overhealMax", "legendary", "freeOffense"],
    ["floorSilver", "common", null], ["floorHealSilver", "uncommon", "floorSilver"], ["silverBonus", "rare", "floorHealSilver"], ["freeDefense", "epic", "silverBonus"], ["stairSkip", "legendary", "freeDefense"],
  ]);
  assert.deepEqual(stairs.map((n) => Object.entries(n.stats)[0]), [
    ["floorGold", 2], ["floorHeal", 3], ["goldBonus", 2], ["freeOffense", 1], ["overhealMax", 5],
    ["floorSilver", 2], ["floorHeal", 3], ["silverBonus", 2], ["freeDefense", 1], ["stairSkip", 1],
  ]);
  const heal = CARD_TREES.heal!;
  assert.deepEqual(heal.map((n) => [n.id, n.rarity, n.after ?? null, Object.entries(n.stats)[0]]), [
    ["percentPotions", "common", null, ["percentPotions", 2]], ["potionSilver", "uncommon", "percentPotions", ["potionSilver", 0.1]], ["goldBonus", "rare", "potionSilver", ["goldBonus", 2]],
    ["freeDefense", "epic", "goldBonus", ["freeDefenseChance", 0.5]], ["parry", "legendary", "freeDefense", ["parry", 1]],
    ["potionHeal", "common", null, ["potionHeal", 2]], ["regen", "uncommon", "potionHeal", ["regen", 2]], ["shroud", "rare", "regen", ["shroud", 2]],
    ["potionMaxHp", "epic", "shroud", ["potionMaxHp", 0.01]], ["overhealMax", "legendary", "potionMaxHp", ["overhealMax", 5]],
  ]);
  const door = CARD_TREES.door!;
  assert.deepEqual(door.map((n) => [n.id, n.rarity, n.after ?? null, Object.entries(n.stats)[0], n.levels, n.max]), [
    ["doorGold", "common", null, ["doorGold", 2], 5, 10], ["doorSilver", "uncommon", "doorGold", ["doorSilver", 0.1], 0, 5], ["goldBonus", "rare", "doorSilver", ["goldBonus", 1], 0, 5],
    ["freeUtility", "epic", "goldBonus", ["freeUtilityChance", 0.5], 0, 5], ["doorChest", "legendary", "freeUtility", ["doorChest", 0.2], 0, 5],
    ["doorCost", "common", null, ["doorCost", 1], 5, 10], ["doorHeal", "uncommon", "doorCost", ["doorHeal", 0.5], 0, 5], ["skeletonKey", "rare", "doorHeal", ["skeletonKey", 1], 0, 5],
    ["lockPick", "epic", "skeletonKey", ["lockPick", 1], 0, 5], ["secretKnock", "legendary", "lockPick", ["secretKnock", 1], 0, 5],
  ]);
  const key = CARD_TREES.key!;
  assert.deepEqual(key.map((n) => [n.id, n.rarity, n.after ?? null, Object.entries(n.stats)[0], n.levels, n.max]), [
    ["keyHeal", "common", null, ["keyHeal", 1], 2, 5], ["keyOverheal", "uncommon", "keyHeal", ["keyOverheal", 1], 0, 5],
    ["keyGold", "common", null, ["keyGold", 2], 4, 5], ["keySilver", "uncommon", "keyGold", ["keySilver", 0.1], 0, 5], ["goldBonus", "rare", "keySilver", ["goldBonus", 1], 0, 5],
    ["freeUtility", "epic", "goldBonus", ["freeUtilityChance", 0.5], 0, 5], ["keyChest", "legendary", "freeUtility", ["keyChest", 0.2], 0, 5],
    ["keyFind", "common", null, ["keyFind", 1], 4, 5], ["plainDoorCost", "uncommon", "keyFind", ["plainDoorCost", 1], 0, 5], ["heartDoorCost", "rare", "plainDoorCost", ["heartDoorCost", 1], 0, 5],
    ["locksmith", "epic", "heartDoorCost", ["doubleKey", 1], 0, 5], ["masterKey", "legendary", "locksmith", ["masterKey", 0.2], 0, 5],
  ]);
  const monster = CARD_TREES.monster!;
  assert.deepEqual(monster.map((n) => [n.id, n.rarity, n.after ?? null, Object.entries(n.stats)[0], n.levels, n.max]), [
    ["attack", "common", null, ["foeAttack", 2], 4, 5], ["critChance", "uncommon", "attack", ["critChance", 1], 0, 5], ["critFactor", "rare", "critChance", ["critFactor", 2], 0, 5],
    ["killXp", "epic", "critFactor", ["killXp", 2], 0, 5], ["surpriseAttack", "legendary", "killXp", ["surpriseAttack", 5], 0, 5],
    ["defense", "common", null, ["foeDefense", 2], 3, 5], ["shroud", "uncommon", "defense", ["shroud", 2], 0, 5], ["weaken", "rare", "shroud", ["foeAttackCut", 1], 0, 5],
    ["stealOverheal", "epic", "weaken", ["stealOverheal", 5], 0, 5],
    ["gold", "common", null, ["foeGold", 1], 3, 5], ["silver", "uncommon", "gold", ["foeSilver", 1], 0, 5], ["spawnRate", "rare", "silver", ["moreEnemies", 2], 0, 5],
  ]);
});

test("a card's max level is every level its tree holds, and its look the rarest rarity opened on it", () => {
  assert.equal(cardMaxLevel({}, "stairs"), 10);
  assert.equal(cardMaxLevel({}, "archer"), 10, "a card without a tree");
  assert.equal(cardMaxLevel({ stairs: { floorGold: 2, goldBonus: 1 } }, "stairs"), 13);
  assert.equal(cardMaxLevel(allOpened("stairs"), "stairs"), 60);
  assert.equal(cardMaxLevel(allOpened("heal"), "heal"), 60);
  assert.equal(cardMaxLevel(allOpened("door"), "door"), 60);
  assert.equal(cardMaxLevel(allOpened("key"), "key"), 60);
  assert.equal(cardMaxLevel(allOpened("monster"), "monster"), 60);
  for (const card of ["atkUp", "defUp", "torch", "chest"] as const) assert.equal(cardMaxLevel(allOpened(card), card), 60, card);
  assert.deepEqual(cardLook({}, "stairs"), { rarity: "common", upgraded: false });
  assert.deepEqual(cardLook({ stairs: { floorGold: 1 } }, "stairs"), { rarity: "common", upgraded: true });
  assert.deepEqual(cardLook({ stairs: { floorHealSilver: 1, goldBonus: 1 } }, "stairs"), { rarity: "rare", upgraded: true });
  const s = saveWith({ atkUp: MAX_CARD_XP });
  assert.equal(pointsLeft(s, "atkUp"), 10, "the cap holds the points");
  s.cardBuys.opened = { atkUp: { shard: 3 } };
  assert.equal(pointsLeft(s, "atkUp"), 13);
});

test("a point goes on a track's first node from level 0, on a node a card buy opened once its parent holds enough, while the card has one left", () => {
  const s = saveWith({ stairs: CARD_LEVEL_XP[0] + CARD_LEVEL_XP[1] });
  assert.equal(raiseRefusal(s, "stairs", "nope"), "unknown");
  assert.equal(raiseRefusal(s, "stairs", "floorHealGold"), "sealed", "no uncommon card buy yet");
  assert.equal(raiseRefusal(s, "stairs", "floorGold"), null);
  s.cardTrees = { stairs: { floorGold: 2 } };
  assert.equal(raiseRefusal(s, "stairs", "floorSilver"), "points", "level 2: both points spent");
  s.cardXp.stairs = MAX_CARD_XP;
  s.cardBuys.opened = { stairs: { floorHealGold: 1, goldBonus: 1 } };
  assert.equal(raiseRefusal(s, "stairs", "floorHealGold"), "locked", "2 of Spare Change's 5 levels");
  s.cardTrees = { stairs: { floorGold: 5 } };
  assert.equal(raiseRefusal(s, "stairs", "floorHealGold"), null);
  assert.equal(raiseRefusal(s, "stairs", "floorGold"), "maxed", "5 of 5 until common buys open more");
  assert.equal(raiseRefusal(s, "stairs", "goldBonus"), "locked", "a node a buy opened opens its child at one level");
  s.cardTrees = { stairs: { floorGold: 5, floorHealGold: 1 } };
  assert.equal(raiseRefusal(s, "stairs", "goldBonus"), null);
  assert.equal(raiseRefusal(s, "stairs", "floorHealGold"), "maxed", "1 level opened");
  assert.equal(raiseRefusal(s, "stairs", "freeOffense"), "sealed");
});

test("the Game's desk spends points in the forest only, and a respec gives them back for 20 Gems", () => {
  const g = new Game(saveWith({ atkUp: MAX_CARD_XP }));
  g.save.cardBuys.opened = allOpened("atkUp");
  g.newRun({ outside: true, seed: 1 });
  assert.equal(g.cardTrees.pointsLeft("atkUp"), 60);
  for (let i = 0; i < 10; i++) assert.equal(g.cardTrees.raise("atkUp", "shard"), null);
  assert.equal(g.cardTrees.raise("atkUp", "shard"), "maxed");
  assert.equal(g.cardTrees.raise("atkUp", "silverBoost"), "locked", "Shard Silver first");
  assert.equal(g.cardTrees.raise("atkUp", "sharper"), null);
  assert.deepEqual(g.save.cardTrees, { atkUp: { shard: 10, sharper: 1 } });
  assert.equal(g.cardTrees.pointsLeft("atkUp"), 49);
  assert.equal(g.cardTrees.respecRefusal("atkUp"), "short", "no Gems");
  g.save.gems = RESPEC_GEMS;
  assert.equal(g.cardTrees.respecRefusal("door"), "none", "nothing spent on DOOR");
  assert.equal(g.cardTrees.respec("atkUp"), null);
  assert.equal(g.save.gems, 0);
  assert.deepEqual(g.save.cardTrees, {});
  assert.deepEqual(g.save.cardBuys.opened, allOpened("atkUp"), "the levels card buys opened stay");
  assert.equal(g.cardTrees.pointsLeft("atkUp"), 60);
  g.cardTrees.raise("atkUp", "gold");
  g.newRun({ seed: 1 });
  assert.equal(g.cardTrees.raise("atkUp", "gold"), "inside");
  g.save.gems = 100;
  assert.equal(g.cardTrees.respec("atkUp"), "inside");
});

test("a saved tree keeps known nodes, whole and in order, within what card buys opened, no child before its parent holds enough, and no more points than the card has", () => {
  const xp = { stairs: CARD_LEVEL_XP[0] + CARD_LEVEL_XP[1] + CARD_LEVEL_XP[2], atkUp: MAX_CARD_XP };
  assert.deepEqual(decodeCardTrees({ stairs: { floorGold: 5 } }, xp, {}), { stairs: { floorGold: 3 } }, "three levels, three points");
  assert.deepEqual(decodeCardTrees({ atkUp: { shard: 4, gold: 1.5, nope: 2, silverBonus: 9 } }, xp, {}), { atkUp: { shard: 4 } });
  assert.deepEqual(decodeCardTrees({ atkUp: { shard: 6 } }, xp, {}), {}, "more than the 5 levels it holds");
  assert.deepEqual(decodeCardTrees({ atkUp: { shard: 6 } }, xp, { atkUp: { shard: 2 } }), { atkUp: { shard: 6 } }, "with two opened by card buys");
  assert.deepEqual(decodeCardTrees({ atkUp: { shard: 4 }, stairs: { floorHealGold: 1 }, heal: { goldBonus: 1 }, bogus: { a: 1 } }, xp, { stairs: { floorHealGold: 1 } }), { atkUp: { shard: 4 } }, "a child without its parent, and a card without points");
  assert.deepEqual(decodeCardTrees("x", xp, {}), {});
  const s = defaults();
  s.cardXp = { torch: MAX_CARD_XP };
  s.cardBuys.opened = { torch: { attack: 3 } };
  s.cardTrees = { torch: { attack: 5, gold: 2 } };
  assert.deepEqual(decode(JSON.stringify(s)).cardTrees, { torch: { attack: 5, gold: 2 } }, "it saves");
});

test("the trees' stats add up over the hand's cards: Silver Bonus from ATK UP, DEF UP and STAIRS together", () => {
  const levels: CardTreeLevels = { atkUp: { silverBoost: 5 }, defUp: { silverBoost: 3 }, stairs: { floorGold: 5, silverBonus: 1 } };
  const b = treeBonus(levels);
  assert.equal(b.silverBonus, 5 + 3 + 2);
  assert.equal(b.floorGold, 10);
  assert.equal(treeFactor(b, "silverBonus"), 1.1);
  assert.equal(treeFactor(b, "goldBonus"), 1, "none raised");
  const full = treeBonus({ chest: filled("chest", 60), atkUp: filled("atkUp", 60), torch: filled("torch", 60) });
  assert.equal(full.supplyChance, 2, "1.5% with the card's base: 3.5%");
  assert.equal(full.equipmentChance, 1, "0.5% with the card's base: 1.5%");
  assert.equal(full.attackShardGold, 100, "a shard's Gold doubled at the top");
  assert.equal(full.bossCells, 15, "1 a level, then 2");
  const heal = treeBonus({ heal: filled("heal", 60) });
  assert.deepEqual([heal.percentPotions, heal.potionSilver, heal.goldBonus, heal.freeDefenseChance, heal.parry, heal.potionHeal, heal.regen, heal.shroud, heal.potionMaxHp, heal.overhealMax],
    [20, 0.5, 10, 2.5, 5, 20, 10, 10, 0.05, 25]);
  const stairs = treeBonus({ stairs: filled("stairs", 60) });
  assert.deepEqual([stairs.floorGold, stairs.floorSilver, stairs.floorHeal, stairs.goldBonus, stairs.silverBonus, stairs.freeOffense, stairs.freeDefense, stairs.overhealMax, stairs.stairSkip], [20, 20, 30, 10, 10, 5, 5, 25, 5]);
});

test("a run copies the trees of its hand's cards as it goes inside, keeping its floors and bonuses for the run", () => {
  const s = saveWith({ stairs: MAX_CARD_XP, monster: MAX_CARD_XP, torch: MAX_CARD_XP, chest: MAX_CARD_XP });
  s.cardBuys.opened = { ...allOpened("monster"), ...allOpened("torch") };
  s.cardTrees = { stairs: { floorGold: 5 }, monster: filled("monster", 60), torch: filled("torch", 15), chest: { gold: 2 } };
  s.hand = ["stairs", "monster", "torch"];
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.cardTrees, { stairs: { floorGold: 5 }, monster: filled("monster", 60), torch: filled("torch", 15) }, "CHEST isn't in the hand");
  assert.deepEqual(g.run.player.foeAttack, { monster: 10, torch: 10 });
  assert.deepEqual(g.run.player.foeDefense, { monster: 10, torch: 5 });
  assert.deepEqual(g.run.player.foeShroud, { monster: 10 }, "TORCH's Boss Shroud not reached");
  assert.equal(g.run.player.stealOverheal, 25, "ENEMY's Lifesteal Overheal");
  assert.deepEqual(runExtras(g.run), extraEnemies(undefined, 10), "ENEMY's 10% more of every strength");
  const saved = decode(JSON.stringify(g.save)).tower.run!;
  assert.deepEqual(saved.cardTrees, g.run.cardTrees, "and saves them");
  assert.deepEqual(saved.player.foeShroud, { monster: 10 });
  assert.equal(saved.player.stealOverheal, 25);
  s.hand = ["stairs"];
  g.newRun({ seed: 3 });
  assert.equal(g.run.player.foeAttack, undefined);
  assert.equal(g.run.player.stealOverheal, undefined);
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

test("HEAL's tree raises each potion's HP, and HEAL's and STAIRS' Overheal Max add percents of max HP to the Overheal ceiling, skill or not", () => {
  const potion = { kind: "potion" } as never;
  assert.equal(potionRestores(potion, 100, { ...BASE_RULES, potionCard: 50 }), snap(35 * 1.5));
  const max = treeBonus({ heal: { overhealMax: 1 }, stairs: { overhealMax: 2 } });
  assert.equal(treeOverheal(1000, max), 1150, "+15% above max HP without the skill");
  assert.equal(treeOverheal(2000, max), 2150, "added, not multiplied");
  assert.equal(treeOverheal(2000, treeBonus({})), 2000);
});

test("HEAL's Parry and Free Defense open their stats without them, and add to them when owned", () => {
  assert.equal(parryCut(hero), 0);
  assert.equal(parryCut({ ...hero, cardParry: 5 }), 5, "Parry without Parry %");
  assert.equal(parryCut({ ...hero, parry: 20, cardParry: 5 }), 25, "added to Parry %");
  assert.equal(parryCut({ ...hero, parry: 50, cardParry: 5 }), 55);
  assert.equal(parryCut({ ...hero, parry: 97, cardParry: 5 }), 98, "under the cap");
  const s = defaults();
  s.upgrades.freeTraining = 1;
  const draws = (chances?: { defense: number }) => {
    const run = { seed: 9, hand: ["stairs"] as CardId[] };
    let hits = 0;
    for (let f = 0; f < 2000; f++) hits += rollFreeTraining(s, run, 0, undefined, chances).length;
    return hits;
  };
  assert.equal(draws(), 0, "no Free Upgrade trained");
  const hits = draws(freeUpChances(treeBonus({ heal: { freeDefense: 5 } })));
  assert.ok(hits > 15 && hits < 90, `about 2.5% of 2,000: ${hits}`);
});

test("HEAL's shroud holds against every enemy, its Parry and Regen reach the run, and a potion finds Silver", () => {
  const s = defaults();
  s.hand = ["stairs", "heal"];
  s.cardXp.heal = MAX_CARD_XP;
  s.cardBuys.opened = allOpened("heal");
  s.cardTrees = { heal: filled("heal", 60) };
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.player.foeShroud, { monster: 10 });
  assert.equal(g.run.player.cardParry, 5);
  assert.equal(decode(JSON.stringify(g.save)).tower.run!.player.cardParry, 5, "it saves");
  assert.deepEqual([facing(g.run.player.foeShroud ? { ...hero, foeShroud: g.run.player.foeShroud } : hero, foe("normal")).shroud], [22]);
  g.run.player.regen = 10;
  const regen = g.stepRules.regen;
  delete g.run.cardTrees;
  assert.equal(regen, snap(g.stepRules.regen * 1.1), "+10% Regen");
  const silverFrom = (potionSilver: number) => {
    const h = new Game(defaults());
    h.newRun({ seed: 7 });
    if (potionSilver) h.run.cardTrees = { heal: { potionSilver } };
    const w = h.world as RoomWorld;
    w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "potion" }]]);
    Object.assign(h.run.player, { x: 0, y: 0 });
    const before = h.run.silver ?? 0;
    assert.ok(h.move(1, 0));
    return snap((h.run.silver ?? 0) - before);
  };
  assert.equal(silverFrom(0), 0);
  assert.ok(silverFrom(5) > 0);
  assert.equal(silverFrom(5), snap(new RunPurse(defaults(), "tower", { silver: 0 } as never, () => 0.5).silver(0.5)));
});

test("STAIRS' Stair Skip climbs two floors at its chance, on the Tower's stairs only", () => {
  const save = defaults();
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["stairs"];
  const w = g.world as RoomWorld;
  w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }], ["2,0", { kind: "floor" }]]);
  assert.equal(g.handRules.rollsSkip("stairs", 1, 0), false, "no Stair Skip, no Skip badge");
  g.run.cardTrees = { stairs: { stairSkip: 5 } };
  assert.equal(g.handRules.rollsSkip("stairs", 1, 0), true);
  assert.equal(g.handRules.rollsSkip("stairs", 2, 0), false, "only the stairs");
  assert.equal(g.handRules.rollsSkip("door", 1, 0), false, "only STAIRS");
  let hits = 0;
  for (let n = 0; n < 4000; n++) {
    g.run.skipRolls = n;
    if (g.handRules.skipHits("stairs")) hits++;
  }
  assert.ok(hits > 140 && hits < 260, `about 5% of 4,000: ${hits}`);
});

test("the trees' Gold and Silver: Gold Bonus, Silver Bonus, a chest's Gold, ENEMY's kill Gold and TORCH's Cells", () => {
  const purse = (trees?: CardTreeLevels) => {
    const g = new Game(defaults());
    g.newRun({ seed: 7 });
    if (trees) g.run.cardTrees = trees;
    return new RunPurse(g.save, g.mode, g.run, () => 0.5);
  };
  const plain = purse(), raised = purse({ heal: { goldBonus: 5 }, stairs: { goldBonus: 20 }, chest: { gold: 5 }, monster: { gold: 5 }, torch: { cellDrop: 3 }, atkUp: { silverBoost: 5 }, defUp: { silverBoost: 5 } });
  assert.equal(raised.treasureGoldPreview(3, 3), snap(snap(plain.treasureGoldPreview(3, 3) * 1.5) * 1.1));
  assert.equal(raised.killGoldOf(foe("normal")), snap(snap(plain.killGoldOf(foe("normal")) * 1.5) * 1.05));
  assert.equal(raised.silver(10), snap(plain.silver(10) * 1.1));
  assert.equal(raised.enemyLoot(foe("greaterBoss"), 2, 2).cells, 4, "1 in tower I, and TORCH's 3");
});
