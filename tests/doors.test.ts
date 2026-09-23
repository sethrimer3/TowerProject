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

test("heart opens free only at full HP and legacy doors remain compatible", () => {
  assert.deepEqual(doorCost(door(8), player(0, 0, 0, 10, 10)), []);
  assert.equal(doorCost(door(8), player(0, 0, 0, 9, 10)), null);
  assert.deepEqual(doorCost({ kind: "door", color: "red" }, player(0, 0, 1)), ["red"]);
});
