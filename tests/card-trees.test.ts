import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { BASE_MAX_LEVEL, CARD_LEVEL_XP, MAX_CARD_LEVEL, MAX_CARD_XP } from "../src/card-levels.ts";
import { CARD_TREES, RESPEC_GEMS, cardLook, cardMaxLevel, decodeCardTrees, pointsLeft, raiseRefusal, runExtras, treeBonus, treeFactor, treeOverheal, type CardOpened, type CardTreeLevels } from "../src/card-trees.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { facing, predict } from "../src/combat.ts";
import { doorDiscount } from "../src/doors.ts";
import { extraEnemies } from "../src/more-enemies.ts";
import { rollFreeTraining } from "../src/free-training.ts";
import { BASE_RULES, potionRestores } from "../src/step-effects.ts";
import { snap } from "../src/exact.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
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

test("every card tree holds 10 levels from the start and opens to 60 (STAIRS) or 25 with card buys, each node after one of its own tree", () => {
  assert.deepEqual(Object.keys(CARD_TREES), ["stairs", "heal", "door", "key", "monster", "atkUp", "defUp", "torch", "chest"]);
  for (const [card, nodes] of Object.entries(CARD_TREES)) {
    assert.equal(nodes!.reduce((a, n) => a + n.levels, 0), BASE_MAX_LEVEL, `${card} starts at 10`);
    assert.equal(nodes!.reduce((a, n) => a + n.max, 0), card === "stairs" ? MAX_CARD_LEVEL : 25, `${card}'s whole tree`);
    const ids = nodes!.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `${card}'s node ids are its own`);
    nodes!.forEach((n, i) => n.after === undefined || assert.ok(ids.slice(0, i).includes(n.after), `${card}.${n.id} comes after its parent`));
    for (const n of nodes!) assert.equal(n.levels > 0, n.rarity === "common", `${card}.${n.id}: only common nodes hold levels from the start`);
    if (card !== "stairs") assert.ok(nodes!.every((n) => n.rarity === "common"), `${card} is common for now`);
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
});

test("a card's max level is every level its tree holds, and its look the rarest rarity opened on it", () => {
  assert.equal(cardMaxLevel({}, "stairs"), 10);
  assert.equal(cardMaxLevel({}, "archer"), 10, "a card without a tree");
  assert.equal(cardMaxLevel({ stairs: { floorGold: 2, goldBonus: 1 } }, "stairs"), 13);
  assert.equal(cardMaxLevel(allOpened("stairs"), "stairs"), 60);
  assert.equal(cardMaxLevel(allOpened("heal"), "heal"), 25);
  assert.deepEqual(cardLook({}, "stairs"), { rarity: "common", upgraded: false });
  assert.deepEqual(cardLook({ stairs: { floorGold: 1 } }, "stairs"), { rarity: "common", upgraded: true });
  assert.deepEqual(cardLook({ stairs: { floorHealSilver: 1, goldBonus: 1 } }, "stairs"), { rarity: "rare", upgraded: true });
  const s = saveWith({ door: MAX_CARD_XP });
  assert.equal(pointsLeft(s, "door"), 10, "the cap holds the points");
  s.cardBuys.opened = { door: { doorCost: 3 } };
  assert.equal(pointsLeft(s, "door"), 13);
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
  const g = new Game(saveWith({ door: MAX_CARD_XP }));
  g.save.cardBuys.opened = allOpened("door");
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
  assert.deepEqual(g.save.cardBuys.opened, allOpened("door"), "the levels card buys opened stay");
  assert.equal(g.cardTrees.pointsLeft("door"), 25);
  g.cardTrees.raise("door", "doorGold");
  g.newRun({ seed: 1 });
  assert.equal(g.cardTrees.raise("door", "doorGold"), "inside");
  g.save.gems = 100;
  assert.equal(g.cardTrees.respec("door"), "inside");
});

test("a saved tree keeps known nodes, whole and in order, within what card buys opened, no child before its parent holds enough, and no more points than the card has", () => {
  const xp = { stairs: CARD_LEVEL_XP[0] + CARD_LEVEL_XP[1] + CARD_LEVEL_XP[2], key: MAX_CARD_XP };
  assert.deepEqual(decodeCardTrees({ stairs: { floorGold: 5 } }, xp, {}), { stairs: { floorGold: 3 } }, "three levels, three points");
  assert.deepEqual(decodeCardTrees({ key: { keyFind: 4, keyGold: 1.5, nope: 2, silverBonus: 9 } }, xp, {}), { key: { keyFind: 4 } });
  assert.deepEqual(decodeCardTrees({ key: { keyFind: 6 } }, xp, {}), {}, "more than the 4 levels it holds");
  assert.deepEqual(decodeCardTrees({ key: { keyFind: 6 } }, xp, { key: { keyFind: 2 } }), { key: { keyFind: 6 } }, "with two opened by card buys");
  assert.deepEqual(decodeCardTrees({ key: { keyFind: 4 }, stairs: { floorHealGold: 1 }, heal: { goldBonus: 1 }, bogus: { a: 1 } }, xp, { stairs: { floorHealGold: 1 } }), { key: { keyFind: 4 } }, "a child without its parent, and a card without points");
  assert.deepEqual(decodeCardTrees("x", xp, {}), {});
  const s = defaults();
  s.cardXp = { torch: MAX_CARD_XP };
  s.cardBuys.opened = { torch: { attack: 3 } };
  s.cardTrees = { torch: { attack: 5, cells: 2 } };
  assert.deepEqual(decode(JSON.stringify(s)).cardTrees, { torch: { attack: 5, cells: 2 } }, "it saves");
});

test("the trees' stats add up over the hand's cards: Silver Bonus from DOOR, KEY, ATK UP, DEF UP and STAIRS together", () => {
  const levels: CardTreeLevels = { door: { silverBonus: 5 }, key: { silverBonus: 5 }, atkUp: { silverBonus: 5 }, defUp: { silverBonus: 3 }, stairs: { floorGold: 5, silverBonus: 1 } };
  const b = treeBonus(levels);
  assert.equal(b.silverBonus, 10 + 10 + 5 + 3 + 2);
  assert.equal(b.floorGold, 10);
  assert.equal(treeFactor(b, "silverBonus"), 1.3);
  assert.equal(treeFactor(b, "goldBonus"), 1, "none raised");
  const full = treeBonus({ chest: filled("chest", 25), atkUp: filled("atkUp", 25), torch: filled("torch", 25), heal: filled("heal", 25) });
  assert.equal(full.supplyChance, 2, "1.5% with the card's base: 3.5%");
  assert.equal(full.equipmentChance, 1, "0.5% with the card's base: 1.5%");
  assert.equal(full.attackShardGold, 1, "a Gold a shard at the top");
  assert.equal(full.bossCells, 5);
  assert.equal(full.potionMaxHp, 0.05);
  const stairs = treeBonus({ stairs: filled("stairs", 60) });
  assert.deepEqual([stairs.floorGold, stairs.floorSilver, stairs.floorHeal, stairs.goldBonus, stairs.silverBonus, stairs.freeOffense, stairs.freeDefense, stairs.overhealMax, stairs.stairSkip], [20, 20, 30, 10, 10, 5, 5, 25, 5]);
});

test("a run copies the trees of its hand's cards as it goes inside, keeping its floors and bonuses for the run", () => {
  const s = saveWith({ stairs: MAX_CARD_XP, monster: MAX_CARD_XP, torch: MAX_CARD_XP, chest: MAX_CARD_XP });
  s.cardBuys.opened = { ...allOpened("monster"), ...allOpened("torch") };
  s.cardTrees = { stairs: { floorGold: 5 }, monster: filled("monster", 25), torch: filled("torch", 25), chest: { gold: 2 } };
  s.hand = ["stairs", "monster", "torch"];
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.cardTrees, { stairs: { floorGold: 5 }, monster: filled("monster", 25), torch: filled("torch", 25) }, "CHEST isn't in the hand");
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

test("HEAL's tree raises each potion's HP and, with the skill, the Overheal ceiling; STAIRS' Overheal Max multiplies it, skill or not", () => {
  const potion = { kind: "potion" } as never;
  assert.equal(potionRestores(potion, 100, { ...BASE_RULES, potionCard: 50 }), snap(35 * 1.5));
  const b = treeBonus({ heal: { overheal: 4 } });
  assert.equal(treeOverheal(2000, { upgrades: { overheal: 0 } }, b), 2000, "HEAL's Overheal never opens it");
  assert.equal(treeOverheal(2000, { upgrades: { overheal: 1 } }, b), 2400, "+20%");
  const max = treeBonus({ heal: { overheal: 4 }, stairs: { overhealMax: 2 } });
  assert.equal(treeOverheal(1000, { upgrades: { overheal: 0 } }, max), 1100, "+10% above max HP without the skill");
  assert.equal(treeOverheal(2000, { upgrades: { overheal: 1 } }, max), 2640, "×1.2 ×1.1");
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
  const plain = purse(), raised = purse({ heal: { goldBonus: 5 }, chest: { gold: 5 }, monster: { gold: 5 }, torch: { cells: 3 }, key: { silverBonus: 5 } });
  assert.equal(raised.treasureGoldPreview(3, 3), snap(snap(plain.treasureGoldPreview(3, 3) * 1.5) * 1.1));
  assert.equal(raised.killGoldOf(foe("normal")), snap(snap(plain.killGoldOf(foe("normal")) * 1.5) * 1.05));
  assert.equal(raised.silver(10), snap(plain.silver(10) * 1.1));
  assert.equal(raised.enemyLoot(foe("greaterBoss"), 2, 2).cells, 4, "1 in tower I, and TORCH's 3");
});
