import { tileTransform, type FrameContext } from "../render-frame.ts";
import { SPARK_MS } from "../../combat.ts";
import { crossbones, skull } from "./struck-down.ts";

export { SPARK_MS };

/** The "no" circle's red and its dark outline. */
const NO_RED = "#ff3b2f";
const OUTLINE = "#1a0303";

/** Phoenix Spark shrugging off a hit that would have felled the hero, `age`
 * ms after it: the skull over the hero's head, crossed out by a red "no"
 * circle that snaps shut around it, with a golden flare behind, fading over
 * `SPARK_MS`. */
export function drawPhoenixSpark(f: FrameContext, age: number) {
  if (age < 0 || age >= SPARK_MS) return;
  const c = f.c, still = f.look.reduceMotion;
  const appear = Math.min(1, age / 150), alpha = appear * Math.min(1, (SPARK_MS - age) / 300);
  // The circle draws itself shut over its first 250 ms.
  const closed = still ? 1 : Math.min(1, age / 250);
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  // Over the hero's head, in tile units (24 a tile).
  c.translate(12, -10);
  c.globalAlpha = alpha;
  c.globalCompositeOperation = "lighter";
  const flare = c.createRadialGradient(0, 0, 0, 0, 0, 22);
  flare.addColorStop(0, "rgba(255, 210, 90, 0.85)");
  flare.addColorStop(0.5, "rgba(255, 120, 30, 0.4)");
  flare.addColorStop(1, "rgba(255, 60, 0, 0)");
  c.fillStyle = flare;
  c.fillRect(-24, -24, 48, 48);
  c.globalCompositeOperation = "source-over";
  const pop = still ? 1 : 0.7 + 0.3 * appear;
  c.scale(pop, pop);
  crossbones(c);
  skull(c);
  // The "no" circle: a ring and its slash, outlined so it reads on any floor.
  const r = 13, start = -Math.PI / 2, slash = Math.PI / 4;
  for (const [width, color] of [[5, OUTLINE], [3, NO_RED]] as const) {
    c.lineCap = "round";
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.arc(0, 2, r, start, start + closed * Math.PI * 2);
    c.stroke();
    if (closed < 1) continue;
    c.beginPath();
    c.moveTo(-Math.cos(slash) * r, 2 - Math.sin(slash) * r);
    c.lineTo(Math.cos(slash) * r, 2 + Math.sin(slash) * r);
    c.stroke();
  }
  c.restore();
}
