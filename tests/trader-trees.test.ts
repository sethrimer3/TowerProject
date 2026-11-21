import { givePowers, type GivenPowers } from "./powers-helper.ts";
import { CARD_LEVEL_XP } from "../src/cards/levels.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { powerBonus } from "../src/cards/powers.ts";
import { TRAINING } from "../src/progression/training.ts";
import { playedSave } from "./first-skills.ts";

/** A Tower run on seed 7 holding the traders, whose hand's trees are
 * `trees`, the hero holding `keys`; undo owned, and Gold Bonus open to
 * train. */
function trading(trees: GivenPowers, keys: { yellow: number; blue: number; red: number }) {
  const save = playedSave();
  Object.assign(save.upgrades, { loot: 1 });
  const g = new Game(save);
  g.newRun({ seed: 7 });
  g.run.hand = ["blueTrader", "redTrader"];
  g.run.handLevels = givePowers(trees);
  Object.assign(g.run.player.keys, keys);
  return g;
}

test("Efficiency cuts the keys a trade takes: at 10%, 2.7 gold keys for a blue key", () => {
  const g = trading({ blueTrader: { blueTradeCost: 10 } }, { yellow: 2.7, blue: 0, red: 0 });
  assert.equal(g.handRules.tradeCost("blueTrader"), 2.7);
  assert.equal(g.handRules.tradeCost("redTrader"), 3, "BK -> RK's own Efficiency is its own");
  assert.ok(g.handRules.canAct("blueTrader"));
  g.activation.actInPlace("blueTrader");
  assert.deepEqual([g.run.player.keys.yellow, g.run.player.keys.blue], [0, 1]);
  assert.equal(g.handRules.canAct("blueTrader"), false);
});

test("Forge gives a second key on a trade, and Master Smelter a third when the Forge does", () => {
  const forged = trading({ redTrader: { redForge: 100 } }, { yellow: 0, blue: 3, red: 0 });
  forged.activation.actInPlace("redTrader");
  assert.equal(forged.run.player.keys.red, 2);
  const smelted = trading({ redTrader: { redForge: 100, redSmelter: 100 } }, { yellow: 0, blue: 3, red: 0 });
  smelted.activation.actInPlace("redTrader");
  assert.equal(smelted.run.player.keys.red, 3);
  const plain = trading({ redTrader: { redSmelter: 100 } }, { yellow: 0, blue: 3, red: 0 });
  plain.activation.actInPlace("redTrader");
  assert.equal(plain.run.player.keys.red, 1, "no Forge, so no Smelter");
});

test("a trade's rolls are fixed by the run seed and use", () => {
  const g = trading({ blueTrader: { blueForge: 50 } }, { yellow: 60, blue: 0, red: 0 });
  const got: number[] = [];
  for (let i = 0; i < 20; i++) {
    const before = g.run.player.keys.blue;
    g.activation.actInPlace("blueTrader");
    got.push(g.run.player.keys.blue - before);
  }
  assert.ok(got.includes(1) && got.includes(2), "a 50% Forge both hits and misses over 20 trades");
  // Each trade made again in the same run gives what it gave.
  for (let i = 0; i < 20; i++) {
    const again = trading({ blueTrader: { blueForge: 50 } }, { yellow: 60, blue: 0, red: 0 });
    for (let j = 0; j < i; j++) again.activation.actInPlace("blueTrader");
    const before = again.run.player.keys.blue;
    again.activation.actInPlace("blueTrader");
    assert.equal(again.run.player.keys.blue - before, got[i], `trade ${i} again`);
  }
});

test("Free Utility gives a free Utility level for the run on a trade", () => {
  const g = trading({ blueTrader: { blueTradeFreeUtility: 100 } }, { yellow: 3, blue: 0, red: 0 });
  const utility = new Set(TRAINING.filter((row) => row.group === "utility").map((row) => row.id));
  g.activation.actInPlace("blueTrader");
  const given = Object.entries(g.run.training ?? {});
  assert.equal(given.length, 1);
  assert.ok(utility.has(given[0]![0] as never));
  assert.equal(given[0]![1], 1);
  assert.ok(g.freeTrained?.lines.length);
});

test("Extra Blue and Red Key give a key of their colour on each floor new to the run", () => {
  const g = trading({ blueTrader: { blueFloorKey: 100 }, redTrader: { redFloorKey: 100 } }, { yellow: 0, blue: 0, red: 0 });
  g.advanceTowerRoom();
  assert.deepEqual([g.run.player.keys.blue, g.run.player.keys.red], [1, 1]);
  const none = trading({}, { yellow: 0, blue: 0, red: 0 });
  none.advanceTowerRoom();
  assert.deepEqual([none.run.player.keys.blue, none.run.player.keys.red], [0, 0]);
});

test("a trader's text names the keys a trade takes: in the forest by the saved trees, inside by the run's", () => {
  const g = trading({}, { yellow: 0, blue: 0, red: 0 });
  assert.equal(g.cardText("blueTrader"), "Trade 3 gold keys for a blue key, without moving. Skipped with fewer than 3 gold keys.");
  g.run.handLevels = givePowers({ blueTrader: { blueTradeCost: 10 }, redTrader: { redTradeCost: 5 } });
  assert.equal(g.cardText("blueTrader"), "Trade 2.7 gold keys for a blue key, without moving. Skipped with fewer than 2.7 gold keys.");
  assert.equal(g.cardText("redTrader"), "Trade 2.85 blue keys for a red key, without moving. Skipped with fewer than 2.85 blue keys.");
  const forest = new Game(playedSave());
  forest.newRun({ outside: true });
  // Level 14: four levels of its uncommon Keys per trade, 1% each.
  forest.save.cardAscension.blueTrader = 1;
  forest.save.cardXp.blueTrader = CARD_LEVEL_XP.slice(0, 14).reduce((a, b) => a + b, 0);
  assert.ok(forest.run.outside);
  assert.equal(forest.cardText("blueTrader"), "Trade 2.88 gold keys for a blue key, without moving. Skipped with fewer than 2.88 gold keys.");
});
