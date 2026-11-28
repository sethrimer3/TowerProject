// An enemy's HP bar over its tile, as every board draws it: a run's fights
// and arrows (board-popups.ts) and the Catacomb's undead (catacomb-board.ts).

/** How long the bar takes to drain to each strike's HP and to fade once the
 * enemy falls (ms), its size and height over the enemy's tile (in tiles),
 * and its colours. */
export const BAR_DRAIN_MS = 200;
export const BAR_FADE_MS = 300;
export const BAR_WIDTH = 0.8;
export const BAR_HEIGHT = 0.1;
export const BAR_RISE = 0.6;
const BAR_FILL = "#d8323a";
const BAR_EMPTY = "#2a0d10";

/** The bar centred on `at` for a tile `s` wide, filled to `share`; never
 * thinner than `minHeight` (3 device pixels, in the caller's units). */
export function paintHpBar(c: CanvasRenderingContext2D, at: { x: number; y: number }, s: number, share: number, alpha: number, minHeight = 3) {
  const w = s * BAR_WIDTH, h = Math.max(minHeight, s * BAR_HEIGHT), x = at.x - w / 2, y = at.y - h / 2;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = "#000";
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = BAR_EMPTY;
  c.fillRect(x, y, w, h);
  c.fillStyle = BAR_FILL;
  c.fillRect(x, y, w * Math.max(0, Math.min(1, share)), h);
  c.restore();
}
