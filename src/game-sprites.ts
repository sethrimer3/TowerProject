const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";

export const GAME_SPRITE_URLS = {
  player: `${ASSET_BASE}assets/sprites/player.png`,
  torch: `${ASSET_BASE}assets/sprites/torch.png`,
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

export function drawGameSprite(c: CanvasRenderingContext2D, id: GameSpriteId) {
  const sprite = image(id);
  if (!sprite?.complete || !sprite.naturalWidth) return false;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, 0, 0, 24, 24);
  c.restore();
  return true;
}
