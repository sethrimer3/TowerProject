import { test } from "node:test";
import assert from "node:assert/strict";
import { cellColor, planTrace, ringCells, settledColor, TILE_CELLS, TRACE_LINES, traceSettled } from "../src/render/effects/tile-trace.ts";
import { random } from "../src/random.ts";

test("each line rings the tile from 12 o'clock clockwise, never covering it", () => {
  for (let line = 0; line < TRACE_LINES; line++) {
    const cells = ringCells(line), out = line + 1;
    assert.equal(cells.length, 4 * (TILE_CELLS + 2 * out - 1));
    assert.equal(new Set(cells.map(([x, y]) => `${x},${y}`)).size, cells.length);
    assert.deepEqual(cells[0], [TILE_CELLS / 2, -out]);
    // Clockwise: along the top to the right first, then down the right side.
    assert.deepEqual(cells[1], [TILE_CELLS / 2 + 1, -out]);
    for (const [x, y] of cells) {
      assert.ok(x < 0 || y < 0 || x >= TILE_CELLS || y >= TILE_CELLS, "outside the tile");
      assert.equal(Math.max(-1 - x, -1 - y, x - TILE_CELLS, y - TILE_CELLS), line, "in its own ring");
    }
    for (let k = 1; k <= cells.length; k++) {
      const [ax, ay] = cells[k - 1], [bx, by] = cells[k % cells.length];
      assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1, "each cell beside the last");
    }
  }
});

test("the lines trace at slightly different speeds, pale at the head and gold once settled", () => {
  const plan = planTrace(random(7));
  assert.equal(new Set(plan.durations).size, TRACE_LINES);
  for (const d of plan.durations) assert.ok(d > 0.49 && d < 0.93);
  assert.equal(cellColor(plan, 0, 0, 0), null);
  const t = plan.durations[0] / 2, count = ringCells(0).length;
  let head = -1;
  for (let k = 0; k < count; k++) if (cellColor(plan, 0, k, t)) head = k;
  assert.ok(head > 0 && head < count - 1);
  const pale = cellColor(plan, 0, head, t)!, tail = cellColor(plan, 0, 0, t)!;
  assert.ok(pale[2] > 200, "the head is pale");
  assert.ok(tail[2] < pale[2], "the tail has turned toward gold");
  assert.ok(!traceSettled(plan, t));
  const end = 3;
  assert.ok(traceSettled(plan, end));
  for (let line = 0; line < TRACE_LINES; line++)
    for (let k = 0; k < ringCells(line).length; k++)
      assert.deepEqual(cellColor(plan, line, k, end), settledColor(plan.shade[line][k]));
});

test("even the slowest trace has settled before its pulse starts, 1.4s in (style.css)", () => {
  assert.ok(traceSettled(planTrace(() => 1), 1.4));
  assert.ok(traceSettled(planTrace(() => 0), 1.4));
});
