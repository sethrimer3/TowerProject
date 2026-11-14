import { drawKit } from "../../sprites/kit.ts";
import { tileTransform, type FrameContext } from "../render-frame.ts";
import type { GemKind } from "../../economy/gems.ts";

/** How long a collected Gem's sparkle lasts. */
export const GEM_SPARKLE_MS = 800;

/** A Gem kind's colours: its glow (an "r, g, b"), pavilion, crown, facet
 * lines and outline. The golden and stellar ones are stub art, drawn in
 * place of sprites until those are made. */
type GemPalette = { glow: string; pavilion: string; crown: string; facets: string; outline: string };
const PALETTES: Record<GemKind, GemPalette> = {
  plain: { glow: "120, 225, 255", pavilion: "#2fa9e0", crown: "#8fe6ff", facets: "rgba(225, 250, 255, 0.85)", outline: "#0d3a5c" },
  golden: { glow: "255, 205, 90", pavilion: "#d99a1e", crown: "#ffe08a", facets: "rgba(255, 248, 220, 0.9)", outline: "#5c3a08" },
  stellar: { glow: "205, 170, 255", pavilion: "#8a5cf0", crown: "#f2e6ff", facets: "rgba(255, 255, 255, 0.95)", outline: "#2c1460" },
};

/** A cut gem in 24x24 tile space: a crown over a pointed pavilion in
 * `kind`'s colours (cyan for a plain Gem), its facets picked out in light,
 * with a soft glow behind it. `time` (ms) turns a glint across it now and
 * then unless motion is reduced. */
export function paintGem(c: CanvasRenderingContext2D, time: number, still: boolean, kind: GemKind = "plain") {
  const colours = PALETTES[kind];
  c.save();
  const glow = c.createRadialGradient(12, 12, 0, 12, 12, 12);
  glow.addColorStop(0, `rgba(${colours.glow}, 0.55)`);
  glow.addColorStop(1, `rgba(${colours.glow}, 0)`);
  c.fillStyle = glow;
  c.fillRect(0, 0, 24, 24);
  c.lineJoin = "round";
  // The pavilion, then the crown above it.
  c.beginPath();
  c.moveTo(4, 9.5);
  c.lineTo(20, 9.5);
  c.lineTo(12, 20.5);
  c.closePath();
  c.fillStyle = colours.pavilion;
  c.fill();
  c.beginPath();
  c.moveTo(7.5, 5);
  c.lineTo(16.5, 5);
  c.lineTo(20, 9.5);
  c.lineTo(4, 9.5);
  c.closePath();
  c.fillStyle = colours.crown;
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
  c.strokeStyle = colours.facets;
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
  c.strokeStyle = colours.outline;
  c.lineWidth = 1;
  c.stroke();
  // A glint for the first fifth of every two seconds.
  const t = still ? 0.5 : (time % 2000) / 400;
  if (t < 1) star(c, 9 + 6 * t, 7, 3.5 * Math.sin(Math.PI * t), 1);
  c.restore();
}

/** A Gem of `kind` in 24x24 tile space: a plain one the kit's Gem sprite
 * where sprites are styled (`styled`), the rest painted. */
export function drawGemArt(c: CanvasRenderingContext2D, kind: GemKind, time: number, still: boolean, styled: boolean) {
  if (!(kind === "plain" && styled && drawKit(c, "gem"))) paintGem(c, time, still, kind);
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

/** Where a Stellar Gem's twinkles sit round it in 24x24 tile space, and
 * when each peaks in its cycle. */
const TWINKLES = [[3, 4, 0], [21, 6, 0.3], [19, 20, 0.55], [4, 18, 0.8], [12, 1, 0.15], [23, 13, 0.7]] as const;
const TWINKLE_MS = 1600;

/** A Stellar Gem's twinkles: small stars round it, each swelling and
 * fading on a cycle of its own (stub art, until twinkle sprites are made);
 * held half-lit with motion reduced. */
function drawTwinkles(c: CanvasRenderingContext2D, time: number, still: boolean) {
  for (const [x, y, phase] of TWINKLES) {
    const t = still ? 0.5 : (time / TWINKLE_MS + phase) % 1, glow = Math.sin(Math.PI * t);
    star(c, x, y, 0.6 + 1.6 * glow, 0.35 + 0.65 * glow);
  }
}

/** The Gem of `kind` lying at (x, y), bobbing gently over its tile: the
 * kit's Gem sprite for a plain one, as its pickup popup shows, where
 * sprites are styled; a Stellar Gem twinkling round it. */
export function drawGem(f: FrameContext, x: number, y: number, kind: GemKind = "plain") {
  const still = f.look.reduceMotion, c = f.c;
  c.save();
  c.setTransform(tileTransform(f, x, y));
  if (!still) c.translate(0, Math.sin(f.now / 400) * 0.8);
  drawGemArt(c, kind, f.now, still, !!f.look.styledSprites);
  if (kind === "stellar") drawTwinkles(c, f.now, still);
  c.restore();
}

/** The sparkle a collected Gem of `kind` vanishes in, `age` ms after:
 * stars flying out from its tile and fading, in its glow. */
export function drawGemSparkle(f: FrameContext, x: number, y: number, age: number, kind: GemKind = "plain") {
  if (age < 0 || age >= GEM_SPARKLE_MS) return;
  const t = age / GEM_SPARKLE_MS, c = f.c, out = f.look.reduceMotion ? 0.5 : 1 - (1 - t) * (1 - t);
  const glow = PALETTES[kind].glow, tint = kind === "plain" ? "200, 245, 255" : glow;
  c.save();
  c.setTransform(tileTransform(f, x, y));
  c.globalCompositeOperation = "lighter";
  const flash = c.createRadialGradient(12, 12, 0, 12, 12, 6 + 12 * out);
  flash.addColorStop(0, `rgba(${tint}, ${0.8 * (1 - t)})`);
  flash.addColorStop(1, `rgba(${glow}, 0)`);
  c.fillStyle = flash;
  c.fillRect(-12, -12, 48, 48);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3, d = 3 + 13 * out * (i % 2 ? 0.7 : 1);
    star(c, 12 + Math.cos(a) * d, 12 + Math.sin(a) * d, (i % 2 ? 2 : 3) * (1 - t * 0.6), 1 - t);
  }
  c.restore();
}
