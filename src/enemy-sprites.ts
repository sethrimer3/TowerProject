const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const cache = new Map<string, HTMLImageElement>();

export function enemySpriteId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function enemySpriteUrl(name: string) {
  return `${ASSET_BASE}assets/enemies/${enemySpriteId(name)}.png`;
}

function image(name: string) {
  const url = enemySpriteUrl(name);
  let sprite = cache.get(url);
  if (!sprite) {
    sprite = new Image();
    sprite.src = url;
    cache.set(url, sprite);
  }
  return sprite;
}

/** Draws a complete 96px source sprite into one 24px game tile. Returns
 * false while loading or after an asset error so the procedural fallback
 * remains available. */
export function drawEnemySprite(c: CanvasRenderingContext2D, name: string) {
  const sprite = image(name);
  if (!sprite.complete || !sprite.naturalWidth) return false;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, 0, 0, 24, 24);
  c.restore();
  return true;
}
