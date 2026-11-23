import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../src/state.ts";
import { decode, defaults } from "../src/save/save.ts";
import { DIVINE_FLOOR, decodeDivineRelics, endLocked, hasAnchor, portalOpen, portalSpot, PORTAL_HEIGHT } from "../src/divine.ts";
import { DIVINE_ARRIVAL, DIVINE_CHEST, DIVINE_RETURN, DivineRoom } from "../src/tower/divine-room.ts";
import { RoomWorld } from "../src/tower/room-world.ts";
import { TOWER_START_X } from "../src/config.ts";
import { point, type Tile } from "../src/entities.ts";
import { codexCategories } from "../src/codex/codex.ts";
import { surroundingLevels, RELIC_FLOOR } from "../src/ambience.ts";

/** A new player's first climb, standing at floor 2's start. */
function floorTwo(seed = 7) {
  const g = new Game(defaults(), () => 0.345);
  // Floor 1's lesson (press Stairs) is done by floor 2.
  g.save.tutorials.climb = true;
  g.newRun({ seed, height: PORTAL_HEIGHT });
  g.auto = false;
  return g;
}
/** Walks a tapped route to its end. */
function walk(g: Game, x: number, y: number) {
  g.walkTo(x, y);
  let left = 200;
  while (g.route.length && left--) g.routeStep();
  assert.ok(left > 0, "walking must terminate");
}
/** Through the portal the hero stands on: the warp's fade, then arrival. */
function warp(g: Game) {
  assert.ok(g.portalWarp, "the portal draws the hero in");
  assert.equal(g.portalWarpFrame(g.portalWarp.at + 10), false, "the floor fades first");
  assert.equal(g.portalWarpFrame(g.portalWarp.at + 10_000), true);
}

test("floor 2 of the first climb holds the Divine Portal a few steps from the way in, and the climb can't end", () => {
  for (const seed of [1, 7, 42, 1234, 99_999]) {
    const g = floorTwo(seed), portal = g.divinePortal;
    assert.ok(portal, `seed ${seed} has a portal`);
    assert.ok(g.world instanceof RoomWorld);
    assert.equal(g.world.tile(portal.x, portal.y).kind, "floor");
    assert.notDeepEqual(portal, { x: TOWER_START_X, y: 0 });
    assert.ok(g.previewRoute(portal.x, portal.y)?.length, "the hero can walk to it");
    assert.ok(g.endLocked);
  }
  // Not on other floors, nor in another tower, nor once a climb has ended.
  const one = new Game(defaults(), () => 0.345);
  one.newRun({ seed: 7 });
  assert.equal(one.divinePortal, null);
  const ended = floorTwo();
  ended.save.tutorials.chamber = true;
  assert.equal(ended.divinePortal, null);
  assert.equal(ended.endLocked, false);
});

test("the portal spot is the nearest open floor to four steps from the way in, never a tile to avoid", () => {
  const open = (x: number, y: number): Tile => ({ kind: x >= 1 && x <= 15 && y >= 0 && y <= 15 ? "floor" : "wall" });
  const at = portalSpot(open, new Set())!;
  assert.equal(Math.abs(at.x - TOWER_START_X) + at.y, 4);
  const avoided = portalSpot(open, new Set([point(at.x, at.y)]))!;
  assert.notDeepEqual(avoided, at);
  assert.equal(portalSpot((x, y) => ({ kind: x === TOWER_START_X && y >= 0 && y <= 1 ? "floor" : "wall" }), new Set()), null, "too near to be a portal");
});

test("only a tap on the portal takes the hero through it; walking over it otherwise does nothing", () => {
  const g = floorTwo(), portal = g.divinePortal!;
  // Stepped onto by Dev mode's swipes, the hero stands on it and nothing happens.
  g.save.settings.devMode = true;
  for (const step of g.previewRoute(portal.x, portal.y)!) assert.ok(g.stepManually(step.dx, step.dy));
  assert.deepEqual({ x: g.run.player.x, y: g.run.player.y }, portal);
  assert.equal(g.portalWarp, null);
  // Tapped, it takes the hero in, even standing on it already.
  g.save.settings.devMode = false;
  g.walkTo(portal.x, portal.y);
  assert.ok(g.portalWarp);
});

test("through the portal to floor 999999, the Chrono Anchor, and back to floor 2 with the climb free to end", () => {
  const g = floorTwo(), portal = g.divinePortal!;
  // A tap elsewhere doesn't move the hero inside a climb.
  g.walkTo(TOWER_START_X, 1);
  assert.equal(g.route.length, 0);
  walk(g, portal.x, portal.y);
  warp(g);
  assert.ok(g.inDivineRoom);
  assert.ok(g.world instanceof DivineRoom);
  assert.deepEqual({ x: g.run.player.x, y: g.run.player.y }, DIVINE_ARRIVAL);
  assert.equal(g.run.height, PORTAL_HEIGHT, "the run's floor is still floor 2's");
  assert.equal(g.divinePortal, null, "no way back before the relic");
  assert.ok(g.endLocked);
  assert.equal(g.boardLesson, null);
  // Free to walk: the corners' torches burn on.
  walk(g, 1, 1);
  assert.equal(g.world.torches!.every((t) => t.active), true);
  walk(g, DIVINE_CHEST.x, DIVINE_CHEST.y);
  assert.ok(hasAnchor(g.save));
  assert.equal(g.divineReveal?.relic, "chronoAnchor");
  assert.equal(g.world.tile(DIVINE_CHEST.x, DIVINE_CHEST.y).kind, "openedChest");
  assert.equal(g.divinePortal, null, "the portal back waits for the celebration");
  assert.ok(g.endLocked, "still locked until back on floor 2");
  // A reload stands in the same room, the relic held.
  const reloaded = new Game(decode(JSON.stringify(g.save)));
  assert.ok(reloaded.inDivineRoom);
  assert.deepEqual(reloaded.divinePortal, DIVINE_RETURN);
  g.dismissDivineReveal();
  assert.deepEqual(g.divinePortal, DIVINE_RETURN);
  walk(g, DIVINE_RETURN.x, DIVINE_RETURN.y);
  warp(g);
  assert.equal(g.inDivineRoom, false);
  assert.ok(g.world instanceof RoomWorld);
  assert.deepEqual({ x: g.run.player.x, y: g.run.player.y }, { x: TOWER_START_X, y: 0 });
  assert.equal(g.run.height, PORTAL_HEIGHT);
  assert.deepEqual(g.run.changes, {}, "floor 2 starts again");
  assert.equal(g.divinePortal, null, "the portal never opens again");
  assert.equal(g.endLocked, false);
});

test("the Divine Relics decode to known ids, and a save past its first climb holds the Chrono Anchor", () => {
  assert.deepEqual(decodeDivineRelics(["nope", "chronoAnchor", "chronoAnchor"]), ["chronoAnchor"]);
  assert.deepEqual(decodeDivineRelics("chronoAnchor"), []);
  const fresh = decode(JSON.stringify(defaults()));
  assert.equal(hasAnchor(fresh), false);
  assert.ok(portalOpen(fresh));
  const looped = defaults();
  looped.tutorials.chamber = true;
  const decoded = decode(JSON.stringify(looped));
  assert.ok(hasAnchor(decoded));
  assert.equal(portalOpen(decoded), false);
  assert.equal(endLocked(decoded, false), false);
});

test("the Story opens in the Codex once the first climb has ended, its Intro the story so far", () => {
  const save = defaults(), source = { save, inside: false, tournament: false, events: false, held: [] };
  const story = () => codexCategories(source).find((c) => c.id === "story")!;
  assert.equal(story().open, false);
  assert.equal(story().sections.length, 0);
  save.tutorials.chamber = true;
  const intro = story().sections[0]!;
  assert.ok(story().open);
  assert.equal(intro.title, "Intro");
  assert.equal(intro.prose?.length, 5);
  assert.match(intro.prose!.at(-1)!, /Chrono Anchor/);
});

test("the Divine Relic's hum rises nearer its chest", () => {
  const level = (x: number, y: number) => surroundingLevels({ place: "divine", weather: "clear", weatherSound: true, hero: { x, y }, relic: DIVINE_CHEST }).divineRelic!;
  assert.equal(level(DIVINE_CHEST.x, DIVINE_CHEST.y), 1);
  assert.ok(level(8, 1) < level(8, 6));
  assert.ok(level(-100, -100) >= RELIC_FLOOR);
  assert.equal(surroundingLevels({ place: "divine", weather: "clear", weatherSound: true, hero: { x: 0, y: 0 } }).windForest, undefined, "no wind or music in the room");
  assert.equal(DIVINE_FLOOR, 999_999);
});
