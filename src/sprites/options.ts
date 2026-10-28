import type { Tile } from "../entities.ts";
import { doorRule, drainsHp } from "../doors.ts";
import { drawKit, kitImage } from "./kit.ts";
import { tileRandom } from "../random.ts";
import { drawPixelOutline } from "./pixel-outline.ts";
export const TORCH_FRAME_COUNT = 4;
export const TORCH_FRAME_MS = 130;
export function torchAnimationFrame(x: number, y: number, now: number, reduceMotion: boolean) {
  const offset = Math.floor(tileRandom(x, y, 0x19fa) * TORCH_FRAME_COUNT);
  return reduceMotion ? offset : (Math.floor(now / TORCH_FRAME_MS) + offset) % TORCH_FRAME_COUNT;
}

export const SQUARE_DOORS = ["yellow", "blue", "red", "steel", "wood", "heart"] as const;
export function squareDoorSprite(tile: Tile) {
  const rule = doorRule(tile);
  const kind = rule.type === "wood" ? "wood" : rule.type === "fullHp" ? "heart"
    : rule.mode === "all" && rule.keys.length === 1 ? rule.keys[0] : "steel";
  return `square-door-${kind}`;
}

/** The entire door stays within its 24-pixel collision tile. Requirements
 * remain live PNG marks, including mixed-key and heart-draining doors. */
export function drawSquareDoor(c: CanvasRenderingContext2D, tile: Tile, outline = true) {
  if (outline) drawPixelOutline(c, squareDoorSprite(tile), "black");
  if (!drawKit(c, squareDoorSprite(tile))) return false;
  const rule = doorRule(tile);
  if (rule.type === "keys") {
    if (drainsHp(rule)) drawKit(c, "heart", 8, 6, 8);
    rule.keys.forEach((color, i) => drawKit(c, `key-${color}`, 3 + i * 6, 14, 7));
  }
  return true;
}

export function drawAnimatedTorch(c: CanvasRenderingContext2D, x: number, y: number, now: number, reduceMotion: boolean) {
  const image = kitImage("torch-animation");
  if (!image) return false;
  const frame = torchAnimationFrame(x, y, now, reduceMotion);
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(image, frame * 24, 0, 24, 24, 0, 0, 24, 24); c.restore();
  return true;
}
export const SPRITE_TORCH_FRAMES = TORCH_FRAME_COUNT;
