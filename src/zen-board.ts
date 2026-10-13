import type { KeyColor } from "./config.ts";
import type { EnemyStrength, Tile, Torch } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import type { ThemedBoard } from "./themed-boards.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import { tileHash } from "./ascii-glyphs.ts";

/** The Yang and Yin Game themes' dungeon board: a raked sand garden drawn
 * in a few strokes of ink. Open ground is sand raked in slow waves, the
 * rock a still flat tone edged by a fine line, with now and then a stone
 * along it. Enemies are ink dots holding their name's letter (an ensō round
 * the strong, a red seal for a boss), doors torii gates in their key's
 * colour, torches stone lanterns, and the hero the taijitu. Yang is ink on
 * pale sand; Yin the same garden by night, pale ink on dark stone. */

export type ZenPalette = {
  /** The rock, the raked sand, the rake's lines, and the line where rock
   * meets sand. */
  rock: string;
  sand: string;
  rake: string;
  edge: string;
  /** The stones resting along the rock's edge. */
  stone: string;
  /** Strokes, the faint ones (what is spent), and what is drawn on ink. */
  ink: string;
  faint: string;
  paper: string;
  /** The seal's red (bosses, the heart, the hero's eye), moss, and gold. */
  seal: string;
  moss: string;
  gold: string;
  heart: string;
  /** A lantern's warm light. */
  light: string;
  keys: Record<KeyColor, string>;
  /** Drawn over the whole board, if anything: a soft rim. */
  rim: string | null;
};

export const YANG: ZenPalette = {
  rock: "#d9d3c5",
  sand: "#f3efe6",
  rake: "#e3ddcf",
  edge: "#a8a193",
  stone: "#8c877c",
  ink: "#2b2a27",
  faint: "#b9b3a6",
  paper: "#f3efe6",
  seal: "#b5402a",
  moss: "#7d8a5c",
  gold: "#b8922e",
  heart: "#b5402a",
  light: "#e8b04a",
  keys: { yellow: "#c49a2c", blue: "#4c7493", red: "#b5402a" },
  rim: null,
};

export const YIN: ZenPalette = {
  rock: "#121211",
  sand: "#1f1e1c",
  rake: "#2a2926",
  edge: "#4d4a44",
  stone: "#5f5b53",
  ink: "#e6e0d3",
  faint: "#57534c",
  paper: "#1f1e1c",
  seal: "#c9583e",
  moss: "#7f8d63",
  gold: "#d4b04a",
  heart: "#c9583e",
  light: "#f0c060",
  keys: { yellow: "#d4b04a", blue: "#7ea6c4", red: "#d0573f" },
  rim: "rgba(0, 0, 0, 0.45)",
};

/** The bundled Cormorant Garamond face of the Yang and Yin UI themes. */
const FONT = "Cormorant Garamond";
let fontAsked = false;
/** Asks the browser for the face once, so letters aren't drawn in the
 * fallback face for long (no `document.fonts` under tests). */
function askFont() {
  if (fontAsked) return;
  fontAsked = true;
  if (typeof document !== "undefined") void document.fonts?.load(`700 16px "${FONT}"`).catch(() => {});
}

/** A letter centred on (x, y) in tile space. */
function letter(c: CanvasRenderingContext2D, ch: string, color: string, size: number, x = 12, y = 12.5) {
  c.font = `700 ${size}px "${FONT}", Georgia, serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(ch, x, y);
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

/** A brush stroke along the given points. */
function stroke(c: CanvasRenderingContext2D, color: string, width: number, ...pts: number[]) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.stroke();
}

/** An ensō: an ink circle left open at the top right, thicker as it goes. */
function enso(c: CanvasRenderingContext2D, r: number, color: string, width: number) {
  c.strokeStyle = color;
  c.lineCap = "round";
  const from = -Math.PI * 0.3, span = Math.PI * 1.8, steps = 8;
  for (let i = 0; i < steps; i++) {
    c.beginPath();
    c.arc(12, 12, r, from + (span * i) / steps, from + (span * (i + 1)) / steps + 0.02);
    c.lineWidth = width * (0.5 + (0.8 * i) / steps);
    c.stroke();
  }
}

/** How large an enemy's ink dot is, by its strength. */
const DOT: Record<EnemyStrength, number> = { weak: 5, normal: 6, strong: 6.5, elite: 6.5, boss: 0, greaterBoss: 0 };

/** The sand raked in slow waves (three to a tile, meeting the next tile's),
 * the rock a flat tone edged by a fine line where it meets the sand, and
 * now and then a stone resting by it. */
function drawGround(p: ZenPalette, f: FrameContext) {
  askFont();
  const c = f.c;
  c.fillStyle = p.rock;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    c.save();
    toTileSpace(c, f, x, y);
    if (!isWall(x, y)) {
      c.fillStyle = p.sand;
      c.fillRect(-0.5, -0.5, 25, 25);
      c.beginPath();
      for (const base of [4, 12, 20]) {
        c.moveTo(0, base);
        for (let i = 1; i <= 12; i++) c.lineTo(i * 2, base + 1.2 * Math.sin((i / 12) * Math.PI * 2));
      }
      c.strokeStyle = p.rake;
      c.lineWidth = 1;
      c.stroke();
    } else {
      // A fine line along each side open to the sand.
      const open = [[0, 1, 0, 0, 24, 0], [0, -1, 0, 24, 24, 24], [-1, 0, 0, 0, 0, 24], [1, 0, 24, 0, 24, 24]].filter(([dx, dy]) => !isWall(x + dx, y + dy));
      for (const [, , x1, y1, x2, y2] of open) stroke(c, p.edge, 1, x1, y1, x2, y2);
      if (open.length && tileHash(x, y) % 5 === 0) {
        const h = tileHash(x, y);
        c.beginPath();
        c.ellipse(8 + (h % 9), 9 + ((h >>> 4) % 7), 3.2 + ((h >>> 8) % 3) * 0.5, 2.3, ((h >>> 12) % 6) * 0.3, 0, Math.PI * 2);
        c.fillStyle = p.stone;
        c.fill();
      }
    }
    c.restore();
  });
}

/** A torii gate: two posts under two crossbars, the top one curved. */
function torii(c: CanvasRenderingContext2D, color: string) {
  stroke(c, color, 2.2, 7, 7, 7, 21);
  stroke(c, color, 2.2, 17, 7, 17, 21);
  c.beginPath();
  c.moveTo(3, 5);
  c.quadraticCurveTo(12, 7, 21, 5);
  c.strokeStyle = color;
  c.lineWidth = 2.6;
  c.stroke();
  stroke(c, color, 1.6, 5, 9.5, 19, 9.5);
}

function heart(p: ZenPalette, c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(12, 19);
  c.bezierCurveTo(3, 13, 5, 5, 12, 9);
  c.bezierCurveTo(19, 5, 21, 13, 12, 19);
  c.strokeStyle = p.heart;
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.stroke();
}

function contents(p: ZenPalette, c: CanvasRenderingContext2D, t: Tile) {
  switch (t.kind) {
    case "enemy": {
      const e = t.enemy;
      const strength = e?.strength ?? "normal";
      const ch = (e?.name.trim()[0] ?? "e").toUpperCase();
      if (strength === "boss" || strength === "greaterBoss") {
        // A red seal stamped with its letter, a greater boss's framed twice.
        const big = strength === "greaterBoss";
        const r = big ? 9.5 : 8;
        c.fillStyle = p.seal;
        c.fillRect(12 - r, 12 - r, r * 2, r * 2);
        c.strokeStyle = p.paper;
        c.lineWidth = 1;
        c.strokeRect(12 - r + 1.8, 12 - r + 1.8, r * 2 - 3.6, r * 2 - 3.6);
        letter(c, ch, p.paper, big ? 16 : 14, 12, 13);
      } else {
        // An ink dot holding its letter, an ensō round the strong, two
        // round the elite.
        dot(c, 12, 12, DOT[strength], p.ink);
        letter(c, ch, p.paper, strength === "weak" ? 9 : 11, 12, 12.8);
        if (strength === "strong" || strength === "elite") enso(c, 9.5, p.ink, 1.6);
        if (strength === "elite") enso(c, 11.5, p.seal, 1);
      }
      rankChevrons(c, strength, p.ink, p.sand);
      // A Ranged enemy's arrow at the top right, a Fast enemy's two strokes
      // at its bottom right.
      if (e?.ranged) {
        stroke(c, p.ink, 1.2, 18, 6, 23, 1);
        stroke(c, p.ink, 1.2, 20, 1, 23, 1, 23, 4);
      }
      if (e?.fast) {
        stroke(c, p.ink, 1.2, 18, 19, 21, 21.5, 18, 24);
        stroke(c, p.ink, 1.2, 21, 19, 24, 21.5, 21, 24);
      }
      return;
    }
    case "key": {
      // A ring and a short stem in its colour.
      const k = t.color ? p.keys[t.color] ?? p.ink : p.ink;
      c.beginPath();
      c.arc(8, 12, 3.4, 0, Math.PI * 2);
      c.strokeStyle = k;
      c.lineWidth = 2;
      c.stroke();
      stroke(c, k, 2, 11.4, 12, 19, 12);
      stroke(c, k, 2, 17, 12, 17, 15);
      return;
    }
    case "door": {
      const rule = t.door;
      if (rule?.type === "fullHp") {
        heart(p, c);
        return;
      }
      if (rule?.type === "wood") {
        // A bamboo fence: any key opens it, or the hero breaks it down.
        for (const x of [6, 10, 14, 18]) stroke(c, p.moss, 1.8, x, 5, x, 21);
        stroke(c, p.ink, 1.2, 4, 10, 20, 10);
        stroke(c, p.ink, 1.2, 4, 16, 20, 16);
        return;
      }
      const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
      torii(c, keys[0] ? p.keys[keys[0]] ?? p.ink : p.ink);
      // A dot per key the gate takes, in that key's colour.
      keys.forEach((k, i) => dot(c, 12 - (keys.length - 1) * 2.5 + i * 5, 17, 1.5, p.keys[k] ?? p.ink));
      if (rule?.type === "keys" && rule.heart) dot(c, 12, 13.5, 1.6, p.heart);
      return;
    }
    case "potion":
      // A tea bowl, the red potion's filled with the seal's red.
      c.beginPath();
      c.moveTo(5, 11);
      c.quadraticCurveTo(12, 23, 19, 11);
      c.closePath();
      c.fillStyle = t.color === "red" ? p.seal : p.moss;
      c.fill();
      stroke(c, p.ink, 1.4, 5, 11, 19, 11);
      stroke(c, p.ink, 1.2, 9, 19, 15, 19);
      return;
    case "attack":
      // One sweeping stroke, a blade.
      stroke(c, p.ink, 2.2, 6, 19, 18, 5);
      stroke(c, p.ink, 1.4, 5, 14, 10, 19);
      return;
    case "defense":
      c.beginPath();
      c.moveTo(6, 6);
      c.lineTo(18, 6);
      c.quadraticCurveTo(18, 16, 12, 20);
      c.quadraticCurveTo(6, 16, 6, 6);
      c.strokeStyle = p.ink;
      c.lineWidth = 1.8;
      c.lineJoin = "round";
      c.stroke();
      return;
    case "reward":
      // A lacquer box, its lid's line red.
      c.fillStyle = p.ink;
      c.fillRect(6, 8, 12, 10);
      stroke(c, p.seal, 1.6, 6, 11, 18, 11);
      return;
    case "openedChest":
      c.strokeStyle = p.faint;
      c.lineWidth = 1;
      c.strokeRect(6.5, 10.5, 11, 7);
      return;
    case "treasure":
      // A pearl with a gold glint.
      dot(c, 12, 12, 4.5, p.gold);
      dot(c, 10.5, 10.5, 1.3, p.paper);
      return;
    case "stairs":
      // Stepping stones, smaller as they climb.
      for (const [y, w] of [[18, 14], [12.5, 10], [7, 6]]) {
        c.fillStyle = p.ink;
        c.fillRect(12 - w / 2, y, w, 2.6);
      }
      return;
    case "oneway":
      stroke(c, p.ink, 2, 6, 15, 12, 8, 18, 15);
      return;
  }
}

/** A stone lantern: its light glows warm while it burns. */
function torch(p: ZenPalette, c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (t.active) {
    const breathe = f.look.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(f.now / 400 + t.x * 3 + t.y);
    c.save();
    c.globalAlpha *= 0.35 * breathe;
    dot(c, 12, 11, 9, p.light);
    c.restore();
  }
  const s = t.active ? p.ink : p.faint;
  c.beginPath();
  c.moveTo(5, 7.5);
  c.quadraticCurveTo(12, 3, 19, 7.5);
  c.closePath();
  c.fillStyle = s;
  c.fill();
  c.fillStyle = t.active ? p.light : p.faint;
  c.fillRect(9, 8.5, 6, 5);
  c.strokeStyle = s;
  c.lineWidth = 1.2;
  c.strokeRect(8.5, 8, 7, 6);
  stroke(c, s, 2, 12, 14, 12, 19);
  stroke(c, s, 2, 8, 20, 16, 20);
}

/** The hero: the taijitu, its light half towards the top. */
function hero(p: ZenPalette, c: CanvasRenderingContext2D) {
  const light = "#f3efe6", dark = "#2b2a27", r = 8;
  c.save();
  c.translate(12, 12);
  dot(c, 0, 0, r + 1.4, p.ink === dark ? dark : light);
  dot(c, 0, 0, r, dark);
  c.beginPath();
  c.arc(0, 0, r, Math.PI, 0);
  c.arc(r / 2, 0, r / 2, 0, Math.PI, true);
  c.arc(-r / 2, 0, r / 2, 0, Math.PI);
  c.fillStyle = light;
  c.fill();
  dot(c, -r / 2, 0, 1.3, dark);
  dot(c, r / 2, 0, 1.3, light);
  c.restore();
}

function rim(p: ZenPalette, f: FrameContext) {
  if (!p.rim) return;
  const c = f.c, w = f.width;
  const g = c.createRadialGradient(w / 2, w / 2, w * 0.35, w / 2, w / 2, w * 0.75);
  g.addColorStop(0, "rgba(0, 0, 0, 0)");
  g.addColorStop(1, p.rim);
  c.fillStyle = g;
  c.fillRect(0, 0, w, w);
}

const zenBoard = (p: ZenPalette): ThemedBoard => ({
  ground: (f) => drawGround(p, f),
  contents: (c, t) => contents(p, c, t),
  heart: (c) => heart(p, c),
  torch: (c, f, t) => torch(p, c, f, t),
  hero: (c) => hero(p, c),
  over: (f) => rim(p, f),
});

export const YANG_BOARD = zenBoard(YANG);
export const YIN_BOARD = zenBoard(YIN);
