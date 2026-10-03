import test from "node:test";
import assert from "node:assert/strict";
import { COUNT_UP_MS, CountUp, countEase } from "../src/ui/count-up.ts";

test("a readout counts up to a rise over half a second, slowing a little at the end", () => {
  const c = new CountUp();
  assert.equal(c.show(100, 0), 100, "the first amount shows at once");
  assert.equal(c.show(200, 1000), 100);
  assert.ok(c.counting(1000));
  const quarter = c.show(200, 1000 + COUNT_UP_MS / 4);
  assert.equal(quarter, 100 + 100 * countEase(0.25));
  assert.ok(quarter > 125, "quicker than a straight line at first");
  assert.equal(c.show(200, 1000 + COUNT_UP_MS), 200);
  assert.equal(c.counting(1000 + COUNT_UP_MS), false);
  // The pace at the end is half the pace at the start.
  const d = 1e-6;
  assert.ok(Math.abs(countEase(1) - countEase(1 - d) - 0.5 * d) < 1e-9);
  assert.ok(Math.abs(countEase(d) - 1.5 * d) < 1e-9);
});

test("a rise mid-count counts on from the amount shown; a fall shows at once", () => {
  const c = new CountUp();
  c.show(0, 0);
  c.show(100, 0);
  const mid = c.show(100, COUNT_UP_MS / 2);
  assert.equal(c.show(300, COUNT_UP_MS / 2), mid, "no jump when the target rises again");
  assert.ok(c.show(300, COUNT_UP_MS) > mid);
  assert.equal(c.show(300, COUNT_UP_MS * 2), 300);
  assert.equal(c.show(50, COUNT_UP_MS * 2), 50);
  assert.equal(c.counting(COUNT_UP_MS * 2), false);
  assert.equal(c.show(80, COUNT_UP_MS * 3, true), 80, "instant (reduced motion) never counts");
});
