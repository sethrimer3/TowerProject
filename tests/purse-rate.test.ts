import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_FRAME_GAP_MS, PlayClock, RATE_SAMPLE_MS, RateTally } from "../src/ui/purse-rate.ts";

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

test("the play clock runs only while the run plays, a long frame gap counting at most a second", () => {
  const c = new PlayClock();
  assert.equal(c.tick(1000, true), 0, "the first frame only starts it");
  assert.equal(c.tick(1016, true), 16);
  assert.equal(c.tick(60_000, false), 16, "a pause adds nothing");
  assert.equal(c.tick(60_016, true), 32);
  assert.equal(c.tick(600_000, true), 32 + MAX_FRAME_GAP_MS, "a hidden tab's gap is not play");
  c.reset();
  assert.equal(c.tick(700_000, true), 0);
});

test("a pause leaves the rate where it was: only played time counts", () => {
  const r = new RateTally(), c = new PlayClock();
  let found = 0;
  // 30 s of play at 10 found a second, a frame every 100 ms.
  for (let t = 0; t <= 30_000; t += 100) {
    if (t % 1000 === 0) found = t / 100;
    r.sample(found, c.tick(t, true));
  }
  const before = r.perMinute!;
  assert.ok(Math.abs(before - 600) < 30, `about 600 a minute, ${before}`);
  // Ten minutes paused: nothing found, the rate unchanged.
  for (let t = 30_100; t <= 630_000; t += 100) r.sample(found, c.tick(t, false));
  assert.equal(r.perMinute, before);
});
