/** DEFEND's structure art, seen from above: the keep, barracks and towers
 * (drawn into the city layer and the palette icons), the keep's live banner,
 * and the shared palette. */
import { SOLDIER, type StructureKind } from "./catalog.ts";

/** Medieval roofing: terracotta tile, old brick, weathered timber, thatch,
 * slate and straw. */
export const ROOFS = ["#8e4a36", "#a35a3e", "#6b5540", "#86704b", "#5a5c62", "#9a7a4a"];
export const OUTLINE = "#0b0907";
export const ROAD = "#5f584d";
const PARK = "#3c5d31";

/** Where a structure is drawn, in canvas pixels, and the cell size. */
export type ArtBox = { x: number; y: number; w: number; h: number; px: number };

/** A structure's box snapped to whole pixels, with its outline widths. */
type Frame = ArtBox & { inset: number; line: number };

export function paintStructureArt(c: CanvasRenderingContext2D, kind: StructureKind, box: ArtBox) {
  const px = box.px;
  const f: Frame = {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.w),
    h: Math.round(box.h),
    px,
    inset: Math.max(1, Math.round(px * 0.1)),
    line: Math.max(1, Math.round(px * 0.08)),
  };
  STRUCTURES[kind](c, f);
}

const STRUCTURES: Record<StructureKind, (c: CanvasRenderingContext2D, f: Frame) => void> = {
  keep: (c, f) => paintKeep(c, f),
  barracks: paintBarracks,
  archerBarracks: paintArcherBarracks,
  archerTower: paintArcherTower,
  cannonTower: paintCannonTower,
  watchTower: paintWatchTower,
};

/** A solid black outline, then the fill inside it. */
function stone(c: CanvasRenderingContext2D, { x, y, w, h, inset, line }: Frame, fill: string) {
  c.fillStyle = OUTLINE;
  c.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  c.fillStyle = fill;
  c.fillRect(x + inset + line, y + inset + line, w - (inset + line) * 2, h - (inset + line) * 2);
}

/** A hall roof inside the stone, its sunny half lighter. */
function hallRoof(c: CanvasRenderingContext2D, { x, y, w, h, inset }: Frame, fill: string, sun: number) {
  c.fillStyle = fill;
  c.fillRect(x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4);
  c.fillStyle = `rgba(255,255,255,${sun})`;
  c.fillRect(x + inset * 2, y + inset * 2, (w - inset * 4) / 2, h - inset * 4);
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function paintBarracks(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, px } = f;
  stone(c, f, "#7a6a5a");
  hallRoof(c, f, "#a03a2e", 0.15);
  c.fillStyle = SOLDIER.color;
  c.fillRect(x + w / 2 - px * 0.3, y + h / 2 - px * 0.3, px * 0.6, px * 0.6);
}

/** Green-roofed hall with a target butt out front. */
function paintArcherBarracks(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h } = f;
  stone(c, f, "#7a6e5c");
  hallRoof(c, f, "#5e4632", 0.14);
  const cx = x + w / 2,
    cy = y + h / 2,
    r = Math.min(w, h) * 0.16;
  c.fillStyle = "#e8dcc0";
  disc(c, cx, cy, r);
  c.fillStyle = "#b3372f";
  disc(c, cx, cy, r * 0.6);
  c.fillStyle = "#e8dcc0";
  disc(c, cx, cy, r * 0.25);
}

function paintArcherTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, px } = f;
  stone(c, f, "#8c8577");
  c.fillStyle = "#6e4a2c";
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.3);
  c.fillStyle = "#c9a36a";
  c.fillRect(x + w / 2 - px * 0.12, y + h / 2 - px * 0.5, px * 0.24, px);
}

/** Iron gun on a round turntable, barrel pointing north. */
function paintCannonTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h, px } = f;
  stone(c, f, "#6f6a62");
  c.fillStyle = "#4a4038";
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.32);
  c.fillStyle = "#26262a";
  c.fillRect(x + w / 2 - px * 0.2, y + h * 0.12, px * 0.4, h * 0.45);
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.17);
  c.fillStyle = "#6a6a70";
  c.fillRect(x + w / 2 - px * 0.1, y + h * 0.14, px * 0.12, h * 0.1);
}

function paintWatchTower(c: CanvasRenderingContext2D, f: Frame) {
  const { x, y, w, h } = f;
  stone(c, f, "#7d8288");
  c.fillStyle = "#3d3f44";
  c.fillRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4);
  c.fillStyle = "#f2d27a";
  disc(c, x + w / 2, y + h / 2, Math.min(w, h) * 0.13);
}

export type IconItem = StructureKind | "cityTile" | "bomb";

/** Palette icon for an item, drawn into a small square canvas. */
export function paintIcon(canvas: HTMLCanvasElement, item: IconItem) {
  const c = canvas.getContext("2d")!;
  const n = canvas.width;
  c.clearRect(0, 0, n, n);
  c.imageSmoothingEnabled = false;
  if (item === "cityTile") return paintCityIcon(c, n);
  if (item === "bomb") return paintBombIcon(c, n);
  const def = { keep: [3, 3], barracks: [3, 4], archerBarracks: [3, 3], archerTower: [2, 2], cannonTower: [2, 2], watchTower: [2, 2] }[item];
  const px = n / Math.max(def[0], def[1]) / 1.1;
  const w = def[0] * px,
    h = def[1] * px;
  paintStructureArt(c, item, { x: (n - w) / 2, y: (n - h) / 2, w, h, px });
}

/** A block of roofs round a little park. */
function paintCityIcon(c: CanvasRenderingContext2D, n: number) {
  const px = n / 7;
  c.fillStyle = ROAD;
  c.fillRect(0, 0, n, n);
  const houses: [number, number, number, number, number][] = [
    [0, 0, 3, 2, 0], [4, 0, 3, 3, 2], [0, 3, 2, 4, 3], [4, 4, 3, 3, 1], [3, 5, 1, 2, 4],
  ];
  for (const [x, y, w, h, v] of houses) {
    c.fillStyle = ROOFS[v];
    c.fillRect(x * px + 1, y * px + 1, w * px - 2, h * px - 2);
  }
  c.fillStyle = PARK;
  c.fillRect(2 * px, 3 * px + 1, px, px);
}

function paintBombIcon(c: CanvasRenderingContext2D, n: number) {
  c.fillStyle = "#2a2a2e";
  disc(c, n * 0.45, n * 0.58, n * 0.3);
  c.fillStyle = "rgba(255,255,255,0.25)";
  c.fillRect(n * 0.3, n * 0.42, n * 0.1, n * 0.1);
  c.fillStyle = "#8a6a3c";
  c.fillRect(n * 0.58, n * 0.18, n * 0.08, n * 0.18);
  c.fillStyle = "#ffb347";
  c.fillRect(n * 0.62, n * 0.1, n * 0.12, n * 0.1);
}

// ── The keep ──────────────────────────────────────────────────────────────

/** The keep's parts, in canvas pixels: the curtain wall's box, outline
 * width and cell size. */
type Keep = { X: number; Y: number; W: number; H: number; line: number; px: number };

/** The keep, from above: a square curtain of crenellated wall with a round
 * turret on each corner, a flagstone courtyard, and the great tower in the
 * middle under a four-sided slate roof. The flag is drawn live (drawFlag). */
function paintKeep(c: CanvasRenderingContext2D, { x, y, w, h, px }: ArtBox) {
  const line = Math.max(1, Math.round(px * 0.08));
  const inset = Math.max(1, Math.round(px * 0.12));
  const k: Keep = { X: x + inset, Y: y + inset, W: w - inset * 2, H: h - inset * 2, line, px };
  curtainWall(c, k);
  courtyard(c, k);
  greatTower(c, k);
  cornerTurrets(c, k);
}

/** The curtain wall, with merlons around the wall walk. */
function curtainWall(c: CanvasRenderingContext2D, { X, Y, W, H, line, px }: Keep) {
  c.fillStyle = OUTLINE;
  c.fillRect(X, Y, W, H);
  c.fillStyle = "#9d968a";
  c.fillRect(X + line, Y + line, W - line * 2, H - line * 2);
  const m = Math.max(1, Math.round(px * 0.2));
  c.fillStyle = "#bcb5a6";
  for (let xx = X + line + m; xx < X + W - line - m; xx += m * 2) {
    c.fillRect(xx, Y + line, m, m);
    c.fillRect(xx, Y + H - line - m, m, m);
  }
  for (let yy = Y + line + m; yy < Y + H - line - m; yy += m * 2) {
    c.fillRect(X + line, yy, m, m);
    c.fillRect(X + W - line - m, yy, m, m);
  }
}

function courtyard(c: CanvasRenderingContext2D, { X, Y, W, H, line, px }: Keep) {
  const wall = Math.round(px * 0.45);
  c.fillStyle = OUTLINE;
  c.fillRect(X + wall, Y + wall, W - wall * 2, H - wall * 2);
  c.fillStyle = "#6f6a60";
  c.fillRect(X + wall + line, Y + wall + line, W - (wall + line) * 2, H - (wall + line) * 2);
}

/** The great tower with a hipped slate roof (four shaded faces). */
function greatTower(c: CanvasRenderingContext2D, { X, Y, W, H, line }: Keep) {
  const tw = Math.round(W * 0.46),
    tx = Math.round(X + (W - tw) / 2),
    ty = Math.round(Y + (H - tw) / 2);
  c.fillStyle = OUTLINE;
  c.fillRect(tx - line, ty - line, tw + line * 2, tw + line * 2);
  const cx = tx + tw / 2,
    cy = ty + tw / 2;
  const face = (pts: [number, number][], fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fill();
  };
  face([[tx, ty], [tx + tw, ty], [cx, cy]], "#6a707a");
  face([[tx + tw, ty], [tx + tw, ty + tw], [cx, cy]], "#474c55");
  face([[tx, ty + tw], [tx + tw, ty + tw], [cx, cy]], "#3b3f47");
  face([[tx, ty], [tx, ty + tw], [cx, cy]], "#5a6069");
  c.strokeStyle = OUTLINE;
  c.lineWidth = line;
  c.beginPath();
  c.moveTo(tx, ty);
  c.lineTo(tx + tw, ty + tw);
  c.moveTo(tx + tw, ty);
  c.lineTo(tx, ty + tw);
  c.stroke();
}

/** Round towers with conical slate caps. */
function cornerTurrets(c: CanvasRenderingContext2D, { X, Y, W, H, line, px }: Keep) {
  const tr = Math.max(2, Math.round(px * 0.5));
  for (const [ox, oy] of [
    [X + tr * 0.7, Y + tr * 0.7],
    [X + W - tr * 0.7, Y + tr * 0.7],
    [X + tr * 0.7, Y + H - tr * 0.7],
    [X + W - tr * 0.7, Y + H - tr * 0.7],
  ]) {
    c.fillStyle = OUTLINE;
    disc(c, ox, oy, tr + line);
    c.fillStyle = "#a8a194";
    disc(c, ox, oy, tr);
    const g = c.createRadialGradient(ox - tr * 0.3, oy - tr * 0.3, 0, ox, oy, tr * 0.72);
    g.addColorStop(0, "#7d848f");
    g.addColorStop(1, "#3f444c");
    c.fillStyle = g;
    disc(c, ox, oy, tr * 0.72);
  }
}

// ── The keep's banner ─────────────────────────────────────────────────────

/** Where the banner's pole stands (canvas pixels) and the time it waves at. */
export type FlagPose = { x: number; y: number; t: number; reduceMotion: boolean };

/** Folds along the flag. */
const STRIPS = 10;

/** The keep's banner, seen from above, rippling in the wind. Drawn every
 * frame from the time, so it keeps waving. */
export function drawFlag(c: CanvasRenderingContext2D, px: number, pose: FlagPose) {
  const pt = flagPoints(px, pose);
  c.save();
  // Shadow on the roof below.
  c.fillStyle = "rgba(0,0,0,0.3)";
  traceFlag(c, pt, px * 0.25, px * 0.3);
  c.fill();
  for (let i = 0; i < STRIPS; i++) flagStrip(c, pt, i, pose.t);
  // Outline and pole cap.
  c.strokeStyle = OUTLINE;
  c.lineWidth = Math.max(1, px * 0.06);
  traceFlag(c, pt, 0, 0);
  c.closePath();
  c.stroke();
  c.fillStyle = "#d8b572";
  c.strokeStyle = OUTLINE;
  c.beginPath();
  c.arc(pose.x, pose.y, Math.max(1.5, px * 0.14), 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.restore();
}

type FlagPoint = (u: number, v: number) => readonly [number, number];

/** The cloth's surface: u along the flag (0 at the pole), v across it; the
 * ripple grows with u. */
function flagPoints(px: number, { x: ax, y: ay, t, reduceMotion }: FlagPose): FlagPoint {
  const len = 1.35 * px,
    wid = 0.5 * px;
  const wind = -0.35; // Blowing a little north of east.
  const cw = Math.cos(wind),
    sw = Math.sin(wind);
  const amp = reduceMotion ? 0.03 : 0.12;
  return (u, v) => {
    const wave = Math.sin(t * 7 - u * 5.5) * amp * px * (0.25 + u);
    const along = u * len,
      across = v * wid + wave;
    return [ax + along * cw - across * sw, ay + along * sw + across * cw] as const;
  };
}

/** Starts a path round the flag's edge, shifted by (ox, oy). */
function traceFlag(c: CanvasRenderingContext2D, pt: FlagPoint, ox: number, oy: number) {
  c.beginPath();
  for (let i = 0; i <= STRIPS; i++) {
    const [x, y] = pt(i / STRIPS, -0.5);
    if (i === 0) c.moveTo(x + ox, y + oy);
    else c.lineTo(x + ox, y + oy);
  }
  for (let i = STRIPS; i >= 0; i--) {
    const [x, y] = pt(i / STRIPS, 0.5);
    c.lineTo(x + ox, y + oy);
  }
}

/** One strip of cloth, shaded by the slope of its fold, with the gold
 * stripe down the middle. */
function flagStrip(c: CanvasRenderingContext2D, pt: FlagPoint, i: number, t: number) {
  const u0 = i / STRIPS,
    u1 = (i + 1) / STRIPS;
  const slope = Math.cos(t * 7 - ((u0 + u1) / 2) * 5.5);
  const light = Math.round(150 + slope * 45);
  c.fillStyle = `rgb(${light + 40},${Math.round(light * 0.2)},${Math.round(light * 0.18)})`;
  quad(c, pt(u0, -0.5), pt(u1, -0.5), pt(u1, 0.5), pt(u0, 0.5));
  c.fillStyle = `rgb(${Math.round(200 + slope * 40)},${Math.round(160 + slope * 35)},70)`;
  quad(c, pt(u0, -0.1), pt(u1, -0.1), pt(u1, 0.1), pt(u0, 0.1));
}

type Corner = readonly [number, number];
function quad(c: CanvasRenderingContext2D, a: Corner, b: Corner, d: Corner, e: Corner) {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.lineTo(d[0], d[1]);
  c.lineTo(e[0], e[1]);
  c.closePath();
  c.fill();
}
