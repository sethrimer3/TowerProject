import test from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";

const withBrightness = (brightness: unknown) => {
  const save = defaults() as unknown as { settings: Record<string, unknown> };
  save.settings.brightness = brightness;
  return decode(JSON.stringify(save)).settings.brightness;
};

test("brightness defaults to 60 and is clamped to the 20-100 slider range", () => {
  assert.equal(defaults().settings.brightness, 60);
  assert.equal(withBrightness(55), 55);
  assert.equal(withBrightness(5), 20);
  assert.equal(withBrightness(400), 100);
  assert.equal(withBrightness("dark"), 60);
  assert.equal(withBrightness(undefined), 60);
});
