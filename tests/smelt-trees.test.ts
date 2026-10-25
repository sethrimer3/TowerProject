import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { CARD_TREES, treeBonus, type CardTreeLevels } from "../src/cards/trees.ts";
import { TRAINING } from "../src/progression/training.ts";
import { playedSave } from "./first-skills.ts";

type Smelt = "keyToHp" | "smeltBlue" | "smeltRed";

/** A Tower run on seed 7 holding the smelts, whose hand's trees are
 * `trees`, the hero at 1 HP holding `keys`; undo owned. */
function smelting(trees: CardTreeLevels, keys: { yellow: number; blue: number; red: number }) {
  const save = playedSave();
  Object.assign(save.upgrades, { inspirationUndos: 1, loot: 1 });
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["keyToHp", "smeltBlue", "smeltRed"];
  g.run.cardTrees = trees;
  g.run.player.hp = 1;
  Object.assign(g.run.player.keys, keys);
  return g;
}

/** The Gold a smelt of `card` banks, under `trees`. */
function smeltGold(card: Smelt, trees: CardTreeLevels) {
  const g = smelting(trees, { yellow: 1, blue: 1, red: 1 }), before = g.save.gold;
  g.activation.actInPlace(card);
  return g.save.gold - before;
}

test("Smelt GK's, BK's and RK's trees: two tracks, each rising one rarity an upgrade", () => {
  const shape = (card: Smelt) => CARD_TREES[card]!.map((n) => `${n.id}:${n.rarity}:${n.levels}/${n.max}${n.after ? `<${n.after}` : ""}`);
  const expected = ["gold:common:5/10", "heal:uncommon:0/5<gold", "silver:rare:0/5<heal", "goldBonus:epic:0/5<silver", "free:legendary:0/5<goldBonus",
    "efficiency:common:5/10", "doorCost:uncommon:0/5<efficiency", "floorKey:rare:0/5<doorCost", "keySmelter:epic:0/5<floorKey", "master:legendary:0/5<keySmelter"];
  for (const card of ["keyToHp", "smeltBlue", "smeltRed"] as const) assert.deepEqual(shape(card), expected, card);
  const full = (card: Smelt) => Object.entries(treeBonus({ [card]: Object.fromEntries(CARD_TREES[card]!.map((n) => [n.id, 1])) })).filter(([, n]) => n);
  assert.deepEqual(full("keyToHp"), [["goldBonus", 1], ["yellowDoorCost", 1], ["yellowFloorKey", 1],
    ["yellowSmeltGold", 0.2], ["yellowSmeltHeal", 2], ["yellowSmeltSilver", 0.1], ["yellowSmeltFree", 2], ["yellowSmeltCost", 1], ["yellowSmeltMaster", 2], ["keySmelter", 2]]);
  assert.deepEqual(full("smeltBlue"), [["goldBonus", 2], ["blueDoorCost", 1], ["blueFloorKey", 1],
    ["blueSmeltGold", 0.4], ["blueSmeltHeal", 6], ["blueSmeltSilver", 0.2], ["blueSmeltFree", 2], ["blueSmeltCost", 1], ["blueSmeltMaster", 2], ["keySmelter", 2]]);
  assert.deepEqual(full("smeltRed"), [["goldBonus", 3], ["redDoorCost", 1], ["redFloorKey", 1],
    ["redSmeltGold", 0.6], ["redSmeltHeal", 18], ["redSmeltSilver", 0.3], ["redSmeltFree", 2], ["redSmeltCost", 1], ["redSmeltMaster", 2], ["keySmelter", 2]]);
  // Key Smelter is one stat every smelt tree adds to.
  assert.equal(treeBonus({ keyToHp: { keySmelter: 1 }, smeltRed: { keySmelter: 2 } }).keySmelter, 6);
});

test("Efficiency cuts the key a smelt takes: at 10%, 0.9 of a gold key", () => {
  const g = smelting({ keyToHp: { efficiency: 10 } }, { yellow: 0.9, blue: 0, red: 0 });
  assert.equal(g.handRules.smeltCost("keyToHp"), 0.9);
  assert.equal(g.handRules.smeltCost("smeltBlue"), 1, "Smelt BK's own Efficiency is its own");
  assert.ok(g.handRules.canAct("keyToHp"));
  g.activation.actInPlace("keyToHp");
  assert.equal(g.run.player.keys.yellow, 0);
  assert.equal(g.handRules.canAct("keyToHp"), false);
});

test("Smelt Heal raises the percent of max HP a smelt heals", () => {
  const g = smelting({ keyToHp: { heal: 5 }, smeltRed: { heal: 1 } }, { yellow: 1, blue: 0, red: 0 });
  assert.deepEqual([g.handRules.smeltPercent("keyToHp"), g.handRules.smeltPercent("smeltBlue"), g.handRules.smeltPercent("smeltRed")], [20, 30, 108]);
  const max = g.run.player.maxHp;
  g.activation.actInPlace("keyToHp");
  assert.equal(g.run.player.hp, 1 + (max * 20) / 100);
});

test("a smelt pays its tree's Gold and Silver, its Gold once a use whatever undo does", () => {
  const g = smelting({ keyToHp: { gold: 5, silver: 5 } }, { yellow: 2, blue: 0, red: 0 });
  const gold = g.save.gold, silver = g.run.silver ?? 0;
  g.activation.actInPlace("keyToHp");
  const paid = g.save.gold - gold;
  assert.ok(paid > 0, "Gold paid");
  assert.ok((g.run.silver ?? 0) > silver, "Silver found");
  assert.ok(g.undo());
  g.activation.actInPlace("keyToHp");
  assert.equal(g.save.gold - gold, paid, "the same smelt again pays no Gold twice");
  g.activation.actInPlace("keyToHp");
  assert.ok(g.save.gold - gold > paid, "the next smelt pays its own");
  assert.equal(smeltGold("keyToHp", {}), 0, "no Smelt Gold, no Gold");
});

test("Key Smelter doubles a smelt's Gold, its Master Smelter triples it, and both six times over", () => {
  const plain = smeltGold("smeltBlue", { smeltBlue: { gold: 5 } });
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
  near(smeltGold("smeltBlue", { smeltBlue: { gold: 5 }, keyToHp: { keySmelter: 50 } }), plain * 2);
  near(smeltGold("smeltBlue", { smeltBlue: { gold: 5, master: 50 } }), plain * 3);
  near(smeltGold("smeltBlue", { smeltBlue: { gold: 5, master: 50, keySmelter: 50 } }), plain * 6);
  near(smeltGold("smeltBlue", { smeltBlue: { gold: 5 }, smeltRed: { master: 50 } }), plain);
});

test("a smelt's rolls are fixed by the run seed and use: undo can't roll them again", () => {
  const trees = { keyToHp: { free: 25 } };
  const given = (g: Game) => Object.values(g.run.training ?? {}).reduce((a, n) => a + n, 0);
  const got: number[] = [];
  const g = smelting(trees, { yellow: 20, blue: 0, red: 0 });
  for (let i = 0; i < 20; i++) {
    const before = given(g);
    g.run.player.hp = 1;
    g.activation.actInPlace("keyToHp");
    got.push(given(g) - before);
  }
  assert.ok(got.includes(0) && got.includes(1), "a 50% Free Defense both hits and misses over 20 smelts");
  for (let i = 0; i < 20; i++) {
    const again = smelting(trees, { yellow: 20, blue: 0, red: 0 });
    for (let j = 0; j < i; j++) again.activation.actInPlace("keyToHp");
    again.run.player.hp = 1;
    again.activation.actInPlace("keyToHp");
    assert.ok(again.undo());
    const before = given(again);
    again.activation.actInPlace("keyToHp");
    assert.equal(given(again) - before, got[i], `smelt ${i} again`);
  }
});

test("Smelt Free gives Smelt GK a Defense level, Smelt BK an Offense one, and Smelt RK one of each group", () => {
  const group = (id: string) => TRAINING.find((row) => row.id === id)!.group;
  const groups = (card: Smelt) => {
    const g = smelting({ [card]: { free: 50 } }, { yellow: 1, blue: 1, red: 1 });
    g.activation.actInPlace(card);
    assert.ok(g.freeTrained?.lines.length);
    return Object.keys(g.run.training ?? {}).map(group).sort();
  };
  assert.deepEqual(groups("keyToHp"), ["defense"]);
  assert.deepEqual(groups("smeltBlue"), ["offense"]);
  assert.deepEqual(groups("smeltRed"), ["defense", "offense", "utility"]);
});

test("Extra Gold Key gives a gold key on each floor new to the run", () => {
  const g = smelting({ keyToHp: { floorKey: 100 } }, { yellow: 0, blue: 0, red: 0 });
  const none = smelting({}, { yellow: 0, blue: 0, red: 0 });
  g.advanceTowerRoom();
  none.advanceTowerRoom();
  assert.equal(g.run.player.keys.yellow, none.run.player.keys.yellow + 1);
  assert.equal(g.run.player.keys.blue, 0);
});

test("a smelt's text names the key it takes and the HP it heals", () => {
  const g = smelting({}, { yellow: 0, blue: 0, red: 0 });
  assert.equal(g.cardText("keyToHp"), "Trade a gold key for 10% of your max HP, without moving, healing past max HP up to your Overheal ceiling. Skipped without a gold key, or while the whole heal wouldn't fit under that ceiling.");
  g.run.cardTrees = { smeltRed: { efficiency: 10, heal: 1 } };
  assert.equal(g.cardText("smeltRed"), "Trade 0.9 of a red key for 108% of your max HP, without moving, healing past max HP up to your Overheal ceiling. Skipped with less than 0.9 of a red key, or while the whole heal wouldn't fit under that ceiling.");
});
