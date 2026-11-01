import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game } from "../src/state.ts";
import { defaults, decode } from "../src/save/save.ts";
import { LakeWorld, FISHERMAN, FISHERMAN_DIALOGUE, onDock } from "../src/lakeside.ts";
import { routeTo } from "../src/pathfinding.ts";

function forest(seed = 7) {
  const g = new Game(defaults(), () => .345);
  g.newRun({ outside: true, seed });
  return g;
}
function arrive(g: Game) { g.forestArrivalFrame(0); g.forestArrivalFrame(1000); }
function walk(g: Game, x: number, y: number) {
  g.walkTo(x, y);
  let left = 100;
  while (g.route.length && left--) g.routeStep();
  assert.ok(left > 0, "walking must terminate");
}

test("the west edge of Tower I leads to the lake and its east edge returns without changing progression", () => {
  const g = forest();
  const before = { tier: g.tier, seed: g.run.seed, best: g.save.tower.best, gold: g.save.gold, hp: g.run.player.hp };
  walk(g, 0, 7);
  assert.ok(g.world instanceof LakeWorld);
  assert.ok(g.atLake);
  assert.equal(g.tier, 1);
  assert.equal(g.save.tower.tiersOpen, 1);
  assert.equal(g.run.player.x, 18);
  assert.equal(g.travelForest(1), false, "arrival locks input");
  arrive(g);
  assert.equal(g.canTravelForest(-1), false);
  assert.equal(g.headForEntrance(), false);
  assert.equal(g.enterRun(), false);
  assert.equal(g.canSwapForest, false);
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.ok(reloaded.atLake);
  assert.ok(reloaded.world instanceof LakeWorld);
  assert.deepEqual(reloaded.run.player, g.run.player);
  walk(reloaded, 19, 7);
  assert.equal(reloaded.atLake, false);
  assert.equal(reloaded.run.player.x, 1);
  assert.deepEqual({ tier: reloaded.tier, seed: reloaded.run.seed, best: reloaded.save.tower.best, gold: reloaded.save.gold, hp: reloaded.run.player.hp }, before);
  arrive(reloaded);
  assert.ok(routeTo(reloaded, 8, 12), "the tower remains reachable on returning");
});

test("walking onto the dock stops the route and requests the exact dialogue, without repeating on every plank", () => {
  const g = forest();
  g.travelForest(-1); arrive(g);
  walk(g, 6, 7);
  assert.equal(g.fishermanRequested, true);
  assert.equal(g.message, "Come back later, traveller...");
  assert.equal(g.message, FISHERMAN_DIALOGUE);
  assert.ok(onDock(g.run.player.x, g.run.player.y));
  g.fishermanRequested = false;
  walk(g, 7, 7);
  assert.equal(g.fishermanRequested, false);
  assert.equal(g.run.player.x, 7);
  const loaded = new Game(decode(JSON.stringify(g.save)));
  assert.ok(loaded.atLake);
  assert.deepEqual(loaded.run.player, g.run.player);
  assert.equal(loaded.fishermanRequested, false, "a reload does not replay the modal");
  walk(g, 14, 7); walk(g, 10, 7);
  assert.equal(g.fishermanRequested, true, "a later visit greets the player again");
});

test("water and the fisherman block walking, while every seed has a route onto the dock and back", () => {
  for (const seed of [1, 7, 123, 9999]) {
    const g = forest(seed); g.travelForest(-1); arrive(g);
    assert.equal(g.world.tile(0, 7).kind, "wall");
    assert.equal(g.world.tile(FISHERMAN.x, FISHERMAN.y).kind, "wall");
    assert.equal(routeTo(g, 0, 7), null);
    assert.equal(routeTo(g, FISHERMAN.x, FISHERMAN.y), null);
    assert.ok(routeTo(g, 5, 7));
    assert.ok(routeTo(g, 19, 7));
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      assert.notEqual(g.world.tile(x, y).kind, "stairs");
      assert.equal((g.world as LakeWorld).isArch(x, y), false);
      assert.equal((g.world as LakeWorld).isProvingGrounds(x, y), false);
    }
  }
});

test("later tiers keep their previous-tier exit, and dungeon and Delve runs cannot travel to the lake", () => {
  const g = forest(); g.save.tower.tiersOpen = 3;
  g.selectTier(2); g.travelForest(-1); arrive(g);
  assert.equal(g.tier, 1); assert.equal(g.atLake, false);
  assert.ok(g.travelForest(-1)); arrive(g);
  assert.ok(g.travelForest(1)); arrive(g);
  assert.ok(g.travelForest(1)); arrive(g);
  assert.equal(g.tier, 2);
  assert.equal(g.atLake, false);
  g.newRun({ outside: false });
  assert.equal(g.travelForest(-1), false);
  g.switchMode("delve", true);
  assert.equal(g.travelForest(-1), false);
});

test("lake location is accepted only for an outside Tower I run and all original sprites are preloaded", () => {
  const g = forest(); g.travelForest(-1); arrive(g);
  for (const change of [(s: any) => s.tower.run.forestArea = "bogus", (s: any) => { s.tower.run.outside = false; }, (s: any) => { s.tower.run.tier = 2; }]) {
    const raw = JSON.parse(JSON.stringify(g.save)); change(raw);
    assert.equal(decode(JSON.stringify(raw)).tower.run?.forestArea, undefined);
  }
  const sizes = { "lake-water": [96, 96], "lake-shore": [24, 24], "lake-dock": [24, 24], "lake-reeds": [24, 36], "lake-fisherman": [48, 40] };
  const inventory = readFileSync(new URL("../src/sprites/assets.ts", import.meta.url), "utf8");
  for (const [id, size] of Object.entries(sizes)) {
    const bytes = readFileSync(new URL(`../public/assets/style/${id}.png`, import.meta.url));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], size);
    assert.ok(inventory.includes(`assets/style/${id}.png`));
  }
});
