import { test } from "node:test";
import assert from "node:assert/strict";
import { layeredFeather, softenField } from "../src/render/soft-field.ts";
import { CLOUD_LIGHT, GOD_RAY_STYLE, CloudField } from "../src/render/cloud-shadows.ts";

test("nested feather layers widen the soft edge without increasing peak light", () => {
  assert.equal(layeredFeather(0, 4, 8, 2.8), 1);
  assert.equal(layeredFeather(20, 4, 8, 2.8), 0);
  assert.ok(layeredFeather(5, 4, 8, 2.8) > layeredFeather(5, 4, 1, 1));
  let previous = 1;
  for (let distance = 0; distance <= 15; distance += .1) {
    const value = layeredFeather(distance, 4, 8, 2.8);
    assert.ok(value >= 0 && value <= previous + 1e-12);
    assert.equal(value, layeredFeather(-distance, 4, 8, 2.8));
    previous = value;
  }
});

test("combined-field softening spreads a point smoothly and conserves light across wrapping edges", () => {
  const source = new Float32Array(81); source[0] = 1;
  const before = source.slice(), result = softenField(source, 9, 9, 2, 2);
  assert.deepEqual(source, before);
  assert.ok(result[0] > 0 && result[0] < .1);
  assert.ok(result[1] > 0 && result[8] > 0 && result[72] > 0);
  assert.ok(Math.abs(result.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
  assert.equal(result[1], result[8]);
  assert.ok(result.every(value => value >= 0 && value <= 1));
});

test("softening preserves uniform fields and supports clamped local effects without opposite-edge light", () => {
  const constant = new Float32Array(64).fill(.25);
  assert.deepEqual(softenField(constant, 8, 8), constant);
  const point = new Float32Array(64); point[0] = 1;
  assert.equal(softenField(point, 8, 8, 1, 1, "clamp")[7], 0);
  assert.deepEqual(softenField(point, 8, 8, 0), point);
});

test("god rays descend steeply, stay faint and have more continuity along their length than across their width", () => {
  assert.ok(CLOUD_LIGHT.direction.y / CLOUD_LIGHT.direction.x >= 2.5);
  assert.ok(GOD_RAY_STYLE.opacity.sunny <= .18 && GOD_RAY_STYLE.opacity.cloudy <= .15);
  assert.ok(GOD_RAY_STYLE.opacity.storm < GOD_RAY_STYLE.opacity.rain);
  const field = new CloudField(507), pixels = field.rays;
  let along = 0, across = 0;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const value = pixels[y * 128 + x];
    along += Math.abs(value - pixels[((y + 3) % 128) * 128 + (x + 1) % 128]);
    across += Math.abs(value - pixels[((y + 1) % 128) * 128 + (x + 3) % 128]);
  }
  assert.ok(along < across * .6, `steep shafts: along=${along}, across=${across}`);
});
