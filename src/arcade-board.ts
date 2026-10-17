import type { KeyColor } from "./config.ts";
import type { EnemyStrength, Tile, Torch } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import type { Facing } from "./shown.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { sprite, type Sprite } from "./pixel-sprite.ts";

/** The Arcade Game theme's dungeon board: an old arcade maze, in sprites of
 * our own rather than any one game's. Open ground is black with a pellet on
 * each bare tile, the rock is hollow, traced by a blue double line where it
 * meets the ground, and everything on it is a chunky pixel sprite, the
 * creatures and a few things more scanlined (every other row a shade
 * darker): enemies squat visored crawlers (green, orange, magenta, then a
 * horned red one) and bosses pixel skulls, keys and gates in their key's
 * colour, potions low-res bottles, the hero a little yellow figure. A
 * screen's scanlines run over it all. */

export const ARCADE = {
  ground: "#000000",
  maze: "#2a2aff",
  pellet: "#ffb8ae",
  hero: "#ffe600",
  white: "#ffffff",
  red: "#ff2020",
  green: "#2bd82b",
  gold: "#ffcf3a",
  brown: "#9a5a22",
  cork: "#c98a4a",
  glass: "#c8d8ff",
  cyan: "#3ff0ff",
  dim: "#555577",
  flame: "#ff8a1a",
} as const;
/** Keys and the gates they open, in their colour. */
const KEY_ARCADE: Record<KeyColor, string> = { yellow: "#ffe600", blue: "#3fa8ff", red: "#ff2020" };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_ARCADE[k] ?? ARCADE.white : ARCADE.white);

/** A crawler's body colour, by its strength. */
const CRAWLER: Partial<Record<EnemyStrength, string>> = { weak: ARCADE.green, normal: "#ffb852", strong: "#ff5cf0", elite: ARCADE.red };
/** A sprite's pixel, in tile units, by the enemy's strength. */
const CELL: Record<EnemyStrength, number> = { weak: 1.55, normal: 1.7, strong: 1.85, elite: 1.85, boss: 1.9, greaterBoss: 2 };

/** `rows` with each of `letters` in its odd rows swapped for its lower case,
 * which `shaded` colours a shade darker: the screen's scanlines running
 * through the sprite. */
function scanlined(rows: Sprite, letters: string): Sprite {
  const scan = new RegExp(`[${letters}]`, "g");
  return rows.map((row, j) => (j % 2 ? row.replace(scan, (ch) => ch.toLowerCase()) : row));
}

/** `colors` with each upper-case letter's lower case added, a shade darker. */
function shaded(colors: Record<string, string>): Record<string, string> {
  const out = { ...colors };
  for (const [k, hex] of Object.entries(colors)) {
    if (k === k.toLowerCase()) continue;
    const n = parseInt(hex.slice(1), 16);
    const dark = (shift: number) => Math.round(((n >> shift) & 255) * 0.62).toString(16).padStart(2, "0");
    out[k.toLowerCase()] = `#${dark(16)}${dark(8)}${dark(0)}`;
  }
  return out;
}

/** A squat crawler: a visor across its face, two pupils in it, stubby legs. */
const CRAWLER_SPRITE = scanlined([
  "...BBBBBB...",
  "..BBBBBBBB..",
  ".BBBBBBBBBB.",
  "BBWWWWWWWWBB",
  "BBWPWWWWPWBB",
  "BBBBBBBBBBBB",
  "BBBBBBBBBBBB",
  ".BBBBBBBBBB.",
  "..BB....BB..",
  ".BBB....BBB.",
], "B");
/** The elite's crawler, horned. */
const HORNED_SPRITE = scanlined([
  "B..........B",
  "BB.BBBBBB.BB",
  ".BBBBBBBBBB.",
  "BBWWWWWWWWBB",
  "BBWPWWWWPWBB",
  "BBBBBBBBBBBB",
  "BBBBBBBBBBBB",
  ".BBBBBBBBBB.",
  "..BB....BB..",
  ".BBB....BBB.",
], "B");
/** A boss: a pixel skull, its eyes glinting. */
const SKULL_SPRITE = scanlined([
  "..XXXXXXXX..",
  ".XXXXXXXXXX.",
  "XXXXXXXXXXXX",
  "XX...XX...XX",
  "XX.E.XX.E.XX",
  "XX...XX...XX",
  "XXXXX..XXXXX",
  ".XXXXXXXXXX.",
  "..X.XX.XX.X.",
  "..XXXXXXXX..",
], "X");
/** The hero, a little yellow figure, by the way it faces: side on (looking
 * right), towards the screen, and away from it. */
const heroSprite = (face: string) => scanlined([
  "...YYYY...",
  "..YYYYYY..",
  face,
  "..YYYYYY..",
  "...YYYY...",
  "..YYYYYY..",
  ".YYYYYYYY.",
  "YY.YYYY.YY",
  "...YYYY...",
  "...YY.YY..",
  "..YY...YY.",
  "..YY...YY.",
], "Y");
const HERO_SIDE = heroSprite("..YYYYEY..");
const HERO_FRONT = heroSprite("..YEYYEY..");
const HERO_BACK = heroSprite("..YYYYYY..");
const HERO_COLORS = shaded({ Y: ARCADE.hero, E: ARCADE.ground });
const KEY_SPRITE: Sprite = [
  ".KKK........",
  "K...K.......",
  "K...KKKKKKKK",
  "K...K...K.K.",
  ".KKK....K.K.",
];
/** A low-res potion bottle: a cork, a glass neck and a belly of liquid. */
const POTION_SPRITE: Sprite = [
  "..CC..",
  "..GG..",
  ".G..G.",
  "GLLLLG",
  "GLHLLG",
  "GLLLLG",
  "GLLLLG",
  ".GGGG.",
];
const SWORD_SPRITE: Sprite = [
  "..........WW",
  ".........WWW",
  "........WWW.",
  ".......WWW..",
  "......WWW...",
  ".....WWW....",
  "..Y.WWW.....",
  "...YWW......",
  "...HYY......",
  "..HH..Y.....",
  ".HH.........",
  "HH..........",
];
const SHIELD_SPRITE: Sprite = [
  "CCCCCCCCCCCC",
  "CBBBBCCBBBBC",
  "CBBBBCCBBBBC",
  "CBBBBCCBBBBC",
  "CCCCCCCCCCCC",
  "CBBBBCCBBBBC",
  ".CBBBCCBBBC.",
  ".CBBBCCBBBC.",
  "..CBBCCBBC..",
  "...CBCCBC...",
  "....CCCC....",
];
const CHEST_SPRITE: Sprite = [
  "..DDDDDDDD..",
  ".DYYYYYYYYD.",
  "DYYYYYYYYYYD",
  "DDDDDDDDDDDD",
  "DYYYYKKYYYYD",
  "DYYYYKKYYYYD",
  "DYYYYYYYYYYD",
  "DDDDDDDDDDDD",
];
const HEART_SPRITE: Sprite = [
  ".RRR...RRR.",
  "RRRRR.RRRRR",
  "RWWRRRRRRRR",
  "RWRRRRRRRRR",
  "RRRRRRRRRRR",
  ".RRRRRRRRR.",
  "..RRRRRRR..",
  "...RRRRR...",
  "....RRR....",
  ".....R.....",
];
const LADDER_SPRITE: Sprite = [
  "C......C",
  "CCCCCCCC",
  "C......C",
  "C......C",
  "CCCCCCCC",
  "C......C",
  "C......C",
  "CCCCCCCC",
  "C......C",
  "C......C",
  "CCCCCCCC",
  "C......C",
];
const ARROW_SPRITE: Sprite = [
  "....WW....",
  "...WWWW...",
  "..WWWWWW..",
  ".WWWWWWWW.",
  "WWW.WW.WWW",
  "....WW....",
  "....WW....",
  "....WW....",
];
/** Treasure: a cut gem. */
const GEM_SPRITE = scanlined([
  "..GGGGGG..",
  ".GHGGGGGG.",
  "GGGGGGGGGG",
  ".GGGGGGGG.",
  "..GGGGGG..",
  "...GGGG...",
  "....GG....",
], "G");
/** A Wooden Door: three planks, nailed. */
const PLANKS_SPRITE = scanlined([
  "PPPPPPPPPPPP",
  "PNPPPPPPPPNP",
  "PPPPPPPPPPPP",
  "............",
  "PPPPPPPPPPPP",
  "PNPPPPPPPPNP",
  "PPPPPPPPPPPP",
  "............",
  "PPPPPPPPPPPP",
  "PNPPPPPPPPNP",
  "PPPPPPPPPPPP",
], "P");
const FLAME_SPRITES: readonly Sprite[] = [
  ["..Y...", "..YY..", ".YOY..", ".YOOY.", "YORROY", "YORROY", ".YOOY.", "..SS..", "..SS.."],
  ["...Y..", "..YY..", "..YOY.", ".YOOY.", "YOORRY", "YORROY", ".YOOY.", "..SS..", "..SS.."],
];
const SNUFFED_SPRITE: Sprite = ["......", "......", "......", "......", "......", "..DD..", "..DD..", "..SS..", "..SS.."];
/** A Ranged enemy's arrow and a Fast enemy's double chevron. */
const RANGED_SPRITE: Sprite = ["W..", ".W.", "..W", ".W.", "W.."];
const FAST_SPRITE: Sprite = ["W.W..", ".W.W.", "..W.W", ".W.W.", "W.W.."];

/** A small white sprite on a black patch a pixel wider all round. */
function badge(c: CanvasRenderingContext2D, rows: Sprite, cx: number, cy: number) {
  const w = rows[0].length + 2, h = rows.length + 2;
  c.fillStyle = ARCADE.ground;
  c.fillRect(cx - w / 2, cy - h / 2, w, h);
  sprite(c, rows, { W: ARCADE.white }, 1, cx, cy);
}

/** Black open ground, a pellet on each bare tile, and the rock hollow,
 * traced where it meets the ground by the maze's blue double line: the open
 * tiles' shapes grown into the rock in rounded bands, alternately blue and
 * black. */
function drawArcadeGround(f: FrameContext) {
  const c = f.c;
  c.fillStyle = ARCADE.ground;
  c.fillRect(0, 0, f.width, f.width);
  const open: [number, number][] = [];
  forEachViewTile(f, (x, y) => {
    if ((f.world.tile(x, y)?.kind ?? "wall") !== "wall") open.push([x, y]);
  });
  const band = (grow: number, color: string) => {
    c.beginPath();
    for (const [x, y] of open) {
      c.save();
      toTileSpace(c, f, x, y);
      c.roundRect(-grow, -grow, 24 + grow * 2, 24 + grow * 2, grow);
      c.restore();
    }
    c.fillStyle = color;
    c.fill();
  };
  band(8, ARCADE.maze);
  band(6.5, ARCADE.ground);
  band(3, ARCADE.maze);
  band(1.5, ARCADE.ground);
  for (const [x, y] of open) {
    if (f.world.tile(x, y)?.kind !== "floor") continue;
    c.save();
    toTileSpace(c, f, x, y);
    c.fillStyle = ARCADE.pellet;
    c.fillRect(11, 11, 2, 2);
    c.restore();
  }
}

/** One tile's contents in tile space (24x24). */
const paintArcadeContents = contentsFrom({
  enemy(c, t) {
    // A crawler, larger and redder the stronger it is (the elite horned);
    // a boss a white skull with red eyes, a greater boss a larger red one.
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    const cell = CELL[strength] ?? 1.7;
    if (strength === "boss" || strength === "greaterBoss") {
      const greater = strength === "greaterBoss";
      sprite(c, SKULL_SPRITE, shaded({ X: greater ? ARCADE.red : ARCADE.white, E: greater ? ARCADE.hero : ARCADE.red }), cell);
    } else {
      const body = strength === "elite" ? HORNED_SPRITE : CRAWLER_SPRITE;
      sprite(c, body, shaded({ B: CRAWLER[strength] ?? ARCADE.red, W: ARCADE.white, P: ARCADE.ground }), cell);
    }
    // A Ranged enemy's arrow at the top right, a Fast enemy's chevrons at
    // the bottom right, each on a black patch so it reads over the body.
    if (e?.ranged) badge(c, RANGED_SPRITE, 21.5, 3.5);
    if (e?.fast) badge(c, FAST_SPRITE, 20.5, 20.5);
  },
  key(c, t) {
    sprite(c, KEY_SPRITE, { K: keyColor(t.color) }, 1.8);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      paintArcadeHeart(c);
      return;
    }
    if (rule?.type === "wood") {
      // Nailed planks: any key opens it, or the hero breaks it down.
      sprite(c, PLANKS_SPRITE, shaded({ P: ARCADE.brown, N: ARCADE.gold }), 1.8);
      return;
    }
    // A gate between two blue posts, a bar across it in each key's colour.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    c.fillStyle = ARCADE.maze;
    c.fillRect(1, 1, 4, 22);
    c.fillRect(19, 1, 4, 22);
    const colors = keys.length ? keys.map(keyColor) : [ARCADE.white];
    const step = 20 / colors.length;
    colors.forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(5, 2 + i * step + step / 2 - 2.5, 14, 5);
    });
    if (rule?.type === "keys" && rule.heart) sprite(c, HEART_SPRITE, { R: ARCADE.red, W: ARCADE.white }, 0.8, 12, 20);
  },
  potion(c, t) {
    // A low-res bottle: cyan heals, red (the red potion) heals a share.
    sprite(c, POTION_SPRITE, { C: ARCADE.cork, G: ARCADE.glass, L: t.color === "red" ? ARCADE.red : ARCADE.cyan, H: ARCADE.white }, 2.6);
  },
  attack(c) {
    sprite(c, SWORD_SPRITE, { W: ARCADE.white, Y: ARCADE.gold, H: ARCADE.brown }, 1.6);
  },
  defense(c) {
    sprite(c, SHIELD_SPRITE, { C: ARCADE.cyan, B: ARCADE.maze }, 1.6);
  },
  reward(c) {
    sprite(c, CHEST_SPRITE, { D: ARCADE.brown, Y: ARCADE.gold, K: ARCADE.ground }, 1.7);
  },
  openedChest(c) {
    sprite(c, CHEST_SPRITE, { D: ARCADE.dim }, 1.7);
  },
  treasure(c) {
    sprite(c, GEM_SPRITE, shaded({ G: ARCADE.cyan, H: ARCADE.white }), 1.8);
  },
  stairs(c) {
    sprite(c, LADDER_SPRITE, { C: ARCADE.cyan }, 2);
  },
  oneway(c) {
    sprite(c, ARROW_SPRITE, { W: ARCADE.white }, 1.6);
  },
});

/** The Heart Door's heart. */
function paintArcadeHeart(c: CanvasRenderingContext2D) {
  sprite(c, HEART_SPRITE, { R: ARCADE.red, W: ARCADE.white }, 1.8);
}

/** A torch: a pixel flame flickering between two frames, a grey stub once
 * put out. */
function paintArcadeTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (!t.active) {
    sprite(c, SNUFFED_SPRITE, { D: ARCADE.dim, S: ARCADE.brown }, 1.5);
    return;
  }
  const frame = f.look.reduceMotion ? 0 : Math.floor(f.now / 160 + t.x * 3 + t.y) % 2;
  sprite(c, FLAME_SPRITES[frame], { Y: ARCADE.hero, O: ARCADE.flame, R: ARCADE.red, S: ARCADE.brown }, 1.5);
}

/** The hero: the little yellow figure, turned the way it last stepped (world
 * y grows upward, the screen's down): side on, mirrored when it went left,
 * its back to us going up the screen, its face going down. */
function paintArcadeHero(c: CanvasRenderingContext2D, facing: Facing = { dx: 1, dy: 0 }) {
  if (facing.dx < 0) {
    c.translate(24, 0);
    c.scale(-1, 1);
  }
  const rows = facing.dy > 0 ? HERO_BACK : facing.dy < 0 ? HERO_FRONT : HERO_SIDE;
  sprite(c, rows, HERO_COLORS, 1.75);
}

/** The screen's scanlines, a faint dark line every third pixel. */
function drawArcadeScanlines(f: FrameContext) {
  const c = f.c;
  c.fillStyle = "rgba(0, 0, 0, 0.28)";
  for (let y = 0; y < f.width; y += 3) c.fillRect(0, y, f.width, 1);
}

export const ARCADE_BOARD: ThemedBoard = {
  ground: drawArcadeGround, contents: paintArcadeContents, heart: paintArcadeHeart,
  torch: paintArcadeTorch, hero: paintArcadeHero, over: drawArcadeScanlines,
};
