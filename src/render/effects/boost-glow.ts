import type { Boosted } from "../../runs.ts";
import { tileTransform, type FrameContext } from "../render-frame.ts";

/** How long one swell of a boost's glow takes. */
const PULSE_MS = 1400;
/** Each boost's glow colour: ATK red, DEF blue. */
const GLOW: Record<Boosted, string> = { attack: "255, 74, 52", defense: "70, 150, 255" };

/** The boosts going on (a Vanguard Banner's ATK, an Aegis charm's DEF), each a
 * glow round the hero, in its tile space: a soft ring of its colour that
 * swells and fades, the two out of step when both go on; with reduced
 * motion, the ring holds still. */
export function drawBoostGlow(f: FrameContext, boosts: readonly Boosted[]) {
  if (!boosts.length) return;
  const c = f.c;
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  c.globalCompositeOperation = "lighter";
  boosts.forEach((stat, i) => {
    const phase = f.look.reduceMotion ? 0.5 : (f.now / PULSE_MS + i / boosts.length) % 1;
    const swell = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2), rgb = GLOW[stat];
    const outer = 15 + 3 * swell, glow = c.createRadialGradient(12, 12, 6, 12, 12, outer);
    glow.addColorStop(0, `rgba(${rgb}, 0)`);
    glow.addColorStop(0.55, `rgba(${rgb}, ${0.35 + 0.3 * swell})`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = glow;
    c.beginPath();
    c.arc(12, 12, outer, 0, Math.PI * 2);
    c.fill();
  });
  c.restore();
}
