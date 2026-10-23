import { test } from "node:test";
import assert from "node:assert/strict";
import { region } from "../src/delve/labyrinth.ts";
import { FULL } from "./test-size.ts";

// A corridor guard's reward lies in a nook beside the guard: one tile cut
// from the wall, whose only open neighbour is the guard's tile, so it joins
// nothing, leaves no way round the guard and needs a card to fetch. Only
// where no nook fits does the reward stay on the corridor past the guard.
const SEEDS = FULL ? 40 : 10;
const AREAS = 6;
const REWARDS = new Set(["potion", "attack", "defense"]);
const GATES = new Set(["enemy", "door"]);
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

test("guard rewards lie in dead-end nooks inside their own area", () => {
  let nooks = 0, fallbacks = 0;
  for (let seed = 1; seed <= SEEDS; seed++) for (let area = 0; area < AREAS; area++) for (const tier of [1, 4]) {
    const r = region(seed, area, tier);
    const others = [area - 1, area + 1].filter((a) => a >= 0).map((a) => region(seed, a, tier).cells);
    for (const [k, t] of r.cells) {
      if (!REWARDS.has(t.kind)) continue;
      const [x, y] = k.split(",").map(Number);
      const around = SIDES.map(([dx, dy]) => `${x + dx},${y + dy}`);
      const open = around.filter((n) => r.cells.has(n)), gates = open.filter((n) => GATES.has(r.cells.get(n)!.kind));
      if (open.length === 1 && gates.length) nooks++;
      else if (open.length === 2 && gates.length) fallbacks++;
      assert.ok(!around.some((n) => others.some((o) => o.has(n))), `${seed}:${area}:${tier} reward at ${k} touches another area`);
    }
  }
  assert.ok(nooks > 50 * fallbacks, `nooks ${nooks}, rewards left on the corridor ${fallbacks}`);
});
