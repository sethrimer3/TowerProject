import { tileTransform, type FrameContext } from "../render-frame.ts";
import { paintEnemy } from "../tile-painters.ts";
import type { Smitten } from "../../angel.ts";
import { drawPoof, POOF_MS } from "./poof.ts";

/** How long Avenging Angel's slash takes to cut across an enemy before it
 * vanishes in a poof, and the whole smite. */
export const SLASH_MS = 360;
export const SMITE_MS = SLASH_MS + POOF_MS;

/** Avenging Angel smiting an enemy, `age` ms after it: the enemy still
 * standing as a golden slash cuts diagonally across it, top right to bottom
 * left, then a poof where it stood; with reduced motion, the slash shows
 * whole. */
export function drawSmite(f: FrameContext, s: Smitten, age: number) {
  if (age < 0 || age >= SMITE_MS) return;
  if (age >= SLASH_MS) {
    drawPoof(f, s.x, s.y, age - SLASH_MS);
    return;
  }
  const c = f.c, t = age / SLASH_MS, cut = f.look.reduceMotion ? 1 : Math.min(1, t / 0.55);
  c.save();
  c.setTransform(tileTransform(f, s.x, s.y));
  paintEnemy(c, { kind: "enemy", enemy: s.enemy });
  // The slash: a white core in a golden glow, growing across the tile, then thinning.
  const thin = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45, [x0, y0, x1, y1] = [24, -2, 0, 26];
  c.lineCap = "round";
  c.globalCompositeOperation = "lighter";
  for (const [width, color] of [[5, "rgba(255, 200, 80, 0.55)"], [2.4, "rgba(255, 244, 200, 0.95)"], [1, "#ffffff"]] as const) {
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x0 + (x1 - x0) * cut, y0 + (y1 - y0) * cut);
    c.strokeStyle = color;
    c.lineWidth = width * thin;
    c.stroke();
  }
  c.restore();
}
