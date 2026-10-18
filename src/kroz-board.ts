import { potionShade, type EnemyStrength, type Tile, type Torch, type KeyColor } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { sprite, type Sprite } from "./pixel-sprite.ts";
import { rankChevrons } from "./rank-chevrons.ts";

/** The Kroz Game theme's dungeon board, after the old Kroz games (Kingdom
 * of Kroz and the rest): every tile one character of an old PC's 8x8 text
 * face in its sixteen colours, often on a coloured cell. Brown solid walls
 * along open ground and the deeper rock dark grey shade, monsters Kroz's
 * three (`Ä`, `Ö`, `Ω`), whips for ATK shards, gems for potions, the yellow
 * `C` on red for a chest, `î` keys and `∞` doors on their key's colour,
 * breakable walls for Wooden Doors, lava for torches, and the hero the
 * yellow face `☻`. The characters are drawn here pixel by pixel, not from a
 * font, so they look the same everywhere. */

/** The old PC's sixteen text colours, those the board uses. */
export const KROZ = {
  black: "#000000",
  blue: "#0000aa",
  green: "#00aa00",
  cyan: "#00aaaa",
  red: "#aa0000",
  magenta: "#aa00aa",
  brown: "#aa5500",
  darkGrey: "#555555",
  lightBlue: "#5555ff",
  lightGreen: "#55ff55",
  lightCyan: "#55ffff",
  lightRed: "#ff5555",
  lightMagenta: "#ff55ff",
  yellow: "#ffff55",
  white: "#ffffff",
} as const;
/** Keys, and the cells of the doors they open, in their colour. */
const KEY_KROZ: Record<KeyColor, string> = { yellow: KROZ.yellow, blue: KROZ.lightBlue, red: KROZ.lightRed };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_KROZ[k] ?? KROZ.white : KROZ.white);

/** Each character, eight pixels square, as the old 8x8 face draws it (its
 * last column and row left clear, as the space between characters), a
 * few redrawn to read at a tile's size. */
const FACE: Sprite = [".XXXXXX.", "XXXXXXXX", "XX.XX.XX", "XXXXXXXX", "XX....XX", "XXX..XXX", "XXXXXXXX", ".XXXXXX."];
const A_DOTS: Sprite = ["XX...XX.", "..XXX...", ".XX.XX..", "XX...XX.", "XXXXXXX.", "XX...XX.", "XX...XX.", "........"];
const O_DOTS: Sprite = ["XX...XX.", "..XXX...", ".XX.XX..", "XX...XX.", "XX...XX.", ".XX.XX..", "..XXX...", "........"];
const OMEGA: Sprite = ["..XXX...", ".XX.XX..", "XX...XX.", "XX...XX.", ".XX.XX..", ".XX.XX..", "XXX.XXX.", "........"];
const WHIP: Sprite = ["....XXX.", "...XX.XX", "...XX.XX", "...XX...", "...XX...", "...XX...", "...XX...", "...XX..."];
const TABLET: Sprite = ["........", "........", "..XXXX..", "..XXXX..", "..XXXX..", "..XXXX..", "........", "........"];
const GEM: Sprite = ["...X....", "..XXX...", ".XXXXX..", "XXXXXXX.", ".XXXXX..", "..XXX...", "...X....", "........"];
const LETTER_C: Sprite = ["..XXXX..", ".XX..XX.", "XX......", "XX......", "XX......", ".XX..XX.", "..XXXX..", "........"];
const NUGGET: Sprite = ["...XX...", "XX.XX.XX", "..XXXX..", "XXX..XXX", "XXX..XXX", "..XXXX..", "XX.XX.XX", "...XX..."];
const KEY: Sprite = ["..XXX...", ".XX.XX..", "........", "..XXX...", "...XX...", "...XX...", "..XXXX..", "........"];
const DOOR: Sprite = ["........", "........", ".XX.XX..", "X..X..X.", "X..X..X.", ".XX.XX..", "........", "........"];
const HEART: Sprite = [".XX.XX..", "XXXXXXX.", "XXXXXXX.", "XXXXXXX.", ".XXXXX..", "..XXX...", "...X....", "........"];
const STAIRS: Sprite = ["........", "XXXXXXX.", "........", "XXXXXXX.", "........", "XXXXXXX.", "........", "........"];
const UP_ARROW: Sprite = ["...XX...", "..XXXX..", ".XXXXXX.", "...XX...", "...XX...", "...XX...", "...XX...", "........"];
/** The dark shade, `▓`: the deeper rock, breakable walls and lava. Every
 * other row is shifted by two pixels, so two frames of lava shimmer. */
const SHADE: Sprite = ["XX.XX.XX", ".XXX.XXX", "XX.XX.XX", ".XXX.XXX", "XX.XX.XX", ".XXX.XXX", "XX.XX.XX", ".XXX.XXX"];
const SHADE_SHIFTED: Sprite = [".XXX.XXX", "XX.XX.XX", ".XXX.XXX", "XX.XX.XX", ".XXX.XXX", "XX.XX.XX", ".XXX.XXX", "XX.XX.XX"];
/** A Ranged enemy's arrow and a Fast enemy's `»`, small in its corner. */
const RANGED_MARK: Sprite = ["..X..", "..XX.", "XXXXX", "..XX.", "..X.."];
const FAST_MARK: Sprite = ["X.X..", ".X.X.", "..X.X", ".X.X.", "X.X.."];
const SMALL_HEART: Sprite = [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."];

/** One character filling the tile, in `color` on a `back` cell (clear
 * without one). */
function char(c: CanvasRenderingContext2D, rows: Sprite, color: string, back?: string) {
  if (back) {
    c.fillStyle = back;
    c.fillRect(0, 0, 24, 24);
  }
  sprite(c, rows, { X: color }, 3);
}

/** A small mark on a black patch a pixel wider all round. */
function mark(c: CanvasRenderingContext2D, rows: Sprite, color: string, cx: number, cy: number) {
  const w = rows[0].length + 2, h = rows.length + 2;
  c.fillStyle = KROZ.black;
  c.fillRect(cx - w / 2, cy - h / 2, w, h);
  sprite(c, rows, { X: color }, 1, cx, cy);
}

/** Each strength's monster: Kroz's slow `Ä`, medium `Ö` and fast `Ω`, two
 * strengths each, the lesser in the darker colour; a Greater Boss's `Ω` on
 * a blue cell. */
const MONSTER: Record<EnemyStrength, { rows: Sprite; color: string; back?: string }> = {
  weak: { rows: A_DOTS, color: KROZ.red },
  normal: { rows: A_DOTS, color: KROZ.lightRed },
  strong: { rows: O_DOTS, color: KROZ.green },
  elite: { rows: O_DOTS, color: KROZ.lightGreen },
  boss: { rows: OMEGA, color: KROZ.lightBlue },
  greaterBoss: { rows: OMEGA, color: KROZ.lightBlue, back: KROZ.blue },
};

/** Black open ground; a solid brown wall, `█`, for each wall touching it,
 * and the deeper rock in dark grey shade, as Kroz's invisible walls show
 * once found. */
function drawKrozGround(f: FrameContext) {
  const c = f.c;
  c.fillStyle = KROZ.black;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  forEachViewTile(f, (x, y) => {
    if (!isWall(x, y)) return;
    c.save();
    toTileSpace(c, f, x, y);
    if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) char(c, SHADE, KROZ.darkGrey);
    else {
      c.fillStyle = KROZ.brown;
      c.fillRect(0, 0, 24, 24);
    }
    c.restore();
  });
}

/** One tile's contents in tile space (24x24). */
const paintKrozContents = contentsFrom({
  enemy(c, t) {
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    const look = MONSTER[strength] ?? MONSTER.normal;
    char(c, look.rows, look.color, look.back);
    rankChevrons(c, strength, KROZ.white, KROZ.black, 1, 1);
    // A Ranged enemy's arrow at the top right, a Fast enemy's » at the
    // bottom right.
    if (e?.ranged) mark(c, RANGED_MARK, KROZ.white, 20.5, 3.5);
    if (e?.fast) mark(c, FAST_MARK, KROZ.white, 20.5, 20.5);
  },
  key(c, t) {
    char(c, KEY, keyColor(t.color));
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      char(c, HEART, KROZ.lightRed, KROZ.magenta);
      return;
    }
    if (rule?.type === "wood") {
      // Kroz's breakable wall: any key opens it, or the hero breaks it down.
      char(c, SHADE, KROZ.brown);
      return;
    }
    // A black ∞ on its key's colour, a band of the cell per key it takes;
    // Kroz's own cyan on magenta for a door no key colours.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    if (!keys.length) {
      char(c, DOOR, KROZ.cyan, KROZ.magenta);
      return;
    }
    const band = 24 / keys.length;
    keys.forEach((k, i) => {
      c.fillStyle = keyColor(k);
      c.fillRect(i * band, 0, band + (i < keys.length - 1 ? 0.15 : 0), 24);
    });
    char(c, DOOR, KROZ.black);
    if (rule?.type === "keys" && rule.heart) mark(c, SMALL_HEART, KROZ.lightRed, 20.5, 20.5);
  },
  potion(c, t) {
    // Kroz's gems: a red one, and for the percent potion, which heals a
    // share of HP, a cyan one.
    char(c, GEM, potionShade(t) === "red" ? KROZ.lightRed : KROZ.lightCyan);
  },
  attack(c) {
    char(c, WHIP, KROZ.white);
  },
  defense(c) {
    char(c, TABLET, KROZ.lightBlue);
  },
  reward(c) {
    char(c, LETTER_C, KROZ.yellow, KROZ.red);
  },
  openedChest(c) {
    char(c, LETTER_C, KROZ.darkGrey);
  },
  treasure(c) {
    char(c, NUGGET, KROZ.yellow);
  },
  stairs(c) {
    char(c, STAIRS, KROZ.black, KROZ.white);
  },
  oneway(c) {
    char(c, UP_ARROW, KROZ.lightMagenta);
  },
});

/** The Heart Door's heart on its own. */
function paintKrozHeart(c: CanvasRenderingContext2D) {
  char(c, HEART, KROZ.lightRed);
}

/** A torch: its wall lava, shimmering between two frames; cooled to dark
 * red shade on black once put out. */
function paintKrozTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (!t.active) {
    char(c, SHADE, KROZ.red, KROZ.black);
    return;
  }
  const frame = f.look.reduceMotion ? 0 : Math.floor(f.now / 220 + t.x * 3 + t.y) % 2;
  char(c, frame ? SHADE_SHIFTED : SHADE, KROZ.lightRed, KROZ.red);
}

/** The hero: Kroz's yellow face. */
function paintKrozHero(c: CanvasRenderingContext2D) {
  char(c, FACE, KROZ.yellow);
}

export const KROZ_BOARD: ThemedBoard = {
  ground: drawKrozGround, contents: paintKrozContents, heart: paintKrozHeart,
  torch: paintKrozTorch, hero: paintKrozHero,
};
