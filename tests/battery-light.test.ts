import { test } from "node:test";
import assert from "node:assert/strict";
import { LIGHT_FADE_MS, LIGHT_HOLD_MS, LIGHT_UP_MS, batteryLight, batteryLightMoving, batteryPress, resetBatteryLight } from "../src/battery-light.ts";

test("with no press, battery saver's white rests at the brightness chosen", () => {
  resetBatteryLight();
  assert.equal(batteryLight(0.2, 1000), 0.2);
  assert.equal(batteryLightMoving(0.2, 1000), false);
});

test("a press lights the white to full quickly, holds it, then fades back to the chosen white", () => {
  resetBatteryLight();
  batteryPress(0.2, 1000);
  assert.equal(batteryLight(0.2, 1000), 0.2);
  assert.ok(batteryLightMoving(0.2, 1000 + LIGHT_UP_MS / 2));
  assert.ok(batteryLight(0.2, 1000 + LIGHT_UP_MS / 2) > 0.5);
  assert.equal(batteryLight(0.2, 1000 + LIGHT_UP_MS + 10), 1);
  assert.equal(batteryLightMoving(0.2, 1000 + LIGHT_UP_MS + 10), false, "held at full: no frames needed");
  const fading = 1000 + LIGHT_UP_MS + LIGHT_HOLD_MS + LIGHT_FADE_MS / 2;
  assert.ok(batteryLightMoving(0.2, fading));
  assert.ok(Math.abs(batteryLight(0.2, fading) - 0.6) < 1e-9);
  assert.equal(batteryLight(0.2, fading + LIGHT_FADE_MS), 0.2);
});

test("pressing again keeps the white full, and a press mid-fade climbs from where it was", () => {
  resetBatteryLight();
  batteryPress(0.2, 0);
  batteryPress(0.2, LIGHT_UP_MS + 1000);
  assert.equal(batteryLight(0.2, LIGHT_UP_MS + 1000), 1);
  const mid = 2 * LIGHT_UP_MS + 1000 + LIGHT_HOLD_MS + LIGHT_FADE_MS / 2;
  const there = batteryLight(0.2, mid);
  batteryPress(0.2, mid);
  assert.equal(batteryLight(0.2, mid), there);
  assert.equal(batteryLight(0.2, mid + LIGHT_UP_MS), 1);
});

test("at full white chosen, a press changes nothing", () => {
  resetBatteryLight();
  batteryPress(1, 0);
  assert.equal(batteryLight(1, 50), 1);
  assert.equal(batteryLightMoving(1, 50), false);
});
