/** Battery saver's white, lit by a tap: a press anywhere brings the white
 * up to full quickly, it stays there while the player keeps pressing, then
 * fades back down to the brightness chosen (the `batteryWhite` setting).
 * Presentation only; the board (Renderer) and the page (`--battery-white`,
 * set by the frame loop) both read `batteryLight`. */

/** The climb to full white after a press. */
export const LIGHT_UP_MS = 150;
/** How long the white stays full after the last press. */
export const LIGHT_HOLD_MS = 2500;
/** The fade back down to the chosen white. */
export const LIGHT_FADE_MS = 900;

/** When the last press came, and the white it found then (0 to 1). */
let pressedAt = -Infinity;
let from = 1;

const lerp = (a: number, b: number, t: number) => (t >= 1 ? b : t <= 0 ? a : a + (b - a) * t);

/** The white now, 0 to 1, given the white chosen (`chosen`, 0 to 1). */
export function batteryLight(chosen: number, now: number) {
  const t = now - pressedAt;
  if (t < LIGHT_UP_MS) return lerp(Math.max(from, chosen), 1, t / LIGHT_UP_MS);
  if (t < LIGHT_UP_MS + LIGHT_HOLD_MS) return 1;
  return lerp(1, chosen, (t - LIGHT_UP_MS - LIGHT_HOLD_MS) / LIGHT_FADE_MS);
}

/** Whether the white is on its way up or down (not resting at full or at
 * the chosen white), so Battery saver draws its frames at the busy rate. */
export function batteryLightMoving(chosen: number, now: number) {
  if (chosen >= 1) return false;
  const t = now - pressedAt;
  return t < LIGHT_UP_MS || (t >= LIGHT_UP_MS + LIGHT_HOLD_MS && t < LIGHT_UP_MS + LIGHT_HOLD_MS + LIGHT_FADE_MS);
}

/** A press: the white climbs to full from wherever it is. `chosen` is the
 * white chosen, 0 to 1. */
export function batteryPress(chosen: number, now: number) {
  from = batteryLight(chosen, now);
  pressedAt = now;
}

/** Forgets the last press (for tests). */
export function resetBatteryLight() {
  pressedAt = -Infinity;
  from = 1;
}
