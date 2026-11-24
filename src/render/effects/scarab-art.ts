import { drawKit } from "../../sprites/kit.ts";
import { tileTransform, type FrameContext } from "../render-frame.ts";
import { drawGemSparkle } from "./gem-art.ts";

/** The Golden Scarab's sprite (`tools/prepare-scarab-sprites.mjs`). */
export const SCARAB_SPRITE = "scarab";

/** The Golden Scarab lying at (x, y): the kit's brass beetle on a soft
 * golden glow that breathes, bobbing gently over its tile like a Gem
 * (held still with motion reduced); a plain golden oval until the sprite
 * has loaded. */
export function drawScarab(f: FrameContext, x: number, y: number) {
  const still = f.look.reduceMotion, c = f.c, breath = still ? 0.5 : 0.5 + 0.5 * Math.sin(f.now / 520);
  c.save();
  c.setTransform(tileTransform(f, x, y));
  if (!still) c.translate(0, Math.sin(f.now / 450 + 1) * 0.8);
  const glow = c.createRadialGradient(12, 12, 0, 12, 12, 13);
  glow.addColorStop(0, `rgba(255, 214, 110, ${0.35 + 0.25 * breath})`);
  glow.addColorStop(1, "rgba(255, 214, 110, 0)");
  c.fillStyle = glow;
  c.fillRect(-2, -2, 28, 28);
  if (!drawKit(c, SCARAB_SPRITE, 2, 2, 20, 20)) {
    c.fillStyle = "#e1bb78";
    c.beginPath();
    c.ellipse(12, 13, 6, 7, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** The sparkle a claimed scarab vanishes in, `age` ms after: a golden Gem's. */
export const drawScarabSparkle = (f: FrameContext, x: number, y: number, age: number) => drawGemSparkle(f, x, y, age, "golden");
