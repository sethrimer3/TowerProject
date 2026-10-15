import type { KeyColor } from "./config.ts";
import type { EnemyStrength, Tile, Torch } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import type { Facing } from "./state.ts";
import type { ThemedBoard } from "./themed-boards.ts";

/** The Arcade Game theme's dungeon board: an old arcade maze. Open ground is
 * black with a pellet on each bare tile, the rock is hollow, traced by a
 * blue double line where it meets the ground, and everything on it is a
 * chunky pixel sprite: enemies ghosts (a frightened blue one for the weak,
 * then orange, pink and red) and bosses space invaders, keys and gates in
 * their key's colour, potions fruit, the hero a yellow chomper. A screen's
 * scanlines run over it all. */

export const ARCADE = {
  ground: "#000000",
  maze: "#2a2aff",
  pellet: "#ffb8ae",
  hero: "#ffe600",
  white: "#ffffff",
  pupil: "#2a2aff",
  /** The frightened ghost's face. */
  scared: "#ffb8ae",
  red: "#ff2020",
  green: "#2bd82b",
  stem: "#3fae3f",
  gold: "#ffcf3a",
  brown: "#9a5a22",
  girder: "#ff3b6b",
  cyan: "#3ff0ff",
  dim: "#555577",
  flame: "#ff8a1a",
} as const;
/** Keys and the gates they open, in their colour. */
const KEY_ARCADE: Record<KeyColor, string> = { yellow: "#ffe600", blue: "#3fa8ff", red: "#ff2020" };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_ARCADE[k] ?? ARCADE.white : ARCADE.white);

/** A ghost's body colour, by its strength (the weak are frightened). */
const GHOST: Partial<Record<EnemyStrength, string>> = { weak: ARCADE.maze, normal: "#ffb852", strong: "#ffb8ff", elite: ARCADE.red };
/** A sprite's pixel, in tile units, by the enemy's strength. */
const CELL: Record<EnemyStrength, number> = { weak: 1.55, normal: 1.7, strong: 1.85, elite: 2, boss: 2.05, greaterBoss: 2.2 };

type Sprite = readonly string[];

/** Draws a sprite of letters, each standing for a colour in `colors` ('.'
 * left clear), centred on (cx, cy) in tile space with pixels `cell` units
 * wide. Each row's runs of one colour are filled as one rectangle, a hair
 * wider, so no seams show between them. */
function sprite(c: CanvasRenderingContext2D, rows: Sprite, colors: Record<string, string>, cell = 2, cx = 12, cy = 12) {
  const w = rows[0].length * cell, h = rows.length * cell;
  const x0 = cx - w / 2, y0 = cy - h / 2;
  rows.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      let k = i + 1;
      while (k < row.length && row[k] === ch) k++;
      const color = colors[ch];
      if (color) {
        c.fillStyle = color;
        c.fillRect(x0 + i * cell, y0 + j * cell, (k - i) * cell + 0.15, cell + 0.15);
      }
      i = k;
    }
  });
}

const GHOST_SPRITE: Sprite = [
  "....BBBB....",
  "..BBBBBBBB..",
  ".BBBBBBBBBB.",
  ".BWWBBBBWWB.",
  "BWWWWBBWWWWB",
  "BWWPPBBWWPPB",
  "BWWPPBBWWPPB",
  "BBWWBBBBWWBB",
  "BBBBBBBBBBBB",
  "BBBBBBBBBBBB",
  "BBBBBBBBBBBB",
  "BB.BBB.BBB.B",
];
const SCARED_SPRITE: Sprite = [
  "....BBBB....",
  "..BBBBBBBB..",
  ".BBBBBBBBBB.",
  ".BBBBBBBBBB.",
  "BBBFFBBFFBBB",
  "BBBFFBBFFBBB",
  "BBBBBBBBBBBB",
  "BBBBBBBBBBBB",
  "BFFBBFFBBFFB",
  "FBBFFBBFFBBF",
  "BBBBBBBBBBBB",
  "BB.BBB.BBB.B",
];
const INVADER_SPRITE: Sprite = [
  "..X.....X..",
  "...X...X...",
  "..XXXXXXX..",
  ".XX.XXX.XX.",
  "XXXXXXXXXXX",
  "X.XXXXXXX.X",
  "X.X.....X.X",
  "...XX.XX...",
];
const HERO_SPRITE: Sprite = [
  "....YYYY....",
  "..YYYYYYYY..",
  ".YYYYYYYYYY.",
  ".YYYYYYYY...",
  "YYYYYYY.....",
  "YYYYY.......",
  "YYYYY.......",
  "YYYYYYY.....",
  ".YYYYYYYY...",
  ".YYYYYYYYYY.",
  "..YYYYYYYY..",
  "....YYYY....",
];
const KEY_SPRITE: Sprite = [
  ".KKK........",
  "K...K.......",
  "K...KKKKKKKK",
  "K...K...K.K.",
  ".KKK....K.K.",
];
const CHERRY_SPRITE: Sprite = [
  "........GG..",
  "......GG.G..",
  ".....G...G..",
  "....G.....G.",
  "...G......G.",
  ".RRRR...RRRR",
  "RWRRRR.RWRRR",
  "RRRRRR.RRRRR",
  "RRRRRR.RRRRR",
  ".RRRR...RRRR",
];
const STRAWBERRY_SPRITE: Sprite = [
  "...GGGGGG...",
  ".RRRGGGGRRR.",
  "RRYRRRRRRYRR",
  "RRRRRYRRRRRR",
  "RYRRRRRRRYRR",
  ".RRRYRRRRRR.",
  ".RRRRRRYRRR.",
  "..RYRRRRRR..",
  "...RRRRYR...",
  "....RRRR....",
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
const PELLET_SPRITE: Sprite = [
  "..PPPP..",
  ".PPPPPP.",
  "PPPPPPPP",
  "PPPPPPPP",
  "PPPPPPPP",
  "PPPPPPPP",
  ".PPPPPP.",
  "..PPPP..",
];
const GIRDER_SPRITE: Sprite = [
  "RRRRRRRRRRRR",
  "R...R...R...",
  ".R.R.R.R.R.R",
  "..R...R...R.",
  "RRRRRRRRRRRR",
];
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
function paintArcadeContents(c: CanvasRenderingContext2D, t: Tile) {
  switch (t.kind) {
    case "enemy": {
      // A ghost, larger and redder the stronger it is (the weak frightened
      // blue); a boss a green space invader, a greater boss a larger red one.
      const e = t.enemy;
      const strength = e?.strength ?? "normal";
      const cell = CELL[strength] ?? 1.7;
      if (strength === "boss" || strength === "greaterBoss")
        sprite(c, INVADER_SPRITE, { X: strength === "boss" ? ARCADE.green : ARCADE.red }, cell);
      else if (strength === "weak") sprite(c, SCARED_SPRITE, { B: ARCADE.maze, F: ARCADE.scared }, cell);
      else sprite(c, GHOST_SPRITE, { B: GHOST[strength] ?? ARCADE.red, W: ARCADE.white, P: ARCADE.pupil }, cell);
      // A Ranged enemy's arrow at the top right, a Fast enemy's chevrons at
      // the bottom right, each on a black patch so it reads over the ghost.
      if (e?.ranged) badge(c, RANGED_SPRITE, 21.5, 3.5);
      if (e?.fast) badge(c, FAST_SPRITE, 20.5, 20.5);
      return;
    }
    case "key":
      sprite(c, KEY_SPRITE, { K: keyColor(t.color) }, 1.8);
      return;
    case "door": {
      const rule = t.door;
      if (rule?.type === "fullHp") {
        paintArcadeHeart(c);
        return;
      }
      if (rule?.type === "wood") {
        // Two girders: any key opens it, or the hero breaks it down.
        sprite(c, GIRDER_SPRITE, { R: ARCADE.girder }, 2, 12, 7);
        sprite(c, GIRDER_SPRITE, { R: ARCADE.girder }, 2, 12, 17);
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
      return;
    }
    case "potion":
      // Fruit: cherries heal, the strawberry (the red potion) heals a share.
      if (t.color === "red") sprite(c, STRAWBERRY_SPRITE, { R: ARCADE.red, Y: ARCADE.gold, G: ARCADE.stem }, 1.8);
      else sprite(c, CHERRY_SPRITE, { R: ARCADE.red, W: ARCADE.white, G: ARCADE.stem }, 1.8);
      return;
    case "attack":
      sprite(c, SWORD_SPRITE, { W: ARCADE.white, Y: ARCADE.gold, H: ARCADE.brown }, 1.6);
      return;
    case "defense":
      sprite(c, SHIELD_SPRITE, { C: ARCADE.cyan, B: ARCADE.maze }, 1.6);
      return;
    case "reward":
      sprite(c, CHEST_SPRITE, { D: ARCADE.brown, Y: ARCADE.gold, K: ARCADE.ground }, 1.7);
      return;
    case "openedChest":
      sprite(c, CHEST_SPRITE, { D: ARCADE.dim }, 1.7);
      return;
    case "treasure":
      // A power pellet.
      sprite(c, PELLET_SPRITE, { P: ARCADE.pellet }, 1.5);
      return;
    case "stairs":
      sprite(c, LADDER_SPRITE, { C: ARCADE.cyan }, 2);
      return;
    case "oneway":
      sprite(c, ARROW_SPRITE, { W: ARCADE.white }, 1.6);
      return;
  }
}

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

/** The hero: the yellow chomper, its mouth turned the way it last stepped
 * (the sprite opens to the right; world y grows upward, the screen's down).
 * The sprite is symmetric top to bottom, so facing left is a half turn. */
function paintArcadeHero(c: CanvasRenderingContext2D, facing: Facing = { dx: 1, dy: 0 }) {
  const turn = facing.dx < 0 ? Math.PI : facing.dy > 0 ? -Math.PI / 2 : facing.dy < 0 ? Math.PI / 2 : 0;
  if (turn) {
    c.translate(12, 12);
    c.rotate(turn);
    c.translate(-12, -12);
  }
  sprite(c, HERO_SPRITE, { Y: ARCADE.hero }, 1.75);
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
