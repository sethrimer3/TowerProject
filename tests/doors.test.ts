import test from "node:test";
import assert from "node:assert/strict";
import { area1DoorRule, doorCost, doorId } from "../src/doors.ts";
import type { Player, Tile } from "../src/entities.ts";

const player = (yellow = 0, blue = 0, red = 0, hp = 10, maxHp = 10): Player => ({
  x: 0, y: 0, attack: 1, defense: 0, hp, maxHp, keys: { yellow, blue, red },
});
const door = (room: number): Tile => ({ kind: "door", door: area1DoorRule(room) });

test("area-one door sequence covers every sprite/rule identity", () => {
  assert.deepEqual(Array.from({ length: 9 }, (_, room) => doorId(door(room))),
    ["a", "b", "c", "ab", "ac", "bc", "abc", "steel", "heart"]);
});

test("single and combination locks require and consume their exact key sets", () => {
  assert.deepEqual(doorCost(door(0), player(1)), ["yellow"]);
  assert.equal(doorCost(door(3), player(1)), null);
  assert.deepEqual(doorCost(door(3), player(1, 1)), ["yellow", "blue"]);
  assert.equal(doorCost(door(6), player(1, 1)), null);
  assert.deepEqual(doorCost(door(6), player(1, 1, 1)), ["yellow", "blue", "red"]);
});

test("steel consumes one key in explicit amber/azure/crimson priority", () => {
  assert.equal(doorCost(door(7), player()), null);
  assert.deepEqual(doorCost(door(7), player(1, 1, 1)), ["yellow"]);
  assert.deepEqual(doorCost(door(7), player(0, 1, 1)), ["blue"]);
  assert.deepEqual(doorCost(door(7), player(0, 0, 1)), ["red"]);
});

test("heart always opens without keys and legacy doors remain compatible", () => {
  assert.deepEqual(doorCost(door(8), player(0, 0, 0, 10, 10)), []);
  assert.deepEqual(doorCost(door(8), player(0, 0, 0, 9, 10)), []);
  assert.deepEqual(doorCost({ kind: "door", color: "red" }, player(0, 0, 1)), ["red"]);
});

test("Heart Door Resilience research shrinks a Heart Door's toll 5% a level, for ten levels, on Focus Count's curve", async () => {
  const { resolveStep, BASE_RULES } = await import("../src/step-effects.ts");
  const { RESEARCH, researched } = await import("../src/archives.ts");
  const { Game } = await import("../src/state.ts");
  const { defaults } = await import("../src/save.ts");
  const heart: Tile = { kind: "door", door: { type: "fullHp" } };
  const hpAfter = (heartToll?: number, scale?: number) => {
    const out = resolveStep(player(0, 0, 0, 101, 101), heart, { ...BASE_RULES, heartToll, scale });
    return "player" in out ? out.player.hp : null;
  };
  assert.equal(hpAfter(), 1, "without research it leaves 1 HP");
  assert.equal(hpAfter(50), 51, "half the toll at level 10");
  assert.equal(hpAfter(50, 0.8), 61, "after Dampen's scale");
  const levels = RESEARCH.heartDoorResilience.levels;
  assert.deepEqual(levels.map((l) => l.gold), RESEARCH.focusCount.levels.concat({ gold: 23_000 } as never).map((l) => l.gold));
  assert.deepEqual(levels.map((l) => l.hours), Array.from({ length: 10 }, (_, i) => 8 * (i + 1)));
  assert.deepEqual(RESEARCH.heartDoorResilience.requires, [{ upgrade: "heartDoorResilience" }]);
  const g = new Game(defaults());
  assert.equal(g.stepRules.heartToll, 100);
  g.save.archives.levels.heartDoorResilience = 10;
  assert.equal(researched(g.save.archives, "heartToll", 100), 50);
  assert.equal(g.stepRules.heartToll, 50, "read at the moment of the step");
});
