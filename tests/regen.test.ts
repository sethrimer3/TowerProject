import { test } from "node:test";
import { snap } from "../src/exact.ts";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults } from "../src/save.ts";
import { GOLD_SHOP, RUN_TRAINING_PRICES, TRAINING, cost, levelForXp, schedulePrice, trained, trainingWorth, type StatTrainingRow } from "../src/config.ts";
import { loadout, provisionPrice, trainingStep } from "../src/loadout.ts";
import { resolveStep, BASE_RULES } from "../src/step-effects.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import type { Player } from "../src/entities.ts";

const row = (id: string) => TRAINING.find((t) => t.id === id)! as StatTrainingRow;

test("Regen costs 1 Inspiration between On the Job and Heal, and opens a Defense training row", () => {
  const g = new Game(defaults());
  g.save.tower.inspiration = 1000;
  assert.equal(cost("regen", 0), 1);
  for (const id of ["combatStance", "buildout", "trainers"] as const) assert.ok(g.buy(id));
  assert.equal(g.buy("regen"), false, "waits for On the Job");
  assert.equal(g.buy("cardHeal"), false, "Heal waits for Regen");
  assert.ok(g.buy("onTheJob"));
  assert.ok(g.buy("regen"));
  assert.ok(g.buy("cardHeal"));
  const regen = row("regen"), def = row("defense");
  assert.equal(regen.group, "defense");
  assert.equal(regen.cost, def.cost, "a rank costs DEF's points, and so a trainer DEF's Gold and time");
  assert.equal(RUN_TRAINING_PRICES.regen, RUN_TRAINING_PRICES.defense, "and DEF's Silver in a run");
  // 0.1n + n²/120: the first rank 0.108333, each after it a 60th more.
  assert.equal(trainingWorth(regen, 0), 0.108333);
  assert.equal(trainingWorth(regen, 12), 0.308333);
  assert.equal(trainingWorth(regen, 12), snap(trainingWorth(def, 12) / 10 + 0.1), "DEF's curve on a tenth, and 0.1 a rank");
});

test("Regen training gives the hero HP per step, shown to the hundredth", () => {
  const save = defaults();
  save.upgrades.regen = 1;
  save.training.regen = 3;
  const per = trained(row("regen"), 3);
  assert.equal(loadout(save).regen, Math.round(per * 1e6) / 1e6);
  const g = new Game(save);
  g.newRun({ seed: 5 });
  assert.equal(g.run.player.regen, loadout(save).regen);
  assert.equal(trainingStep(save, "regen").now, Math.floor(per * 100) / 100);
  assert.equal(new Game(defaults()).run.player.regen, undefined, "a hero without Regen carries none");
});

test("each step regains Regen's HP after what the step does, up to max HP, and a fallen hero none", () => {
  const p: Player = { x: 0, y: 0, hp: 50, maxHp: 100, attack: 10, defense: 0, keys: { yellow: 0, blue: 0, red: 0 } };
  const rules = { ...BASE_RULES, regen: 0.5 };
  const step = (player: Player, tile: Parameters<typeof resolveStep>[1]) => {
    const o = resolveStep(player, tile, rules);
    assert.ok(!o.blocked);
    return o.player.hp;
  };
  assert.equal(step(p, { kind: "floor" }), 50.5);
  assert.equal(step({ ...p, hp: 99.8 }, { kind: "floor" }), 100, "up to max HP");
  assert.equal(step(p, { kind: "potion", amount: 10 }), 60.5, "after a potion");
  const rat = { name: "rat", hp: 25, attack: 15, defense: 0, tier: 0, strength: "normal" as const };
  const fight = resolveStep(p, { kind: "enemy", enemy: rat }, rules);
  assert.ok(!fight.blocked && fight.combat!.damage > 0);
  assert.equal(fight.player.hp, 50 - fight.combat!.damage + 0.5, "after a fight won");
  assert.equal(step({ ...p, hp: 5 }, { kind: "enemy", enemy: rat }), 0, "none for a fight lost");
  assert.equal(resolveStep(p, { kind: "floor" }).player.hp, 50, "none without Regen");
});

/** A Tower corridor along the bottom row with a key at its east end, the
 * hero at 50 HP regaining 0.5 a step, and `rush` Rush levels. */
function corridor(rush: number) {
  const g = new Game(defaults());
  if (rush) {
    g.save.upgrades.rush = 1;
    g.save.archives.levels.rush = rush;
  }
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let x = 0; x < 8; x++) w.cells.set(`${x},0`, { kind: "floor" });
  w.cells.set("5,0", { kind: "key", color: "yellow" });
  w.cells.set("7,0", { kind: "stairs" });
  w.cells.set("7,1", { kind: "enemy", enemy: { name: "rat", hp: 1, attack: 0, defense: 0, tier: 0, strength: "normal" } });
  w.torches = [];
  Object.assign(g.run.player, { x: 0, y: 0, hp: 50, regen: 0.5 });
  return g;
}

test("in a run each step regains HP, and a rushed turn counts as one step", () => {
  const walk = corridor(0);
  walk.autoTurn();
  walk.autoTurn();
  assert.equal(walk.run.player.hp, 51);
  const rush = corridor(10);
  rush.autoTurn();
  assert.deepEqual([rush.run.player.x, rush.run.player.y], [4, 0], "it rushed four tiles");
  assert.equal(rush.run.player.hp, 50.5, "but regained HP once");
  rush.autoTurn();
  assert.equal(rush.run.player.hp, 51, "the next step regains again");
});

test("no Regen in the forest", () => {
  const g = new Game(defaults());
  g.newRun({ outside: true, seed: 3 });
  g.run.player.regen = 0.5;
  assert.equal(g.stepRules.regen, 0);
  g.enterRun();
  g.run.player.regen = 0.5;
  assert.equal(g.stepRules.regen, 0.5);
});

test("stat provisions compound 5% a buy on top of their schedule; the Yellow Key doesn't", () => {
  const heal = GOLD_SHOP.find((g) => g.id === "heal")!;
  assert.deepEqual([0, 9, 19, 49].map((n) => schedulePrice(heal.price, n)), [5, 111, 746, 21046]);
  const save = defaults();
  save.provisions.guard = 9;
  assert.equal(provisionPrice(save, "guard"), 132);
  save.provisions.yellowKey = 2;
  assert.equal(provisionPrice(save, "yellowKey"), 1600);
});
