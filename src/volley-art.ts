import type { Shot, Volley } from "./state.ts";
import { tileCenter, type FrameContext } from "./render-frame.ts";

/** A Ranged enemy's shot: a small glowing ball, its radius in tiles. */
const SHOT_COLOR = "#ffb347";
const SHOT_GLOW = "#ff6a1a";
const SHOT_RADIUS = 0.09;
/** The Archer's arrow: a shaft, a head and fletching, its length in tiles. */
const ARROW_COLOR = "#e9edf4";
const ARROW_HEAD = "#ffd34d";
const FLETCH_COLOR = "#e86d7a";
const ARROW_LENGTH = 0.42;
/** A Charged Shot's arrow flies in a blue glow. */
const CHARGED_GLOW = "#4da6ff";

/** The turn's shots in flight at `f.now` (ranged.ts): each leaves its
 * shooter as the turn begins and reaches its target as `flight` ends, the
 * hero's step ending with it; one of several arrows a turn (Rapid Fire)
 * flies half of it, leaving at its `lead` (`shotFlight`). `wrap`, the
 * board's width where it wraps
 * (the Delve), sends a shot the short way round. */
export function drawVolley(f: FrameContext, volley: Volley | null, wrap = 0) {
  if (!volley) return;
  const k = (f.now - volley.at) / volley.flight;
  if (k < 0 || k >= 1) return;
  for (const shot of volley.shots) {
    const t = shotFlight(shot, k);
    if (t < 0 || t >= 1) continue;
    let dx = shot.to.x - shot.from.x;
    if (wrap && Math.abs(dx) > wrap / 2) dx -= Math.sign(dx) * wrap;
    const dy = shot.to.y - shot.from.y;
    const at = tileCenter(f, shot.from.x + dx * t, shot.from.y + dy * t);
    if (shot.by === "enemy") drawShot(f, at);
    // World y grows upward, the screen's downward.
    else drawArrow(f, at, Math.atan2(-dy, dx), !!shot.charged);
  }
}

/** How far along its path `shot` is when the volley is `k` of its flight
 * through: all of it for one shot a turn, or half the flight from `lead` / 2
 * for an arrow with a `lead`. Below 0 it hasn't left, from 1 it has landed. */
export const shotFlight = (shot: Shot, k: number) => (shot.lead === undefined ? k : (k - shot.lead / 2) * 2);

function drawShot(f: FrameContext, at: { x: number; y: number }) {
  const c = f.c, r = Math.max(2, f.s * SHOT_RADIUS);
  c.save();
  c.shadowColor = SHOT_GLOW;
  c.shadowBlur = Math.max(4, f.s * 0.3);
  c.fillStyle = SHOT_COLOR;
  c.beginPath();
  c.arc(at.x, at.y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawArrow(f: FrameContext, at: { x: number; y: number }, angle: number, charged = false) {
  const c = f.c, len = f.s * ARROW_LENGTH, w = Math.max(1.5, f.s * 0.05);
  c.save();
  if (charged) {
    c.shadowColor = CHARGED_GLOW;
    c.shadowBlur = Math.max(6, f.s * 0.4);
  }
  c.translate(at.x, at.y);
  c.rotate(angle);
  c.lineCap = "round";
  c.strokeStyle = "#000";
  c.lineWidth = w + 2;
  c.beginPath();
  c.moveTo(-len / 2, 0);
  c.lineTo(len / 2, 0);
  c.stroke();
  c.strokeStyle = ARROW_COLOR;
  c.lineWidth = w;
  c.stroke();
  // The head at the front, the fletching at the back.
  c.fillStyle = ARROW_HEAD;
  c.beginPath();
  c.moveTo(len / 2 + w * 2.5, 0);
  c.lineTo(len / 2 - w, -w * 1.8);
  c.lineTo(len / 2 - w, w * 1.8);
  c.closePath();
  c.fill();
  c.strokeStyle = FLETCH_COLOR;
  c.lineWidth = w * 0.9;
  c.beginPath();
  c.moveTo(-len / 2, 0);
  c.lineTo(-len / 2 - w * 1.5, -w * 1.8);
  c.moveTo(-len / 2, 0);
  c.lineTo(-len / 2 - w * 1.5, w * 1.8);
  c.stroke();
  c.restore();
}
