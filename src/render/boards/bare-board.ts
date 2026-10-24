import { potionShade, type EnemyStrength, type Tile, type Torch, type KeyColor } from "../../entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "../../render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "../../rank-chevrons.ts";

/** The Shiro and Kuro Game themes' dungeon board, as bare as it can be while
 * still telling what matters: walls one solid block of colour, the floor
 * another, and everything on it the simplest shape. Enemies are dots,
 * larger the stronger (a ring round the elite, a square for a boss); keys
 * are diamonds and doors squares in their key's colour; the hero is a dot
 * of its own colour. Shiro is drawn on white; Kuro on black. */

export type BarePalette = {
  wall: string;
  floor: string;
  /** Enemies, shards, stairs and gates; what is spent. */
  ink: string;
  faint: string;
  hero: string;
  /** Healing and the Heart Door. */
  heal: string;
  heart: string;
  gold: string;
  wood: string;
  light: string;
  keys: Record<KeyColor, string>;
};

export const SHIRO: BarePalette = {
  wall: "#d4d4d4",
  floor: "#ffffff",
  ink: "#1a1a1a",
  faint: "#bdbdbd",
  hero: "#2f6fdf",
  heal: "#2e9e5b",
  heart: "#d93a3a",
  gold: "#d9a21b",
  wood: "#a9835a",
  light: "#f2b62a",
  keys: { yellow: "#e0b000", blue: "#3d7bd9", red: "#d93a3a" },
};

export const KURO: BarePalette = {
  wall: "#2a2a2a",
  floor: "#0d0d0d",
  ink: "#ededed",
  faint: "#4a4a4a",
  hero: "#5da0ff",
  heal: "#4fcf82",
  heart: "#ff5a5a",
  gold: "#f0c03a",
  wood: "#a9835a",
  light: "#ffcc4a",
  keys: { yellow: "#f2cc2a", blue: "#5d96ef", red: "#ff5a5a" },
};

function circle(c: CanvasRenderingContext2D, r: number, color: string, x = 12, y = 12) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}

function square(c: CanvasRenderingContext2D, half: number, color: string) {
  c.fillStyle = color;
  c.fillRect(12 - half, 12 - half, half * 2, half * 2);
}

/** How large an enemy's dot is, by its strength (a boss's square's half). */
const SIZE: Record<EnemyStrength, number> = { weak: 3.5, normal: 5, strong: 6.5, elite: 6.5, boss: 7, greaterBoss: 9 };

/** Walls one block of colour, open ground another. */
function ground(p: BarePalette, f: FrameContext) {
  const c = f.c;
  c.fillStyle = p.wall;
  c.fillRect(0, 0, f.width, f.width);
  c.fillStyle = p.floor;
  forEachViewTile(f, (x, y) => {
    if ((f.world.tile(x, y)?.kind ?? "wall") === "wall") return;
    c.save();
    toTileSpace(c, f, x, y);
    c.fillRect(-0.5, -0.5, 25, 25);
    c.restore();
  });
}

const contents = (p: BarePalette) => contentsFrom({
  enemy(c, t) {
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    if (strength === "boss" || strength === "greaterBoss") square(c, SIZE[strength], p.ink);
    else circle(c, SIZE[strength], p.ink);
    if (strength === "elite") {
      c.beginPath();
      c.arc(12, 12, 9.5, 0, Math.PI * 2);
      c.strokeStyle = p.ink;
      c.lineWidth = 1.5;
      c.stroke();
    }
    rankChevrons(c, strength, p.ink, p.floor);
    // A Ranged enemy's dot at the top right, a Fast enemy's at the
    // bottom right.
    if (e?.ranged) circle(c, 1.8, p.ink, 21, 3);
    if (e?.fast) circle(c, 1.8, p.ink, 21, 21);
  },
  key(c, t) {
    c.beginPath();
    c.moveTo(12, 6.5);
    c.lineTo(17.5, 12);
    c.lineTo(12, 17.5);
    c.lineTo(6.5, 12);
    c.closePath();
    c.fillStyle = t.color ? p.keys[t.color] ?? p.ink : p.ink;
    c.fill();
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      heart(p, c);
      return;
    }
    if (rule?.type === "wood") {
      square(c, 8, p.wood);
      return;
    }
    // A square in its key's colour, split in a band per key it takes.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const colors = keys.length ? keys.map((k) => p.keys[k] ?? p.ink) : [p.ink];
    const w = 16 / colors.length;
    colors.forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(4 + i * w, 4, w, 16);
    });
    if (rule?.type === "keys" && rule.heart) circle(c, 2.5, p.heart);
  },
  potion(c, t) {
    // A plus, red, the percent potion's the heal colour.
    c.fillStyle = potionShade(t) === "red" ? p.heart : p.heal;
    c.fillRect(10.5, 6, 3, 12);
    c.fillRect(6, 10.5, 12, 3);
  },
  attack(c) {
    c.beginPath();
    c.moveTo(12, 6);
    c.lineTo(18, 17);
    c.lineTo(6, 17);
    c.closePath();
    c.fillStyle = p.ink;
    c.fill();
  },
  defense(c) {
    c.strokeStyle = p.ink;
    c.lineWidth = 2;
    c.strokeRect(7, 7, 10, 10);
  },
  reward(c) {
    square(c, 5, p.gold);
  },
  openedChest(c) {
    c.strokeStyle = p.faint;
    c.lineWidth = 1;
    c.strokeRect(7.5, 7.5, 9, 9);
  },
  treasure(c) {
    circle(c, 3.5, p.gold);
  },
  stairs(c) {
    c.fillStyle = p.ink;
    for (const y of [6, 11, 16]) c.fillRect(6, y, 12, 2);
  },
  oneway(c) {
    c.beginPath();
    c.moveTo(6, 15);
    c.lineTo(12, 9);
    c.lineTo(18, 15);
    c.strokeStyle = p.ink;
    c.lineWidth = 2.2;
    c.stroke();
  },
});

/** The Heart Door: a square outlined in the heart's red. */
function heart(p: BarePalette, c: CanvasRenderingContext2D) {
  c.strokeStyle = p.heart;
  c.lineWidth = 2.5;
  c.strokeRect(5.25, 5.25, 13.5, 13.5);
}

/** A torch: a small warm dot, grey once put out. */
function torch(p: BarePalette, c: CanvasRenderingContext2D, _f: FrameContext, t: Torch) {
  circle(c, 1.5, t.active ? p.light : p.faint);
}

/** The hero: a dot of its own colour. */
function hero(p: BarePalette, c: CanvasRenderingContext2D) {
  circle(c, 7, p.hero);
}

const bareBoard = (p: BarePalette): ThemedBoard => ({
  ground: (f) => ground(p, f),
  contents: contents(p),
  heart: (c) => heart(p, c),
  torch: (c, f, t) => torch(p, c, f, t),
  hero: (c) => hero(p, c),
});

export const SHIRO_BOARD = bareBoard(SHIRO);
export const KURO_BOARD = bareBoard(KURO);
