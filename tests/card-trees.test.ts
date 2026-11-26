import { givePowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { MAX_CARD_XP } from "../src/cards/levels.ts";
import { freeUpChances, powerBonus, powerFactor, powerOverheal } from "../src/cards/powers.ts";
import { RunPurse } from "../src/game/run-purse.ts";
import { facing, parryCut, predict } from "../src/combat.ts";
import { extraEnemies } from "../src/enemies/more-enemies.ts";
import { rollFreeTraining } from "../src/progression/free-training.ts";
import { BASE_RULES, potionRestores } from "../src/step-effects.ts";
import { snap } from "../src/exact.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { CardId } from "../src/cards/cards.ts";
import type { Enemy, Player } from "../src/entities.ts";

const hero: Player = { x: 0, y: 0, hp: 100, maxHp: 100, attack: 100, defense: 10, shroud: 20, keys: { yellow: 0, blue: 0, red: 0 } };
const foe = (strength: Enemy["strength"]): Enemy => ({ name: "Slime", hp: 100, attack: 30, defense: 0, tier: 1, strength });


test("the cards' powers add up over the hand's cards: Silver Bonus from three cards together", () => {
  const b = powerBonus(givePowers({ atkUp: { silverBonus: 5 }, defUp: { silverBonus: 3 }, stairs: { floorGold: 10, silverBonus: 2 } }));
  assert.equal(b.silverBonus, 5 + 3 + 2);
  assert.equal(b.floorGold, 10);
  assert.equal(powerFactor(b, "silverBonus"), 1.1);
  assert.equal(powerFactor(b, "goldBonus"), 1, "none raised");
  // At level 60 the base power holds 60 levels and each rarity's ten.
  const heal = powerBonus({ heal: 60 });
  assert.deepEqual([heal.percentPotions, heal.potionHeal, heal.shroud, heal.freeDefenseChance, heal.overhealMax, heal.potionMaxHp, heal.parry], [60, 20, 20, 5, 50, 0.1, 5]);
  const stairs = powerBonus({ stairs: 60 });
  assert.deepEqual([stairs.floorHeal, stairs.silverBonus, stairs.stairSkip, stairs.freeOffenseChance, stairs.freeDefenseChance, stairs.freeUtilityChance, stairs.goldBonus, stairs.floorRuby, stairs.levelSkipBoost],
    [60, 10, 20, 5, 5, 5, 10, 10, 10]);
  // Two cards with the same power add up: ATK UP's and DEF UP's Gold Bonus.
  assert.equal(powerBonus({ atkUp: 50, defUp: 45 }).goldBonus, 10 + 5);
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
  const max = powerBonus(givePowers({ heal: { overhealMax: 5 }, stairs: { overhealMax: 10 } }));
  assert.equal(powerOverheal(1000, max), 1150, "+15% above max HP without the skill");
  assert.equal(powerOverheal(2000, max), 2150, "added, not multiplied");
  assert.equal(powerOverheal(2000, powerBonus(givePowers({}))), 2000);
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
  const hits = draws(freeUpChances(powerBonus(givePowers({ heal: { freeDefenseChance: 2.5 } }))));
  assert.ok(hits > 15 && hits < 90, `about 2.5% of 2,000: ${hits}`);
});

test("HEAL's shroud holds against every enemy, its Parry reaches the run, and a potion finds Silver", () => {
  const s = defaults();
  s.hand = ["stairs", "heal"];
  s.cardXp.heal = MAX_CARD_XP;
  s.cardAscension.heal = 5;
  const g = new Game(s);
  g.newRun({ seed: 3 });
  assert.deepEqual(g.run.player.foeShroud, { monster: 20 });
  assert.equal(g.run.player.cardParry, 5);
  assert.equal(decode(JSON.stringify(g.save)).tower.run!.player.cardParry, 5, "it saves");
  assert.deepEqual([facing(g.run.player.foeShroud ? { ...hero, foeShroud: g.run.player.foeShroud } : hero, foe("normal")).shroud], [24]);
  const silverFrom = (potionSilver: number) => {
    const h = new Game(defaults());
    h.newRun({ seed: 7 });
    if (potionSilver) h.run.handLevels = givePowers({ heal: { potionSilver } });
    const w = h.world as RoomWorld;
    w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "potion" }]]);
    Object.assign(h.run.player, { x: 0, y: 0 });
    const before = h.run.silver ?? 0;
    assert.ok(h.move(1, 0));
    return snap((h.run.silver ?? 0) - before);
  };
  assert.equal(silverFrom(0), 0);
  assert.ok(silverFrom(5) > 0);
  assert.equal(silverFrom(5), snap(new RunPurse(defaults(), "tower", { silver: 0 } as never, () => 0.5).silver(5)));
});

test("STAIRS' Stair Skip climbs two floors at its chance, on the Tower's stairs only", () => {
  const save = defaults();
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["stairs"];
  const w = g.world as RoomWorld;
  w.cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }], ["2,0", { kind: "floor" }]]);
  assert.equal(g.handRules.rollsSkip("stairs", 1, 0), false, "no Stair Skip, no Skip badge");
  g.run.handLevels = givePowers({ stairs: { stairSkip: 5 } });
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

test("the trees' Gold and Silver: Gold Bonus, Silver Bonus, a chest's Gold, ENEMY's kill Gold and TORCH's Lore", () => {
  const purse = (trees?: GivenPowers) => {
    const g = new Game(defaults());
    g.newRun({ seed: 7 });
    if (trees) g.run.handLevels = givePowers(trees);
    return new RunPurse(g.save, g.mode, g.run, () => 0.5);
  };
  const plain = purse(), raised = purse({ heal: { goldBonus: 10 }, stairs: { goldBonus: 40 }, chest: { chestGold: 10 }, monster: { foeGold: 5 }, torch: { bossCells: 3 }, atkUp: { silverBonus: 5 }, defUp: { silverBonus: 5 } });
  assert.equal(raised.treasureGoldPreview(3, 3), snap(snap(plain.treasureGoldPreview(3, 3) * 1.5) * 1.1));
  assert.equal(raised.killGoldOf(foe("normal")), snap(snap(plain.killGoldOf(foe("normal")) * 1.5) * 1.05));
  assert.equal(raised.silver(10), snap(plain.silver(10) * 1.1));
  assert.equal(raised.enemyLoot(foe("greaterBoss"), 2, 2).cells, 4, "1 in tower I, and TORCH's 3");
});
