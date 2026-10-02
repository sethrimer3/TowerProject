import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTowerFloor } from "../src/tower/index.ts";
import { region } from "../src/delve/labyrinth.ts";
import { STRENGTH_FROM_FLOOR, strengthOnFloor } from "../src/scaling.ts";
import { HEART_DOOR_FLOOR, heartDoorsOn } from "../src/key-schedule.ts";
import type { Tile } from "../src/entities.ts";

const seeds = [7919, 15838, 23757];
const isHeart = (t: Tile) => t.kind === "door" && t.door?.type === "fullHp";

test("strong enemies wait for floor 11 and elites for floor 41; Heart Doors for floor 31", () => {
  assert.deepEqual(STRENGTH_FROM_FLOOR, { strong: 11, elite: 41 });
  assert.equal(HEART_DOOR_FLOOR, 31);
  // Floors count from 0 here: floor 11 is 10.
  assert.deepEqual([9, 10, 39, 40].map((f) => strengthOnFloor("elite", f)), ["normal", "strong", "strong", "elite"]);
  assert.deepEqual([9, 10].map((f) => strengthOnFloor("strong", f)), ["normal", "strong"]);
  assert.deepEqual(["weak", "normal", "boss"].map((s) => strengthOnFloor(s as "weak", 0)), ["weak", "normal", "boss"]);
  assert.deepEqual([29, 29.9, 30].map(heartDoorsOn), [false, false, true]);
});

test("Tower floors place no strong enemy below floor 11, no Heart Door below 31 and no elite below 41", () => {
  const seen = { strong: false, heart: false, elite: false };
  for (const seed of seeds)
    for (let room = 0; room < 50; room++)
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
          assert.ok(room >= 30, `seed ${seed}: a Heart Door on floor ${room + 1}`);
          seen.heart = true;
        }
      }
  assert.deepEqual(seen, { strong: true, heart: true, elite: true }, "each still appears once its floor comes");
});

test("the Delve's first areas hold no strong or elite enemy below equivalent floor 11, nor a Heart Door below 31", () => {
  for (const seed of seeds)
    for (let area = 0; area < 3; area++) {
      const r = region(seed, area);
      for (const [key, t] of r.cells) {
        const floor = Math.floor(r.metadata.get(key)!.depth / 10);
        if (t.kind === "enemy" && t.enemy!.strength !== "boss") assert.equal(strengthOnFloor(t.enemy!.strength, floor), t.enemy!.strength, `${key} at floor ${floor + 1}`);
        if (t.kind === "enemy" && (t.enemy!.strength === "strong" || t.enemy!.strength === "elite")) assert.ok(floor >= 10, `a ${t.enemy!.strength} enemy on floor ${floor + 1}`);
        if (isHeart(t)) assert.ok(floor >= 30, `a Heart Door on floor ${floor + 1}`);
      }
    }
});
