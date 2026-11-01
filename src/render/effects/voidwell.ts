import { shortWay } from "../../volley.ts";
import type { VortexZone } from "../../arcana/voidwell.ts";
import { tileCenter, type FrameContext } from "../render-frame.ts";

/** Voidwell's vortex: a see-through dark blue disc, deepest at its middle, and spiral
 * arms turning slowly over it. */
const CORE = "rgba(3, 8, 44, 0.62)";
const EDGE = "rgba(14, 34, 112, 0.34)";
const RIM = "rgba(30, 54, 150, 0.7)";
const ARM = "rgba(26, 46, 136, 0.5)";
/** The arms, and how far each winds from the rim to the middle, in radians. */
const ARMS = 5;
const WIND = Math.PI * 1.6;
/** Points along an arm. */
const ARM_POINTS = 24;
/** How long the vortex takes to turn once, in ms. */
const TURN_MS = 9000;

/** The vortex round (x, y), `radius` wide, its rim `rim` thick: `still`, it doesn't turn. */
export function paintVortex(c: CanvasRenderingContext2D, x: number, y: number, radius: number, rim: number, now: number, still: boolean) {
  c.save();
  const shade = c.createRadialGradient(x, y, 0, x, y, radius);
  shade.addColorStop(0, CORE);
  shade.addColorStop(1, EDGE);
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.fillStyle = shade;
  c.fill();
  c.lineWidth = rim;
  c.strokeStyle = RIM;
  c.stroke();
  c.lineCap = "round";
  c.lineWidth = Math.max(1, radius / 24);
  c.strokeStyle = ARM;
  const spin = still ? 0 : (-now / TURN_MS) * Math.PI * 2;
  for (let arm = 0; arm < ARMS; arm++) {
    const start = spin + (arm / ARMS) * Math.PI * 2;
    c.beginPath();
    for (let i = 0; i <= ARM_POINTS; i++) {
      const along = i / ARM_POINTS, out = radius * (1 - along * 0.92), turn = start + along * WIND;
      c.lineTo(x + Math.cos(turn) * out, y + Math.sin(turn) * out);
    }
    c.stroke();
  }
  c.restore();
}

/** What the board shows of Voidwell: the vortex where it opened, while one stands. */
export function drawVortex(f: FrameContext, zone: VortexZone | undefined) {
  if (!zone) return;
  const { x, y } = tileCenter(f, f.playerX + shortWay(zone.x - f.playerX, zone.wrap), zone.y);
  paintVortex(f.c, x, y, f.s * zone.radius, Math.max(1, f.s / 24), f.now, f.look.reduceMotion);
}
