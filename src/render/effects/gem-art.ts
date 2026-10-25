import { drawKit } from "../../sprites/kit.ts";
import { tileTransform, type FrameContext } from "../render-frame.ts";

/** How long a collected Gem's sparkle lasts. */
export const GEM_SPARKLE_MS = 800;

/** A cut gem in 24x24 tile space: a cyan crown over a pointed pavilion,
 * its facets picked out in light, with a soft glow behind it. `time`
 * (ms) turns a glint across it now and then unless motion is reduced. */
export function paintGem(c: CanvasRenderingContext2D, time: number, still: boolean) {
  c.save();
  const glow = c.createRadialGradient(12, 12, 0, 12, 12, 12);
  glow.addColorStop(0, "rgba(120, 225, 255, 0.55)");
  glow.addColorStop(1, "rgba(120, 225, 255, 0)");
  c.fillStyle = glow;
  c.fillRect(0, 0, 24, 24);
  c.lineJoin = "round";
  // The pavilion, then the crown above it.
  c.beginPath();
  c.moveTo(4, 9.5);
  c.lineTo(20, 9.5);
  c.lineTo(12, 20.5);
  c.closePath();
  c.fillStyle = "#2fa9e0";
  c.fill();
  c.beginPath();
  c.moveTo(7.5, 5);
  c.lineTo(16.5, 5);
  c.lineTo(20, 9.5);
  c.lineTo(4, 9.5);
  c.closePath();
  c.fillStyle = "#8fe6ff";
  c.fill();
  // The facets.
  c.beginPath();
  c.moveTo(7.5, 5);
  c.lineTo(10, 9.5);
  c.lineTo(12, 20.5);
  c.lineTo(14, 9.5);
  c.lineTo(16.5, 5);
  c.moveTo(10, 9.5);
  c.lineTo(12, 5);
  c.lineTo(14, 9.5);
  c.strokeStyle = "rgba(225, 250, 255, 0.85)";
  c.lineWidth = 0.6;
  c.stroke();
  // The outline.
  c.beginPath();
  c.moveTo(7.5, 5);
  c.lineTo(16.5, 5);
  c.lineTo(20, 9.5);
  c.lineTo(12, 20.5);
  c.lineTo(4, 9.5);
  c.closePath();
  c.strokeStyle = "#0d3a5c";
  c.lineWidth = 1;
  c.stroke();
  // A glint for the first fifth of every two seconds.
  const t = still ? 0.5 : (time % 2000) / 400;
  if (t < 1) star(c, 9 + 6 * t, 7, 3.5 * Math.sin(Math.PI * t), 1);
  c.restore();
}

/** A four-pointed white star at (x, y), `r` from its centre to its points. */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  if (r <= 0 || alpha <= 0) return;
  const w = r * 0.22;
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + w, y - w);
  c.lineTo(x + r, y);
  c.lineTo(x + w, y + w);
  c.lineTo(x, y + r);
  c.lineTo(x - w, y + w);
  c.lineTo(x - r, y);
  c.lineTo(x - w, y - w);
  c.closePath();
  c.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  c.fill();
}

/** The Gem lying at (x, y), bobbing gently over its tile: the kit's Gem
 * sprite, as its pickup popup shows, where sprites are styled. */
export function drawGem(f: FrameContext, x: number, y: number) {
  const still = f.look.reduceMotion, c = f.c;
  c.save();
  c.setTransform(tileTransform(f, x, y));
  if (!still) c.translate(0, Math.sin(f.now / 400) * 0.8);
  if (!(f.look.styledSprites && drawKit(c, "gem"))) paintGem(c, f.now, still);
  c.restore();
}

/** The sparkle a collected Gem vanishes in, `age` ms after: stars flying
 * out from its tile and fading. */
export function drawGemSparkle(f: FrameContext, x: number, y: number, age: number) {
  if (age < 0 || age >= GEM_SPARKLE_MS) return;
  const t = age / GEM_SPARKLE_MS, c = f.c, out = f.look.reduceMotion ? 0.5 : 1 - (1 - t) * (1 - t);
  c.save();
  c.setTransform(tileTransform(f, x, y));
  c.globalCompositeOperation = "lighter";
  const flash = c.createRadialGradient(12, 12, 0, 12, 12, 6 + 12 * out);
  flash.addColorStop(0, `rgba(200, 245, 255, ${0.8 * (1 - t)})`);
  flash.addColorStop(1, "rgba(120, 225, 255, 0)");
  c.fillStyle = flash;
  c.fillRect(-12, -12, 48, 48);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3, d = 3 + 13 * out * (i % 2 ? 0.7 : 1);
    star(c, 12 + Math.cos(a) * d, 12 + Math.sin(a) * d, (i % 2 ? 2 : 3) * (1 - t * 0.6), 1 - t);
  }
  c.restore();
}
