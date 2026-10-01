import { tileTransform, type FrameContext } from "./render-frame.ts";

/** How long the level-up glow and its "LEVEL UP!" text last. */
export const LEVEL_UP_MS = 2000;
/** How long the training points a level-up earned rise over the hero,
 * once its burst is over. */
export const POINTS_MS = 1400;
/** How long a revival's golden fire and its "REVIVED" text last. */
export const REVIVE_MS = 1400;

/** One of the fiery bursts over the hero: how long it lasts and fades, how
 * far its glow and flames reach, its colours, and its words. */
type Blaze = {
  ms: number;
  /** The glow and text fade out over the last of it. */
  fadeMs: number;
  /** The burst flies outward over the first part of it. */
  burstMs: number;
  flames: number;
  /** The glow's radius and the flames' reach, in tile units (24 a tile). */
  glow: number;
  reach: number;
  /** The glow's inner, middle and outer colours (r, g, b). */
  glowColors: [string, string, string];
  /** The flames' cool tail and hot tip, and the white-hot flash's edge. */
  flameTail: string;
  flameMid: string;
  flameTip: string;
  flashEdge: string;
  text: string;
  /** The text's size as a share of the board's width, and its colours. */
  textSize: number;
  textMin: number;
  outline: string;
  shadow: string;
  fill: [string, string, string];
};

const LEVEL_UP: Blaze = {
  ms: LEVEL_UP_MS, fadeMs: 500, burstMs: 800, flames: 16, glow: 36, reach: 1,
  glowColors: ["255, 214, 120", "255, 140, 40", "255, 70, 0"],
  flameTail: "255, 60, 0", flameMid: "255, 140, 30", flameTip: "255, 240, 170", flashEdge: "255, 180, 60",
  text: "LEVEL UP!", textSize: 0.085, textMin: 20, outline: "#3a1200", shadow: "rgba(255, 110, 20, 0.9)",
  fill: ["#fff3b8", "#ffc24a", "#ff6a1a"],
};
/** A lesser, golder blaze than the level-up's, for a revival. */
const REVIVAL: Blaze = {
  ms: REVIVE_MS, fadeMs: 400, burstMs: 600, flames: 10, glow: 26, reach: 0.6,
  glowColors: ["255, 236, 150", "255, 196, 60", "220, 140, 0"],
  flameTail: "230, 150, 0", flameMid: "255, 205, 60", flameTip: "255, 250, 205", flashEdge: "255, 214, 90",
  text: "REVIVED", textSize: 0.065, textMin: 16, outline: "#3a2600", shadow: "rgba(255, 196, 40, 0.9)",
  fill: ["#fffbe0", "#ffe07a", "#e8a91c"],
};

/** The hero's level-up, drawn over the board: a fiery flash bursting
 * outward from the hero, a glow around the hero, and "LEVEL UP!" across
 * the board, `age` ms after the level was reached. */
export function drawLevelUp(f: FrameContext, age: number, points = 0) {
  drawBlaze(f, age, LEVEL_UP);
  if (points > 0) drawPoints(f, age - LEVEL_UP_MS, points);
}

/** "+3" and the training points' golden arrow rising off the hero and
 * fading, `age` ms after the level-up's burst ended. */
function drawPoints(f: FrameContext, age: number, points: number) {
  if (age < 0 || age >= POINTS_MS) return;
  const t = age / POINTS_MS, c = f.c, rise = f.look.reduceMotion ? 0 : 14 * t;
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  c.globalAlpha = Math.min(1, age / 150, (1 - t) / 0.3);
  c.translate(12, -8 - rise);
  c.font = "700 17px Cinzel";
  c.textAlign = "right";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = 4;
  c.strokeStyle = "#3a1200";
  c.fillStyle = "#ffe68a";
  const text = `+${points}`;
  c.strokeText(text, 1, 0);
  c.fillText(text, 1, 0);
  // The arrow, as the Training tab draws it (24 units scaled to 16).
  c.translate(2, -8.5);
  c.scale(16 / 24, 16 / 24);
  c.beginPath();
  c.moveTo(12, 3); c.lineTo(21, 13); c.lineTo(15.5, 13); c.lineTo(15.5, 21);
  c.lineTo(8.5, 21); c.lineTo(8.5, 13); c.lineTo(3, 13); c.closePath();
  c.fillStyle = "#ffc94a";
  c.strokeStyle = "#5a3200";
  c.lineWidth = 2.5;
  c.stroke();
  c.fill();
  c.restore();
}

/** The hero rising from a strike that would have felled it: a smaller,
 * golden fire than the level-up's, with "REVIVED", `age` ms after it. */
export function drawRevive(f: FrameContext, age: number) {
  drawBlaze(f, age, REVIVAL);
}

function drawBlaze(f: FrameContext, age: number, b: Blaze) {
  if (age < 0 || age >= b.ms) return;
  const fade = Math.min(1, (b.ms - age) / b.fadeMs);
  const c = f.c;
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  c.globalCompositeOperation = "lighter";
  drawGlow(c, age, fade, f.look.reduceMotion, b);
  if (!f.look.reduceMotion && age < b.burstMs) drawBurst(c, age / b.burstMs, b);
  c.restore();
  drawText(f, age, fade, b);
}

/** Warm light around the hero (in tile space, where a tile is 24 units),
 * breathing slowly unless motion is reduced. */
function drawGlow(c: CanvasRenderingContext2D, age: number, fade: number, reduced: boolean, b: Blaze) {
  const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(age / 90);
  const glow = c.createRadialGradient(12, 12, 0, 12, 12, b.glow * pulse);
  glow.addColorStop(0, `rgba(${b.glowColors[0]}, ${0.75 * fade})`);
  glow.addColorStop(0.45, `rgba(${b.glowColors[1]}, ${0.45 * fade})`);
  glow.addColorStop(1, `rgba(${b.glowColors[2]}, 0)`);
  c.fillStyle = glow;
  c.fillRect(-30, -30, 84, 84);
}

/** Tongues of flame and embers flying out in every direction; `t` runs
 * from 0 to 1 over the burst. */
function drawBurst(c: CanvasRenderingContext2D, t: number, b: Blaze) {
  const out = 1 - (1 - t) * (1 - t) * (1 - t), alpha = 1 - t;
  // A white-hot flash at the start.
  if (t < 0.3) {
    const flash = c.createRadialGradient(12, 12, 0, 12, 12, (14 + 70 * t) * b.reach);
    flash.addColorStop(0, `rgba(255, 255, 230, ${1 - t / 0.3})`);
    flash.addColorStop(1, `rgba(${b.flashEdge}, 0)`);
    c.fillStyle = flash;
    c.fillRect(-60, -60, 144, 144);
  }
  c.lineCap = "round";
  for (let i = 0; i < b.flames; i++) {
    // Fixed, uneven angles and reaches, so the burst looks ragged but is the
    // same every time.
    const angle = (i / b.flames) * Math.PI * 2 + 0.35 * Math.sin(i * 7.3),
      reach = (52 + 20 * (0.5 + 0.5 * Math.sin(i * 3.1))) * b.reach,
      dx = Math.cos(angle), dy = Math.sin(angle);
    const head = 6 + reach * out, tail = Math.max(4, head - 16 - 14 * (1 - t));
    const flame = c.createLinearGradient(12 + dx * tail, 12 + dy * tail, 12 + dx * head, 12 + dy * head);
    flame.addColorStop(0, `rgba(${b.flameTail}, 0)`);
    flame.addColorStop(0.6, `rgba(${b.flameMid}, ${alpha})`);
    flame.addColorStop(1, `rgba(${b.flameTip}, ${alpha})`);
    c.strokeStyle = flame;
    c.lineWidth = 6 * (1 - 0.6 * t);
    c.beginPath();
    c.moveTo(12 + dx * tail, 12 + dy * tail);
    c.lineTo(12 + dx * head, 12 + dy * head);
    c.stroke();
    // An ember flung a little further between each pair of flames.
    const ember = angle + Math.PI / b.flames, far = 8 + (reach + 8) * out;
    c.fillStyle = b === LEVEL_UP ? `rgba(255, ${170 + 60 * (i % 2)}, 60, ${alpha})` : `rgba(255, ${210 + 30 * (i % 2)}, 90, ${alpha})`;
    c.beginPath();
    c.arc(12 + Math.cos(ember) * far, 12 + Math.sin(ember) * far, 2.4 * (1 - 0.5 * t), 0, Math.PI * 2);
    c.fill();
  }
}

/** The blaze's words across the upper board, popping in and fading with
 * the glow. */
function drawText(f: FrameContext, age: number, fade: number, b: Blaze) {
  const c = f.c, pop = f.look.reduceMotion ? 1 : Math.min(1, 0.6 + age / 375);
  c.save();
  c.globalAlpha = fade;
  c.translate(f.width / 2, f.width * 0.32);
  c.scale(pop, pop);
  c.font = `700 ${Math.max(b.textMin, f.width * b.textSize)}px Cinzel`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = Math.max(3, f.width * 0.012);
  c.strokeStyle = b.outline;
  c.shadowColor = b.shadow;
  c.shadowBlur = 14;
  c.strokeText(b.text, 0, 0);
  const fill = c.createLinearGradient(0, -f.width * 0.04, 0, f.width * 0.04);
  fill.addColorStop(0, b.fill[0]);
  fill.addColorStop(0.5, b.fill[1]);
  fill.addColorStop(1, b.fill[2]);
  c.fillStyle = fill;
  c.fillText(b.text, 0, 0);
  c.restore();
}
