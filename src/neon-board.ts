import { COLORS, type KeyColor } from "./config.ts";
import type { Tile, Torch } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";

/** The Neon theme's dungeon board: every wall, tile content, torch and the
 * hero drawn as glowing laser lines on black. It replaces the dungeon's
 * lighting, decor and ambient effects while the theme is on; those wait
 * until they have neon versions of their own. */

export const NEON = {
  wall: "#ff4fc0",
  floor: "#ff4fc022",
  hero: "#9dff6a",
  enemy: "#ff5a3d",
  torch: "#ffb347",
  stairs: "#ffe866",
  potion: "#ff5a7a",
  percentPotion: "#ff3fd0",
  attack: "#ff7a3d",
  defense: "#5fd8ff",
  chest: "#ffd24a",
  heart: "#ff4fc0",
} as const;

const KEY_NEON: Record<KeyColor, string> = { yellow: "#ffe866", blue: "#4fc3ff", red: "#ff4f5e" };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_NEON[k] ?? COLORS[k] : NEON.stairs);

/** Strokes the current path as a tube: a wide soft glow, then a bright core. */
function tube(c: CanvasRenderingContext2D, color: string, width = 1.6) {
  c.lineCap = "round";
  c.lineJoin = "round";
  c.shadowColor = color;
  c.shadowBlur = 8;
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
  c.shadowBlur = 0;
  c.strokeStyle = "#fff8";
  c.lineWidth = width * 0.35;
  c.stroke();
}
function path(c: CanvasRenderingContext2D, draw: () => void, color: string, width?: number) {
  c.beginPath();
  draw();
  tube(c, color, width);
}

/** Black ground, a faint dot per floor tile, and the walls' outlines. */
export function drawNeonGround(f: FrameContext) {
  const c = f.c;
  c.fillStyle = "#05030a";
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => f.world.tile(x, y)?.kind === "wall";
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    c.save();
    toTileSpace(c, f, x, y);
    if (!wall) {
      c.fillStyle = NEON.floor;
      c.fillRect(11, 11, 2, 2);
    } else {
      // A tube along every side that faces open ground, inset from it.
      const i = 3;
      c.beginPath();
      if (!isWall(x, y + 1)) { c.moveTo(0, i); c.lineTo(24, i); }
      if (!isWall(x, y - 1)) { c.moveTo(0, 24 - i); c.lineTo(24, 24 - i); }
      if (!isWall(x - 1, y)) { c.moveTo(i, 0); c.lineTo(i, 24); }
      if (!isWall(x + 1, y)) { c.moveTo(24 - i, 0); c.lineTo(24 - i, 24); }
      tube(c, NEON.wall, 1.8);
    }
    c.restore();
  });
}

/** Every tile's contents, each in its own neon sprite. */
export function drawNeonContents(f: FrameContext, lunge: { x: number; y: number; dx: number; dy: number }) {
  const c = f.c;
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y);
    if (!t || t.kind === "wall" || t.kind === "floor") return;
    const leaning = x === lunge.x && y === lunge.y;
    c.save();
    toTileSpace(c, f, leaning ? x + lunge.dx : x, leaning ? y + lunge.dy : y);
    paintNeonContents(c, t);
    c.restore();
  });
}

/** One tile's contents in tile space (24x24). */
export function paintNeonContents(c: CanvasRenderingContext2D, t: Tile) {
  switch (t.kind) {
    case "enemy": {
      // One sprite for every enemy: a horned head with two eyes.
      const color = NEON.enemy;
      path(c, () => {
        c.moveTo(6, 9); c.lineTo(4, 3); c.lineTo(9, 7);
        c.lineTo(15, 7); c.lineTo(20, 3); c.lineTo(18, 9);
        c.lineTo(19, 15); c.lineTo(15, 21); c.lineTo(9, 21); c.lineTo(5, 15); c.closePath();
      }, color);
      path(c, () => { c.moveTo(8.5, 12); c.lineTo(11, 13.5); c.moveTo(15.5, 12); c.lineTo(13, 13.5); c.moveTo(10, 17.5); c.lineTo(14, 17.5); }, color, 1.3);
      return;
    }
    case "key": {
      const color = keyColor(t.color);
      path(c, () => { c.arc(8, 12, 4, 0, Math.PI * 2); c.moveTo(12, 12); c.lineTo(21, 12); c.moveTo(18, 12); c.lineTo(18, 16); c.moveTo(21, 12); c.lineTo(21, 15); }, color);
      return;
    }
    case "door": {
      const rule = t.door;
      if (rule?.type === "fullHp") {
        frame(c, NEON.heart);
        path(c, () => heart(c), NEON.heart, 1.4);
        return;
      }
      const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
      const color = keyColor(keys[0]);
      frame(c, color);
      // A bar per key the door takes, in that key's colour.
      const n = Math.max(1, keys.length);
      for (let i = 0; i < n; i++) {
        const bx = 4 + (16 * (i + 1)) / (n + 1);
        path(c, () => { c.moveTo(bx, 6); c.lineTo(bx, 20); }, keyColor(keys[i]), 1.4);
      }
      return;
    }
    case "potion": {
      const color = t.color === "red" ? NEON.percentPotion : NEON.potion;
      path(c, () => {
        c.moveTo(10, 4); c.lineTo(14, 4); c.moveTo(10.5, 4); c.lineTo(10.5, 9);
        c.lineTo(6, 15); c.arc(12, 16, 6, Math.PI * 1.05, Math.PI * -0.05, true);
        c.lineTo(13.5, 9); c.lineTo(13.5, 4);
      }, color);
      path(c, () => { c.moveTo(7.5, 16); c.lineTo(16.5, 16); }, color, 1.2);
      return;
    }
    case "attack":
      path(c, () => { c.moveTo(18, 4); c.lineTo(8, 14); c.moveTo(5, 12); c.lineTo(12, 19); c.moveTo(8, 16); c.lineTo(4, 20); c.moveTo(18, 4); c.lineTo(20, 4); c.lineTo(20, 6); }, NEON.attack);
      return;
    case "defense":
      path(c, () => { c.moveTo(12, 3); c.lineTo(19, 6); c.lineTo(18, 13); c.quadraticCurveTo(16, 18, 12, 21); c.quadraticCurveTo(8, 18, 6, 13); c.lineTo(5, 6); c.closePath(); c.moveTo(12, 7); c.lineTo(12, 17); }, NEON.defense);
      return;
    case "reward":
    case "openedChest": {
      const open = t.kind === "openedChest";
      path(c, () => {
        c.rect(4, 11, 16, 9);
        if (open) { c.moveTo(4, 11); c.lineTo(6, 5); c.lineTo(18, 5); c.lineTo(20, 11); }
        else { c.moveTo(4, 11); c.quadraticCurveTo(12, 4, 20, 11); c.moveTo(12, 13); c.lineTo(12, 16); }
      }, open ? "#ffd24a88" : NEON.chest);
      return;
    }
    case "treasure":
      path(c, () => { c.moveTo(12, 4); c.lineTo(19, 10); c.lineTo(12, 20); c.lineTo(5, 10); c.closePath(); c.moveTo(5, 10); c.lineTo(19, 10); c.moveTo(9, 10); c.lineTo(12, 20); c.lineTo(15, 10); }, NEON.chest);
      return;
    case "stairs":
    case "stairsDown": {
      const color = t.kind === "stairs" ? NEON.stairs : "#c98fb0";
      path(c, () => {
        c.moveTo(4, 20); c.lineTo(4, 16); c.lineTo(9, 16); c.lineTo(9, 11); c.lineTo(14, 11); c.lineTo(14, 6); c.lineTo(20, 6); c.lineTo(20, 20); c.closePath();
      }, color);
      const up = t.kind === "stairs";
      path(c, () => { c.moveTo(7, up ? 9 : 4); c.lineTo(9.5, up ? 4 : 9); c.lineTo(12, up ? 9 : 4); }, color, 1.2);
      return;
    }
    case "oneway":
      path(c, () => { c.moveTo(6, 15); c.lineTo(12, 9); c.lineTo(18, 15); }, NEON.wall, 1.8);
      return;
  }
}
function frame(c: CanvasRenderingContext2D, color: string) {
  path(c, () => c.rect(4, 3, 16, 19), color, 1.8);
}
function heart(c: CanvasRenderingContext2D) {
  c.moveTo(12, 18);
  c.bezierCurveTo(5, 13, 7, 7, 12, 10);
  c.bezierCurveTo(17, 7, 19, 13, 12, 18);
}

/** A torch: a short post with a flickering flame. */
export function drawNeonTorch(f: FrameContext, t: Torch) {
  const c = f.c;
  c.save();
  toTileSpace(c, f, t.x, t.y);
  const flicker = f.look.reduceMotion ? 0 : Math.sin(f.now / 90 + t.x * 3 + t.y) * 0.8;
  path(c, () => { c.moveTo(12, 21); c.lineTo(12, 13); c.moveTo(9, 13); c.lineTo(15, 13); }, NEON.torch, 1.4);
  path(c, () => { c.moveTo(12, 4 + flicker); c.quadraticCurveTo(16, 9, 12, 11.5); c.quadraticCurveTo(8, 9, 12, 4 + flicker); }, NEON.torch, 1.5);
  c.restore();
}

/** The hero: a ring with a visor, like a laser-drawn helmet. */
export function paintNeonHero(c: CanvasRenderingContext2D) {
  path(c, () => { c.arc(12, 12, 8, 0, Math.PI * 2); }, NEON.hero, 1.8);
  path(c, () => { c.moveTo(8, 11); c.lineTo(16, 11); c.moveTo(12, 11); c.lineTo(12, 16); }, NEON.hero, 1.4);
}
