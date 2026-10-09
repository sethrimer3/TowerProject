import { test } from "node:test";
import assert from "node:assert/strict";
import { point, type Tile } from "../src/entities.ts";
import { doorRule } from "../src/doors.ts";
import { region } from "../src/delve/labyrinth.ts";
import { delveCensus } from "../src/delve/census.ts";
import { keysPerLock, woodShare } from "../src/tower/census.ts";
import { QUOTA_DOORS } from "../src/key-schedule.ts";

/** The Delve follows the Tower's door and key schedules by equivalent floor
 * (docs/DOOR_AND_KEY_SCHEDULE.md, phase 5). */

const seeds = [7919, 15838, 23757, 31676];
const band = (tier: number, from: number, to: number) => delveCensus({ towers: [tier], from, to, band: to - from + 1, seeds: 6 })[0].avg;

test("each delve's quota doors track the schedule of the tower of its number", () => {
  for (const [tier, from, to] of [[1, 401, 500], [9, 101, 200]]) {
    const c = band(tier, from, to);
    for (const door of QUOTA_DOORS) {
      const want = c[`target:${door}`] ?? 0, placed = (c[`door:${door}`] ?? 0) + (c[`dropped:${door}`] ?? 0);
      assert.ok(want > 0 && Math.abs(placed - want) / want < 0.25, `delve ${tier} floors ${from}-${to}: ${door} ${placed.toFixed(2)} a floor for ${want.toFixed(2)}`);
    }
  }
});

test("the Delve's keys per lock track each colour's aim, and its yellow locks the wooden share", () => {
  for (const [tier, from, to] of [[1, 1, 100], [1, 401, 500], [9, 201, 300]]) {
    const c = band(tier, from, to), found = keysPerLock(c);
    // Floors 1-100 hold the first blue doors and floor 51's entrance key, a surplus by design.
    for (const color of from > 100 ? ["yellow", "blue"] as const : ["yellow"] as const)
      assert.ok(Math.abs(found[color] - c[`aim:${color}`]!) < 0.2, `delve ${tier} floors ${from}-${to}: ${color} ${found[color].toFixed(2)} keys a lock for ${c[`aim:${color}`]!.toFixed(2)}`);
    assert.ok(Math.abs(woodShare(c) * 100 - c["target:wood"]!) < 15, `delve ${tier} floors ${from}-${to}: ${(woodShare(c) * 100).toFixed(0)}% wooden for ${c["target:wood"]}%`);
  }
});

/** Whether a door takes a blue or red key. */
const rare = (t: Tile) => {
  const rule = t.kind === "door" ? doorRule(t) : null;
  return rule?.type === "keys" && rule.mode === "all" && rule.keys.some((c) => c !== "yellow");
};

test("blue and red doors never stand on the way to the milestone gate", () => {
  for (const tier of [1, 9])
    for (const seed of seeds)
      for (const area of [12, 40]) {
        const cells = new Map<string, Tile>();
        for (const a of [area - 1, area, area + 1]) for (const [k, t] of region(seed, a, tier).cells) cells.set(k, t);
        const r = region(seed, area, tier), goal = point(r.gate.x, r.gate.y);
        const seen = new Set([point(r.entry.x, r.entry.y)]), queue = [r.entry];
        for (let i = 0; i < queue.length && !seen.has(goal); i++)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const p = { x: queue[i].x + dx, y: queue[i].y + dy }, k = point(p.x, p.y), t = cells.get(k);
            if (!t || seen.has(k) || rare(t)) continue;
            seen.add(k);
            queue.push(p);
          }
        assert.ok(seen.has(goal), `delve ${tier} seed ${seed} area ${area}: the gate needs a blue or red key`);
      }
});

test("the equivalent floor blue and red keys first appear on holds one near the entrance", () => {
  const keysOn = (area: number, tier: number, color: string, floor: number) => seeds.every((seed) => {
    const r = region(seed, area, tier);
    return [...r.cells].some(([k, t]) => t.kind === "key" && t.color === color && Math.floor(r.metadata.get(k)!.depth / 10) === floor);
  });
  assert.ok(keysOn(5, 1, "blue", 50), "floor 51 of the first delve");
  assert.ok(keysOn(10, 1, "red", 100), "floor 101 of the first delve");
  assert.ok(keysOn(1, 9, "blue", 10), "floor 11 of the ninth");
  for (const seed of seeds)
    assert.ok(![...region(seed, 4, 1).cells.values()].some((t) => t.kind === "key" && t.color === "blue"), "no blue key below floor 51 of the first delve");
});
