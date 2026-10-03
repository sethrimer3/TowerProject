import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { CHECKPOINTS, PASSES, canWarp, decodeGoals, floorsCompleted, goalState, goalUnlocked, passFor, passTotals, warpUnlocked } from "../src/goals.ts";
import { TIERS } from "../src/tiers.ts";

test("every tower has a checkpoint each ten floors to 100; Tower I's first three unlock Combat Forecast, Attack Lore and Warp", () => {
  for (let tower = 1; tower <= TIERS; tower++) {
    assert.deepEqual(CHECKPOINTS[tower]!.map((c) => c.floor), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  }
  const gems = (amount: number) => ({ kind: "currency", currency: "gems", amount });
  assert.deepEqual(CHECKPOINTS[1]!.slice(0, 3), [
    { floor: 10, reward: { kind: "unlock", unlock: "combatForecast" }, premium: gems(15) },
    { floor: 20, reward: { kind: "unlock", unlock: "attackLore" }, premium: gems(25) },
    { floor: 30, reward: { kind: "unlock", unlock: "warp" }, premium: gems(35) },
  ]);
  // The stubs: 100 Gold × checkpoint × tower, 10 Gems × checkpoint.
  assert.deepEqual(CHECKPOINTS[3]![1], { floor: 20, reward: { kind: "currency", currency: "gold", amount: 600 }, premium: { kind: "currency", currency: "gems", amount: 20 } });
});

test("each pass covers three towers and totals its premium rewards", () => {
  assert.deepEqual(PASSES.map((p) => [p.towers, p.label]), [[[1, 2, 3], "$9.99"], [[4, 5, 6], "$19.99"], [[7, 8, 9], "$29.99"]]);
  assert.equal(passFor(5).n, 2);
  // Tower I's first three premiums pay 15, 25 and 35 Gems; the others 10 × n.
  assert.deepEqual(passTotals(PASSES[0]!), { gems: 3 * 550 - 60 + 75 });
  assert.deepEqual(passTotals(PASSES[2]!), { gems: 3 * 550 });
});

test("a reward is claimed once, after its floor is completed; a premium one needs the pass", () => {
  const g = new Game(defaults());
  const save = g.save;
  assert.equal(floorsCompleted(save, 1), 0, "a tower not yet climbed has no floor completed");
  assert.equal(goalState(save, 1, 40, false), "locked");
  assert.equal(g.claimGoal(1, 40, false), null);
  save.tower.reached = 39; // standing on floor 40: not completed yet
  assert.equal(floorsCompleted(save, 1), 39);
  assert.equal(goalState(save, 1, 40, false), "locked");
  save.tower.reached = 44; // floor 45 reached: floors 1 to 44 completed
  assert.equal(floorsCompleted(save, 1), 44);
  assert.equal(goalState(save, 1, 40, false), "ready");
  const gold = save.gold;
  assert.deepEqual(g.claimGoal(1, 40, false), { kind: "currency", currency: "gold", amount: 400 });
  assert.equal(save.gold, gold + 400);
  assert.equal(goalState(save, 1, 40, false), "claimed");
  assert.equal(g.claimGoal(1, 40, false), null, "never twice");
  assert.equal(goalState(save, 1, 40, true), "needsPass");
  assert.equal(g.claimGoal(1, 40, true), null);
  assert.equal(g.buyOffer("pass1", 0, true), null);
  assert.equal(goalState(save, 1, 40, true), "ready");
  assert.equal(goalState(save, 4, 40, true), "needsPass", "the first pass opens only Towers I to III");
  const gems = save.gems;
  g.claimGoal(1, 40, true);
  assert.equal(save.gems, gems + 40);
  assert.equal(goalState(save, 1, 50, true), "locked");
  // Claims and the pass survive a reload; erasing progress keeps only the pass.
  const loaded = decode(JSON.stringify(save));
  assert.deepEqual(loaded.goals, { claimed: { "1": [40] }, premium: { "1": [40] } });
  g.eraseAll();
  assert.deepEqual(g.save.goals, { claimed: {}, premium: {} });
  assert.equal(goalState(g.save, 1, 10, true), "locked");
});

test("Warp, once claimed, starts a run at once just above a reached checkpoint; entering starts on floor 1", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.tower.reached = 34;
  assert.equal(warpUnlocked(g.save), false);
  assert.equal(canWarp(g.save, 1, 30), false, "not before Warp is claimed");
  assert.equal(g.warp(1, 20), false);
  g.claimGoal(1, 10, false);
  assert.equal(warpUnlocked(g.save), false, "floor 10 unlocks Combat Forecast");
  assert.ok(goalUnlocked(g.save, "combatForecast"));
  g.claimGoal(1, 30, false);
  assert.ok(warpUnlocked(g.save));
  assert.equal(canWarp(g.save, 1, 40), false, "not past the highest floor completed");
  assert.ok(g.warp(1, 30));
  assert.ok(!g.run.outside);
  assert.equal(g.run.height, 30);
  assert.equal(g.run.player.hp, g.run.player.maxHp);
  assert.equal(g.warp(1, 20), false, "only from the forest");
  g.newRun({ outside: true });
  assert.equal(g.run.height, 0);
  g.enterRun();
  assert.equal(g.run.height, 0);
});

test("Warp into another open tower selects it first", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.tower.reached = 29;
  assert.equal(g.claimGoal(1, 30, false), null, "floor 30 isn't completed until floor 31 is reached");
  g.save.tower.reached = 30;
  assert.ok(g.claimGoal(1, 30, false));
  g.save.tower.tiersOpen = 2;
  g.save.tower.tierRecords["2"] = { best: 12, reached: 12, log: {} };
  assert.equal(floorsCompleted(g.save, 2), 12);
  assert.ok(g.warp(2, 10));
  assert.equal(g.save.tower.tier, 2);
  assert.equal(g.run.tier, 2);
  assert.equal(g.run.height, 10);
});

test("decoding keeps known towers' checkpoint floors, each once", () => {
  assert.deepEqual(decodeGoals({ claimed: { "1": [20, 10, 10, 15, "x"], "0": [10], "10": [10] }, premium: { "2": [100], "3": "x" } }), {
    claimed: { "1": [10, 20] },
    premium: { "2": [100] },
  });
  assert.deepEqual(decodeGoals(null), { claimed: {}, premium: {} });
});
