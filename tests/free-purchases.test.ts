import { trainNow } from "./train-now.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLD_SHOP, TRAINING, xpForLevel } from "../src/config.ts";
import { craftConsumable } from "../src/crafting.ts";
import { addItem } from "../src/equipment/inventory.ts";
import { buyBomb, buyItem, buyUpgrade, defaultDefendSave } from "../src/defend/progress.ts";
import { trainingPoints, trainingStep } from "../src/loadout.ts";
import { decode, defaults } from "../src/save.ts";
import { Game } from "../src/state.ts";

const T0 = Date.UTC(2026, 8, 30, 12);

/** A penniless level-1 hero (2 training points) with Dev free purchases on. */
function freeSave() {
  const save = defaults();
  save.xp = xpForLevel(1);
  save.settings.freePurchases = true;
  return save;
}

test("free purchases: skills, Training and provisions are bought with nothing and cost nothing", () => {
  const g = new Game(freeSave());
  assert.ok(g.buy("combatStance"));
  assert.equal(g.save.upgrades.combatStance, 1);
  assert.equal(g.save.tower.inspiration, 0);
  assert.ok(!g.buy("combatStance"), "a maxed skill still can't be bought");
  assert.ok(!g.buy("cardHeal"), "nor one whose requirements aren't owned");

  const hp = TRAINING.find((t) => t.id === "hp")!;
  assert.ok(trainingStep(g.save, "hp").affordable);
  assert.ok(trainNow(g, "hp") && trainNow(g, "hp"));
  assert.equal(g.save.training.hp, 2);
  assert.deepEqual(trainingPoints(g.save), { earned: 2, spent: 0, left: 2 }, "no points spent");
  assert.deepEqual(g.save.trainingPaid.hp, { points: 0, gold: 0, ms: 0 }, "nor anything else");
  assert.ok(g.training.trainWithGold("hp"), "a trainer trains for nothing too");
  assert.equal(g.save.training.hp, 3, "at once");
  assert.equal(g.save.trainingJobs.length, 0);

  assert.ok(g.gear.buyProvision(GOLD_SHOP[0].id));
  assert.equal(g.save.provisions[GOLD_SHOP[0].id], 1);
  assert.equal(g.save.gold, 0);
});

test("free Training stays unspent after free purchases are turned off, and saves", () => {
  const g = new Game(freeSave());
  trainNow(g, "attack");
  g.save.settings.freePurchases = false;
  assert.equal(trainingPoints(g.save).left, 2);
  for (let i = 0; i < 2; i++) assert.ok(trainNow(g, "attack"), "1 point a rank, 2 left");
  assert.ok(!trainNow(g, "attack"), "and none left after");
  const loaded = decode(JSON.stringify(g.save));
  assert.deepEqual(loaded.trainingPaid, g.save.trainingPaid);
  assert.equal(loaded.training.attack, 3);
});

test("free purchases: crafting takes no materials", () => {
  const save = freeSave();
  assert.ok(craftConsumable(save, "cinderTonic"));
  assert.equal(save.consumables.cinderTonic, 1);
  assert.ok(Object.values(save.materials).every((n) => n === 0));
});

test("free purchases: equipment levels and Gem pulls cost nothing, and caps still hold", () => {
  const g = new Game(freeSave()), e = g.save.equipment;
  e.unlocked = true;
  const sword = addItem(e, "knightsSword", "common")!;
  assert.equal(g.equipment.levelUp(sword.id, 100), 19, "up to Common's level 20");
  assert.equal(g.equipment.levelUp(sword.id), "maxed");
  assert.equal(sword.spent, undefined, "nothing invested");
  assert.equal(g.save.gold, 0);
  const pulled = g.equipment.pull("ring", 10);
  assert.ok(Array.isArray(pulled) && pulled.length === 10);
  assert.equal(g.save.gems, 0);
});

test("free purchases: research costs no Gold and completes the moment it starts; archivists are free", () => {
  const save = freeSave();
  save.upgrades.archives = 1;
  save.upgrades.greaterHeal = 1;
  const g = new Game(save);
  g.clock = () => T0;
  assert.ok(g.research.start(0, "potionHp"));
  assert.equal(save.archives.levels.potionHp, 1);
  assert.equal(save.archives.slots[0].job, undefined, "done already");
  assert.equal(save.gold, 0);
  assert.deepEqual(g.research.done.map((r) => [r.research, r.level]), [["potionHp", 1]]);
  assert.ok(g.research.hire());
  assert.equal(save.archives.slots.length, 2);
  assert.equal(save.gold, 0);
});

test("without free purchases, nothing is bought on credit", () => {
  const g = new Game(defaults());
  g.save.upgrades.archives = 1;
  g.save.upgrades.greaterHeal = 1;
  g.clock = () => T0;
  assert.ok(!g.buy("combatStance"));
  assert.ok(!trainNow(g, "hp"));
  assert.ok(!g.gear.buyProvision(GOLD_SHOP[0].id));
  assert.equal(craftConsumable(g.save, "cinderTonic"), false);
  assert.ok(!g.research.start(0, "potionHp"));
  assert.ok(!g.research.hire());
});

test("completed research queues for its notification, oldest first, however many complete at once", () => {
  const save = defaults();
  save.upgrades.archives = 1;
  save.upgrades.greaterHeal = 1;
  save.gold = 1_000;
  save.archives.slots[0].autoContinue = true;
  const g = new Game(save);
  g.clock = () => T0;
  assert.ok(g.research.start(0, "potionHp"));
  assert.deepEqual(g.research.done, []);
  g.clock = () => T0 + 10 * 60_000; // 15 s + 1 min + 5 min pass while away
  g.research.settle();
  assert.deepEqual(g.research.done.map((r) => r.level), [1, 2, 3]);
});

test("free purchases: Defend buys for nothing", () => {
  const save = defaultDefendSave(), wallet = { gold: 0, ironBar: 0, steelBar: 0, free: true };
  assert.ok(buyItem(save, wallet, "watchTower"));
  assert.ok(buyUpgrade(save, wallet, "barracksCapacity"));
  assert.ok(buyBomb(save, wallet));
  assert.deepEqual(wallet, { gold: 0, ironBar: 0, steelBar: 0, free: true });
  assert.ok(!buyBomb(save, { gold: 0, ironBar: 0, steelBar: 0 }));
});
