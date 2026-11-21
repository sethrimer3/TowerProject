import { givePowers, type GivenPowers } from "./powers-helper.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { powerBonus } from "../src/cards/powers.ts";
import { TRAINING } from "../src/progression/training.ts";
import { playedSave } from "./first-skills.ts";

type Smelt = "keyToHp" | "smeltBlue" | "smeltRed";

/** A Tower run on seed 7 holding the smelts, whose hand's trees are
 * `trees`, the hero at 1 HP holding `keys`; undo owned. */
function smelting(trees: GivenPowers, keys: { yellow: number; blue: number; red: number }) {
  const save = playedSave();
  Object.assign(save.upgrades, { loot: 1 });
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["keyToHp", "smeltBlue", "smeltRed"];
  g.run.handLevels = givePowers(trees);
  g.run.player.hp = 1;
  Object.assign(g.run.player.keys, keys);
  return g;
}

/** The Gold a smelt of `card` banks, under `trees`. */
function smeltGold(card: Smelt, trees: GivenPowers) {
  const g = smelting(trees, { yellow: 1, blue: 1, red: 1 }), before = g.save.gold;
  g.activation.actInPlace(card);
  return g.save.gold - before;
}

test("Efficiency cuts the key a smelt takes: at 10%, 0.9 of a gold key", () => {
  const g = smelting({ keyToHp: { yellowSmeltCost: 10 } }, { yellow: 0.9, blue: 0, red: 0 });
  assert.equal(g.handRules.smeltCost("keyToHp"), 0.9);
  assert.equal(g.handRules.smeltCost("smeltBlue"), 1, "Smelt BK's own Efficiency is its own");
  assert.ok(g.handRules.canAct("keyToHp"));
  g.activation.actInPlace("keyToHp");
  assert.equal(g.run.player.keys.yellow, 0);
  assert.equal(g.handRules.canAct("keyToHp"), false);
});

test("Smelt Heal raises the percent of max HP a smelt heals", () => {
  const g = smelting({ keyToHp: { yellowSmeltHeal: 10 }, smeltRed: { redSmeltHeal: 18 } }, { yellow: 1, blue: 0, red: 0 });
  assert.deepEqual([g.handRules.smeltPercent("keyToHp"), g.handRules.smeltPercent("smeltBlue"), g.handRules.smeltPercent("smeltRed")], [20, 30, 108]);
  const max = g.run.player.maxHp;
  g.activation.actInPlace("keyToHp");
  assert.equal(g.run.player.hp, 1 + (max * 20) / 100);
});

test("a smelt pays its tree's Gold and Silver, its Gold once a use", () => {
  const g = smelting({ keyToHp: { yellowSmeltGold: 1, yellowSmeltSilver: 0.5 } }, { yellow: 2, blue: 0, red: 0 });
  const gold = g.save.gold, silver = g.run.silver ?? 0;
  g.activation.actInPlace("keyToHp");
  const paid = g.save.gold - gold;
  assert.ok(paid > 0, "Gold paid");
  assert.ok((g.run.silver ?? 0) > silver, "Silver found");
  g.activation.actInPlace("keyToHp");
  assert.ok(g.save.gold - gold > paid, "the next smelt pays its own");
});

test("each smelt pays its own Gold, 2, 4 or 8, and its tree's Smelt Gold adds to it", () => {
  assert.deepEqual([smeltGold("keyToHp", {}), smeltGold("smeltBlue", {}), smeltGold("smeltRed", {})], [2, 4, 8]);
  assert.equal(smeltGold("keyToHp", { keyToHp: { yellowSmeltGold: 1 } }), 3, "five levels of +0.2");
  const g = smelting({ smeltRed: { redSmeltGold: 3 } }, { yellow: 0, blue: 0, red: 0 });
  assert.deepEqual([g.handRules.smeltGold("keyToHp"), g.handRules.smeltGold("smeltRed")], [2, 11]);
});

test("Key Smelter doubles a smelt's Gold, its Master Smelter triples it, and both six times over", () => {
  const plain = smeltGold("smeltBlue", { smeltBlue: { blueSmeltGold: 2 } });
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
  near(smeltGold("smeltBlue", { smeltBlue: { blueSmeltGold: 2 }, keyToHp: { keySmelter: 100 } }), plain * 2);
  near(smeltGold("smeltBlue", { smeltBlue: { blueSmeltGold: 2, blueSmeltMaster: 100 } }), plain * 3);
  near(smeltGold("smeltBlue", { smeltBlue: { blueSmeltGold: 2, blueSmeltMaster: 100, keySmelter: 100 } }), plain * 6);
  near(smeltGold("smeltBlue", { smeltBlue: { blueSmeltGold: 2 }, smeltRed: { redSmeltMaster: 100 } }), plain);
});

test("a smelt's rolls are fixed by the run seed and use", () => {
  const trees = { keyToHp: { yellowSmeltFree: 50 } };
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
    for (let j = 0; j < i; j++) {
      again.run.player.hp = 1;
      again.activation.actInPlace("keyToHp");
    }
    again.run.player.hp = 1;
    const before = given(again);
    again.activation.actInPlace("keyToHp");
    assert.equal(given(again) - before, got[i], `smelt ${i} again`);
  }
});

test("Smelt Free gives Smelt GK a Defense level, Smelt BK an Offense one, and Smelt RK one of each group", () => {
  const group = (id: string) => TRAINING.find((row) => row.id === id)!.group;
  const groups = (card: Smelt) => {
    const color = ({ keyToHp: "yellow", smeltBlue: "blue", smeltRed: "red" } as const)[card];
    const g = smelting({ [card]: { [`${color}SmeltFree`]: 100 } }, { yellow: 1, blue: 1, red: 1 });
    g.activation.actInPlace(card);
    assert.ok(g.freeTrained?.lines.length);
    return Object.keys(g.run.training ?? {}).map(group).sort();
  };
  assert.deepEqual(groups("keyToHp"), ["defense"]);
  assert.deepEqual(groups("smeltBlue"), ["offense"]);
  assert.deepEqual(groups("smeltRed"), ["defense", "offense", "utility"]);
});

test("Extra Gold Key gives a gold key on each floor new to the run", () => {
  const g = smelting({ keyToHp: { yellowFloorKey: 100 } }, { yellow: 0, blue: 0, red: 0 });
  const none = smelting({}, { yellow: 0, blue: 0, red: 0 });
  g.advanceTowerRoom();
  none.advanceTowerRoom();
  assert.equal(g.run.player.keys.yellow, none.run.player.keys.yellow + 1);
  assert.equal(g.run.player.keys.blue, 0);
});

test("a smelt's text names the key it takes, the HP it heals and the Gold it pays", () => {
  const g = smelting({}, { yellow: 0, blue: 0, red: 0 });
  assert.equal(g.cardText("keyToHp"), "Trade a gold key for 10% of your max HP and 2 Gold, without moving, healing past max HP up to your Overheal ceiling. Skipped without a gold key, or while the whole heal wouldn't fit under that ceiling.");
  g.run.handLevels = givePowers({ smeltRed: { redSmeltCost: 10, redSmeltHeal: 18, redSmeltGold: 3 } });
  assert.equal(g.cardText("smeltRed"), "Trade 0.9 of a red key for 108% of your max HP and 11 Gold, without moving, healing past max HP up to your Overheal ceiling. Skipped with less than 0.9 of a red key, or while the whole heal wouldn't fit under that ceiling.");
});
