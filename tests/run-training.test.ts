import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { RUN_TRAINING_CAP, RUN_TRAINING_PRICES, TRAINING, trained, xpForLevel, levelForXp } from "../src/config.ts";
import { reviveChance } from "../src/loadout.ts";
import { ranksInRun, runTrainingOffer, runTrainingValue, silverPrice } from "../src/run-training.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";

/** A Tower run inside on an open 5×5 floor, with undo and `silver` to spend. */
function arena(silver: number, edit?: (g: Game) => void) {
  const g = new Game(defaults());
  g.save.upgrades.inspirationUndos = 1;
  g.save.xp = xpForLevel(10);
  edit?.(g);
  const w = g.world as RoomWorld;
  w.cells = new Map();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) w.cells.set(`${x},${y}`, { kind: "floor" });
  w.cells.set("4,4", { kind: "stairs" });
  g.run.player.x = 0;
  g.run.player.y = 0;
  g.run.silver = silver;
  return g;
}

test("Silver prices start at the row's base and rise by a step plus the ranks bought, the step growing every five", () => {
  const prices = (id: Parameters<typeof silverPrice>[0], n: number) => Array.from({ length: n }, (_, k) => silverPrice(id, k));
  // Max HP from 3: +1+N for five ranks, then +3+N, then +5+N.
  assert.deepEqual(prices("hp", 12), [3, 5, 8, 12, 17, 23, 32, 42, 53, 65, 78, 94]);
  // +1+N for five ranks, then +4+N, then +7+N.
  assert.deepEqual(prices("attack", 17), [5, 7, 10, 14, 19, 25, 35, 46, 58, 71, 85, 103, 122, 142, 163, 185, 211]);
  // +2+N, then +5+N, then +8+N.
  assert.deepEqual(prices("shroud", 12), [10, 13, 17, 22, 28, 35, 46, 58, 71, 85, 100, 119]);
  // +4+N, then +8+N, then +12+N.
  assert.deepEqual(prices("revive", 12), [20, 25, 31, 38, 46, 55, 69, 84, 100, 117, 135, 158]);
  for (const row of TRAINING) {
    const { base } = RUN_TRAINING_PRICES[row.id];
    assert.ok([3, 5, 10, 20].includes(base), `${row.id} starts at 3, 5, 10 or 20`);
    let last = 0;
    for (let k = 0; k < 1000; k++) {
      const price = silverPrice(row.id, k);
      assert.ok(Number.isInteger(price) && price > last, "each rank dearer than the last, in whole Silver");
      last = price;
    }
  }
  assert.ok(RUN_TRAINING_PRICES.hp.base < RUN_TRAINING_PRICES.shroud.base, "rows open from the start cost least");
});

test("training for the run spends Silver and raises the stat at once; undo takes it back", () => {
  const g = arena(100);
  const attack = g.run.player.attack, level = levelForXp(g.save.xp), row = TRAINING.find((t) => t.id === "attack")!;
  assert.ok(g.trainInRun("attack"));
  assert.equal(g.silver, 95);
  assert.equal(g.run.player.attack, attack + trained(row, 1, level));
  assert.equal(g.run.loadout!.attack, g.run.player.attack, "kept when a new section resets ATK");
  assert.equal(runTrainingOffer(g.save, g.run, "attack").level, 1);
  assert.equal(runTrainingOffer(g.save, g.run, "attack").price, 7, "the next costs more");
  assert.equal(g.save.training.attack, 0, "the hero's own training is untouched");
  assert.ok(g.undo());
  assert.equal(g.run.player.attack, attack);
  assert.equal(g.silver, 100);
  assert.equal(runTrainingOffer(g.save, g.run, "attack").level, 0);
});

test("maximum HP bought for the run comes with the HP to fill it", () => {
  const g = arena(100);
  g.run.player.hp = 50;
  const max = g.run.player.maxHp;
  assert.ok(g.trainInRun("hp"));
  const gain = g.run.player.maxHp - max;
  assert.ok(gain > 0);
  assert.equal(g.run.player.hp, 50 + gain);
  assert.equal(runTrainingValue(g.save, g.run, "hp").value, g.run.player.maxHp);
});

test("training for the run is refused without the Silver or its upgrade, and in the forest", () => {
  const g = arena(4);
  assert.equal(g.trainInRun("attack"), false, "5 Silver needed");
  assert.equal(g.trainInRun("shroud"), false, "Shroud not owned");
  g.run.silver = 1000;
  g.save.upgrades.shroud = 1;
  assert.ok(g.trainInRun("shroud"));
  g.newRun({ outside: true });
  g.run.silver = 1000;
  assert.equal(g.trainInRun("attack"), false, "not before the run goes inside");
});

test("a row reaches no higher in a run than its most on the Training tab, or the cap without one", () => {
  const g = arena(0, (g) => {
    g.save.upgrades.recovery = 1;
    g.save.upgrades.findPotion = 1;
    g.save.training.findPotion = 71;
  });
  g.save.settings.freePurchases = true;
  assert.ok(g.trainInRun("findPotion"));
  assert.equal(runTrainingOffer(g.save, g.run, "findPotion").maxed, true);
  assert.equal(g.trainInRun("findPotion"), false, "72 is Find Potion's most");
  assert.equal(g.run.percentPotions, 2000, "the run's potions at once");
  assert.equal((g.world as RoomWorld).percentPotions, 2000, "on the floor stood on too");
  g.save.training.hp = RUN_TRAINING_CAP - 1;
  assert.ok(g.trainInRun("hp"));
  assert.equal(g.trainInRun("hp"), false, `${RUN_TRAINING_CAP} without a most of its own`);
});

test("the hero's own ranks raise where a run starts, at the same Silver prices", () => {
  const g = arena(100, (g) => { g.save.upgrades.revive = 1; g.save.training.revive = 10; });
  assert.deepEqual(runTrainingOffer(g.save, g.run, "revive").price, RUN_TRAINING_PRICES.revive.base);
  assert.equal(runTrainingOffer(g.save, g.run, "revive").level, 10);
  assert.ok(g.trainInRun("revive"));
  assert.equal(ranksInRun(g.save, g.run).revive, 11);
  assert.equal(runTrainingValue(g.save, g.run, "revive").value, reviveChance({ upgrades: g.save.upgrades, training: { ...g.save.training, revive: 11 } }) / 100);
});

test("training for the run ends with the run, and a save keeps it while the run lasts", () => {
  const g = arena(100);
  assert.ok(g.trainInRun("defense"));
  assert.deepEqual(decode(JSON.stringify(g.save)).tower.run!.training, { defense: 1 });
  const bad = JSON.parse(JSON.stringify(g.save));
  bad.tower.run.training = { defense: -1 };
  assert.equal(decode(JSON.stringify(bad)).tower.run!.training, undefined, "a malformed record is dropped");
  g.finish("Ended");
  assert.equal(g.run.training, undefined);
  assert.equal(runTrainingOffer(g.save, g.run, "defense").level, 0);
});
