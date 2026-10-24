import { kitImage, CITY_SPRITES } from "../sprites/kit.ts";

export const CITY_ROOFS = CITY_SPRITES.slice(0, 6);
type Box = { x: number; y: number; w: number; h: number };

/** Roof corners keep their shape and the center repeats on one pixel grid.
 * Houses retain their exact footprints, without stretching square art into
 * long terraces or rotating the baked-in upper-left lighting. */
export function paintRoofSprite(c: CanvasRenderingContext2D, variant: number, box: Box, px: number) {
  if (box.w <= 0 || box.h <= 0 || px <= 0) return false;
  const image = kitImage(CITY_ROOFS[variant % CITY_ROOFS.length]);
  if (!image) return false;
  const unit = px / 12;
  const edge = Math.min(11, box.w / unit / 2, box.h / unit / 2);
  const source = [0, edge, 24 - edge, 24];
  const xs = [box.x, box.x + edge * unit, box.x + box.w - edge * unit, box.x + box.w];
  const ys = [box.y, box.y + edge * unit, box.y + box.h - edge * unit, box.y + box.h];
  c.save();
  c.imageSmoothingEnabled = false;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const sw = source[col + 1] - source[col], sh = source[row + 1] - source[row];
    if (sw <= 0 || sh <= 0) continue;
    for (let y = ys[row]; y < ys[row + 1] - 0.0001; y += sh * unit)
      for (let x = xs[col]; x < xs[col + 1] - 0.0001; x += sw * unit) {
        const w = Math.min(sw, (xs[col + 1] - x) / unit), h = Math.min(sh, (ys[row + 1] - y) / unit);
        c.drawImage(image, source[col], source[row], w, h, x, y, w * unit, h * unit);
      }
  }
  c.restore();
  return true;
}
