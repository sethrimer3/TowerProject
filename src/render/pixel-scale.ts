/** Pixel-perfect scaling: the board drawn at a whole number of canvas
 * pixels an art pixel, the way pixel-art games draw a fixed low resolution
 * scaled up ×2 or ×3, then fitted to the screen. Drawing only. */

/** A tile's size in art pixels: the PNG kit, dungeon tiles and decor are
 * drawn ART_PX × ART_PX a tile (tile space). */
export const ART_PX = 24;

/** The canvas pixels an art pixel takes on a board `device` screen pixels
 * across showing `n` tiles: the whole number at or just above the screen's
 * own, so the browser only ever shrinks the canvas a little to fit, which
 * keeps every art pixel the same size (a hair soft at the edges) where
 * drawing one 1.75 or 2.7 screen pixels wide makes some wider than others.
 * One just below the screen's (within 5%) is close enough. */
export function artPixelScale(device: number, n: number) {
  const exact = device / (n * ART_PX), below = Math.floor(exact);
  return below >= 1 && exact - below < 0.05 ? below : below + 1;
}

/** `v` on the grid of art pixels: a whole number of them. */
export const onArtGrid = (v: number) => Math.round(v * ART_PX) / ART_PX;
