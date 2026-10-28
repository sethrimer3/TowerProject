import { test } from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save/save.ts";
import { OUTSIDE_SIZE, OUTSIDE_START_Y, OutsideWorld } from "../src/outside.ts";
import { FOREST_ARRIVAL_PAUSE_MS, FOREST_ARRIVAL_WALK_MS, forestArrivalPose } from "../src/forest-arrival.ts";
import { routeTo } from "../src/pathfinding.ts";

function forest() {
  const g = new Game(defaults(), () => .345);
  g.save.tower.tiersOpen = 3;
  g.newRun({ outside: true, seed: 7 });
  return g;
}

test("the entire visible forest, including the three rightmost columns, can be walked and reloaded", () => {
  const g = forest(), w = g.world as OutsideWorld;
  assert.equal(w.width, OUTSIDE_SIZE);
  g.walkTo(18, OUTSIDE_START_Y);
  assert.equal(g.route.at(-1)?.x, 18);
  while (g.route.length) g.routeStep();
  assert.equal(g.run.player.x, 18);
  assert.equal(g.tier, 1);
  for (let y = 1; y < 11; y++) {
    if (w.tile(18, y).kind !== "floor") continue;
    g.walkTo(18, y);
    assert.ok(g.route.every(step => step.x !== 19), "a route to grass cannot silently leave the screen");
    g.cancelRoute();
  }
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.equal(loaded.run.player.x, 18);
  assert.ok(loaded.run.outside);
  // Grass has the same movement bounds as the dirt road.
  const grass = Array.from({ length: 11 }, (_, y) => y).find(y => y !== OUTSIDE_START_Y && w.tile(18, y).kind === "floor");
  assert.notEqual(grass, undefined);
  g.run.player.x = 17; g.run.player.y = grass!;
  assert.equal(w.step(17, grass!, 1, 0)?.x, 18);
  assert.equal(w.tile(18, grass!).kind, "floor");
  // Dungeon runs retain their original bounds.
  const raw = JSON.parse(JSON.stringify(g.save)); raw.tower.run.outside = false;
  assert.equal(decode(JSON.stringify(raw)).tower.run, null);
});

test("walking onto an open side edge changes screens exactly once and cancels the old route", () => {
  const g = forest();
  g.walkTo(OUTSIDE_SIZE - 1, OUTSIDE_START_Y);
  while (g.route.length) g.routeStep();
  assert.equal(g.tier, 2);
  assert.equal(g.run.player.x, 1);
  assert.equal(g.run.player.y, OUTSIDE_START_Y);
  assert.equal(g.world.tile(g.run.player.x, g.run.player.y).kind, "floor");
  assert.equal(g.route.length, 0);
  assert.equal(g.auto, false);
  assert.deepEqual(g.facing, { dx: 1, dy: 0 });
  assert.ok(g.forestArrival);
  assert.equal(g.stepManually(1, 0), false);
  assert.equal(g.travelForest(1), false);
  g.forestArrivalFrame(1000); g.forestArrivalFrame(1400);
  assert.equal(g.stepManually(-1, 0), true);
  assert.equal(g.tier, 1);
  assert.equal(g.run.player.x, OUTSIDE_SIZE - 2);
  assert.deepEqual(g.facing, { dx: -1, dy: 0 });
});

test("arrows use the same arrival, with a 100ms empty screen and a finite walk", () => {
  const g = forest();
  assert.ok(g.travelForest(1));
  const a = g.forestArrival!;
  assert.equal(a.started, null);
  assert.deepEqual(a.from, { x: -1, y: OUTSIDE_START_Y });
  assert.equal(g.forestArrivalFrame(3000), false);
  assert.equal(forestArrivalPose(a, 3099, g.forestArrivalWalkMs).visible, false);
  assert.equal(forestArrivalPose(a, 3100, g.forestArrivalWalkMs).visible, true);
  assert.equal(forestArrivalPose(a, 3250, g.forestArrivalWalkMs).x, 0);
  assert.equal(g.forestArrivalFrame(3399), false);
  assert.equal(g.forestArrivalFrame(3400), true);
  assert.equal(g.forestArrival, null);
  assert.equal(FOREST_ARRIVAL_PAUSE_MS + FOREST_ARRIVAL_WALK_MS, 400);
  assert.equal(g.stepManually(1, 0), true);
});

test("only adjacent unlocked screens are connected; walking along an edge never bounces", () => {
  const g = forest();
  assert.equal(g.travelForest(-1), false);
  g.selectTier(3);
  const closedRow = Array.from({ length: 11 }, (_, y) => y).find(y => g.world.tile(19, y).kind === "floor" && g.world.tile(18, y).kind === "floor");
  assert.notEqual(closedRow, undefined);
  g.run.player.x = OUTSIDE_SIZE - 2; g.run.player.y = closedRow!;
  assert.ok(g.stepManually(1, 0));
  assert.equal(g.tier, 3);
  assert.equal(g.forestArrival, null);
  assert.equal(g.travelForest(1), false);
  g.selectTier(2);
  const world = g.world as OutsideWorld;
  const y = Array.from({ length: 11 }, (_, y) => y).find(y => world.tile(0, y).kind === "floor" && world.tile(0, y + 1).kind === "floor");
  assert.notEqual(y, undefined);
  g.run.player.x = 0; g.run.player.y = y!;
  assert.ok(g.stepManually(0, 1));
  assert.equal(g.tier, 2);
});

test("grass edges preserve a safe row, saves never contain cutscene positions, and motion settings are respected", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = new Game(defaults(), () => seed / 101);
    g.save.tower.tiersOpen = 3;
    g.newRun({ outside: true, seed: 7 });
    assert.ok(g.travelForest(1, seed % 12));
    const p = g.run.player;
    assert.equal(g.world.tile(p.x, p.y).kind, "floor");
    assert.equal(g.world.tile(0, p.y).kind, "floor");
    assert.notEqual(routeTo(g, 8, OUTSIDE_START_Y), null, "entry grass must connect to the main path");
    const restored = new Game(decode(JSON.stringify(g.save)));
    assert.deepEqual(restored.run.player, p);
    assert.equal(restored.forestArrival, null);
    g.forestArrivalFrame(1000); g.forestArrivalFrame(1400);
    assert.ok(g.travelForest(-1, seed % 12));
    assert.notEqual(routeTo(g, 8, OUTSIDE_START_Y), null, "the opposite entry must connect too");
  }
  const g = forest(); g.save.settings.reduceMotion = true;
  g.travelForest(1); g.forestArrivalFrame(0);
  assert.equal(g.forestArrivalFrame(99), false);
  assert.equal(g.forestArrivalFrame(100), true);
  g.save.settings.reduceMotion = false; g.save.settings.transition = "fast";
  g.travelForest(-1); g.forestArrivalFrame(0);
  assert.equal(g.forestArrivalFrame(249), false);
  assert.equal(g.forestArrivalFrame(250), true);
});
