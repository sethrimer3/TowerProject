import { PORTAL_FADE_MS } from "../../divine.ts";
import { tileCenter, type FrameContext } from "../render-frame.ts";
import { paintVortex, type VortexPalette } from "./voidwell.ts";

/** The Divine Portal (divine.ts): Voidwell's vortex in gold and pale light,
 * turning over its tile, with motes of light swirling in toward its middle. */
const PORTAL: VortexPalette = {
  core: "rgba(255, 246, 214, 0.85)",
  edge: "rgba(214, 160, 60, 0.28)",
  rim: "rgba(255, 214, 110, 0.85)",
  arm: "rgba(255, 233, 160, 0.75)",
};
/** The portal's radius, in tiles, and how far it breathes either side of it. */
const RADIUS = 0.62, BREATH = 0.05;
/** The motes swirling in, and how long each takes from the rim to the middle, in ms. */
const MOTES = 10, MOTE_MS = 1800;
/** The sparkles round the Divine Relic's chest, and how long each takes to twinkle, in ms. */
const SPARKLES = 6, TWINKLE_MS = 1400;

/** The Divine Portal on tile (x, y), its glow under it; `still`, nothing moves. */
export function drawDivinePortal(f: FrameContext, at: { x: number; y: number }) {
  const still = f.look.reduceMotion, now = still ? 0 : f.now, c = f.c;
  const { x, y } = tileCenter(f, at.x, at.y);
  const radius = f.s * (RADIUS + (still ? 0 : BREATH * Math.sin(now / 600)));
  c.save();
  const glow = c.createRadialGradient(x, y, 0, x, y, radius * 1.9);
  glow.addColorStop(0, "rgba(255, 222, 140, 0.45)");
  glow.addColorStop(1, "rgba(255, 222, 140, 0)");
  c.fillStyle = glow;
  c.fillRect(x - radius * 2, y - radius * 2, radius * 4, radius * 4);
  c.restore();
  paintVortex(c, x, y, radius, Math.max(1, f.s / 16), now * 2.2, still, PORTAL);
  if (still) return;
  c.save();
  c.fillStyle = "#fff6cf";
  for (let i = 0; i < MOTES; i++) {
    const k = ((now / MOTE_MS + i / MOTES) % 1 + 1) % 1, turn = i * 2.4 - k * Math.PI * 2.5, out = radius * 1.5 * (1 - k);
    const size = Math.max(1, (f.s / 14) * (1 - k * 0.6));
    c.globalAlpha = Math.min(1, k * 4) * (1 - k);
    c.fillRect(Math.round(x + Math.cos(turn) * out - size / 2), Math.round(y + Math.sin(turn) * out - size / 2), size, size);
  }
  c.restore();
}

/** Sparkles twinkling round the Divine Relic's chest on tile (x, y), each a
 * small four-pointed star at its own spot, in its own time. */
export function drawRelicSparkles(f: FrameContext, at: { x: number; y: number }) {
  const { x, y } = tileCenter(f, at.x, at.y), c = f.c, still = f.look.reduceMotion;
  c.save();
  c.fillStyle = "#fff3c4";
  for (let i = 0; i < SPARKLES; i++) {
    const k = still ? 0.5 : ((f.now / TWINKLE_MS + i * 0.37) % 1 + 1) % 1;
    const angle = i * 2.1 + Math.floor(f.now / TWINKLE_MS + i * 0.37) * (still ? 0 : 1.3), out = f.s * (0.3 + 0.18 * ((i * 7) % 3));
    const sx = x + Math.cos(angle) * out, sy = y + Math.sin(angle) * out * 0.8;
    const arm = Math.max(1, f.s * 0.14 * Math.sin(k * Math.PI)), thin = Math.max(1, f.s / 24);
    c.globalAlpha = Math.sin(k * Math.PI);
    c.fillRect(Math.round(sx - arm), Math.round(sy - thin / 2), Math.round(arm * 2), Math.round(thin));
    c.fillRect(Math.round(sx - thin / 2), Math.round(sy - arm), Math.round(thin), Math.round(arm * 2));
  }
  c.restore();
}

/** The floor fading to black as the hero steps into a Divine Portal (`warp`,
 * its start), and back in from black where it arrives (`arrived`). */
export function drawPortalFade(f: FrameContext, warp: { at: number } | null, arrived: number) {
  const out = warp ? (f.now - warp.at) / PORTAL_FADE_MS : 0, back = 1 - (f.now - arrived) / PORTAL_FADE_MS;
  const alpha = Math.min(1, Math.max(0, warp ? out : back));
  if (alpha <= 0) return;
  const c = f.c;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = "#000";
  c.fillRect(0, 0, f.width, f.width);
  c.restore();
}
