import { PORTAL_FADE_MS } from "../../divine.ts";
import { tileCenter, type FrameContext } from "../render-frame.ts";

/** The Divine Portal (divine.ts): Breakout's deployment portal in gold, drawn
 * in art pixels (sixteen a tile): a swirling disc of three spiral arms inside a
 * bright segmented rim turning the other way, a dark outline, and sparks
 * circling just outside it. Its swirl runs dark void to hot white. */
const SWIRL = ["#1c1002", "#4f2f06", "#93600f", "#dca024", "#ffdc66", "#fffae0"];
const RIM = "#ffe9a0", RIM_HOT = "#ffffff", RIM_DIM = "#d99a2c", OUTLINE = "#140a00";
/** The portal's radius and its sparks' orbit, in art pixels (ART a tile). */
const ART = 16, R = 10, SPARKS = 6;
/** 4x4 Bayer matrix, normalized to (0, 1), for the swirl's ordered dither. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (gx: number, gy: number) => BAYER4[(gy & 3) * 4 + (gx & 3)];
/** The sparkles round the Divine Relic's chest, and how long each takes to twinkle, in ms. */
const SPARKLES = 6, TWINKLE_MS = 1400;

/** The Divine Portal on tile (x, y); `still`, nothing turns. */
export function drawDivinePortal(f: FrameContext, at: { x: number; y: number }) {
  const still = f.look.reduceMotion, time = still ? 0 : f.now / 1000, c = f.c;
  const { x, y } = tileCenter(f, at.x, at.y), px = f.s / ART;
  // Art pixel (gx, gy) counts from the tile's middle, which falls on a pixel corner.
  const cell = (gx: number, gy: number) => {
    const x0 = Math.round(x + gx * px), y0 = Math.round(y + gy * px);
    c.fillRect(x0, y0, Math.max(1, Math.round(x + (gx + 1) * px) - x0), Math.max(1, Math.round(y + (gy + 1) * px) - y0));
  };
  const spin = time * 1.7, span = R + 2;
  c.save();
  for (let gy = -span; gy < span; gy++) {
    for (let gx = -span; gx < span; gx++) {
      const dx = gx + 0.5, dy = gy + 0.5, dist = Math.hypot(dx, dy);
      if (dist > R + 1) continue;
      if (dist > R) c.fillStyle = OUTLINE;
      else if (dist > R - 1.3) {
        // Segmented rim that turns the other way to the swirl.
        const seg = Math.floor((((Math.atan2(dy, dx) / (Math.PI * 2)) * 18 - spin * 2.5) % 3) + 3) % 3;
        c.fillStyle = seg === 0 ? RIM_HOT : seg === 1 ? RIM : RIM_DIM;
      } else {
        const d = dist / R, a = Math.atan2(dy, dx) / (Math.PI * 2);
        // Three spiral arms drawn into the middle, round a hot core.
        const arm = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (a * 3 + d * 1.6 + spin));
        const core = Math.max(0, 1 - d / 0.35);
        const b = Math.min(1, arm * (0.25 + 0.65 * d) + core * 0.9 + 0.08);
        c.fillStyle = SWIRL[Math.max(0, Math.min(SWIRL.length - 1, Math.floor(b * (SWIRL.length - 1) + bayer(gx, gy) - 0.25)))];
      }
      cell(gx, gy);
    }
  }
  // Sparks circling just outside the rim.
  c.fillStyle = RIM;
  for (let k = 0; k < SPARKS; k++) {
    const a = spin * 1.7 + (k * Math.PI * 2) / SPARKS, r = R + 2.5 + Math.sin(time * 5 + k * 1.9) * 0.8;
    cell(Math.floor(Math.cos(a) * r), Math.floor(Math.sin(a) * r));
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
