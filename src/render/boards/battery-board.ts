import { potionShade, type EnemyStrength, type KeyColor, type Tile, type Torch } from "../../entities.ts";
import type { Facing } from "../../shown.ts";
import { sprite, type Sprite } from "../../sprites/pixel-sprite.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "../render-frame.ts";
import { rankChevrons } from "../rank-chevrons.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";

/** Battery saver's board: white pixel art on pure black, twelve pixels to a
 * tile, so an OLED screen lights as few pixels as it can while every piece
 * of the room still shows. Walls are a one-pixel outline where they meet
 * open ground, open ground a faint dot, and every creature and thing a small
 * one-colour sprite: enemies grow and gain horns, spikes and crowns with
 * strength, and keys and the locks they open share a shape (gold round, blue
 * square, red diamond), since colour is gone.
 * Each sprite is baked once into a small canvas and drawn without smoothing;
 * where no canvas can be made (tests), it is filled run by run instead.
 * Drawing only: nothing here is saved or played by. */

/** The one light colour, and a dim grey for what is spent or only a guide. */
export const BATTERY_INK = "#ffffff";
export const BATTERY_DIM = "#5c5c5c";
export const BATTERY_BLACK = "#000000";
/** A tile's pixels across. */
export const BATTERY_GRID = 12;
/** Tile-space units a pixel. */
const CELL = 24 / BATTERY_GRID;
/** Battery saver's one colour: the red of its warning sign. */
export const BATTERY_ALERT = "#ff3b3b";
const COLORS: Record<string, string> = { "#": BATTERY_INK, "+": BATTERY_DIM, o: BATTERY_BLACK, r: BATTERY_ALERT };

type Art = { rows: Sprite; baked?: CanvasImageSource | null };
const art = (...rows: string[]): Art => ({ rows });

function bake(a: Art): CanvasImageSource | null {
  try {
    if (typeof document === "undefined") return null;
    const cv = document.createElement("canvas");
    cv.width = a.rows[0].length;
    cv.height = a.rows.length;
    const g = cv.getContext("2d");
    if (typeof CanvasRenderingContext2D === "undefined" || !(g instanceof CanvasRenderingContext2D)) return null;
    // Whole pixels, each run filled exactly: no seam to cover at this size.
    a.rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        let end = x + 1;
        while (end < row.length && row[end] === row[x]) end++;
        const color = COLORS[row[x]];
        if (color) {
          g.fillStyle = color;
          g.fillRect(x, y, end - x, 1);
        }
        x = end;
      }
    });
    return cv;
  } catch {
    return null;
  }
}

/** Draws `a` with its top-left pixel at pixel (px, py) of the tile, `cell`
 * tile-space units a pixel, mirrored left to right when `flip`. */
export function drawArt(c: CanvasRenderingContext2D, a: Art, px = 0, py = 0, cell = CELL, flip = false) {
  const w = a.rows[0].length * cell, h = a.rows.length * cell, x = px * cell, y = py * cell;
  if (flip) {
    c.save();
    c.translate(x + w / 2, 0);
    c.scale(-1, 1);
    c.translate(-(x + w / 2), 0);
  }
  if (a.baked === undefined) a.baked = bake(a);
  if (a.baked) {
    const smoothing = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    c.drawImage(a.baked, x, y, w, h);
    c.imageSmoothingEnabled = smoothing;
  } else sprite(c, a.rows, COLORS, cell, x + w / 2, y + h / 2);
  if (flip) c.restore();
}

/** Whole-tile sprites, 12 x 12. */
export const BATTERY_ART = {
  hero: art(
    "....####....",
    "...######...",
    "...#.##.#...",
    "...######...",
    "....####....",
    ".##########.",
    "#.########.#",
    "#..######..#",
    "...######...",
    "...##..##...",
    "...##..##...",
    "..###..###..",
  ),
  weak: art(
    "............",
    "............",
    "............",
    "............",
    "............",
    "....####....",
    "...######...",
    "..##.##.##..",
    "..########..",
    "..########..",
    "..#.#..#.#..",
    "............",
  ),
  normal: art(
    "............",
    "............",
    "...#....#...",
    "...##..##...",
    "...######...",
    "..########..",
    "..#..##..#..",
    "..########..",
    "...######...",
    "...#.##.#...",
    "..##....##..",
    "............",
  ),
  strong: art(
    "............",
    "..#......#..",
    "..##....##..",
    "..########..",
    ".##########.",
    ".##..##..##.",
    ".##########.",
    ".###....###.",
    "..########..",
    "..##.##.##..",
    ".###....###.",
    "............",
  ),
  elite: art(
    ".#...##...#.",
    ".##.####.##.",
    "..########..",
    ".##########.",
    ".#..####..#.",
    ".##########.",
    ".##########.",
    "..###..###..",
    "..########..",
    ".##.####.##.",
    ".##......##.",
    "............",
  ),
  boss: art(
    "...######...",
    "..########..",
    ".##########.",
    ".#...##...#.",
    ".#...##...#.",
    ".##########.",
    "..########..",
    "...#.##.#...",
    "...######...",
    ".#........#.",
    "..########..",
    ".#........#.",
  ),
  greaterBoss: art(
    "#..#.##.#..#",
    "############",
    ".##########.",
    ".#...##...#.",
    ".#...##...#.",
    ".##########.",
    "..########..",
    "...#.##.#...",
    "...######...",
    ".#........#.",
    "..########..",
    ".#........#.",
  ),
  potion: art(
    "............",
    "....####....",
    ".....##.....",
    ".....##.....",
    "....#..#....",
    "...#....#...",
    "..#......#..",
    "..########..",
    "..########..",
    "..########..",
    "...######...",
    "............",
  ),
  /** The percent potion: its liquid a checker. */
  percentPotion: art(
    "............",
    "....####....",
    ".....##.....",
    ".....##.....",
    "....#..#....",
    "...#....#...",
    "..#......#..",
    "..##.#.#.#..",
    "..#.#.#.##..",
    "..##.#.#.#..",
    "...######...",
    "............",
  ),
  sword: art(
    "..........##",
    ".........###",
    "........###.",
    ".......###..",
    "..#...###...",
    "...#.###....",
    "....###.....",
    "....##......",
    "...#..#.....",
    "..#.........",
    ".#..........",
    "............",
  ),
  shield: art(
    "............",
    "..########..",
    "..#..##..#..",
    "..#..##..#..",
    "..########..",
    "..#..##..#..",
    "..#..##..#..",
    "...#.##.#...",
    "....####....",
    ".....##.....",
    "............",
    "............",
  ),
  chest: art(
    "............",
    "............",
    "............",
    "..########..",
    ".#........#.",
    ".##########.",
    ".#...##...#.",
    ".#...##...#.",
    ".#........#.",
    ".##########.",
    "............",
    "............",
  ),
  openedChest: art(
    "............",
    "............",
    "..++++++++..",
    "..+......+..",
    "..++++++++..",
    ".+........+.",
    ".++++++++++.",
    ".+........+.",
    ".+........+.",
    ".++++++++++.",
    "............",
    "............",
  ),
  /** An area reward: a bigger chest with a star over it. */
  reward: art(
    ".....##.....",
    "...######...",
    ".....##.....",
    "..########..",
    ".#........#.",
    ".##########.",
    ".#...##...#.",
    ".#..####..#.",
    ".#...##...#.",
    ".#........#.",
    ".##########.",
    "............",
  ),
  stairs: art(
    "............",
    ".........###",
    ".........#..",
    "......####..",
    "......#.....",
    "...####.....",
    "...#........",
    "####........",
    "#...........",
    "############",
    "............",
    "............",
  ),
  oneway: art(
    "............",
    ".....##.....",
    "....####....",
    "...##..##...",
    "..##....##..",
    ".....##.....",
    "....####....",
    "...##..##...",
    "..##....##..",
    "............",
    "............",
    "............",
  ),
  door: art(
    ".##########.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".#........#.",
    ".##########.",
  ),
  woodDoor: art(
    ".##########.",
    ".#........#.",
    ".##########.",
    ".#........#.",
    ".#........#.",
    ".##########.",
    ".#........#.",
    ".#........#.",
    ".##########.",
    ".#........#.",
    ".#........#.",
    ".##########.",
  ),
  /** A Steel Door, which takes any one key: rivets in its corners. */
  steelDoor: art(
    ".##########.",
    ".#........#.",
    ".#.#....#.#.",
    ".#........#.",
    ".#...##...#.",
    ".#..#..#..#.",
    ".#..#..#..#.",
    ".#...##...#.",
    ".#........#.",
    ".#.#....#.#.",
    ".#........#.",
    ".##########.",
  ),
  gem: art(
    "............",
    "............",
    "...######...",
    "..#..##..#..",
    ".##########.",
    "..#..##..#..",
    "...#.##.#...",
    "....#..#....",
    ".....##.....",
    "............",
    "............",
    "............",
  ),
  bat: art(
    "............",
    "............",
    "#....##....#",
    "##..####..##",
    "###.#..#.###",
    "############",
    ".##.####.##.",
    ".#..#..#..#.",
    "............",
    "............",
    "............",
    "............",
  ),
  bow: art(
    "...##.......",
    "....##....#.",
    ".....#...#..",
    ".....##.#...",
    "......##....",
    "....######..",
    "......##....",
    ".....##.#...",
    ".....#...#..",
    "....##....#.",
    "...##.......",
    "............",
  ),
  wings: art(
    "............",
    "##........##",
    "###......###",
    ".###....###.",
    ".####..####.",
    "..###..###..",
    "..########..",
    "...######...",
    "....####....",
    ".....##.....",
    "............",
    "............",
  ),
  torch: art(
    "............",
    ".....#......",
    ".....##.....",
    "....###.....",
    "....####....",
    "...######...",
    "...######...",
    "....####....",
    ".....##.....",
    ".....##.....",
    ".....##.....",
    "....####....",
  ),
} as const;

/** Small marks, drawn at a tile's corners. */
const MARKS = {
  /** A Ranged enemy: an arrow up and to the right. */
  ranged: art(".##", "..#", "#.."),
  /** A Fast enemy: two chevrons. */
  fast: art("#.#.", ".#.#", "#.#."),
  /** An Aggroed enemy, coming for the hero. */
  aggro: art("#", "#", ".", "#"),
  /** An enemy held where it stands (stunned). */
  stunned: art("###", ".#.", "###"),
  /** A Supply Chest's one star, an Equipment Chest's two. */
  star: art(".#.", "###", ".#."),
  heart: art("##.##", "#####", ".###.", "..#.."),
  litFlame: art(".#.", "##.", "###", ".#."),
  outFlame: art("...", "...", "+++", ".+."),
  sword: art("..#", ".#.", "#.."),
  shield: art("###", "###", ".#."),
  up: art(".#.", "###", ".#."),
  cross: art("#.#", ".#.", "#.#"),
} as const;

/** A key's bow and the lock it opens, by its colour: round, square or diamond. */
const BOWS: Record<KeyColor, Art> = {
  yellow: art(".###.", "#...#", "#...#", "#...#", ".###."),
  blue: art("#####", "#...#", "#...#", "#...#", "#####"),
  red: art("..#..", ".#.#.", "#...#", ".#.#.", "..#.."),
};
/** Any key's bow, filled: the KEY card, which goes for each colour. */
const SOLID_BOW = art(".###.", "#####", "#####", "#####", ".###.");
const SHAFT = art("#######", "...#.#.", "...#.#.");

/** A key of `color` (any colour's round bow when none). */
export function batteryKey(c: CanvasRenderingContext2D, color: KeyColor | undefined) {
  drawArt(c, BOWS[color ?? "yellow"], 0, 3);
  drawArt(c, SHAFT, 5, 5);
}

const ENEMY_ART: Record<EnemyStrength, Art> = {
  weak: BATTERY_ART.weak, normal: BATTERY_ART.normal, strong: BATTERY_ART.strong,
  elite: BATTERY_ART.elite, boss: BATTERY_ART.boss, greaterBoss: BATTERY_ART.greaterBoss,
};

/** Clears a mark's backing so it reads over the sprite beneath it. */
function marked(c: CanvasRenderingContext2D, a: Art, px: number, py: number) {
  c.fillStyle = BATTERY_BLACK;
  c.fillRect((px - 0.5) * CELL, (py - 0.5) * CELL, (a.rows[0].length + 1) * CELL, (a.rows.length + 1) * CELL);
  drawArt(c, a, px, py);
}

function heart(c: CanvasRenderingContext2D) {
  drawArt(c, BATTERY_ART.door);
  drawArt(c, MARKS.heart, 3.5, 4);
}

const painted = contentsFrom({
  enemy(c, t) {
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    drawArt(c, ENEMY_ART[strength] ?? BATTERY_ART.normal);
    rankChevrons(c, strength, BATTERY_INK, BATTERY_BLACK);
    if (e?.ranged) marked(c, MARKS.ranged, 9, 0);
    if (e?.fast) marked(c, MARKS.fast, 8, 9);
    if (e?.aggro) marked(c, MARKS.aggro, 0, 8);
    if (e && (e.stunned || e.stun)) marked(c, MARKS.stunned, 4.5, 9);
  },
  key(c, t) {
    batteryKey(c, t.color);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") return heart(c);
    if (rule?.type === "wood") return drawArt(c, BATTERY_ART.woodDoor);
    if (rule?.type === "keys" && rule.mode === "any") return drawArt(c, BATTERY_ART.steelDoor);
    drawArt(c, BATTERY_ART.door);
    // A lock in each key's shape, stacked down the door, half size when
    // three must share it.
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    const cell = CELL * (keys.length > 2 ? 0.6 : keys.length > 1 ? 0.8 : 1), size = 5 * cell, gap = cell;
    const top = 12 - (keys.length * size + (keys.length - 1) * gap) / 2;
    keys.forEach((k, i) => drawArt(c, BOWS[k], (12 - size / 2) / cell, (top + i * (size + gap)) / cell, cell));
    if (rule?.type === "keys" && rule.heart) marked(c, MARKS.heart, 7, 8);
  },
  potion(c, t) {
    drawArt(c, potionShade(t) === "red" ? BATTERY_ART.potion : BATTERY_ART.percentPotion);
  },
  attack(c) {
    drawArt(c, BATTERY_ART.sword);
  },
  defense(c) {
    drawArt(c, BATTERY_ART.shield);
  },
  reward(c, t) {
    drawArt(c, BATTERY_ART.reward);
    // A gold area's chest wears a second star.
    if (t.tier === "gold") {
      drawArt(c, MARKS.star, 0, 0);
      drawArt(c, MARKS.star, 9, 0);
    }
  },
  openedChest(c) {
    drawArt(c, BATTERY_ART.openedChest);
  },
  treasure(c, t) {
    drawArt(c, BATTERY_ART.chest);
    if (t.chest) drawArt(c, MARKS.star, 9, 0);
    if (t.chest === "equipment") drawArt(c, MARKS.star, 0, 0);
  },
  stairs(c) {
    drawArt(c, BATTERY_ART.stairs);
  },
  oneway(c) {
    drawArt(c, BATTERY_ART.oneway);
  },
});

/** Each tile's contents (an Armored enemy wearing a small shield, white
 * rather than the themes' steel). */
function contents(c: CanvasRenderingContext2D, t: Tile) {
  if (!t.enemy?.armored) return painted(c, t);
  painted(c, { ...t, enemy: { ...t.enemy, armored: undefined } });
  marked(c, MARKS.shield, 9, 5);
}

const isOpen = (t: Tile | undefined) => !!t && t.kind !== "wall";

/** Black everywhere, a faint dot on each open tile, and a one-pixel line
 * along each wall's sides and corners that face open ground. */
function ground(f: FrameContext) {
  const c = f.c;
  c.fillStyle = BATTERY_BLACK;
  c.fillRect(0, 0, f.width, f.width);
  const at = (x: number, y: number) => (y < 0 ? undefined : f.world.tile(x, y));
  forEachViewTile(f, (x, y) => {
    const t = at(x, y);
    c.save();
    toTileSpace(c, f, x, y);
    if (isOpen(t)) {
      c.fillStyle = BATTERY_DIM;
      c.fillRect(11, 11, CELL, CELL);
    } else {
      c.fillStyle = BATTERY_INK;
      // World y grows upward: the tile above on screen is y + 1.
      const n = isOpen(at(x, y + 1)), s = isOpen(at(x, y - 1)), w = isOpen(at(x - 1, y)), e = isOpen(at(x + 1, y));
      if (n) c.fillRect(0, 0, 24, CELL);
      if (s) c.fillRect(0, 24 - CELL, 24, CELL);
      if (w) c.fillRect(0, 0, CELL, 24);
      if (e) c.fillRect(24 - CELL, 0, CELL, 24);
      if (!n && !w && isOpen(at(x - 1, y + 1))) c.fillRect(0, 0, CELL, CELL);
      if (!n && !e && isOpen(at(x + 1, y + 1))) c.fillRect(24 - CELL, 0, CELL, CELL);
      if (!s && !w && isOpen(at(x - 1, y - 1))) c.fillRect(0, 24 - CELL, CELL, CELL);
      if (!s && !e && isOpen(at(x + 1, y - 1))) c.fillRect(24 - CELL, 24 - CELL, CELL, CELL);
    }
    c.restore();
  });
}

/** A torch: a small flame in its tile's top-left corner, grey once put out. */
function torch(c: CanvasRenderingContext2D, _f: FrameContext, t: Torch) {
  drawArt(c, t.active ? MARKS.litFlame : MARKS.outFlame, 0, 0);
}

function hero(c: CanvasRenderingContext2D, facing?: Facing) {
  drawArt(c, BATTERY_ART.hero, 0, 0, CELL, !!facing && facing.dx < 0);
}

export const BATTERY_BOARD: ThemedBoard = { ground, contents, heart, torch, hero };

const TREE = art(
  "............",
  ".....##.....",
  "....####....",
  "...######...",
  ".....##.....",
  "...######...",
  "..########..",
  ".....##.....",
  "..########..",
  ".##########.",
  ".....##.....",
  ".....##.....",
);

/** The forest clearing: its edge a row of trees where the woods meet open
 * ground (the woods behind them black), open ground a faint dot. */
function forestGround(f: FrameContext) {
  const c = f.c;
  c.fillStyle = BATTERY_BLACK;
  c.fillRect(0, 0, f.width, f.width);
  const at = (x: number, y: number) => (y < 0 ? undefined : f.world.tile(x, y));
  forEachViewTile(f, (x, y) => {
    const t = at(x, y), open = isOpen(t);
    if (!open && !isOpen(at(x, y + 1)) && !isOpen(at(x, y - 1)) && !isOpen(at(x - 1, y)) && !isOpen(at(x + 1, y))) return;
    c.save();
    toTileSpace(c, f, x, y);
    if (open) {
      c.fillStyle = BATTERY_DIM;
      c.fillRect(11, 11, CELL, CELL);
    } else drawArt(c, TREE);
    c.restore();
  });
}

/** Battery saver's forest: trees at the woods' edge instead of wall lines. */
export const BATTERY_FOREST: ThemedBoard = { ...BATTERY_BOARD, ground: forestGround };

/** A route's tiles still ahead: a small square at each one's centre, the
 * hero's own tile left clear. */
export function drawBatteryRoute(f: FrameContext, route: readonly { x: number; y: number }[], hero: { x: number; y: number }) {
  const c = f.c;
  c.fillStyle = BATTERY_INK;
  for (const p of route) {
    if (p.x === hero.x && p.y === hero.y) continue;
    c.save();
    toTileSpace(c, f, p.x, p.y);
    c.fillRect(10, 10, 4, 4);
    c.restore();
  }
}

/** Turns everything drawn on the board so far grey, so feedback drawn in
 * colour (damage numbers, marks, rising rewards) keeps to black and white. */
export function monochrome(f: FrameContext) {
  const c = f.c;
  c.save();
  c.globalCompositeOperation = "saturation";
  c.fillStyle = BATTERY_BLACK;
  c.fillRect(0, 0, f.width, f.width);
  c.restore();
}

/** What each hand card's battery saver icon shows: a board sprite and,
 * for a card that trades or covers only some of them, a small mark. */
type CardIcon = { art?: Art; key?: KeyColor; mark?: Art; draw?: (c: CanvasRenderingContext2D) => void };
const CARD_ICONS: Record<string, CardIcon> = {
  stairs: { art: BATTERY_ART.stairs },
  heal: { art: BATTERY_ART.potion },
  door: { art: BATTERY_ART.door },
  key: { draw: (c) => { drawArt(c, SOLID_BOW, 0, 3); drawArt(c, SHAFT, 5, 5); } },
  yellowKey: { key: "yellow" },
  blueKey: { key: "blue" },
  redKey: { key: "red" },
  monster: { draw: (c) => { drawArt(c, BATTERY_ART.weak, 0, -2, CELL * 0.6); drawArt(c, BATTERY_ART.normal, 8, 0, CELL * 0.6); drawArt(c, BATTERY_ART.strong, 4, 7, CELL * 0.6); } },
  atkUp: { art: BATTERY_ART.sword },
  defUp: { art: BATTERY_ART.shield },
  keySiphon: { key: "yellow", mark: MARKS.heart },
  blueSiphon: { key: "blue", mark: MARKS.shield },
  redSiphon: { key: "red", mark: MARKS.sword },
  keyToHp: { draw: (c) => { drawArt(c, BATTERY_ART.potion); drawArt(c, BOWS.yellow, 7, 0, CELL * 0.8); } },
  smeltBlue: { draw: (c) => { drawArt(c, BATTERY_ART.potion); drawArt(c, BOWS.blue, 7, 0, CELL * 0.8); } },
  smeltRed: { draw: (c) => { drawArt(c, BATTERY_ART.potion); drawArt(c, BOWS.red, 7, 0, CELL * 0.8); } },
  blueTrader: { key: "blue", mark: MARKS.up },
  redTrader: { key: "red", mark: MARKS.up },
  yellowDoor: { draw: (c) => contents(c, { kind: "door", door: { type: "keys", keys: ["yellow"], mode: "all" } }) },
  heartDoor: { draw: heart },
  woodenDoor: { art: BATTERY_ART.woodDoor },
  weakEnemy: { art: BATTERY_ART.weak },
  baseEnemy: { art: BATTERY_ART.normal },
  strongEnemy: { art: BATTERY_ART.strong },
  eliteEnemy: { art: BATTERY_ART.elite },
  bossEnemy: { art: BATTERY_ART.boss },
  nonBossEnemy: { art: BATTERY_ART.strong, mark: MARKS.cross },
  fastEnemy: { draw: (c) => contents(c, { kind: "enemy", enemy: { name: "", hp: 1, attack: 0, defense: 0, tier: 1, strength: "normal", fast: true } }) },
  flyingEnemy: { art: BATTERY_ART.bat },
  chest: { art: BATTERY_ART.chest },
  torch: { art: BATTERY_ART.torch },
  archer: { art: BATTERY_ART.bow },
  angelWings: { art: BATTERY_ART.wings },
  gem: { art: BATTERY_ART.gem },
};

/** Whether a card has a battery saver icon of its own. */
export const hasBatteryCardIcon = (id: string) => id in CARD_ICONS;

/** Draws card `id`'s battery saver icon in tile space (24 x 24). */
export function drawBatteryCardIcon(c: CanvasRenderingContext2D, id: string) {
  const icon = CARD_ICONS[id];
  if (!icon) return;
  if (icon.draw) icon.draw(c);
  if (icon.art) drawArt(c, icon.art);
  if (icon.key) batteryKey(c, icon.key);
  if (icon.mark) marked(c, icon.mark, 12 - icon.mark.rows[0].length, 12 - icon.mark.rows.length);
}

const cardUrls = new Map<string, string>();
/** Card `id`'s battery saver icon as an image URL (12 x 12 pixels), or ""
 * where none can be drawn. */
export function batteryCardIconUrl(id: string) {
  let url = cardUrls.get(id);
  if (url !== undefined) return url;
  url = "";
  try {
    if (typeof document !== "undefined" && hasBatteryCardIcon(id)) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = BATTERY_GRID;
      const g = cv.getContext("2d");
      if (g) {
        g.scale(BATTERY_GRID / 24, BATTERY_GRID / 24);
        drawBatteryCardIcon(g, id);
        url = cv.toDataURL();
      }
    }
  } catch {
    url = "";
  }
  cardUrls.set(id, url);
  return url;
}

/** Battery saver's stats and buttons, 7 x 7. */
export const BATTERY_ICONS = {
  heart: art(".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."),
  sword: art(".....##", "....###", "...###.", "#.###..", ".###...", ".##....", "#..#..."),
  shield: art("#######", "#..#..#", "#..#..#", "#######", ".#.#.#.", "..###..", "...#..."),
  stairs: art("....###", "....#..", "..###..", "..#....", "###....", "#......", "#######"),
  play: art(".#.....", ".##....", ".###...", ".####..", ".###...", ".##....", ".#....."),
  pause: art(".##.##.", ".##.##.", ".##.##.", ".##.##.", ".##.##.", ".##.##.", ".##.##."),
  cog: art("..#.#..", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", "..#.#.."),
  enter: art("..###..", ".#...#.", "#.....#", "#..#..#", "#..#..#", "#..#..#", "#######"),
  yellow: art("..###..", ".#...#.", ".#...#.", "..###..", "...#...", "...##..", "...##.."),
  blue: art(".#####.", ".#...#.", ".#...#.", ".#####.", "...#...", "...##..", "...##.."),
  caution: art("...r...", "..rrr..", "..r.r..", ".rr.rr.", ".rrrrr.", "rrr.rrr", "rrrrrrr"),
  red: art("...#...", "..#.#..", ".#...#.", "..#.#..", "...#...", "...##..", "...##.."),
  back: art(".......", "..#....", ".##....", "#######", ".##....", "..#....", "......."),
  gem: art("..###..", ".#...#.", "#######", "#.#.#.#", ".#...#.", "..#.#..", "...#..."),
} as const;
export type BatteryIcon = keyof typeof BATTERY_ICONS;

const iconUrls = new Map<string, string>();
/** A Battery saver stat or button icon as an image URL (7 x 7 white
 * pixels), or "" where none can be drawn. */
export function batteryIconUrl(name: BatteryIcon) {
  let url = iconUrls.get(name);
  if (url !== undefined) return url;
  url = "";
  try {
    if (typeof document !== "undefined") {
      const a = BATTERY_ICONS[name];
      if (a.baked === undefined) a.baked = bake(a);
      if (a.baked) url = (a.baked as HTMLCanvasElement).toDataURL();
    }
  } catch {
    url = "";
  }
  iconUrls.set(name, url);
  return url;
}

/** Scales everything drawn on the board toward black, white becoming grey
 * `level` (0 to 1) of the way up: Battery saver's white brightness. */
export function dimWhite(f: FrameContext, level: number) {
  const c = f.c, v = Math.round(Math.max(0, Math.min(1, level)) * 255);
  c.save();
  c.globalCompositeOperation = "multiply";
  c.fillStyle = `rgb(${v}, ${v}, ${v})`;
  c.fillRect(0, 0, f.width, f.width);
  c.restore();
}
