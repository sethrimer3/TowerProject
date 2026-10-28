import { POSITION_HALOS_ENABLED } from "../lighting.ts";
import { forEachViewTile, type FrameContext } from "../render-frame.ts";

/** How long one beat of the waiting hero's pulse takes (ms). */
export const WAIT_PULSE_MS = 1400;

/** A ring of light round a tile, hollow at its middle so the sprite on it
 * stays clear: `rgb` at `alpha` where it is brightest, `reach` tiles out
 * from the tile's centre (drawn at screen point x, y). */
function ringLight(f: FrameContext, x: number, y: number, rgb: string, alpha: number, reach: number) {
  const c = f.c, r = f.s * reach;
  const light = c.createRadialGradient(x, y, 0, x, y, r);
  light.addColorStop(0, `rgba(${rgb}, 0)`);
  light.addColorStop(0.3, `rgba(${rgb}, ${alpha * 0.5})`);
  light.addColorStop(0.5, `rgba(${rgb}, ${alpha})`);
  light.addColorStop(1, `rgba(${rgb}, 0)`);
  c.fillStyle = light;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Inside a run, a warm light round the hero's tile wherever it is drawn
 * (gliding with it), so its place on the floor is plain at a glance; and
 * while it waits for a card to be pressed (`waiting`, before Auto-Climb),
 * a golden glow pulsing round it (held steady when motion is reduced).
 * Over every board and above the darkness. */
export function drawHeroLight(f: FrameContext, waiting: boolean) {
  if (!POSITION_HALOS_ENABLED) return;
  const c = f.c, x = (f.playerX - f.left + 0.5) * f.s, y = (f.n - 0.5 - (f.playerY - f.bottom)) * f.s;
  c.save();
  ringLight(f, x, y, "255, 228, 160", 0.34, 1.05);
  if (waiting) {
    const beat = f.look.reduceMotion ? 0.5 : 0.5 - 0.5 * Math.cos((2 * Math.PI * f.now) / WAIT_PULSE_MS);
    ringLight(f, x, y, "255, 205, 90", 0.25 + 0.5 * beat, 1.1 + 0.25 * beat);
  }
  c.restore();
}

/** Each staircase up in view on a Tower floor: a cool light round its
 * tile, breathing slowly, so the way up is easy to spot. Over every board
 * and above the darkness. */
export function drawStairsLights(f: FrameContext) {
  if (!POSITION_HALOS_ENABLED) return;
  let started = false;
  forEachViewTile(f, (x, y) => {
    if (f.world.tile(x, y).kind !== "stairs") return;
    if (!started) {
      f.c.save();
      started = true;
    }
    const breathe = f.look.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(f.now / 700);
    ringLight(f, (x - f.left + 0.5) * f.s, (f.n - 0.5 - (y - f.bottom)) * f.s, "200, 225, 255", 0.5 * breathe, 1.2);
  });
  if (started) f.c.restore();
}
