import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";
import { CHECKPOINTS, PASSES, canWarp, decodeGoals, floorsCompleted, goalState, goalsWaiting, goalUnlocked, passFor, passTotals, unlockFloor, warpUnlocked } from "../src/goals.ts";
import { TIERS } from "../src/tiers.ts";

test("every tower has a checkpoint each ten floors to 100; Tower I's first six unlock Damage Prediction, Combat Forecast, Attack Lore, Warp, Damage Visual and Equipment", () => {
  for (let tower = 1; tower <= TIERS; tower++) {
    assert.deepEqual(CHECKPOINTS[tower]!.map((c) => c.floor), [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  }
  const gems = (amount: number) => ({ kind: "currency", currency: "gems", amount });
  assert.deepEqual(CHECKPOINTS[1]!.slice(0, 6), [
    { floor: 10, reward: { kind: "unlock", unlock: "damagePrediction" }, premium: gems(10) },
    { floor: 20, reward: { kind: "unlock", unlock: "combatForecast" }, premium: gems(15) },
    { floor: 30, reward: { kind: "unlock", unlock: "attackLore" }, premium: gems(25) },
    { floor: 40, reward: { kind: "unlock", unlock: "warp" }, premium: gems(35) },
    { floor: 50, reward: { kind: "unlock", unlock: "damageVisual" }, premium: gems(50) },
    { floor: 60, reward: { kind: "unlock", unlock: "equipment" }, premium: gems(60) },
  ]);
  assert.deepEqual(CHECKPOINTS[2]![0], { floor: 10, reward: { kind: "unlock", unlock: "relativeDamageColor" }, premium: gems(10) });
  // The stubs: 100 Gold × checkpoint × tower, 10 Gems × checkpoint.
  assert.deepEqual(CHECKPOINTS[3]![1], { floor: 20, reward: { kind: "currency", currency: "gold", amount: 600 }, premium: { kind: "currency", currency: "gems", amount: 20 } });
  // Floor 100 opens the next tower, in every tower but the last.
  for (let tower = 1; tower < TIERS; tower++)
    assert.deepEqual(CHECKPOINTS[tower]![9], { floor: 100, reward: { kind: "tower", tower: tower + 1 }, premium: gems(100) });
  assert.deepEqual(CHECKPOINTS[TIERS]![9]!.reward, { kind: "currency", currency: "gold", amount: 1000 * TIERS });
});

test("claiming floor 100's goal opens the next tower and its cave; an older tower's claim closes nothing", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.tower.reached = 99;
  assert.equal(g.claimGoal(1, 100, false), null, "not before floor 101 is reached: its boss beaten");
  g.save.tower.reached = 100;
  assert.deepEqual(g.claimGoal(1, 100, false), { kind: "tower", tower: 2 });
  assert.deepEqual([g.save.tower.tiersOpen, g.save.delve.tiersOpen], [2, 2]);
  assert.ok(g.selectTier(2));
  g.save.tower.tiersOpen = 4;
  g.save.tower.reached = 100;
  assert.ok(g.claimGoal(2, 100, false));
  assert.deepEqual([g.save.tower.tiersOpen, g.save.delve.tiersOpen], [4, 4], "Tower III was open already");
});

test("Relative Damage Color is owned once Tower II's floor 10 is claimed", () => {
  const g = new Game(defaults());
  g.save.tower.tiersOpen = 2;
  g.save.tower.tierRecords["2"] = { best: 10, reached: 10 };
  assert.equal(goalUnlocked(g.save, "relativeDamageColor"), false);
  assert.equal(unlockFloor("relativeDamageColor"), 10);
  assert.ok(g.claimGoal(2, 10, false));
  assert.ok(goalUnlocked(g.save, "relativeDamageColor"));
  assert.equal(goalUnlocked(g.save, "damagePrediction"), false, "Tower I's floor 10 is its own");
});

test("each pass covers three towers and totals its premium rewards", () => {
  assert.deepEqual(PASSES.map((p) => [p.towers, p.label]), [[[1, 2, 3], "$9.99"], [[4, 5, 6], "$19.99"], [[7, 8, 9], "$29.99"]]);
  assert.equal(passFor(5).n, 2);
  // Tower I's first four premiums pay 10, 15, 25 and 35 Gems; the others 10 × n.
  assert.deepEqual(passTotals(PASSES[0]!), { gems: 3 * 550 - 100 + 85 });
  assert.deepEqual(passTotals(PASSES[2]!), { gems: 3 * 550 });
});

test("a reward is claimed once, after its floor is completed; a premium one needs the pass", () => {
  const g = new Game(defaults());
  const save = g.save;
  assert.equal(floorsCompleted(save, 1), 0, "a tower not yet climbed has no floor completed");
  assert.equal(goalState(save, 1, 70, false), "locked");
  assert.equal(g.claimGoal(1, 70, false), null);
  save.tower.reached = 69; // standing on floor 70: not completed yet
  assert.equal(floorsCompleted(save, 1), 69);
  assert.equal(goalState(save, 1, 70, false), "locked");
  save.tower.reached = 74; // floor 75 reached: floors 1 to 74 completed
  assert.equal(floorsCompleted(save, 1), 74);
  assert.equal(goalState(save, 1, 70, false), "ready");
  const gold = save.gold;
  assert.deepEqual(g.claimGoal(1, 70, false), { kind: "currency", currency: "gold", amount: 700 });
  assert.equal(save.gold, gold + 700);
  assert.equal(goalState(save, 1, 70, false), "claimed");
  assert.equal(g.claimGoal(1, 70, false), null, "never twice");
  assert.equal(goalState(save, 1, 70, true), "needsPass");
  assert.equal(g.claimGoal(1, 70, true), null);
  assert.equal(g.buyOffer("pass1", 0, true), null);
  assert.equal(goalState(save, 1, 70, true), "ready");
  assert.equal(goalState(save, 4, 70, true), "needsPass", "the first pass opens only Towers I to III");
  const gems = save.gems;
  g.claimGoal(1, 70, true);
  assert.equal(save.gems, gems + 70);
  assert.equal(goalState(save, 1, 80, true), "locked");
  // Claims and the pass survive a reload; erasing progress keeps only the pass.
  const loaded = decode(JSON.stringify(save));
  assert.deepEqual(loaded.goals, { claimed: { "1": [70] }, premium: { "1": [70] }, mastered: {}, cleared: {} });
  g.eraseAll();
  assert.deepEqual(g.save.goals, { claimed: {}, premium: {}, mastered: {}, cleared: {} });
  assert.equal(goalState(g.save, 1, 10, true), "locked");
});

test("Warp, once claimed, starts a run at once just above a mastered checkpoint; entering starts on floor 1", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true });
  g.save.tower.reached = 44;
  assert.equal(warpUnlocked(g.save), false);
  assert.equal(canWarp(g.save, 1, 30), false, "not before Warp is claimed");
  assert.equal(g.warp(1, 20), false);
  g.claimGoal(1, 10, false);
  assert.equal(warpUnlocked(g.save), false, "floor 10 unlocks Damage Prediction");
  assert.ok(goalUnlocked(g.save, "damagePrediction"));
  g.claimGoal(1, 40, false);
  assert.ok(warpUnlocked(g.save));
  assert.equal(canWarp(g.save, 1, 40), false, "not before its area is mastered");
  g.save.goals.mastered[1] = [40];
  assert.ok(g.warp(1, 40));
  assert.ok(!g.run.outside);
  assert.equal(g.run.height, 40);
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
  g.save.tower.reached = 39;
  assert.equal(g.claimGoal(1, 40, false), null, "floor 40 isn't completed until floor 41 is reached");
  g.save.tower.reached = 40;
  assert.ok(g.claimGoal(1, 40, false));
  g.save.tower.tiersOpen = 2;
  g.save.tower.tierRecords["2"] = { best: 12, reached: 12 };
  assert.equal(floorsCompleted(g.save, 2), 12);
  g.save.goals.mastered[2] = [10];
  assert.ok(g.warp(2, 10));
  assert.equal(g.save.tower.tier, 2);
  assert.equal(g.run.tier, 2);
  assert.equal(g.run.height, 10);
});

test("decoding keeps known towers' checkpoint floors, each once", () => {
  assert.deepEqual(decodeGoals({ claimed: { "1": [20, 10, 10, 15, "x"], "0": [10], "10": [10] }, premium: { "2": [100], "3": "x" } }), {
    claimed: { "1": [10, 20] },
    premium: { "2": [100] },
    mastered: {},
    cleared: {},
  });
  assert.deepEqual(decodeGoals(null), { claimed: {}, premium: {}, mastered: {}, cleared: {} });
});

test("the Goals button's dot shows while a reward in an open tower waits to be claimed", () => {
  const g = new Game(defaults());
  assert.equal(goalsWaiting(g.save), false);
  g.save.tower.reached = 10;
  assert.equal(goalsWaiting(g.save), true, "floor 10's reward is ready");
  assert.ok(g.claimGoal(1, 10, false));
  assert.equal(goalsWaiting(g.save), false, "a premium reward without the pass doesn't count");
  g.save.tower.tierRecords[2] = { ...g.save.tower.tierRecords[2], reached: 20 } as never;
  assert.equal(goalsWaiting(g.save), false, "nor one in a tower not yet open");
  g.save.tower.tiersOpen = 2;
  assert.equal(goalsWaiting(g.save), true, "a tower opened brings its own");
});
