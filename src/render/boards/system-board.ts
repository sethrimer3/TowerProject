import type { EnemyStrength, Tile, Torch, KeyColor } from "../../entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "../render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "../rank-chevrons.ts";
import { roundRect } from "./themed-art.ts";

/** The System Game theme's dungeon board, as an old one-bit computer's paint
 * program would draw it: black on white and nothing between but dithered
 * grey. Open ground is white paper, the walls along it bricks, the rock
 * beyond the desktop's 50% grey; enemies are the system's bombs (a boss the
 * sad computer with crossed-out eyes), chests folders, and the hero the
 * smiling computer. Keys and doors alone keep their key's colour, since
 * that colour is the rule. */

export const SYSTEM = {
  ink: "#000000",
  paper: "#ffffff",
  /** The grey drawn where a dither pattern can't be (no canvas to bake it
   * on). */
  grey: "#808080",
  keys: { yellow: "#f2c200", blue: "#2f6fe0", red: "#e0302a" } as Record<KeyColor, string>,
} as const;
const keyColor = (k: KeyColor | undefined) => (k ? SYSTEM.keys[k] ?? SYSTEM.paper : SYSTEM.paper);

/** The 50% grey: a checker of one-CSS-pixel dots, baked once. */
let checker: CanvasPattern | null | undefined;
/** The board's device pixel ratio, as the ground last saw it. */
let ratio = 1;
function dither(c: CanvasRenderingContext2D): CanvasPattern | string {
  if (checker === undefined) {
    checker = null;
    try {
      const cv = typeof document === "undefined" ? null : document.createElement("canvas");
      const g = cv?.getContext("2d");
      if (cv && g) {
        cv.width = cv.height = 2;
        g.fillStyle = SYSTEM.paper;
        g.fillRect(0, 0, 2, 2);
        g.fillStyle = SYSTEM.ink;
        g.fillRect(0, 0, 1, 1);
        g.fillRect(1, 1, 1, 1);
        checker = c.createPattern(cv, "repeat");
      }
    } catch {
      checker = null;
    }
  }
  if (!checker || typeof checker.setTransform !== "function") return SYSTEM.grey;
  // Each dot is one CSS pixel on screen, whatever the current transform.
  try {
    checker.setTransform(c.getTransform().inverse().scale(ratio));
  } catch {
    return SYSTEM.grey;
  }
  return checker;
}

/** Fills then outlines the current path in black. */
function icon(c: CanvasRenderingContext2D, fill: string | CanvasPattern, width = 1.5) {
  c.fillStyle = fill;
  c.fill();
  if (width <= 0) return;
  c.lineJoin = "round";
  c.lineWidth = width;
  c.strokeStyle = SYSTEM.ink;
  c.stroke();
}
function shape(c: CanvasRenderingContext2D, draw: () => void, fill: string | CanvasPattern, width?: number) {
  c.beginPath();
  draw();
  icon(c, fill, width);
}

/** The desktop's grey over the whole board, white paper on open ground, and
 * a brick wall in a black frame wherever rock touches it. */
function ground(f: FrameContext) {
  const c = f.c;
  ratio = f.dpr || 1;
  const smoothing = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = false;
  c.fillStyle = dither(c);
  c.fillRect(0, 0, f.width, f.width);
  c.imageSmoothingEnabled = smoothing;
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    if (wall && [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) return;
    c.save();
    toTileSpace(c, f, x, y);
    c.fillStyle = SYSTEM.paper;
    c.fillRect(-0.25, -0.25, 24.5, 24.5);
    if (wall) {
      // Bricks: three courses, every other one offset by half a brick.
      c.fillStyle = SYSTEM.ink;
      for (let row = 0; row < 3; row++) {
        const y0 = row * 8;
        c.fillRect(0, y0 + 7, 24, 1);
        for (let bx = row % 2 ? 6 : 0; bx < 24; bx += 12) c.fillRect(bx, y0, 1, 7);
      }
      // A black edge along each side that faces open ground.
      if (!isWall(x, y + 1)) c.fillRect(0, 0, 24, 1.5);
      if (!isWall(x, y - 1)) c.fillRect(0, 22.5, 24, 1.5);
      if (!isWall(x - 1, y)) c.fillRect(0, 0, 1.5, 24);
      if (!isWall(x + 1, y)) c.fillRect(22.5, 0, 1.5, 24);
    }
    c.restore();
  });
}

/** The system's bomb: a black ball with a highlight, a fuse and its spark;
 * `r` its radius. */
function bomb(c: CanvasRenderingContext2D, r: number) {
  const cy = 14;
  c.beginPath();
  c.moveTo(12 + r * 0.55, cy - r * 0.75);
  c.quadraticCurveTo(12 + r * 0.9, cy - r - 4, 12 + r + 3, cy - r - 3);
  c.lineWidth = 1.4;
  c.strokeStyle = SYSTEM.ink;
  c.stroke();
  // The spark: a little star of four strokes.
  const sx = 12 + r + 3.5, sy = cy - r - 3.5;
  c.beginPath();
  c.moveTo(sx - 2.2, sy); c.lineTo(sx + 2.2, sy);
  c.moveTo(sx, sy - 2.2); c.lineTo(sx, sy + 2.2);
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = SYSTEM.ink;
  c.fillRect(12 + r * 0.25, cy - r - 0.5, r * 0.6, 2.5);
  c.beginPath();
  c.arc(12, cy, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = SYSTEM.paper;
  c.fillRect(12 - r * 0.55, cy - r * 0.55, Math.max(1.5, r * 0.3), Math.max(1.5, r * 0.3));
}

/** The sad computer, a boss: a boxy little computer filled black (white
 * for a Greater Boss's screen, framed in black), with crossed-out eyes and
 * a frown on its screen. */
function sadComputer(c: CanvasRenderingContext2D, big: boolean) {
  const k = big ? 1.12 : 0.95;
  c.save();
  c.translate(12, 13);
  c.scale(k, k);
  shape(c, () => roundRect(c, -8, -10, 16, 20, 2), SYSTEM.ink, 1);
  shape(c, () => roundRect(c, -5.5, -7.5, 11, 9, 1), big ? SYSTEM.paper : SYSTEM.ink, 1.2);
  if (!big) {
    c.strokeStyle = SYSTEM.paper;
    c.lineWidth = 1;
    c.strokeRect(-5, -7, 10, 8);
  }
  const face = big ? SYSTEM.ink : SYSTEM.paper;
  c.beginPath();
  for (const ex of [-2.5, 2.5]) {
    c.moveTo(ex - 1.2, -5.7); c.lineTo(ex + 1.2, -3.5);
    c.moveTo(ex + 1.2, -5.7); c.lineTo(ex - 1.2, -3.5);
  }
  c.moveTo(-2.2, -0.6);
  c.quadraticCurveTo(0, -2.6, 2.2, -0.6);
  c.lineWidth = 0.9;
  c.strokeStyle = face;
  c.stroke();
  // The floppy slot.
  c.fillStyle = SYSTEM.paper;
  c.fillRect(1, 5, 5, 1);
  c.restore();
}

/** How large an enemy's bomb is, by its strength. */
const BOMB: Record<EnemyStrength, number> = { weak: 4, normal: 5.2, strong: 6.4, elite: 6.4, boss: 0, greaterBoss: 0 };

/** One tile's contents in tile space (24x24). */
const contents = contentsFrom({
  enemy(c, t) {
    const e = t.enemy, strength = e?.strength ?? "normal";
    if (strength === "boss" || strength === "greaterBoss") sadComputer(c, strength === "greaterBoss");
    else bomb(c, BOMB[strength]);
    // The elite: a marching-ants ring round its bomb.
    if (strength === "elite") {
      c.beginPath();
      c.arc(12, 14, 9.3, 0, Math.PI * 2);
      c.setLineDash?.([1.5, 1.5]);
      c.lineWidth = 1.2;
      c.strokeStyle = SYSTEM.ink;
      c.stroke();
      c.setLineDash?.([]);
    }
    rankChevrons(c, strength, SYSTEM.ink, SYSTEM.paper);
    // A Ranged enemy's arrow at the top right, a Fast enemy's
    // fast-forward sign at the bottom right.
    if (e?.ranged) {
      c.beginPath();
      c.moveTo(17, 7); c.lineTo(22.5, 1.5); c.moveTo(19, 1.5); c.lineTo(22.5, 1.5); c.lineTo(22.5, 5);
      c.lineWidth = 1.3;
      c.strokeStyle = SYSTEM.ink;
      c.stroke();
    }
    if (e?.fast) {
      c.beginPath();
      c.moveTo(16, 19); c.lineTo(19, 21); c.lineTo(16, 23); c.closePath();
      c.moveTo(19.5, 19); c.lineTo(22.5, 21); c.lineTo(19.5, 23); c.closePath();
      c.fillStyle = SYSTEM.ink;
      c.fill();
    }
  },
  key(c, t) {
    shape(c, () => {
      c.arc(7.5, 12, 4.5, 0, Math.PI * 2);
      c.moveTo(12, 10.5); c.lineTo(21, 10.5); c.lineTo(21, 15.5); c.lineTo(19, 15.5); c.lineTo(19, 13.5);
      c.lineTo(17, 13.5); c.lineTo(17, 15); c.lineTo(15, 15); c.lineTo(15, 13.5); c.lineTo(12, 13.5); c.closePath();
    }, keyColor(t.color));
    shape(c, () => c.arc(7.5, 12, 1.6, 0, Math.PI * 2), SYSTEM.paper, 1);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      shape(c, () => c.rect(3.5, 2.5, 17, 19), SYSTEM.paper);
      heart(c);
      return;
    }
    if (rule?.type === "wood") {
      // Planks of grey with black seams.
      shape(c, () => c.rect(3.5, 2.5, 17, 19), dither(c));
      c.fillStyle = SYSTEM.ink;
      c.fillRect(9, 2.5, 1, 19);
      c.fillRect(14.5, 2.5, 1, 19);
      return;
    }
    // A door in a black frame, a panel per key it takes in that key's
    // colour, and a white knob.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const n = Math.max(1, keys.length), w = 17 / n;
    shape(c, () => c.rect(3.5, 2.5, 17, 19), SYSTEM.paper);
    for (let i = 0; i < n; i++) shape(c, () => c.rect(3.5 + i * w, 2.5, w, 19), keyColor(keys[i]), 1.2);
    if (rule?.type === "keys" && rule.heart) shape(c, () => heartPath(c, 12, 5.5, 0.4), SYSTEM.paper, 1);
    shape(c, () => c.arc(17, 13, 1.4, 0, Math.PI * 2), SYSTEM.paper, 1);
  },
  potion(c, t) {
    // A flask with a cross on it: white, or black with a white cross for
    // the percent potion.
    const dark = t.color === "red";
    shape(c, () => {
      c.moveTo(10, 3.5); c.lineTo(14, 3.5); c.lineTo(14, 9);
      c.lineTo(18, 14); c.arc(12, 16, 6.3, -0.3, Math.PI + 0.3); c.lineTo(10, 9); c.closePath();
    }, dark ? SYSTEM.ink : SYSTEM.paper);
    c.fillStyle = dark ? SYSTEM.paper : SYSTEM.ink;
    c.fillRect(11, 13, 2, 6);
    c.fillRect(9, 15, 6, 2);
  },
  attack(c) {
    // A sword: a white blade, a black guard and grip.
    shape(c, () => { c.moveTo(19, 3); c.lineTo(21, 5); c.lineTo(11, 15); c.lineTo(9, 13); c.closePath(); }, SYSTEM.paper);
    shape(c, () => { c.moveTo(6, 12); c.lineTo(8, 10); c.lineTo(14, 16); c.lineTo(12, 18); c.closePath(); }, SYSTEM.ink, 1);
    shape(c, () => { c.moveTo(8, 15); c.lineTo(9.5, 16.5); c.lineTo(5, 21); c.lineTo(3.5, 19.5); c.closePath(); }, SYSTEM.ink, 1);
  },
  defense(c) {
    // A shield, its left half grey.
    shape(c, () => {
      c.moveTo(12, 3); c.lineTo(19, 5.5); c.lineTo(18.5, 13); c.quadraticCurveTo(16, 18, 12, 21);
      c.quadraticCurveTo(8, 18, 5.5, 13); c.lineTo(5, 5.5); c.closePath();
    }, SYSTEM.paper);
    shape(c, () => {
      c.moveTo(12, 3); c.lineTo(5, 5.5); c.lineTo(5.5, 13); c.quadraticCurveTo(8, 18, 12, 21); c.closePath();
    }, dither(c), 0);
    shape(c, () => {
      c.moveTo(12, 3); c.lineTo(19, 5.5); c.lineTo(18.5, 13); c.quadraticCurveTo(16, 18, 12, 21);
      c.quadraticCurveTo(8, 18, 5.5, 13); c.lineTo(5, 5.5); c.closePath();
      c.moveTo(12, 3); c.lineTo(12, 21);
    }, "transparent");
  },
  reward: paintChest,
  openedChest: paintChest,
  treasure(c) {
    // A gem: white facets on one side, grey on the other.
    shape(c, () => { c.moveTo(12, 4); c.lineTo(19, 10); c.lineTo(12, 20); c.lineTo(5, 10); c.closePath(); }, SYSTEM.paper);
    shape(c, () => { c.moveTo(12, 10); c.lineTo(19, 10); c.lineTo(12, 20); c.closePath(); }, dither(c), 0);
    shape(c, () => {
      c.moveTo(12, 4); c.lineTo(19, 10); c.lineTo(12, 20); c.lineTo(5, 10); c.closePath();
      c.moveTo(5, 10); c.lineTo(19, 10); c.moveTo(9, 10); c.lineTo(12, 20); c.lineTo(15, 10);
    }, "transparent", 1.1);
  },
  stairs(c) {
    shape(c, () => {
      c.moveTo(3, 21); c.lineTo(3, 16); c.lineTo(8, 16); c.lineTo(8, 11); c.lineTo(13, 11); c.lineTo(13, 6); c.lineTo(21, 6); c.lineTo(21, 21); c.closePath();
    }, SYSTEM.paper);
    c.fillStyle = SYSTEM.ink;
    c.fillRect(3, 16, 5, 1.5);
    c.fillRect(8, 11, 5, 1.5);
    c.fillRect(13, 6, 8, 1.5);
    shape(c, () => { c.moveTo(4, 9); c.lineTo(7.5, 3); c.lineTo(11, 9); c.closePath(); }, SYSTEM.ink, 0.6);
  },
  oneway(c) {
    // A scroll bar's up arrow: a hollow arrow in a box.
    shape(c, () => c.rect(5, 5, 14, 14), SYSTEM.paper, 1.2);
    shape(c, () => {
      c.moveTo(12, 7.5); c.lineTo(17, 12.5); c.lineTo(14.2, 12.5); c.lineTo(14.2, 16.5); c.lineTo(9.8, 16.5); c.lineTo(9.8, 12.5); c.lineTo(7, 12.5); c.closePath();
    }, SYSTEM.paper, 1.1);
  },
});
/** A reward chest, shut or opened (`reward`, `openedChest`). */
function paintChest(c: CanvasRenderingContext2D, t: Tile) {
  // A folder: closed and full while it holds a reward, an empty dotted
  // outline once emptied.
  if (t.kind === "openedChest") {
    c.beginPath();
    c.moveTo(3.5, 7.5); c.lineTo(9, 7.5); c.lineTo(11, 9.5); c.lineTo(20.5, 9.5); c.lineTo(20.5, 19.5); c.lineTo(3.5, 19.5); c.closePath();
    c.setLineDash?.([1, 1.5]);
    c.lineWidth = 1;
    c.strokeStyle = SYSTEM.ink;
    c.stroke();
    c.setLineDash?.([]);
    return;
  }
  shape(c, () => { c.moveTo(3, 7); c.lineTo(9, 7); c.lineTo(11, 9); c.lineTo(21, 9); c.lineTo(21, 20); c.lineTo(3, 20); c.closePath(); }, SYSTEM.paper);
  c.fillStyle = SYSTEM.ink;
  c.fillRect(3, 11, 18, 1.2);
}
function heartPath(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
  c.moveTo(x, y + 16 * k);
  c.bezierCurveTo(x - 10 * k, y + 9 * k, x - 7 * k, y, x, y + 4 * k);
  c.bezierCurveTo(x + 7 * k, y, x + 10 * k, y + 9 * k, x, y + 16 * k);
}
/** The Heart Door's heart on its own, as its toll rises off the door: solid
 * black. */
function heart(c: CanvasRenderingContext2D) {
  shape(c, () => heartPath(c, 12, 5, 0.85), SYSTEM.ink, 1);
}

/** A torch: a white candle and, while lit, a flame of black outline round
 * white; a bare wick once put out. */
function torch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  shape(c, () => c.rect(10, 13, 4, 8), SYSTEM.paper, 1.1);
  c.fillStyle = SYSTEM.ink;
  c.fillRect(11.5, 10.5, 1, 2.5);
  if (!t.active) return;
  const flicker = f.look.reduceMotion ? 0 : Math.sin(f.now / 90 + t.x * 3 + t.y) * 0.7;
  shape(c, () => { c.moveTo(12, 3.5 + flicker); c.quadraticCurveTo(16, 8, 12, 11); c.quadraticCurveTo(8, 8, 12, 3.5 + flicker); }, SYSTEM.paper, 1.1);
  c.fillStyle = SYSTEM.ink;
  c.fillRect(11.4, 7, 1.2, 3);
}

/** The hero: the smiling computer, white, its face white on a black
 * screen. */
function hero(c: CanvasRenderingContext2D) {
  shape(c, () => roundRect(c, 4.5, 2, 15, 20, 2), SYSTEM.paper, 1.5);
  shape(c, () => roundRect(c, 7, 4.5, 10, 8.5, 1), SYSTEM.ink, 1.2);
  c.fillStyle = SYSTEM.paper;
  c.fillRect(9.4, 6.3, 1.4, 2.2);
  c.fillRect(13.2, 6.3, 1.4, 2.2);
  c.beginPath();
  c.moveTo(9.3, 9.8);
  c.quadraticCurveTo(12, 12.2, 14.7, 9.8);
  c.lineWidth = 1.1;
  c.strokeStyle = SYSTEM.paper;
  c.stroke();
  // The floppy slot and the base.
  c.fillStyle = SYSTEM.ink;
  c.fillRect(13, 17, 4, 1);
  c.fillRect(6, 19.5, 12, 1);
}

export const SYSTEM_BOARD: ThemedBoard = { ground, contents, heart, torch, hero };
