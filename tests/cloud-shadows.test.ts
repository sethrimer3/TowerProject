import { test } from "node:test";
import assert from "node:assert/strict";
import { CloudField, ForestHeightMap, cloudSurfacePoint } from "../src/render/cloud-shadows.ts";
import { OutdoorWeather } from "../src/render/weather.ts";

test("cloud density is continuous across wrapped world coordinates, seeded, and independent of gameplay RNG", () => {
  const field = new CloudField(7), same = new CloudField(7), other = new CloudField(8);
  assert.deepEqual(field.pixels, same.pixels);
  assert.notDeepEqual(field.pixels, other.pixels);
  assert.deepEqual(field.rays, same.rays);
  assert.notDeepEqual(field.rays, field.pixels, "light shafts integrate gaps along the sun rather than reusing the shadow mask");
  assert.ok(Math.max(...field.rays) > .25 && Math.min(...field.rays) < .01, "visible shafts and unlit air coexist");
  for (let x = -1000; x < 1000; x += 19) {
    const v = field.sample(x, x / 2, 0, 20);
    assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(v - field.sample(x + 768, x / 2 + 768, 0, 20)) < 1e-12);
    assert.ok(Math.abs(v - field.sample(x + .001, x / 2, 0, 20)) < .001);
    assert.ok(Math.abs(field.sample(x, x / 2, 0, 20, field.rays) - field.sample(x + 768, x / 2 + 768, 0, 20, field.rays)) < 1e-12);
  }
  assert.ok(Math.min(...field.pixels) < .01 && Math.max(...field.pixels) > .99, "both sunlit and clouded patches");
});

test("one moving cloud projects consistently onto ground and elevated surfaces", () => {
  const field = new CloudField(17), p = cloudSurfacePoint(40, 70, 80);
  assert.notDeepEqual(p, cloudSurfacePoint(40, 70, 0));
  assert.equal(field.sample(40, 70, 80, 30), field.sample(p.x, p.y, 0, 30));
  assert.equal(field.sample(40, 70, 80, 30), field.sample(40 - 90, 70 - 33, 80, 0));
  assert.notEqual(field.sample(40, 70, 80, 30), field.sample(40, 70, 0, 30));
});

test("height stamps follow alpha silhouettes and drawing order rather than rectangular tile bounds", () => {
  const map = new ForestHeightMap(20), alpha = new Uint8ClampedArray(16).fill(255);
  alpha[5] = 0;
  const mask = { width: 4, height: 4, alpha };
  map.stamp(mask, 0, 0, 16, 16, 4, 40);
  assert.equal(map.at(6, 6), 0, "a transparent gap keeps the ground height");
  assert.ok(map.at(2, 2) > map.at(2, 14), "the upper crown is taller than its foot");
  const tall = map.at(2, 2);
  map.stamp({ ...mask, alpha: new Uint8ClampedArray(16).fill(255) }, 0, 0, 16, 16, 0, 10);
  assert.ok(map.at(2, 2) < tall, "a later foreground object replaces the hidden surface");
  assert.ok(map.at(6, 6) > 0);
  assert.equal(map.at(18, 6), 0);
  assert.equal(map.at(-1000, 0), 0);
  assert.ok(map.pixels.byteLength < 40000, "the static height map stays small");
});

test("weather advances surface shadows on its own clock and freezes them for pause and Reduce motion", () => {
  const c = new Proxy({}, { get: (_, name) => name === "createLinearGradient" || name === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {} }) as CanvasRenderingContext2D;
  const weather = new OutdoorWeather(), times: number[] = [];
  const frame = { dt: .2, reduceMotion: false, active: true, sound: false };
  const draw = (seed = 7) => weather.draw(c, 400, seed, frame, seconds => times.push(seconds));
  draw(); draw();
  frame.active = false; draw();
  frame.active = true; frame.reduceMotion = true; draw();
  frame.reduceMotion = false; draw(); draw(9);
  assert.deepEqual(times.slice(0, 4), [.2, .4, .4, .4]);
  assert.ok(Math.abs(times[4] - .6) < 1e-12);
  assert.equal(times[5], .2, "another forest starts its own weather");
});
