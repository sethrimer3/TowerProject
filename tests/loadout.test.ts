import { trainNow } from "./train-now.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { GoldItemId } from "../src/config.ts";
import { loadout, trainingPoints, trainingStep, upgradeText, provisionPrice, provisionText } from "../src/loadout.ts";
import { defaults } from "../src/save.ts";
import { GOLD_SHOP, UPGRADES, levelForXp, xpForLevel } from "../src/config.ts";
import type { CraftedEquipment } from "../src/equipment.ts";
import { Game } from "../src/state.ts";
import { ENTRANCE_Y } from "../src/outside.ts";
import { predict } from "../src/combat.ts";
import { delveDefenseGrowth, getTowerGateEnemy } from "../src/scaling.ts";
import { delveEnemyBase } from "../src/delve/labyrinth.ts";

test("a new character starts at 12 ATK, 0 DEF, 100 HP, no shroud, no keys and no undo", () => {
  assert.deepEqual(loadout(defaults()), {
    attack: 12, defense: 0, maxHp: 100, shroud: 0, keys: { yellow: 0, blue: 0, red: 0 }, undoCapacity: 0,
  });
});

test("Rehearsed steps gives the first undo; without it nothing else stores one", () => {
  const s = defaults();
  s.upgrades.undos = 2;
  assert.equal(loadout(s).undoCapacity, 0, "Echoes of time alone");
  s.upgrades.inspirationUndos = 1;
  assert.equal(loadout(s).undoCapacity, 1 + 2);
  s.archives.levels.undoCount = 3;
  assert.equal(loadout(s).undoCapacity, 1 + 2 + 3, "Undo Count research adds to it");
});

test("each rank of an upgrade adds its grant", () => {
  const s = defaults();
  Object.assign(s.upgrades, {
    handOrdering: 1, combatStance: 1, defense: 2, quality: 1,
    yellow: 1, blue: 2, red: 3, undos: 2, inspirationUndos: 1, shroud: 1,
  });
  assert.deepEqual(loadout(s), {
    attack: 12 + 2,
    defense: 0 + 2 + 1,
    maxHp: 100,
    shroud: 1,
    keys: { yellow: 1, blue: 2, red: 3 },
    undoCapacity: 2 + 1,
  });
});

test("each level earns three training points and nothing else", () => {
  const s = defaults();
  s.xp = xpForLevel(15);
  assert.equal(levelForXp(s.xp), 15);
  assert.equal(levelForXp(s.xp - 1), 14);
  assert.deepEqual(trainingPoints(s), { earned: 45, spent: 0, left: 45 });
  assert.deepEqual(loadout(s), loadout(defaults()));
});

test("each training rank is worth more as the hero levels up", () => {
  const s = defaults();
  s.xp = xpForLevel(5);
  Object.assign(s.training, { hp: 3, defense: 2, attack: 1 });
  for (const [id, points] of [["hp", 3], ["defense", 4], ["attack", 3]] as const) s.trainingPaid[id].points = points;
  // At level 5 a rank is worth 15 HP (10 + L), 1.42 DEF (1 + L/12) and 2 ATK (1 + L/5),
  // fractions kept (the page shows the stats whole).
  const l = loadout(s);
  assert.deepEqual([l.attack, l.defense, l.maxHp], [12 + 2, 2.833333, 100 + 45]);
  assert.deepEqual(trainingPoints(s), { earned: 15, spent: 3 + 4 + 3, left: 5 });
  assert.deepEqual(
    [trainingStep(s, "hp"), trainingStep(s, "attack")].map(({ now, next, worth, affordable }) => [now, next, worth, affordable]),
    [[145, 160, 15, true], [14, 16, 2, true]],
  );
  assert.equal(trainingStep({ ...s, trainingPaid: { ...s.trainingPaid, hp: { points: 8, gold: 0, ms: 0 } } }, "attack").affordable, false, "1 point a rank, none left");
  // Levelling up raises every rank already bought.
  s.xp = xpForLevel(20);
  const later = loadout(s);
  assert.deepEqual([later.attack, later.defense, later.maxHp], [12 + 5, 5.333333, 100 + 90]);
});

test("Shroud blocks 1 damage a fight and opens Shroud training, each rank worth more as the hero levels", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.xp = xpForLevel(10);
  assert.equal(trainNow(g, "shroud"), false, "not before Shroud");
  assert.equal(g.run.player.shroud, undefined, "no shroud yet");
  g.save.tower.inspiration = 10;
  assert.equal(g.buy("shroud"), false, "not before Greater Heal");
  g.save.upgrades.greaterHeal = 1;
  assert.ok(g.buy("shroud"));
  assert.equal(loadout(g.save).shroud, 1);
  assert.equal(g.save.tower.inspiration, 0, "10 Inspiration");
  assert.equal(g.run.player.shroud, 1, "the run in the forest takes it at once");
  assert.ok(trainNow(g, "shroud") && trainNow(g, "shroud"));
  // At level 10 a rank is worth 1 × (1 + 10 / 10) = 2.
  assert.equal(loadout(g.save).shroud, 1 + 2 * 2);
  assert.equal(g.run.player.shroud, 1 + 2 * 2, "training reaches a run still outside");
  assert.deepEqual([trainingStep(g.save, "shroud").now, trainingStep(g.save, "shroud").next], [5, 7]);
  assert.equal(trainingPoints(g.save).spent, 2, "a point a rank");
});

test("each level costs the cube of its number in XP, and levels are found exactly", () => {
  assert.deepEqual([1, 5, 10, 20, 50].map(xpForLevel), [48, 1200, 6600, 42000, 561000]);
  for (const level of [0, 1, 2, 7, 49, 300]) {
    assert.equal(levelForXp(xpForLevel(level)), level);
    if (level) assert.equal(levelForXp(xpForLevel(level) - 1), level - 1);
  }
});

test("training spends points and reaches a run still outside", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  assert.equal(trainNow(g, "hp"), false);
  g.save.xp = xpForLevel(1);
  assert.equal(trainNow(g, "hp"), true);
  assert.deepEqual([g.run.player.maxHp, g.run.player.hp, trainingPoints(g.save).left], [111, 111, 2]);
  assert.equal(trainNow(g, "attack"), true, "ATK takes 1 point");
  assert.equal(trainNow(g, "defense"), true, "DEF takes 1 point");
  assert.equal(trainNow(g, "hp"), false, "no points left");
});

test("evenly spread training alone still beats both modes' normal enemies at floor 100", () => {
  // The levels a hero reaches by each floor when every run climbs about 1.5
  // floors past the last, clearing the floors below again (see
  // docs/PROGRESSION_AND_DIFFICULTY.md).
  const hero = (level: number) => {
    const s = defaults(), points = 3 * level;
    s.xp = xpForLevel(level);
    // Every row costs 1 point a rank: a third of the points each.
    Object.assign(s.training, { hp: Math.floor(points / 3), defense: Math.floor(points / 3), attack: Math.floor(points / 3) });
    const l = loadout(s);
    return { x: 0, y: 0, hp: l.maxHp, maxHp: l.maxHp, attack: l.attack, defense: l.defense, keys: l.keys };
  };
  const delve = (floor: number) => {
    const b = delveEnemyBase(floor * 10);
    return { name: "Cinder slime", tier: 1, strength: "normal" as const, hp: Math.round(b.hp), attack: Math.round(b.attack), defense: Math.round(b.defense * delveDefenseGrowth(floor * 10)) };
  };
  const wins = (level: number, floor: number) => [getTowerGateEnemy(floor - 1, "normal", "balanced"), delve(floor - 1)].map((e) => predict(hero(level), e).survivable);
  assert.deepEqual(wins(7, 10), [true, true]);
  assert.deepEqual(wins(28, 50), [true, true]);
  assert.deepEqual(wins(39, 75), [true, true]);
  assert.deepEqual(wins(50, 100), [true, true]);
});

test("gear adds flat bonuses, then its percentages of the total, fractions kept; provisions come last", () => {
  const s = defaults();
  const ring: CraftedEquipment = {
    id: "r", slot: "ring", name: "Ring", metal: "iron",
    flatAttack: 3, flatDefense: 0, flatMaxHp: 10, percentAttack: 0.1, percentDefense: 0.25, percentMaxHp: 0.05,
    baseRecipe: [], enhancements: [], createdAt: 0,
  };
  s.equipmentInventory.push(ring);
  s.equipped.ring = "r";
  Object.assign(s.provisions, { edge: 1, guard: 2, heal: 1 });
  const l = loadout(s);
  assert.equal(l.attack, 17.5, "(12 + 3) × 1.1 + 1");
  assert.equal(l.defense, 2); // 25% of no DEF is nothing
  assert.equal(l.maxHp, 135.5, "110 × 1.05 + 20");
});

test("descriptions are written from the grants", () => {
  const text = Object.fromEntries(UPGRADES.map((u) => [u.id, upgradeText(u.id)]));
  assert.deepEqual(
    { defense: text.defense, yellow: text.yellow, blue: text.blue, red: text.red,
      quality: text.quality, undos: text.undos, handOrdering: text.handOrdering, combatStance: text.combatStance,
      inspirationUndos: text.inspirationUndos, revive: text.revive },
    {
      defense: "+1 starting defense",
      yellow: "+1 starting amber key",
      blue: "+1 starting azure key",
      red: "+1 starting crimson key",
      quality: "+2 weapon attack and +1 armor defense",
      undos: "Store one additional undo (up to 14)",
      handOrdering: "Open the Deck, where you reorder the cards in your hand before a run",
      combatStance: "Unlock the Deck: add its cards to your hand, or set them aside, to choose what a run heads for",
      inspirationUndos: "Rewind an action, and open Undo Count research in the Archives",
      revive: "When a strike would fell you, a 0.5% chance to rise at full HP and fight on: opens Revive training",
    },
  );
  assert.deepEqual(GOLD_SHOP.map((g) => provisionText(g.id)), [
    "+20 max HP every run", "+1 defense every run", "+1 attack every run", "+1 yellow key every run",
  ]);
});

test("each provision bought costs more than the last, on run training's schedule", () => {
  const s = defaults();
  const prices = (id: GoldItemId) => Array.from({ length: 7 }, (_, n) => provisionPrice({ provisions: { ...s.provisions, [id]: n } }, id));
  assert.deepEqual(prices("heal"), [5, 7, 10, 14, 19, 25, 35]);
  assert.deepEqual(prices("guard"), [10, 13, 17, 22, 28, 35, 46]);
  assert.deepEqual(prices("edge"), [15, 18, 22, 27, 33, 40, 51]);
  const g = new Game(s);
  s.gold = 20;
  assert.ok(g.buyGold("heal") && g.buyGold("heal"));
  assert.equal(s.gold, 20 - 5 - 7);
  assert.equal(g.buyGold("guard"), false, "10 Gold, 8 left");
  assert.equal(s.provisions.heal, 2);
});

test("Extra Key opens the Yellow Key provision: 100 Gold, then four times the last", () => {
  const s = defaults(), g = new Game(s);
  g.newRun({ outside: true });
  assert.deepEqual(Array.from({ length: 6 }, (_, n) => provisionPrice({ provisions: { ...s.provisions, yellowKey: n } }, "yellowKey")), [100, 400, 1600, 6400, 25600, 102400]);
  s.gold = 1000;
  assert.equal(g.buyGold("yellowKey"), false, "closed without Extra Key");
  s.upgrades.extraKey = 1;
  const keys = loadout(s).keys.yellow;
  assert.ok(g.buyGold("yellowKey") && g.buyGold("yellowKey"));
  assert.equal(s.gold, 500);
  assert.equal(loadout(s).keys.yellow, keys + 2, "a yellow key for each, every run");
  assert.equal(g.run.player.keys.yellow, keys + 2, "the run in the forest takes them");
  assert.equal(g.buyGold("yellowKey"), false, "1,600 Gold, 500 held");
  goInside(g);
  const held = g.run.player.keys.yellow;
  s.gold = 1600;
  assert.ok(g.buyGold("yellowKey"));
  assert.equal(g.run.player.keys.yellow, held + 1, "one bought inside a run comes at once");
});

const ring = (flatAttack: number, flatMaxHp: number): CraftedEquipment => ({
  id: "r", slot: "ring", name: "Ring", metal: "iron",
  flatAttack, flatDefense: 0, flatMaxHp, percentAttack: 0, percentDefense: 0, percentMaxHp: 0,
  baseRecipe: [], enhancements: [], createdAt: 0,
});

test("changing gear mid-run keeps the ATK gathered and the provisions owned", () => {
  const g = new Game(defaults()), s = g.save;
  s.provisions.edge = 1;
  g.newRun();
  assert.equal(g.run.player.attack, 13);
  g.run.player.attack += 2; // an attack shard picked up
  s.equipmentInventory.push(ring(3, 10));
  assert.ok(g.equipItem("r"));
  assert.equal(g.run.player.attack, 18);
  assert.equal(g.run.player.maxHp, 110);
  assert.deepEqual(g.run.loadout, { attack: 16, defense: 0, maxHp: 110 });
  g.unequipSlot("ring");
  assert.equal(g.run.player.attack, 15);
  assert.deepEqual(g.run.loadout, { attack: 13, defense: 0, maxHp: 100 });
  assert.equal(g.run.player.hp, 100);
});

test("a gear change reaches a run still outside, which starts at its new full HP", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.equipmentInventory.push(ring(3, 10));
  g.equipItem("r");
  assert.deepEqual([g.run.player.attack, g.run.player.maxHp, g.run.player.hp], [15, 110, 110]);
});

/** Walks the hero from the forest in through the entrance. */
function goInside(g: Game) {
  g.walkTo(g.run.player.x, ENTRANCE_Y);
  for (let i = 0; i < 40 && g.route.length; i++) g.routeStep();
  assert.equal(g.run.outside, false);
}

test("provisions last for good: every run takes them, and one bought mid-run counts at once", () => {
  const g = new Game(defaults()), s = g.save;
  s.upgrades.delve = 1;
  g.switchMode("delve");
  g.newRun({ outside: true, seed: 5 });
  g.switchMode("tower");
  g.newRun({ outside: true, seed: 5 });
  s.tower.inspiration = 100;
  s.gold = 100;
  s.upgrades.greaterHeal = 1;
  assert.ok(g.buy("shroud"));
  assert.ok(g.buyGold("edge") && g.buyGold("heal"));
  assert.equal(s.gold, 100 - 15 - 5);
  const ready = { attack: 13, maxHp: 120, hp: 120, shroud: 1 };
  const hero = (run = g.run) => ({ attack: run.player.attack, maxHp: run.player.maxHp, hp: run.player.hp, shroud: run.player.shroud });
  assert.deepEqual(hero(), ready, "the Tower's run in the forest");
  assert.deepEqual(hero(s.delve.run!), ready, "and the Delve's");
  assert.deepEqual(g.run.loadout, { attack: 13, defense: 0, maxHp: 120, shroud: 1 });
  goInside(g);
  assert.deepEqual(hero(), ready, "the run takes its provisions inside");
  assert.deepEqual(s.provisions, { heal: 1, edge: 1, guard: 0, yellowKey: 0 }, "and keeps them for every later run");
  assert.deepEqual(hero(s.delve.run!), ready, "the other forest run still has them");
  assert.ok(g.buyGold("guard"));
  assert.equal(g.run.player.defense, 1, "one bought inside a run counts at once");
  assert.equal(s.delve.run!.player.defense, 1, "and in the Delve's forest run");
});
