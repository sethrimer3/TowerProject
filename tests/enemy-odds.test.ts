import { test } from "node:test";
import assert from "node:assert/strict";
import { strengthOdds, traitOdds, type OddsSource } from "../src/enemy-odds.ts";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import type { Enemy, EnemyStrength } from "../src/entities.ts";
import type { TowerRun } from "../src/runs.ts";

const source = (tier: number, floor: number, greaterBoss = false): OddsSource => ({
  tier, floor, greaterBoss,
  enemy: (strength: EnemyStrength): Enemy => ({ name: "Slime", hp: 10, attack: 2, defense: 1, tier: 1, strength }),
  gold: () => 1,
});
const chances = (s: OddsSource) => strengthOdds(s).map((r) => [r.strength, r.chance]);

test("a floor's strengths come with the schedule's shares, and the boss at 0% off its floors", () => {
  assert.deepEqual(chances(source(1, 0)), [["weak", 40], ["normal", 60], ["boss", 0]]);
  assert.deepEqual(chances(source(1, 9)), [["weak", 40], ["normal", 60], ["boss", 100]], "every tenth floor a boss guards");
  assert.deepEqual(chances(source(1, 100)), [["weak", 36], ["normal", 40], ["strong", 20], ["elite", 4], ["boss", 0]]);
  assert.deepEqual(chances(source(1, 19, true)), [["weak", 40], ["normal", 40], ["strong", 20], ["boss", 100], ["greaterBoss", 100]], "a Greater Boss present after the boss");
});

test("a floor's traits leave out those at 0%, and Aggroed shows at 0% wherever Flying enemies stand", () => {
  assert.deepEqual(traitOdds(1, 0), []);
  assert.deepEqual(traitOdds(2, 0), [{ trait: "fast", chance: 12 }]);
  assert.deepEqual(traitOdds(4, 0), [
    { trait: "fast", chance: 13.5 },
    { trait: "ranged", chance: 12, attackSpeed: 1 },
    { trait: "shielded", chance: 4.004 },
  ]);
  const five = traitOdds(5, 0);
  assert.deepEqual(five.map((r) => r.trait), ["fast", "ranged", "shielded", "flying", "aggroed"]);
  assert.equal(five[3]!.chance, 12.75);
  assert.equal(five[0]!.chance, 12.433125, "Fast rolls only enemies that didn't fly");
  assert.deepEqual(five[4], { trait: "aggroed", chance: 0, moveSpeed: 1 });
  assert.equal(traitOdds(5, 2500)[1]!.attackSpeed, 2, "a shot every 5 turns by floor 2,501");
});

test("the game reads the floor the hero stands on, its enemies as the board makes them", () => {
  const g = new Game(defaults());
  g.newRun({ seed: 5 });
  const odds = g.enemyOdds!;
  assert.equal(odds.floor, 0);
  const base = odds.strengths.find((r) => r.strength === "normal")!, enemy = g.world.typicalEnemy!(0);
  assert.deepEqual([base.hp, base.attack, base.defense], [enemy.hp, enemy.attack, enemy.defense]);
  assert.ok(base.gold > 0);
  assert.equal(odds.strengths.some((r) => r.strength === "greaterBoss"), false);
  (g.run as TowerRun).summoned = [0];
  assert.deepEqual(g.enemyOdds!.strengths.at(-1)!.strength, "greaterBoss");
  g.newRun({ outside: true });
  assert.equal(g.enemyOdds, null, "none in the forest");
});
