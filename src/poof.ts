import { tileTransform, type FrameContext } from "./render-frame.ts";

/** How long the poof announcing a Greater Boss lasts. */
export const POOF_MS = 1000;
/** How many puffs of smoke billow out of it. */
const PUFFS = 12;

/** A cloud of violet-grey smoke bursting out of tile (x, y) `age` ms after
 * a Greater Boss appeared there, thinning away over POOF_MS; with reduced
 * motion, the cloud fades where it stands. */
export function drawPoof(f: FrameContext, x: number, y: number, age: number) {
  if (age < 0 || age >= POOF_MS) return;
  const t = age / POOF_MS, out = f.look.reduceMotion ? 0.6 : 1 - (1 - t) * (1 - t), alpha = 1 - t;
  const c = f.c;
  c.save();
  c.setTransform(tileTransform(f, x, y));
  if (t < 0.25) {
    const flash = c.createRadialGradient(12, 12, 0, 12, 12, 10 + 40 * t);
    flash.addColorStop(0, `rgba(255, 245, 255, ${1 - t / 0.25})`);
    flash.addColorStop(1, "rgba(190, 120, 255, 0)");
    c.fillStyle = flash;
    c.fillRect(-12, -12, 48, 48);
  }
  for (let i = 0; i < PUFFS; i++) {
    // Fixed, uneven angles and sizes, so the cloud is ragged but the same
    // every time.
    const angle = (i / PUFFS) * Math.PI * 2 + 0.4 * Math.sin(i * 5.7),
      reach = (10 + 6 * (0.5 + 0.5 * Math.sin(i * 2.3))) * out,
      r = (4 + 3 * (0.5 + 0.5 * Math.cos(i * 4.1))) * (0.6 + 0.8 * out);
    const px = 12 + Math.cos(angle) * reach, py = 12 + Math.sin(angle) * reach - 4 * out;
    const puff = c.createRadialGradient(px, py, 0, px, py, r);
    puff.addColorStop(0, `rgba(226, 214, 240, ${0.9 * alpha})`);
    puff.addColorStop(0.6, `rgba(160, 140, 190, ${0.6 * alpha})`);
    puff.addColorStop(1, "rgba(90, 70, 120, 0)");
    c.fillStyle = puff;
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
