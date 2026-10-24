import type { Tile } from "../entities.ts";
import { tileRandom } from "../random.ts";
import { kitImage } from "./kit.ts";

export const AMBIENT_SPRITE_FRAMES = 5;
export const HERO_IDLE_FRAMES = 4;
export const DEATH_SKULL_FRAMES = 6;
export const HERO_FACINGS = ["down", "up", "left", "right"] as const;

/** Short, coordinate-phased windows never consume a gameplay random stream. */
function windowFrame(now: number, x: number, y: number, seed: number, period: number, duration: number) {
  const phase = Math.floor(tileRandom(x, y, seed) * period);
  const age = ((now + phase) % period + period) % period;
  return age < duration ? 1 + Math.floor(age / duration * 4) : 0;
}
export function potionBubbleFrame(x: number, y: number, now: number, seed = 0) {
  return windowFrame(now, x, y, seed ^ 0x712b, 4200, 900);
}
export function keyShineFrame(x: number, y: number, now: number, seed = 0) {
  const period = 22000 + Math.floor(tileRandom(x, y, seed ^ 0x954f) * 14000);
  return windowFrame(now, x, y, seed ^ 0x329d, period, 600);
}
export function pickupAnimationFrame(tile: Tile, x: number, y: number, now: number, seed = 0) {
  return tile.kind === "potion" ? potionBubbleFrame(x, y, now, seed)
    : tile.kind === "key" ? keyShineFrame(x, y, now, seed) : 0;
}

export function drawSpriteFrame(c: CanvasRenderingContext2D, id: string, frame: number, x = 0, y = 0) {
  const image = kitImage(id);
  if (!image) return false;
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(image, frame * 24, 0, 24, 24, x, y, 24, 24); c.restore();
  return true;
}
export function drawPickupAnimation(c: CanvasRenderingContext2D, tile: Tile, x: number, y: number, now: number, seed = 0) {
  if (tile.kind !== "potion" && tile.kind !== "key") return;
  const id = tile.kind === "potion" ? "ambient-potion-bubbles" : "ambient-key-shine";
  // Load while resting so the first rare glint is ready when its window opens.
  kitImage(id);
  const frame = pickupAnimationFrame(tile, x, y, now, seed);
  if (frame) drawSpriteFrame(c, id, frame);
}

/** Breathing waits for a stationary, living hero, and resets on motion,
 * facing, combat, toggles or a new board. Feet and gear stay in place. */
export class HeroIdleAnimation {
  private key = "";
  private since = 0;
  frame(now: number, active: boolean, key: string) {
    if (!active) { this.key = ""; return 0; }
    if (key !== this.key) { this.key = key; this.since = now; }
    const age = now - this.since - 700;
    if (age < 0) return 0;
    return [0, 1, 2, 1, 0, 3, 0, 0][Math.floor(age / 320) % 8] ?? 0;
  }
}
export const deathSkullFrame = (age: number, animate: boolean) => animate ? Math.min(DEATH_SKULL_FRAMES - 1, Math.max(0, Math.floor(age / 140))) : 0;
