import type { EnemyStrength, Tile, Torch, KeyColor } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import { askAsciiFont, asciiGlyph as glyph, letterField } from "./ascii-glyphs.ts";
import { vignette } from "./themed-art.ts";

/** The Glyph Game theme's dungeon board: an ASCII dungeon in many neon
 * colours on purple, every wall, tile content, torch and the hero a
 * strongly glowing character of the bundled VT323 face, the rock a field
 * of dim purple symbols, and enemies and doors framed like ASCII cards. */

export const GLYPH = {
  ground: "#07020d",
  /** The rock's field of dim symbols. */
  field: "#4c1a6e",
  wall: "#b65cff",
  floor: "#2e1544",
  cyan: "#3ff0ff",
  orange: "#ff9a2e",
  yellow: "#ffe53d",
  magenta: "#ff4fe0",
  blue: "#4f8bff",
  green: "#5dff7a",
  red: "#ff4f5e",
  hero: "#fff4d6",
  heart: "#ff4fe0",
  dim: "#5a3a78",
} as const;
const KEY_GLYPH: Record<KeyColor, string> = { yellow: GLYPH.yellow, blue: GLYPH.cyan, red: GLYPH.red };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_GLYPH[k] ?? GLYPH.cyan : GLYPH.cyan);
/** Each strength of enemy glows in its own colour. */
const ENEMY_GLYPH: Record<EnemyStrength, string> = {
  weak: GLYPH.green, normal: GLYPH.cyan, strong: GLYPH.orange, elite: GLYPH.yellow, boss: GLYPH.magenta, greaterBoss: GLYPH.red,
};

/** Purple dark, a dim dot per floor tile, a glowing `#` for every wall
 * touching open ground (but those holding a torch), and the deeper rock a field of dim symbols. */
function drawGlyphGround(f: FrameContext) {
  askAsciiFont();
  const c = f.c;
  c.fillStyle = GLYPH.ground;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  const torches = new Set(f.torches.map((t) => `${t.x},${t.y}`));
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    if (wall && torches.has(`${x},${y}`)) return;
    c.save();
    toTileSpace(c, f, x, y);
    if (!wall) glyph(c, ".", GLYPH.floor, 24, 12, 10, 0);
    else if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) letterField(c, x, y, "#=+:*%&8", GLYPH.field);
    else glyph(c, "#", GLYPH.wall, 21, 12, 12.5, 7);
    c.restore();
  });
}

/** A card's dotted frame round a tile, glowing in `color`. */
function cardFrame(c: CanvasRenderingContext2D, color: string, inset = 2) {
  c.save();
  c.setLineDash([2, 2]);
  c.shadowColor = color;
  c.shadowBlur = 6;
  c.strokeStyle = color;
  c.lineWidth = 1.2;
  c.strokeRect(inset, inset, 24 - inset * 2, 24 - inset * 2);
  c.restore();
}

/** One tile's contents in tile space (24x24). */
const paintGlyphContents = contentsFrom({
  enemy(c, t) {
    // Its name's first letter in its strength's colour, a capital from
    // strong up; a boss's framed like a card.
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    const color = ENEMY_GLYPH[strength] ?? GLYPH.cyan;
    const letter = (e?.name.trim()[0] ?? "e").toLowerCase();
    const big = strength !== "weak" && strength !== "normal";
    if (strength === "boss" || strength === "greaterBoss") cardFrame(c, color, 1);
    glyph(c, big ? letter.toUpperCase() : letter, color, 24, 12, 12.5, 10);
    rankChevrons(c, strength, color, GLYPH.ground, 1, 1, 4);
    // A Ranged enemy's > at the top right, and a Fast enemy's » there, or
    // below it when it has both.
    if (e?.ranged) glyph(c, ">", GLYPH.yellow, 12, 20, 4, 4);
    if (e?.fast) glyph(c, "»", GLYPH.cyan, 12, 20, e.ranged ? 11 : 4, 4);
  },
  key(c, t) {
    glyph(c, "o-", keyColor(t.color), 16, 12, 12.5, 8);
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      paintGlyphHeart(c);
      return;
    }
    if (rule?.type === "wood") {
      // Boarded up: any key opens it, or the hero breaks it down.
      glyph(c, "=", GLYPH.orange, 28, 12, 8, 6);
      glyph(c, "=", GLYPH.orange, 28, 12, 16, 6);
      return;
    }
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    cardFrame(c, keyColor(keys[0]));
    glyph(c, "+", keyColor(keys[0]), 20, 12, 10.5, 8);
    // A dot per key the door takes, in that key's colour.
    keys.forEach((k, i) => {
      c.fillStyle = keyColor(k);
      c.fillRect(12 - keys.length * 2 + i * 4, 17, 2.5, 2.5);
    });
    if (rule?.type === "keys" && rule.heart) glyph(c, "<3", GLYPH.heart, 10, 19, 4, 4);
  },
  potion(c, t) {
    glyph(c, "!", GLYPH.red, 24, 12, 12.5, 10);
    // The red potion heals a share of HP: its % beside it.
    if (t.color === "red") glyph(c, "%", GLYPH.magenta, 12, 19, 5, 4);
  },
  attack(c) {
    glyph(c, ")", GLYPH.orange, 24, 12, 12.5, 10);
  },
  defense(c) {
    glyph(c, "]", GLYPH.blue, 24, 12, 12.5, 10);
  },
  reward(c) {
    cardFrame(c, GLYPH.yellow, 3);
    glyph(c, "$", GLYPH.yellow, 20, 12, 12.5, 10);
  },
  openedChest(c) {
    glyph(c, "_", GLYPH.dim, 24, 12, 10, 0);
  },
  treasure(c) {
    glyph(c, "*", GLYPH.yellow, 24, 12, 14, 10);
  },
  stairs(c) {
    glyph(c, "<", GLYPH.cyan, 26, 12, 12.5, 10);
  },
  oneway(c) {
    glyph(c, "^", GLYPH.green, 24, 12, 14, 10);
  },
});
/** The Heart Door's heart, typed. */
function paintGlyphHeart(c: CanvasRenderingContext2D) {
  glyph(c, "<3", GLYPH.heart, 20, 12, 12.5, 10);
}

/** A torch: an orange flame flickering over its `i`, dim once put out. */
function paintGlyphTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (!t.active) {
    glyph(c, "i", GLYPH.dim, 20, 12, 14, 0);
    return;
  }
  glyph(c, "i", GLYPH.hero, 20, 12, 15, 4, GLYPH.orange);
  const flicker = f.look.reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(f.now / 90 + t.x * 3 + t.y);
  c.globalAlpha *= flicker;
  glyph(c, "*", GLYPH.orange, 16, 12, 6, 12);
}

/** The hero: a bright @, haloed in magenta and cyan. */
function paintGlyphHero(c: CanvasRenderingContext2D) {
  glyph(c, "@", GLYPH.magenta, 26, 12, 12.5, 14);
  glyph(c, "@", GLYPH.hero, 26, 12, 12.5, 6, GLYPH.cyan);
}

/** A soft dark rim round the board. */
function drawGlyphVignette(f: FrameContext) {
  vignette(f, 0.35, "rgba(20, 0, 40, 0)", "rgba(10, 0, 20, 0.55)");
}

export const GLYPH_BOARD: ThemedBoard = {
  ground: drawGlyphGround, contents: paintGlyphContents, heart: paintGlyphHeart,
  torch: paintGlyphTorch, hero: paintGlyphHero, over: drawGlyphVignette,
};
