import { COLORS } from "../../config.ts";
import type { EnemyStrength, Tile, Torch, KeyColor } from "../../entities.ts";
import { WOOD_COLOR } from "../../doors.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "../../render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "../../rank-chevrons.ts";

/** The Neon theme's dungeon board: every wall, tile content, torch and the
 * hero drawn as glowing laser lines on black. It replaces the dungeon's
 * lighting, decor and ambient effects while the theme is on; those wait
 * until they have neon versions of their own. */

export const NEON = {
  wall: "#ff4fc0",
  floor: "#ff4fc022",
  hero: "#9dff6a",
  enemy: "#ff5a3d",
  fast: "#7fe3ff",
  ranged: "#ffcf6e",
  torch: "#ffb347",
  stairs: "#ffe866",
  potion: "#ff5a7a",
  percentPotion: "#3fa8ff",
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

/** One tile's contents in tile space (24x24). */
export const paintNeonContents = contentsFrom({
  enemy(c, t) {
    const strength = t.enemy?.strength ?? "normal";
    ENEMY_SPRITES[strength](c, NEON.enemy);
    rankChevrons(c, strength, NEON.stairs, "#05030a", 1, 1, 4);
    // A Ranged enemy's arrow at the top right, and a Fast enemy's
    // fast-forward sign there, or below the arrow when it has both.
    if (t.enemy?.ranged) path(c, () => { c.moveTo(16, 7); c.lineTo(22, 1); c.moveTo(18.5, 1); c.lineTo(22, 1); c.lineTo(22, 4.5); }, NEON.ranged, 1);
    const fy = t.enemy?.ranged ? 7 : 0;
    if (t.enemy?.fast) path(c, () => { c.moveTo(16, 1 + fy); c.lineTo(19, 3 + fy); c.lineTo(16, 5 + fy); c.closePath(); c.moveTo(19, 1 + fy); c.lineTo(22, 3 + fy); c.lineTo(19, 5 + fy); c.closePath(); }, NEON.fast, 1);
  },
  key(c, t) {
    const color = keyColor(t.color);
    path(c, () => { c.arc(8, 12, 4, 0, Math.PI * 2); c.moveTo(12, 12); c.lineTo(21, 12); c.moveTo(18, 12); c.lineTo(18, 16); c.moveTo(21, 12); c.lineTo(21, 15); }, color);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      frame(c, NEON.heart);
      path(c, () => heart(c), NEON.heart, 1.4);
      return;
    }
    if (rule?.type === "wood") {
      // Planks: a frame and a crossbar in the timber's colour.
      frame(c, WOOD_COLOR);
      path(c, () => { c.moveTo(4, 13); c.lineTo(20, 13); c.moveTo(10, 6); c.lineTo(10, 20); c.moveTo(14, 6); c.lineTo(14, 20); }, WOOD_COLOR, 1.2);
      return;
    }
    if (rule?.type === "keys" && rule.heart) path(c, () => heart(c), NEON.heart, 1);
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const color = keyColor(keys[0]);
    frame(c, color);
    // A bar per key the door takes, in that key's colour.
    const n = Math.max(1, keys.length);
    for (let i = 0; i < n; i++) {
      const bx = 4 + (16 * (i + 1)) / (n + 1);
      path(c, () => { c.moveTo(bx, 6); c.lineTo(bx, 20); }, keyColor(keys[i]), 1.4);
    }
  },
  potion(c, t) {
    const color = t.color === "red" ? NEON.percentPotion : NEON.potion;
    path(c, () => {
      c.moveTo(10, 4); c.lineTo(14, 4); c.moveTo(10.5, 4); c.lineTo(10.5, 9);
      c.lineTo(6, 15); c.arc(12, 16, 6, Math.PI * 1.05, Math.PI * -0.05, true);
      c.lineTo(13.5, 9); c.lineTo(13.5, 4);
    }, color);
    path(c, () => { c.moveTo(7.5, 16); c.lineTo(16.5, 16); }, color, 1.2);
  },
  attack(c) {
    path(c, () => { c.moveTo(18, 4); c.lineTo(8, 14); c.moveTo(5, 12); c.lineTo(12, 19); c.moveTo(8, 16); c.lineTo(4, 20); c.moveTo(18, 4); c.lineTo(20, 4); c.lineTo(20, 6); }, NEON.attack);
  },
  defense(c) {
    path(c, () => { c.moveTo(12, 3); c.lineTo(19, 6); c.lineTo(18, 13); c.quadraticCurveTo(16, 18, 12, 21); c.quadraticCurveTo(8, 18, 6, 13); c.lineTo(5, 6); c.closePath(); c.moveTo(12, 7); c.lineTo(12, 17); }, NEON.defense);
  },
  reward: paintChest,
  openedChest: paintChest,
  treasure(c) {
    path(c, () => { c.moveTo(12, 4); c.lineTo(19, 10); c.lineTo(12, 20); c.lineTo(5, 10); c.closePath(); c.moveTo(5, 10); c.lineTo(19, 10); c.moveTo(9, 10); c.lineTo(12, 20); c.lineTo(15, 10); }, NEON.chest);
  },
  stairs(c) {
    path(c, () => {
      c.moveTo(4, 20); c.lineTo(4, 16); c.lineTo(9, 16); c.lineTo(9, 11); c.lineTo(14, 11); c.lineTo(14, 6); c.lineTo(20, 6); c.lineTo(20, 20); c.closePath();
    }, NEON.stairs);
    path(c, () => { c.moveTo(7, 9); c.lineTo(9.5, 4); c.lineTo(12, 9); }, NEON.stairs, 1.2);
  },
  oneway(c) {
    path(c, () => { c.moveTo(6, 15); c.lineTo(12, 9); c.lineTo(18, 15); }, NEON.wall, 1.8);
  },
});
/** A reward chest, shut or opened (`reward`, `openedChest`). */
function paintChest(c: CanvasRenderingContext2D, t: Tile) {
  const open = t.kind === "openedChest";
  path(c, () => {
    c.rect(4, 11, 16, 9);
    if (open) { c.moveTo(4, 11); c.lineTo(6, 5); c.lineTo(18, 5); c.lineTo(20, 11); }
    else { c.moveTo(4, 11); c.quadraticCurveTo(12, 4, 20, 11); c.moveTo(12, 13); c.lineTo(12, 16); }
  }, open ? "#ffd24a88" : NEON.chest);
}

/** A weak enemy: a slime sitting low on the tile, with a wobbly base, two
 * round eyes and a shine, leaving the top clear for its marks. */
function slime(c: CanvasRenderingContext2D, color: string) {
  path(c, () => {
    c.moveTo(4, 19.5); c.bezierCurveTo(4, 11, 8, 8, 12, 8); c.bezierCurveTo(16, 8, 20, 11, 20, 19.5);
    c.quadraticCurveTo(18, 21.5, 15.5, 20); c.quadraticCurveTo(12, 21.5, 8.5, 20); c.quadraticCurveTo(6, 21.5, 4, 19.5);
    c.moveTo(7, 20.4); c.lineTo(7, 22);
  }, color);
  path(c, () => { c.moveTo(10.7, 14.5); c.arc(9.5, 14.5, 1.2, 0, Math.PI * 2); c.moveTo(15.7, 14.5); c.arc(14.5, 14.5, 1.2, 0, Math.PI * 2); }, color, 1.2);
  path(c, () => { c.moveTo(7, 14); c.quadraticCurveTo(7.3, 11, 10, 10.3); }, "#fff", 0.8);
}

/** A normal or strong enemy: a horned head with two eyes. */
function imp(c: CanvasRenderingContext2D, color: string) {
  path(c, () => {
    c.moveTo(6, 9); c.lineTo(4, 3); c.lineTo(9, 7);
    c.lineTo(15, 7); c.lineTo(20, 3); c.lineTo(18, 9);
    c.lineTo(19, 15); c.lineTo(15, 21); c.lineTo(9, 21); c.lineTo(5, 15); c.closePath();
  }, color);
  path(c, () => { c.moveTo(8.5, 12); c.lineTo(11, 13.5); c.moveTo(15.5, 12); c.lineTo(13, 13.5); c.moveTo(10, 17.5); c.lineTo(14, 17.5); }, color, 1.3);
}

/** An elite or a boss: a broad demon's face filling the tile, with tall
 * curved horns rising between the chevrons and the Ranged and Fast marks,
 * slanted eyes and a fanged jaw. */
function demonFace(c: CanvasRenderingContext2D) {
  c.moveTo(7, 9); c.quadraticCurveTo(12, 7, 17, 9);
  c.lineTo(20, 13); c.lineTo(17.5, 19); c.lineTo(14, 22); c.lineTo(10, 22); c.lineTo(6.5, 19); c.lineTo(4, 13); c.closePath();
}
function demon(c: CanvasRenderingContext2D, color: string) {
  path(c, () => {
    demonFace(c);
    c.moveTo(7.5, 8.8); c.quadraticCurveTo(4.5, 5, 8, 1); c.quadraticCurveTo(8.5, 5, 10.5, 7.8);
    c.moveTo(16.5, 8.8); c.quadraticCurveTo(19.5, 5, 16, 1); c.quadraticCurveTo(15.5, 5, 13.5, 7.8);
  }, color);
  path(c, () => {
    c.moveTo(7, 12); c.lineTo(10.5, 13.8); c.moveTo(17, 12); c.lineTo(13.5, 13.8);
    c.moveTo(9, 17); c.lineTo(15, 17);
    c.moveTo(10, 17); c.lineTo(10.8, 19.2); c.lineTo(11.6, 17); c.moveTo(12.4, 17); c.lineTo(13.2, 19.2); c.lineTo(14, 17);
  }, color, 1.3);
}
/** A Greater Boss: the demon inside a faint second outline of its face. */
function greaterDemon(c: CanvasRenderingContext2D, color: string) {
  c.save();
  c.translate(12, 15);
  c.scale(1.2, 1.2);
  c.translate(-12, -15);
  path(c, () => demonFace(c), `${color}88`, 0.9);
  c.restore();
  demon(c, color);
}

/** Each strength's sprite: three silhouettes, two strengths apiece, which the
 * rank chevrons tell apart. */
const ENEMY_SPRITES: Record<EnemyStrength, (c: CanvasRenderingContext2D, color: string) => void> = {
  weak: slime,
  normal: imp,
  strong: imp,
  elite: demon,
  boss: demon,
  greaterBoss: greaterDemon,
};

function frame(c: CanvasRenderingContext2D, color: string) {
  path(c, () => c.rect(4, 3, 16, 19), color, 1.8);
}
/** The Heart Door's heart on its own, as its toll rises off the door. */
export function paintNeonHeart(c: CanvasRenderingContext2D) {
  path(c, () => heart(c), NEON.heart, 1.4);
}
function heart(c: CanvasRenderingContext2D) {
  c.moveTo(12, 18);
  c.bezierCurveTo(5, 13, 7, 7, 12, 10);
  c.bezierCurveTo(17, 7, 19, 13, 12, 18);
}

/** A torch, in tile space: a short post with a flickering flame. */
export function paintNeonTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  const flicker = f.look.reduceMotion ? 0 : Math.sin(f.now / 90 + t.x * 3 + t.y) * 0.8;
  path(c, () => { c.moveTo(12, 21); c.lineTo(12, 13); c.moveTo(9, 13); c.lineTo(15, 13); }, NEON.torch, 1.4);
  path(c, () => { c.moveTo(12, 4 + flicker); c.quadraticCurveTo(16, 9, 12, 11.5); c.quadraticCurveTo(8, 9, 12, 4 + flicker); }, NEON.torch, 1.5);
}

/** The hero: a ring with a visor, like a laser-drawn helmet. */
export function paintNeonHero(c: CanvasRenderingContext2D) {
  path(c, () => { c.arc(12, 12, 8, 0, Math.PI * 2); }, NEON.hero, 1.8);
  path(c, () => { c.moveTo(8, 11); c.lineTo(16, 11); c.moveTo(12, 11); c.lineTo(12, 16); }, NEON.hero, 1.4);
}

export const NEON_BOARD: ThemedBoard = { ground: drawNeonGround, contents: paintNeonContents, heart: paintNeonHeart, torch: paintNeonTorch, hero: paintNeonHero };
