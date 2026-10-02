import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTACK_SHARD, DEFENSE_SHARD, POTION_HEAL, resolveStep, type StepEffect, type StepRules } from "../src/step-effects.ts";
import type { Player, Tile } from "../src/entities.ts";

const player = (over: Partial<Player> = {}): Player => ({
  x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 2, keys: { yellow: 1, blue: 0, red: 2 }, ...over,
});
const effect = (p: Player, t: Tile, rules?: StepRules) => {
  const outcome = resolveStep(p, t, rules);
  assert.equal(outcome.blocked, undefined);
  return outcome as StepEffect;
};

test("pickups grant their documented amounts", () => {
  assert.equal(effect(player(), { kind: "attack" }).player.attack, 10 + ATTACK_SHARD);
  assert.equal(effect(player(), { kind: "defense" }).player.defense, 2 + DEFENSE_SHARD);
  assert.equal(effect(player(), { kind: "key", color: "blue" }).player.keys.blue, 1);
  const potion = effect(player(), { kind: "potion" });
  assert.equal(potion.healed, POTION_HEAL);
  assert.equal(potion.player.hp, 50 + POTION_HEAL);
});

test("Potion HP research scales every potion but the red (percent) one, fractions kept", () => {
  const rules = { potionHeal: 130, percentPotion: 0 };
  const hurt = player({ hp: 1, maxHp: 500 });
  assert.equal(effect(hurt, { kind: "potion" }, rules).healed, 45.5, "35 × 1.3");
  assert.equal(effect(hurt, { kind: "potion", color: "blue" }, rules).healed, 45.5);
  assert.equal(effect(hurt, { kind: "potion", amount: 60 }, rules).healed, 78);
  assert.equal(effect(hurt, { kind: "potion", color: "red" }, rules).healed, POTION_HEAL);
  assert.equal(effect(hurt, { kind: "potion" }, { potionHeal: 400, percentPotion: 0 }).healed, 140);
  assert.equal(effect(player({ hp: 90 }), { kind: "potion" }, rules).healed, 10, "still capped at max HP");
});

test("potions heal their own amount, capped at max HP", () => {
  assert.equal(effect(player(), { kind: "potion", amount: 10 }).healed, 10);
  const capped = effect(player({ hp: 90 }), { kind: "potion", amount: 60 });
  assert.equal(capped.healed, 10);
  assert.equal(capped.player.hp, 100);
});

test("doors spend exactly the keys they report, or block", () => {
  const opened = effect(player(), { kind: "door", color: "red" });
  assert.deepEqual(opened.keysSpent, ["red"]);
  assert.equal(opened.player.keys.red, 1);
  assert.deepEqual(resolveStep(player(), { kind: "door", color: "blue" }), { blocked: "locked" });
  const heart = { kind: "door", door: { type: "fullHp" } } as const;
  const drained = effect(player({ hp: 100 }), heart);
  assert.deepEqual(drained.keysSpent, []);
  assert.equal(drained.player.hp, 1, "a Heart Door drains HP to 1");
  assert.equal(effect(player({ hp: 7 }), heart).player.hp, 1, "at any HP");
});

test("fights apply predicted damage; lethal fights leave 0 HP, impervious ones block", () => {
  const foe = (attack: number, defense = 0): Tile => ({ kind: "enemy", enemy: { name: "Foe", hp: 25, attack, defense, tier: 0 } });
  const won = effect(player(), foe(8));
  assert.equal(won.player.hp, 50 - won.combat!.damage);
  assert.ok(won.combat!.survivable);
  const lost = effect(player(), foe(99));
  assert.equal(lost.player.hp, 0);
  assert.equal(lost.combat!.survivable, false);
  assert.equal(resolveStep(player(), foe(8, 10)).blocked, "impervious");
});

test("resolving never mutates the input player", () => {
  const p = player();
  const snapshot = structuredClone(p);
  for (const t of [{ kind: "door", color: "red" }, { kind: "key", color: "yellow" }, { kind: "potion" }, { kind: "attack" }] as Tile[])
    resolveStep(p, t);
  assert.deepEqual(p, snapshot);
  assert.deepEqual(resolveStep(p, { kind: "wall" }), { blocked: "wall" });
});
