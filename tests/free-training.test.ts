import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save.ts";
import { TRAINING, type TrainingId, trainedAmount } from "../src/config.ts";
import { FREE_TRAINING_ROWS, trainingStep } from "../src/progression/loadout.ts";
import { freeTrainingLines, freeTrainingSeed, rollFreeTraining } from "../src/progression/free-training.ts";
import { drawAt } from "../src/random.ts";
import { runTrainingOffer, runTrainingValue, silverPrice } from "../src/progression/run-training.ts";
import type { RoomWorld } from "../src/tower/room-world.ts";
import type { World } from "../src/delve/world.ts";
import type { RunCore } from "../src/runs.ts";

/** A save with Free Training owned and `ranks` of each Free Upgrade row. */
function owned(ranks: Partial<Record<"freeOffense" | "freeDefense" | "freeUtility", number>>) {
  const save = defaults();
  save.upgrades.freeTraining = 1;
  Object.assign(save.training, ranks);
  return save;
}
const run = (seed: number): Pick<RunCore, "seed" | "freeRolls" | "training"> => ({ seed });

test("Free Training opens the three Free Upgrade rows: 0.5% a rank, 50% at their 100", () => {
  const save = defaults();
  assert.equal(trainedAmount(save, FREE_TRAINING_ROWS["offense"]), 0);
  save.training.freeOffense = 10;
  assert.equal(trainedAmount(save, FREE_TRAINING_ROWS["offense"]), 0, "nothing without the skill");
  save.upgrades.freeTraining = 1;
  assert.deepEqual(["offense", "defense", "utility"].map((g) => trainedAmount(save, FREE_TRAINING_ROWS[g as "offense"])), [500, 0, 0]);
  assert.deepEqual([trainingStep(save, "freeOffense").now, trainingStep(save, "freeOffense").next, trainingStep(save, "freeOffense").unit], [5, 5.5, "%"]);
  assert.deepEqual(runTrainingValue(save, {}, "freeOffense"), { value: 5, unit: "%" });
  save.training.freeOffense = 100;
  assert.equal(trainingStep(save, "freeOffense").now, 50);
});

test("each group rolls its own stream, seeded from the run seed: Defense one above Offense, Utility two", () => {
  assert.equal(freeTrainingSeed(77, "defense"), freeTrainingSeed(77, "offense") + 1);
  assert.equal(freeTrainingSeed(77, "utility"), freeTrainingSeed(77, "offense") + 2);
  // Only Defense has ranks: it alone draws, from its own stream's start.
  const save = owned({ freeDefense: 100 }), r = run(77);
  rollFreeTraining(save, r);
  assert.equal(r.freeRolls?.offense, undefined, "no draw while a chance is nothing");
  assert.equal(r.freeRolls?.utility, undefined);
  const first = drawAt(freeTrainingSeed(77, "defense"), 0);
  assert.equal(r.freeRolls!.defense, first * 10_000 < 5000 ? 2 : 1, "a hit draws again to pick the row");
  // The same seed replays the same levels; the streams move on floor by floor.
  const replay = (seed: number) => {
    const s = owned({ freeOffense: 60, freeDefense: 60, freeUtility: 60 }), r = run(seed), given: TrainingId[][] = [];
    for (let f = 0; f < 40; f++) {
      const ids = rollFreeTraining(s, r);
      for (const id of ids) r.training = { ...r.training, [id]: (r.training?.[id] ?? 0) + 1 };
      given.push(ids);
    }
    return given;
  };
  assert.deepEqual(replay(5), replay(5));
  assert.notDeepEqual(replay(5), replay(6));
  assert.ok(replay(5).flat().length > 10, "about 30% a group a floor");
});

test("a free level goes to an open row of its group below its most; Free Utility may raise the Free rows", () => {
  // Below their most of 100, so the Free rows can take a level themselves.
  const save = owned({ freeOffense: 99, freeUtility: 99 });
  save.upgrades.critical = 1;
  const offense = new Set<TrainingId>(), utility = new Set<TrainingId>(), r = run(3);
  // The levels aren't applied: the rolls alone are under test.
  for (let f = 0; f < 400; f++)
    for (const id of rollFreeTraining(save, r)) (TRAINING.find((t) => t.id === id)!.group === "offense" ? offense : utility).add(id);
  assert.deepEqual([...offense].sort(), ["attack", "critChance", "critFactor"]);
  assert.deepEqual([...utility].sort(), ["freeDefense", "freeOffense", "freeUtility"], "the other Utility rows aren't open");
  // A maxed row is never picked, and a group with none left gives nothing.
  save.training.critChance = 80;
  save.training.critFactor = 150;
  save.training.attack = 6000;
  save.training.freeUtility = 0;
  const left = run(3);
  for (let f = 0; f < 50; f++) assert.deepEqual(rollFreeTraining(save, left), []);
});

test("the board's lines: +N and each row's short name, in the order given", () => {
  assert.deepEqual(freeTrainingLines(["attack", "hp", "attack", "critChance"]), ["+2 ATK", "+1 Max HP", "+1 Crit %"]);
});

/** A Tower run inside, the hero beside the stairs, with every Free Upgrade row at 100. */
function stairs(seed: number) {
  const save = owned({ freeOffense: 100, freeDefense: 100, freeUtility: 100 });
  save.upgrades.inspirationUndos = 1;
  const g = new Game(save);
  g.newRun({ seed });
  (g as unknown as { enterFromOutside(): void }).enterFromOutside();
  g.run.height = 3;
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  return g;
}

test("each new Tower floor rolls: free levels cost no Silver but raise the row's Silver price a step, and stay in the run", () => {
  // The first seed whose first floor gives a level.
  let g = stairs(1);
  for (let seed = 1; ; seed++) {
    g = stairs(seed);
    g.run.silver = 0;
    const attack = g.run.player.attack, maxHp = g.run.player.maxHp;
    assert.ok(g.move(1, 0));
    const given = Object.entries(g.run.training ?? {}) as [TrainingId, number][];
    if (!given.length) continue;
    assert.equal(g.silver, 0, "free");
    for (const [id, n] of given) {
      const offer = runTrainingOffer(g.save, g.run, id);
      assert.equal(offer.bought, n);
      assert.equal(offer.price, silverPrice(id, n), "priced as if bought");
    }
    if (g.run.training?.attack) assert.ok(g.run.player.attack > attack, "the stat rises at once");
    if (g.run.training?.hp) assert.ok(g.run.player.maxHp > maxHp);
    assert.ok(g.freeTrained && g.freeTrained.lines.length >= 1);
    // Saved with the run, its streams' draws counted.
    const back = decode(JSON.stringify(g.save));
    assert.deepEqual(back.tower.run.training, g.run.training);
    assert.deepEqual(back.tower.run.freeRolls, g.run.freeRolls);
    break;
  }
  // A floor climbed again pays no new roll.
  const rolls = { ...g.run.freeRolls };
  g.run.maxHeight = 10;
  (g.world as RoomWorld).cells = new Map([["0,0", { kind: "floor" }], ["1,0", { kind: "stairs" }]]);
  Object.assign(g.run.player, { x: 0, y: 0 });
  assert.ok(g.move(1, 0));
  assert.deepEqual(g.run.freeRolls, rolls);
});

test("the Delve rolls once for each new equivalent floor", () => {
  const save = owned({ freeDefense: 100 });
  save.upgrades.delve = 1;
  const g = new Game(save);
  g.switchMode("delve");
  g.newRun({ seed: 5 });
  (g as unknown as { enterFromOutside(): void }).enterFromOutside();
  (g.world as World).depth = () => 45;
  g.run.maxHeight = 5;
  const step = (g as unknown as { afterDelveStep(t: unknown, x: number, y: number, from: { x: number; y: number }): void }).afterDelveStep.bind(g);
  step({ kind: "floor" }, g.run.player.x, g.run.player.y, g.run.player);
  // Floors 1 to 4: four Defense rolls, each hit drawing once more.
  const given = Object.values(g.run.training ?? {}).reduce((n, k) => n + (k ?? 0), 0);
  assert.equal(g.run.freeRolls!.defense, 4 + given);
  assert.ok(Object.keys(g.run.training ?? {}).every((id) => TRAINING.find((t) => t.id === id)!.group === "defense"));
});
