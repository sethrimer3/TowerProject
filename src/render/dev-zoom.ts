/** Dev zoom (Dev Mode only): the board scaled up about the hero by the mouse
 * wheel or a pinch, for a close look at the drawing. Every step puts a whole
 * number of screen pixels on each art pixel, so the art stays crisp, and the
 * last step is the first such number past ×4. Drawing only. */
import { ART_PX } from "./pixel-scale.ts";

/** The most canvas pixels across the board draws while zoomed; past it the
 * browser enlarges the canvas's pixels (still on the art grid). */
export const ZOOM_CANVAS_MAX = 3072;

/** How far the zoom goes past the board's own size, at least. */
export const ZOOM_PAST = 4;

/** Screen pixels an art pixel takes unzoomed, on a board `cssWidth` wide
 * showing `n` tiles at `dpr` screen pixels a CSS pixel. */
export const artScreenPixels = (cssWidth: number, dpr: number, n: number) => (cssWidth * dpr) / (n * ART_PX);

/** The zoom's steps as screen pixels an art pixel: the first whole number
 * past the unzoomed size, up to the first whole number past `ZOOM_PAST` times it. */
export function zoomSteps(a: number) {
  return { min: Math.floor(a) + 1, max: Math.floor(ZOOM_PAST * a) + 1 };
}

/** The step after `level` (0 is unzoomed) one notch in (`dir` 1) or out (-1). */
export function stepZoom(level: number, dir: 1 | -1, a: number) {
  const { min, max } = zoomSteps(a);
  if (!level) return dir > 0 ? min : 0;
  const next = Math.min(max, level + dir);
  return next < min ? 0 : next;
}

/** The step nearest a zoom of `scale` times the unzoomed size (a pinch). */
export function zoomForScale(scale: number, a: number) {
  const { min, max } = zoomSteps(a);
  const level = Math.round(scale * a);
  return level < min ? 0 : Math.min(max, level);
}

/** How the zoomed board is drawn and placed, for screen pixels an art pixel
 * `level` over an unzoomed `a`: the scale, and the canvas pixels an art
 * pixel (whole, so the art lands on the canvas's grid, and capped so the
 * canvas stays at most `ZOOM_CANVAS_MAX` across). */
export function zoomLook(level: number, a: number, n: number) {
  const cap = Math.max(1, Math.floor(ZOOM_CANVAS_MAX / (n * ART_PX)));
  return { scale: level / a, perArtPixel: Math.max(1, Math.min(level, cap)) };
}

/** The canvas's offset (CSS pixels) that puts `hx, hy` (the hero, in the
 * unzoomed board's CSS pixels) at the middle of a board `width` wide at
 * `scale`, kept from showing past the board's edge, on whole screen pixels. */
export function zoomOffset(hx: number, hy: number, width: number, scale: number, dpr: number) {
  const place = (h: number) => {
    const t = Math.min(0, Math.max(width - width * scale, width / 2 - h * scale));
    return Math.round(t * dpr) / dpr;
  };
  return { x: place(hx), y: place(hy) };
}
