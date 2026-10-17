import type { KeyColor } from "./config.ts";
import type { Tile, Torch } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "./rank-chevrons.ts";

/** The Desktop Game theme's dungeon board, as an old windowed desktop
 * computer's mine-sweeping game draws its field: flat grey floor cells,
 * walls as raised bevelled buttons on the teal desktop, and every tile's
 * contents a small flat icon in the sixteen-colour palette with a black
 * outline (enemies are mines, chests folders, the hero a smiling face). */

export const DESKTOP = {
  desktop: "#008080",
  face: "#c0c0c0",
  shadow: "#808080",
  light: "#ffffff",
  ink: "#000000",
  navy: "#000080",
  red: "#ff0000",
  maroon: "#800000",
  olive: "#808000",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
} as const;
const KEY_DESKTOP: Record<KeyColor, string> = { yellow: DESKTOP.yellow, blue: "#0000ff", red: DESKTOP.red };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_DESKTOP[k] ?? DESKTOP.yellow : DESKTOP.yellow);

/** Fills then outlines the current path. */
function icon(c: CanvasRenderingContext2D, fill: string, width = 1.2) {
  c.fillStyle = fill;
  c.fill();
  if (width <= 0) return;
  c.lineJoin = "round";
  c.lineWidth = width;
  c.strokeStyle = DESKTOP.ink;
  c.stroke();
}
function shape(c: CanvasRenderingContext2D, draw: () => void, fill: string, width?: number) {
  c.beginPath();
  draw();
  icon(c, fill, width);
}

/** A raised button over (x, y, w, h): grey face, white top and left edges,
 * black bottom and right with grey just inside. */
function raised(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.fillStyle = DESKTOP.ink;
  c.fillRect(x, y, w, h);
  c.fillStyle = DESKTOP.light;
  c.fillRect(x, y, w - 1, h - 1);
  c.fillStyle = DESKTOP.shadow;
  c.fillRect(x + 2, y + 2, w - 3, h - 3);
  c.fillStyle = DESKTOP.face;
  c.fillRect(x + 2, y + 2, w - 4.5, h - 4.5);
}

/** The teal desktop, flat grey floor cells ruled grey along their top and
 * left, and a raised button for every wall touching open ground. */
function drawDesktopGround(f: FrameContext) {
  const c = f.c;
  c.fillStyle = DESKTOP.desktop;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    if (wall && [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) return;
    c.save();
    toTileSpace(c, f, x, y);
    if (wall) raised(c, 0, 0, 24, 24);
    else {
      c.fillStyle = DESKTOP.face;
      c.fillRect(0, 0, 24, 24);
      c.fillStyle = DESKTOP.shadow;
      c.fillRect(0, 0, 24, 1);
      c.fillRect(0, 0, 1, 24);
    }
    c.restore();
  });
}

/** One tile's contents in tile space (24x24). */
const paintDesktopContents = contentsFrom({
  enemy(c, t) {
    // A mine: bigger for a boss, small for a weak enemy, and on a red
    // cell, as a mine set off, when strong or more.
    const e = t.enemy, strength = e?.strength ?? "normal";
    const boss = strength === "boss" || strength === "greaterBoss";
    if (boss || strength === "strong" || strength === "elite") {
      c.fillStyle = DESKTOP.red;
      c.fillRect(1, 1, 22, 22);
    }
    const r = boss ? 7.5 : strength === "weak" ? 4.5 : 6, spike = r + 3;
    c.beginPath();
    c.moveTo(12 - spike, 13); c.lineTo(12 + spike, 13);
    c.moveTo(12, 13 - spike); c.lineTo(12, 13 + spike);
    const d = spike * 0.7;
    c.moveTo(12 - d, 13 - d); c.lineTo(12 + d, 13 + d);
    c.moveTo(12 + d, 13 - d); c.lineTo(12 - d, 13 + d);
    c.lineWidth = 1.6;
    c.strokeStyle = DESKTOP.ink;
    c.stroke();
    c.beginPath();
    c.arc(12, 13, r, 0, Math.PI * 2);
    c.fillStyle = DESKTOP.ink;
    c.fill();
    c.fillStyle = DESKTOP.light;
    c.fillRect(12 - r * 0.55, 13 - r * 0.55, r * 0.4, r * 0.4);
    rankChevrons(c, strength, DESKTOP.yellow, DESKTOP.ink);
    // A Ranged enemy's arrow at the top right, and a Fast enemy's
    // fast-forward sign there, or below the arrow when it has both.
    if (e?.ranged) {
      c.beginPath();
      c.moveTo(16, 7); c.lineTo(22, 1); c.moveTo(18.5, 1); c.lineTo(22, 1); c.lineTo(22, 4.5);
      c.lineWidth = 1.4;
      c.strokeStyle = DESKTOP.navy;
      c.stroke();
    }
    const fy = e?.ranged ? 7 : 0;
    if (e?.fast) {
      c.beginPath();
      c.moveTo(16, 1 + fy); c.lineTo(19, 3 + fy); c.lineTo(16, 5 + fy); c.closePath();
      c.moveTo(19, 1 + fy); c.lineTo(22, 3 + fy); c.lineTo(19, 5 + fy); c.closePath();
      c.fillStyle = DESKTOP.navy;
      c.fill();
    }
  },
  key(c, t) {
    shape(c, () => {
      c.arc(7.5, 12, 4.5, 0, Math.PI * 2);
      c.moveTo(12, 10.5); c.lineTo(21, 10.5); c.lineTo(21, 15.5); c.lineTo(19, 15.5); c.lineTo(19, 13.5);
      c.lineTo(17, 13.5); c.lineTo(17, 15); c.lineTo(15, 15); c.lineTo(15, 13.5); c.lineTo(12, 13.5); c.closePath();
    }, keyColor(t.color));
    c.beginPath();
    c.arc(7.5, 12, 1.6, 0, Math.PI * 2);
    c.fillStyle = DESKTOP.ink;
    c.fill();
  },
  door(c, t) {
    const rule = t.door;
    raised(c, 3, 2, 18, 21);
    if (rule?.type === "fullHp") {
      paintDesktopHeart(c);
      return;
    }
    if (rule?.type === "wood") {
      // Planks: two olive boards and a crossbar.
      shape(c, () => { c.rect(7, 5, 4, 15); c.rect(13, 5, 4, 15); }, DESKTOP.olive, 1);
      shape(c, () => c.rect(6, 11, 12, 3), DESKTOP.olive, 1);
      return;
    }
    if (rule?.type === "keys" && rule.heart) shape(c, () => heartPath(c, 12, 5, 0.45), DESKTOP.red, 0.8);
    // A bar per key the door takes, in that key's colour.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const n = Math.max(1, keys.length);
    for (let i = 0; i < n; i++) {
      const bx = 4 + (16 * (i + 1)) / (n + 1);
      shape(c, () => c.rect(bx - 1.5, 8, 3, 12), keyColor(keys[i]), 1);
    }
  },
  potion(c, t) {
    shape(c, () => {
      c.moveTo(10, 4); c.lineTo(14, 4); c.lineTo(14, 9);
      c.lineTo(18, 14); c.arc(12, 16, 6.3, -0.3, Math.PI + 0.3); c.lineTo(10, 9); c.closePath();
    }, t.color === "red" ? DESKTOP.magenta : DESKTOP.red);
    c.fillStyle = DESKTOP.light;
    c.fillRect(8.5, 14, 2, 3);
  },
  attack(c) {
    // A sword: a white-edged grey blade and an olive hilt.
    shape(c, () => { c.moveTo(19, 3); c.lineTo(21, 5); c.lineTo(11, 15); c.lineTo(9, 13); c.closePath(); }, DESKTOP.face);
    shape(c, () => { c.moveTo(6, 12); c.lineTo(8, 10); c.lineTo(14, 16); c.lineTo(12, 18); c.closePath(); }, DESKTOP.olive);
    shape(c, () => { c.moveTo(8, 15); c.lineTo(9.5, 16.5); c.lineTo(5, 21); c.lineTo(3.5, 19.5); c.closePath(); }, DESKTOP.maroon);
  },
  defense(c) {
    shape(c, () => {
      c.moveTo(12, 3); c.lineTo(19, 5.5); c.lineTo(18.5, 13); c.quadraticCurveTo(16, 18, 12, 21);
      c.quadraticCurveTo(8, 18, 5.5, 13); c.lineTo(5, 5.5); c.closePath();
    }, DESKTOP.navy);
    c.fillStyle = DESKTOP.yellow;
    c.fillRect(11, 6.5, 2, 10);
    c.fillRect(8, 9.5, 8, 2);
  },
  reward: paintChest,
  openedChest: paintChest,
  treasure(c) {
    shape(c, () => { c.moveTo(12, 4); c.lineTo(19, 10); c.lineTo(12, 20); c.lineTo(5, 10); c.closePath(); }, DESKTOP.cyan);
    c.beginPath();
    c.moveTo(5, 10); c.lineTo(19, 10); c.moveTo(9, 10); c.lineTo(12, 20); c.lineTo(15, 10);
    c.lineWidth = 0.8;
    c.strokeStyle = DESKTOP.navy;
    c.stroke();
    c.fillStyle = DESKTOP.light;
    c.fillRect(8.5, 7.5, 2, 1.5);
  },
  stairs(c) {
    shape(c, () => {
      c.moveTo(3, 21); c.lineTo(3, 16); c.lineTo(8, 16); c.lineTo(8, 11); c.lineTo(13, 11); c.lineTo(13, 6); c.lineTo(21, 6); c.lineTo(21, 21); c.closePath();
    }, DESKTOP.face);
    shape(c, () => { c.moveTo(4, 9); c.lineTo(7.5, 3); c.lineTo(11, 9); c.closePath(); }, DESKTOP.ink, 0.6);
  },
  oneway(c) {
    // A scroll bar's arrow button.
    raised(c, 5, 6, 14, 12);
    c.beginPath();
    c.moveTo(8.5, 14); c.lineTo(12, 9.5); c.lineTo(15.5, 14); c.closePath();
    c.fillStyle = DESKTOP.ink;
    c.fill();
  },
});
/** A reward chest, shut or opened (`reward`, `openedChest`). */
function paintChest(c: CanvasRenderingContext2D, t: Tile) {
  // A folder: closed while it holds a reward, opened once emptied.
  const open = t.kind === "openedChest";
  shape(c, () => { c.moveTo(3, 7); c.lineTo(9, 7); c.lineTo(11, 9); c.lineTo(21, 9); c.lineTo(21, 20); c.lineTo(3, 20); c.closePath(); }, open ? "#c8c860" : "#e8d850");
  if (open) shape(c, () => { c.moveTo(3, 20); c.lineTo(6.5, 12); c.lineTo(23, 12); c.lineTo(21, 20); c.closePath(); }, "#f0f0b0");
  else shape(c, () => c.rect(3, 11, 18, 9), DESKTOP.yellow);
}
function heartPath(c: CanvasRenderingContext2D, x: number, y: number, k: number) {
  c.moveTo(x, y + 16 * k);
  c.bezierCurveTo(x - 10 * k, y + 9 * k, x - 7 * k, y, x, y + 4 * k);
  c.bezierCurveTo(x + 7 * k, y, x + 10 * k, y + 9 * k, x, y + 16 * k);
}
/** The Heart Door's heart on its own, as its toll rises off the door. */
function paintDesktopHeart(c: CanvasRenderingContext2D) {
  shape(c, () => heartPath(c, 12, 5, 1), DESKTOP.red);
}

/** A torch: an olive post and, while lit, a flickering flame. */
function paintDesktopTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  shape(c, () => c.rect(10.5, 12, 3, 9), DESKTOP.olive, 1);
  if (!t.active) return;
  const flicker = f.look.reduceMotion ? 0 : Math.sin(f.now / 90 + t.x * 3 + t.y) * 0.8;
  shape(c, () => { c.moveTo(12, 3 + flicker); c.quadraticCurveTo(17, 8, 12, 11.5); c.quadraticCurveTo(7, 8, 12, 3 + flicker); }, DESKTOP.red, 1);
  shape(c, () => { c.moveTo(12, 6.5 + flicker); c.quadraticCurveTo(14.5, 9, 12, 11); c.quadraticCurveTo(9.5, 9, 12, 6.5 + flicker); }, DESKTOP.yellow, 0);
}

/** The hero: the mine-sweeping game's smiling face. */
function paintDesktopHero(c: CanvasRenderingContext2D) {
  shape(c, () => c.arc(12, 12, 8.5, 0, Math.PI * 2), DESKTOP.yellow, 1.4);
  c.fillStyle = DESKTOP.ink;
  c.fillRect(8.5, 8.5, 2, 2.5);
  c.fillRect(13.5, 8.5, 2, 2.5);
  c.beginPath();
  c.arc(12, 12.5, 4.5, 0.25 * Math.PI, 0.75 * Math.PI);
  c.lineWidth = 1.4;
  c.strokeStyle = DESKTOP.ink;
  c.stroke();
}

export const DESKTOP_BOARD: ThemedBoard = {
  ground: drawDesktopGround, contents: paintDesktopContents, heart: paintDesktopHeart, torch: paintDesktopTorch, hero: paintDesktopHero,
};
