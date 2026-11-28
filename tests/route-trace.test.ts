import { test } from "node:test";
import assert from "node:assert/strict";
import { endsAt, routeTurns, planRoute, ROUTE_CELLS, ROUTE_LINES, routeCellColor, routeCells, routeSettled, slowestSpeed, sparks } from "../src/render/effects/route-trace.ts";
import { TRACE_TILES_PER_S } from "../src/render/effects/tile-trace.ts";
import { random } from "../src/random.ts";

// Right two, up one, right one: a turn each way.
const ROUTE = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }];

test("the five lines run side by side, meeting edge to edge round square corners", () => {
  const lines = routeCells(ROUTE);
  assert.equal(lines.length, ROUTE_LINES);
  // The centre line covers each step's cells and the end's.
  assert.equal(lines[2].length, 4 * ROUTE_CELLS + 1);
  for (const cells of lines) {
    // In screen cells from the first tile's centre (y down): each beside the last.
    const abs = cells.map((c) => {
      const v = ROUTE[c.at];
      return [v.x * ROUTE_CELLS + c.ox, -v.y * ROUTE_CELLS + c.oy];
    });
    assert.equal(new Set(abs.map((p) => p.join())).size, abs.length);
    for (let k = 1; k < abs.length; k++) assert.equal(Math.abs(abs[k][0] - abs[k - 1][0]) + Math.abs(abs[k][1] - abs[k - 1][1]), 1);
    for (let k = 1; k < cells.length; k++) assert.ok(cells[k].d >= cells[k - 1].d);
  }
});

test("a wrap round the world breaks the lines", () => {
  const lines = routeCells([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 0 }, { x: 8, y: 0 }]);
  assert.equal(lines[2].length, 2 * (ROUTE_CELLS + 1));
});

test("each line draws at least twice the hero's speed and at least ten times the tile trace's", () => {
  assert.equal(slowestSpeed(1), 10 * TRACE_TILES_PER_S);
  assert.equal(slowestSpeed(100), 200);
  for (const rate of [0, 1, 3, 10, 15]) {
    const plan = planRoute(ROUTE, rate, random(rate + 3));
    for (const v of plan.speeds) assert.ok(v >= slowestSpeed(rate) && v <= slowestSpeed(rate) * 1.35);
  }
});

test("pale at the head, gold behind it; the end square pops sparks that fade", () => {
  const plan = planRoute(ROUTE, 2, random(5)), t = endsAt(plan) / 2;
  assert.equal(routeCellColor(plan, 0, 0, 0)![2] > 200, true);
  const drawn = plan.lines[0].filter((_, k) => routeCellColor(plan, 0, k, t)).length;
  assert.ok(drawn > 0 && drawn < plan.lines[0].length);
  assert.ok(routeCellColor(plan, 0, 0, 0.3)![2] < 160);
  assert.deepEqual(sparks(plan, -0.01), []);
  assert.equal(sparks(plan, 0.1).length, 6);
  assert.deepEqual(sparks(plan, 1), []);
  assert.ok(!routeSettled(plan, t));
  assert.ok(routeSettled(plan, 5));
});

test("a square marks every 90° turn, but not a wrap or a straight", () => {
  assert.deepEqual(routeTurns(ROUTE), [2, 3]);
  assert.deepEqual(routeTurns([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), []);
  assert.deepEqual(routeTurns([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 1 }]), []);
});
