import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTowerFloor } from "../src/tower/index.ts";
import { generateStrategicGraph } from "../src/tower/strategic-graph.ts";
import { gateTile } from "../src/tower/furnisher.ts";
import { region } from "../src/delve/labyrinth.ts";
import { STRENGTH_FROM_FLOOR, strengthOnFloor } from "../src/scaling.ts";
import { FIRST_TIER_HEART_DOOR_FLOOR, HEART_DOOR_FLOOR, heartDoorsOn } from "../src/key-schedule.ts";
import type { Tile } from "../src/entities.ts";

const seeds = [7919, 15838, 23757];
const isHeart = (t: Tile) => t.kind === "door" && t.door?.type === "fullHp";

test("strong enemies wait for floor 11 and elites for floor 41; Heart Doors for floor 101 in the first tier and 31 after", () => {
  assert.deepEqual(STRENGTH_FROM_FLOOR, { strong: 11, elite: 41 });
  assert.equal(HEART_DOOR_FLOOR, 31);
  assert.equal(FIRST_TIER_HEART_DOOR_FLOOR, 101);
  // Floors count from 0 here: floor 11 is 10.
  assert.deepEqual([9, 10, 39, 40].map((f) => strengthOnFloor("elite", f)), ["normal", "strong", "strong", "elite"]);
  assert.deepEqual([9, 10].map((f) => strengthOnFloor("strong", f)), ["normal", "strong"]);
  assert.deepEqual(["weak", "normal", "boss"].map((s) => strengthOnFloor(s as "weak", 0)), ["weak", "normal", "boss"]);
  assert.deepEqual([29, 29.9, 30].map((f) => heartDoorsOn(f, 2)), [false, false, true]);
  assert.deepEqual([30, 99, 99.9, 100].map((f) => heartDoorsOn(f)), [false, false, false, true]);
});

test("Tower floors place no strong enemy below floor 11, no Heart Door below 101 and no elite below 41", () => {
  const seen = { strong: false, heart: false, elite: false };
  for (const seed of seeds)
    for (let room = 0; room < 130; room++)
      for (const [, t] of generateTowerFloor(seed, room).cells) {
        const strength = t.kind === "enemy" ? t.enemy!.strength : null;
        if (strength === "strong") {
          assert.ok(room >= 10, `seed ${seed}: a strong enemy on floor ${room + 1}`);
          seen.strong = true;
        }
        if (strength === "elite") {
          assert.ok(room >= 40, `seed ${seed}: an elite on floor ${room + 1}`);
          seen.elite = true;
        }
        if (isHeart(t)) {
          assert.ok(room >= 100, `seed ${seed}: a Heart Door on floor ${room + 1}`);
          seen.heart = true;
        }
      }
  assert.deepEqual(seen, { strong: true, heart: true, elite: true }, "each still appears once its floor comes");
});

test("later towers place Heart Doors from floor 31", () => {
  let heart = false;
  for (const seed of seeds)
    for (let room = 20; room < 60; room++)
      for (const [, t] of generateTowerFloor(seed, room, 2).cells)
        if (isHeart(t)) {
          assert.ok(room >= 30, `seed ${seed}: a Heart Door on floor ${room + 1}`);
          heart = true;
        }
  assert.ok(heart, "they still appear once floor 31 comes");
});

test("the Delve's first areas hold no strong or elite enemy below equivalent floor 11, nor a Heart Door below 101", () => {
  for (const seed of seeds)
    for (let area = 0; area < 3; area++) {
      const r = region(seed, area);
      for (const [key, t] of r.cells) {
        const floor = Math.floor(r.metadata.get(key)!.depth / 10);
        if (t.kind === "enemy" && t.enemy!.strength !== "boss") assert.equal(strengthOnFloor(t.enemy!.strength, floor), t.enemy!.strength, `${key} at floor ${floor + 1}`);
        if (t.kind === "enemy" && (t.enemy!.strength === "strong" || t.enemy!.strength === "elite")) assert.ok(floor >= 10, `a ${t.enemy!.strength} enemy on floor ${floor + 1}`);
        if (isHeart(t)) assert.ok(floor >= 100, `a Heart Door on floor ${floor + 1}`);
      }
    }
});

test("Tower I's first ten floors lay a potion in about 35% of the doorways on the way to the stairs, in place of enemies", () => {
  const share = (depth: number, tier = 1) => {
    let potions = 0, gates = 0;
    for (let seed = 1; seed <= 400; seed++)
      for (const n of generateStrategicGraph(seed * 7919, depth, 0, tier).nodes)
        if (n.route === "main" && n.parent !== null) {
          gates++;
          if (n.gate.kind === "potion") potions++;
        }
    return potions / gates;
  };
  for (let depth = 0; depth < 10; depth++) {
    const s = share(depth);
    assert.ok(s > 0.3 && s < 0.4, `floor ${depth + 1}: ${s}`);
  }
  assert.equal(share(10), 0, "none from floor 11");
  assert.equal(share(3, 2), 0, "none in later towers");
  // Each becomes a potion standing in the doorway.
  assert.equal(gateTile({ kind: "potion" }, 3, () => 0.5).kind, "potion");
  let laid = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { embedding: e } = generateTowerFloor(seed * 7919, 6);
    for (const d of e.doorways)
      if (!d.shortcut && e.graph.nodes[d.child].route === "main" && e.graph.nodes[d.child].gate.kind === "potion") {
        assert.equal(e.cells.get(`${d.x},${d.y}`)?.kind, "potion", `seed ${seed}: the doorway at ${d.x},${d.y}`);
        laid++;
      }
  }
  assert.ok(laid > 0, "floor 7 lays some");
});
