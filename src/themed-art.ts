import type { FrameContext } from "./render-frame.ts";

/** Drawing the Game theme boards share. Drawing only: nothing here is saved
 * or played by. */

/** Adds a rectangle with corners rounded by `r` to the current path. */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** A dark rim round the board: clear (`clear`) out to `inner` of the
 * board's width from its middle, darkening to `edge` at three quarters of
 * it, its corners. Nothing where the context has no gradients. */
export function vignette(f: FrameContext, inner: number, clear: string, edge: string) {
  const c = f.c, w = f.width;
  if (typeof c.createRadialGradient !== "function") return;
  const g = c.createRadialGradient(w / 2, w / 2, w * inner, w / 2, w / 2, w * 0.75);
  g.addColorStop(0, clear);
  g.addColorStop(1, edge);
  c.fillStyle = g;
  c.fillRect(0, 0, w, w);
}
