import { tileTransform, type FrameContext } from "./render-frame.ts";
import { DEFEAT_MS } from "./combat.ts";
import { deathSkullFrame, drawSpriteFrame } from "./sprites/animations.ts";
import { kitImage } from "./sprites/kit.ts";

export { DEFEAT_MS };

/** The bone's colour, the dark outline around it and the eyes' red. */
const BONE = "#f2e8d5";
const OUTLINE = "#1a0303";
const SOCKET = "#5a0000";

/** The hero struck down, `age` ms after the strike: native kit frames or
 * a static PNG, with the existing fade over `DEFEAT_MS`. The original
 * fallback keeps its red glow, pop and bob unless motion is reduced. */
export function drawStruckDown(f: FrameContext, age: number) {
  if (age < 0 || age >= DEFEAT_MS) return;
  const c = f.c, still = f.look.reduceMotion;
  const appear = Math.min(1, age / 200), alpha = appear * Math.min(1, (DEFEAT_MS - age) / 400);
  if (f.look.styledSprites && !f.look.spritesOff && kitImage("ambient-death-skull")) {
    c.save(); c.setTransform(tileTransform(f, f.playerX, f.playerY)); c.globalAlpha = alpha;
    drawSpriteFrame(c, "ambient-death-skull", deathSkullFrame(age, !!f.look.spriteAnimations && !still), 0, -22);
    c.restore(); return;
  }
  const pulse = still ? 1 : 0.85 + 0.15 * Math.sin(age / 110), bob = still ? 0 : 1.5 * Math.sin(age / 280);
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  // Over the hero's head, in tile units (24 a tile).
  c.translate(12, -10 + bob);
  c.globalAlpha = alpha;
  c.globalCompositeOperation = "lighter";
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, 22 * pulse);
  glow.addColorStop(0, "rgba(255, 70, 40, 0.9)");
  glow.addColorStop(0.45, "rgba(210, 10, 10, 0.5)");
  glow.addColorStop(1, "rgba(120, 0, 0, 0)");
  c.fillStyle = glow;
  c.fillRect(-24, -24, 48, 48);
  c.globalCompositeOperation = "source-over";
  const pop = still ? 1 : 0.6 + 0.4 * appear;
  c.scale(pop, pop);
  c.shadowColor = "rgba(255, 30, 20, 0.9)";
  c.shadowBlur = (6 * f.s) / 24;
  crossbones(c);
  skull(c);
  c.restore();
}

/** Two bones crossed behind the skull, each with a knobbed end. */
function crossbones(c: CanvasRenderingContext2D) {
  c.lineCap = "round";
  for (const side of [-1, 1]) {
    const [x0, y0, x1, y1] = [-9 * side, -2, 9 * side, 11];
    for (const [width, color] of [[4.6, OUTLINE], [2.6, BONE]] as const) {
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.stroke();
    }
    // A knob either side of each end.
    const len = Math.hypot(x1 - x0, y1 - y0), px = (-(y1 - y0) / len) * 1.3, py = ((x1 - x0) / len) * 1.3;
    for (const [x, y] of [[x0, y0], [x1, y1]] as const) {
      for (const k of [-1, 1]) {
        c.beginPath();
        c.arc(x + k * px, y + k * py, 1.7, 0, Math.PI * 2);
        c.fillStyle = BONE;
        c.strokeStyle = OUTLINE;
        c.lineWidth = 0.9;
        c.fill();
        c.stroke();
      }
    }
  }
}

/** The skull: a round crown over a narrower jaw, dark red eyes, a nose
 * and teeth. */
function skull(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.arc(0, -1, 7, Math.PI * 0.8, Math.PI * 2.2);
  c.lineTo(4.2, 8);
  c.lineTo(-4.2, 8);
  c.closePath();
  c.fillStyle = BONE;
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.2;
  c.fill();
  c.stroke();
  c.shadowBlur = 0;
  c.fillStyle = SOCKET;
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(side * 2.8, 0, 2, 2.3, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  c.moveTo(0, 2.6);
  c.lineTo(-1.1, 4.4);
  c.lineTo(1.1, 4.4);
  c.closePath();
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 0.7;
  c.beginPath();
  for (const x of [-2, 0, 2]) {
    c.moveTo(x, 5.6);
    c.lineTo(x, 8);
  }
  c.stroke();
}
