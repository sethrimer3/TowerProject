import { tileRandom } from "./themes.ts";

const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const TORCH_FRAME_COUNT = 4;
export const TORCH_FRAME_MS = 130;

/** Stable spatial phase: torches animate at the same cadence without ever
 * snapping into a room-wide synchronized loop. */
export function torchAnimationFrame(x: number, y: number, now: number, reduceMotion: boolean) {
  const offset = Math.floor(tileRandom(x, y, 0x19fa) * TORCH_FRAME_COUNT);
  return reduceMotion ? offset : (Math.floor(now / TORCH_FRAME_MS) + offset) % TORCH_FRAME_COUNT;
}

export const GAME_SPRITE_URLS = {
  player: `${ASSET_BASE}assets/sprites/player.png`,
  torch: `${ASSET_BASE}assets/sprites/torch.png`,
  torchFrames: `${ASSET_BASE}assets/sprites/torch-frames.png`,
  stairsUp: `${ASSET_BASE}assets/sprites/stairs-up.png`,
  stairsDown: `${ASSET_BASE}assets/sprites/stairs-down.png`,
} as const;

export type GameSpriteId = keyof typeof GAME_SPRITE_URLS;
const cache = new Map<GameSpriteId, HTMLImageElement>();

function image(id: GameSpriteId) {
  if (typeof Image === "undefined") return null;
  let sprite = cache.get(id);
  if (!sprite) {
    sprite = new Image();
    sprite.src = GAME_SPRITE_URLS[id];
    cache.set(id, sprite);
  }
  return sprite;
}

/** The loaded sprite image, or null while it is still loading. */
export function gameSprite(id: GameSpriteId) {
  const sprite = image(id);
  return sprite?.complete && sprite.naturalWidth ? sprite : null;
}

export function drawGameSprite(c: CanvasRenderingContext2D, id: GameSpriteId) {
  const sprite = image(id);
  if (!sprite?.complete || !sprite.naturalWidth) return false;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, 0, 0, 24, 24);
  c.restore();
  return true;
}

/** Draw one equally-sized horizontal frame from a sprite sheet. */
export function drawGameSpriteFrame(
  c: CanvasRenderingContext2D,
  id: GameSpriteId,
  frame: number,
  frameCount: number,
) {
  const sprite = gameSprite(id);
  if (!sprite || frameCount < 1) return false;
  const sourceWidth = sprite.naturalWidth / frameCount;
  const sourceFrame = ((Math.floor(frame) % frameCount) + frameCount) % frameCount;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, sourceFrame * sourceWidth, 0, sourceWidth, sprite.naturalHeight, 0, 0, 24, 24);
  c.restore();
  return true;
}
