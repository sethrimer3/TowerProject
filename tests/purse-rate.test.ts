import { test } from "node:test";
import assert from "node:assert/strict";
import { RATE_SAMPLE_MS, RateTally } from "../src/ui/purse-rate.ts";

test("a rate needs two samples, taken every 3 seconds", () => {
  const r = new RateTally();
  assert.equal(r.sample(0, 0), true);
  assert.equal(r.perMinute, null);
  assert.equal(r.sample(50, RATE_SAMPLE_MS - 1), false);
  assert.equal(r.perMinute, null);
  assert.equal(r.sample(10, RATE_SAMPLE_MS), true);
  // 10 in 3 seconds is 200 a minute.
  assert.equal(r.perMinute, 200);
});

test("the rate is the rise over the last minute", () => {
  const r = new RateTally();
  // 100 a sample for the first minute, then nothing.
  for (let t = 0; t <= 60_000; t += 3000) r.sample(t / 30, t);
  assert.equal(r.perMinute, 2000);
  for (let t = 63_000; t <= 90_000; t += 3000) r.sample(2000, t);
  // From 30 s to 90 s: 1,000 found, the first half minute dropped.
  assert.equal(r.perMinute, 1000);
  for (let t = 93_000; t <= 120_000; t += 3000) r.sample(2000, t);
  assert.equal(r.perMinute, 0);
});

test("a fall reads as no rise, and reset starts over", () => {
  const r = new RateTally();
  r.sample(100, 0);
  r.sample(40, 3000);
  assert.equal(r.perMinute, 0);
  r.reset();
  assert.equal(r.perMinute, null);
  assert.equal(r.sample(0, 3001), true);
});
