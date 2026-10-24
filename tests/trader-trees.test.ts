import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { CARD_TREES, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import { TRAINING } from "../src/progression/training.ts";
import { playedSave } from "./first-skills.ts";

/** A Tower run on seed 7 holding the traders, whose hand's trees are
 * `trees`, the hero holding `keys`; undo owned, and Gold Bonus open to
 * train. */
function trading(trees: CardTreeLevels, keys: { yellow: number; blue: number; red: number }) {
  const save = playedSave();
  Object.assign(save.upgrades, { inspirationUndos: 1, loot: 1 });
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["blueTrader", "redTrader"];
  g.run.cardTrees = trees;
  Object.assign(g.run.player.keys, keys);
  return g;
}

test("GK -> BK's and BK -> RK's trees: two tracks, each rising one rarity an upgrade", () => {
  const shape = (card: "blueTrader" | "redTrader") => CARD_TREES[card]!.map((n) => `${n.id}:${n.rarity}:${n.levels}/${n.max}${n.after ? `<${n.after}` : ""}`);
  const expected = ["find:common:5/10", "gold:uncommon:0/5<find", "silver:rare:0/5<gold", "goldBonus:epic:0/5<silver", "freeUtility:legendary:0/5<goldBonus",
    "efficiency:common:5/10", "doorCost:uncommon:0/5<efficiency", "floorKey:rare:0/5<doorCost", "forge:epic:0/5<floorKey", "smelter:legendary:0/5<forge"];
  assert.deepEqual(shape("blueTrader"), expected);
  assert.deepEqual(shape("redTrader"), expected);
  const full = (card: "blueTrader" | "redTrader") => Object.entries(treeBonus({ [card]: Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, 1])) })).filter(([, n]) => n);
  assert.deepEqual(full("blueTrader"), [["goldBonus", 1], ["blueKeyGold", 2], ["blueKeyFind", 1], ["blueKeySilver", 0.1], ["blueDoorCost", 1],
    ["blueTradeCost", 1], ["blueTradeFreeUtility", 1], ["blueFloorKey", 1], ["blueForge", 2], ["blueSmelter", 2]]);
  assert.deepEqual(full("redTrader"), [["goldBonus", 2], ["redKeyGold", 3], ["redKeyFind", 1], ["redKeySilver", 0.2], ["redDoorCost", 1],
    ["redTradeCost", 1], ["redTradeFreeUtility", 2], ["redFloorKey", 1], ["redForge", 2], ["redSmelter", 2]]);
});

test("Efficiency cuts the keys a trade takes: at 10%, 2.7 gold keys for a blue key", () => {
  const g = trading({ blueTrader: { efficiency: 10 } }, { yellow: 2.7, blue: 0, red: 0 });
  assert.equal(g.handRules.tradeCost("blueTrader"), 2.7);
  assert.equal(g.handRules.tradeCost("redTrader"), 3, "BK -> RK's own Efficiency is its own");
  assert.ok(g.handRules.canAct("blueTrader"));
  g.activation.actInPlace("blueTrader");
  assert.deepEqual([g.run.player.keys.yellow, g.run.player.keys.blue], [0, 1]);
  assert.equal(g.handRules.canAct("blueTrader"), false);
});

test("Forge gives a second key on a trade, and Master Smelter a third when the Forge does", () => {
  const forged = trading({ redTrader: { forge: 50 } }, { yellow: 0, blue: 3, red: 0 });
  forged.activation.actInPlace("redTrader");
  assert.equal(forged.run.player.keys.red, 2);
  const smelted = trading({ redTrader: { forge: 50, smelter: 50 } }, { yellow: 0, blue: 3, red: 0 });
  smelted.activation.actInPlace("redTrader");
  assert.equal(smelted.run.player.keys.red, 3);
  const plain = trading({ redTrader: { smelter: 50 } }, { yellow: 0, blue: 3, red: 0 });
  plain.activation.actInPlace("redTrader");
  assert.equal(plain.run.player.keys.red, 1, "no Forge, so no Smelter");
});

test("a trade's rolls are fixed by the run seed and use: undo can't roll them again", () => {
  const g = trading({ blueTrader: { forge: 25 } }, { yellow: 60, blue: 0, red: 0 });
  const got: number[] = [];
  for (let i = 0; i < 20; i++) {
    const before = g.run.player.keys.blue;
    g.activation.actInPlace("blueTrader");
    got.push(g.run.player.keys.blue - before);
  }
  assert.ok(got.includes(1) && got.includes(2), "a 50% Forge both hits and misses over 20 trades");
  // Each trade undone and made again gives what it gave.
  for (let i = 0; i < 20; i++) {
    const again = trading({ blueTrader: { forge: 25 } }, { yellow: 60, blue: 0, red: 0 });
    for (let j = 0; j < i; j++) again.activation.actInPlace("blueTrader");
    again.activation.actInPlace("blueTrader");
    assert.ok(again.undo());
    const before = again.run.player.keys.blue;
    again.activation.actInPlace("blueTrader");
    assert.equal(again.run.player.keys.blue - before, got[i], `trade ${i} again`);
  }
});

test("Free Utility gives a free Utility level for the run on a trade", () => {
  const g = trading({ blueTrader: { freeUtility: 100 } }, { yellow: 3, blue: 0, red: 0 });
  const utility = new Set(TRAINING.filter((row) => row.group === "utility").map((row) => row.id));
  g.activation.actInPlace("blueTrader");
  const given = Object.entries(g.run.training ?? {});
  assert.equal(given.length, 1);
  assert.ok(utility.has(given[0]![0] as never));
  assert.equal(given[0]![1], 1);
  assert.ok(g.freeTrained?.lines.length);
});

test("Extra Blue and Red Key give a key of their colour on each floor new to the run", () => {
  const g = trading({ blueTrader: { floorKey: 100 }, redTrader: { floorKey: 100 } }, { yellow: 0, blue: 0, red: 0 });
  g.advanceTowerRoom();
  assert.deepEqual([g.run.player.keys.blue, g.run.player.keys.red], [1, 1]);
  const none = trading({}, { yellow: 0, blue: 0, red: 0 });
  none.advanceTowerRoom();
  assert.deepEqual([none.run.player.keys.blue, none.run.player.keys.red], [0, 0]);
});
