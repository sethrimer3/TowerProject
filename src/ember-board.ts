import type { EnemyStrength, Tile, Torch, KeyColor } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "./rank-chevrons.ts";
import { askAsciiFont, asciiGlyph as glyph, letterField, tileHash } from "./ascii-glyphs.ts";
import { vignette } from "./themed-art.ts";

/** The Ember Game theme's dungeon board: warm cream and amber ASCII glowing
 * on a dark maroon field of dim letters, open ground left black, enemies a
 * pair of red glowing eyes under their name's letters, and the hero a
 * little figure of amber characters, all in the bundled VT323 face. */

export const EMBER = {
  ground: "#0b0204",
  /** The rock's field of dim letters, and where it meets open ground. */
  field: "#341012",
  edge: "#8c2f2c",
  cream: "#ffe9c4",
  amber: "#ffb347",
  red: "#ff2a1a",
  pupil: "#ffd23d",
  heart: "#ff3b30",
  dim: "#5a2a28",
} as const;
/** Keys and the doors they open glow in their colour round cream. */
const KEY_EMBER: Record<KeyColor, string> = { yellow: "#ffd23d", blue: "#6fd6ff", red: "#ff4a3a" };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_EMBER[k] ?? EMBER.amber : EMBER.amber);
/** How wide an enemy's eyes open, by its strength. */
const EYE_SIZE: Record<EnemyStrength, number> = { weak: 3, normal: 3.4, strong: 3.8, elite: 4.2, boss: 4.8, greaterBoss: 5.2 };

/** Black open ground, and the rock a field of dim maroon letters, brighter
 * where it meets open ground (but under a torch). */
function drawEmberGround(f: FrameContext) {
  askAsciiFont();
  const c = f.c;
  c.fillStyle = EMBER.ground;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  const torches = new Set(f.torches.map((t) => `${t.x},${t.y}`));
  forEachViewTile(f, (x, y) => {
    if (torches.has(`${x},${y}`)) return;
    if (!isWall(x, y)) {
      // Now and then a faint mote on the open ground.
      if (tileHash(x, y) % 7 !== 0) return;
      c.save();
      toTileSpace(c, f, x, y);
      glyph(c, ".", EMBER.dim, 20, 12, 10, 0);
      c.restore();
      return;
    }
    const deep = [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)));
    c.save();
    toTileSpace(c, f, x, y);
    letterField(c, x, y, "utoraie*l", deep ? EMBER.field : EMBER.edge);
    c.restore();
  });
}

/** A pair of glowing red eyes, each with a yellow slit, centred on (12, y). */
function eyes(c: CanvasRenderingContext2D, r: number, y = 14) {
  c.save();
  c.shadowColor = EMBER.red;
  c.shadowBlur = 10;
  c.fillStyle = EMBER.red;
  for (const x of [12 - r - 1, 12 + r + 1]) {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.shadowBlur = 3;
  c.shadowColor = EMBER.pupil;
  c.fillStyle = EMBER.pupil;
  for (const x of [12 - r - 1, 12 + r + 1]) c.fillRect(x - r * 0.55, y - 0.6, r * 1.1, 1.2);
  c.restore();
}

/** One tile's contents in tile space (24x24). */
const paintEmberContents = contentsFrom({
  enemy(c, t) {
    // Red eyes, wider the stronger it is, under its name's first letters
    // in glowing cream (more of them from strong up).
    const e = t.enemy;
    const strength = e?.strength ?? "normal";
    const name = (e?.name.trim().toLowerCase() ?? "e").replace(/[^a-z]/g, "");
    const letters = name.slice(0, strength === "weak" || strength === "normal" ? 2 : 4);
    glyph(c, letters, EMBER.cream, letters.length > 2 ? 9 : 10, 12, 4.5, 5, EMBER.amber);
    eyes(c, EYE_SIZE[strength] ?? 3);
    if (strength === "boss" || strength === "greaterBoss") glyph(c, "^", EMBER.pupil, 10, 12, 20, 4, EMBER.red);
    // Its rank chevrons down the left edge, under the letters.
    rankChevrons(c, strength, EMBER.pupil, EMBER.ground, 1, 8, 4);
    // A Ranged enemy's > at the top right, and a Fast enemy's » at its
    // bottom right.
    if (e?.ranged) glyph(c, ">", EMBER.cream, 10, 22, 4, 4, EMBER.amber);
    if (e?.fast) glyph(c, "»", EMBER.cream, 10, 21, 21, 4, EMBER.amber);
  },
  key(c, t) {
    glyph(c, "o-", EMBER.cream, 16, 12, 12.5, 8, keyColor(t.color));
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      paintEmberHeart(c);
      return;
    }
    if (rule?.type === "wood") {
      // Boarded up: any key opens it, or the hero breaks it down.
      glyph(c, "=", EMBER.amber, 26, 12, 8, 5);
      glyph(c, "=", EMBER.amber, 26, 12, 16, 5);
      return;
    }
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    glyph(c, "[+]", EMBER.cream, 18, 12, 11, 8, keyColor(keys[0]));
    // A dot per key the door takes, in that key's colour.
    keys.forEach((k, i) => {
      c.fillStyle = keyColor(k);
      c.fillRect(12 - keys.length * 2 + i * 4, 19, 2.5, 2.5);
    });
    if (rule?.type === "keys" && rule.heart) glyph(c, "<3", EMBER.heart, 9, 20, 3, 4);
  },
  potion(c, t) {
    glyph(c, "!", EMBER.cream, 24, 12, 12.5, 8, EMBER.red);
    // The red potion heals a share of HP: its % beside it.
    if (t.color === "red") glyph(c, "%", EMBER.amber, 12, 19, 5, 4);
  },
  attack(c) {
    glyph(c, ")", EMBER.amber, 24, 12, 12.5, 8);
  },
  defense(c) {
    glyph(c, "]", EMBER.cream, 24, 12, 12.5, 8, EMBER.amber);
  },
  reward(c) {
    glyph(c, "{$}", EMBER.amber, 18, 12, 12.5, 8);
  },
  openedChest(c) {
    glyph(c, "{_}", EMBER.dim, 18, 12, 12.5, 0);
  },
  treasure(c) {
    glyph(c, "*", EMBER.pupil, 24, 12, 14, 8, EMBER.amber);
  },
  stairs(c) {
    glyph(c, "<", EMBER.cream, 26, 12, 12.5, 8, EMBER.amber);
  },
  oneway(c) {
    glyph(c, "^", EMBER.cream, 24, 12, 14, 8, EMBER.amber);
  },
});
/** The Heart Door's heart, typed. */
function paintEmberHeart(c: CanvasRenderingContext2D) {
  glyph(c, "<3", EMBER.heart, 20, 12, 12.5, 10);
}

/** A torch: an amber flame flickering over its cream `i`, dim once put out. */
function paintEmberTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (!t.active) {
    glyph(c, "i", EMBER.dim, 20, 12, 14, 0);
    return;
  }
  glyph(c, "i", EMBER.cream, 20, 12, 15, 4, EMBER.amber);
  const flicker = f.look.reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(f.now / 90 + t.x * 3 + t.y);
  c.globalAlpha *= flicker;
  glyph(c, "*", EMBER.amber, 16, 12, 6, 12, EMBER.red);
}

/** The hero: a little figure of glowing amber characters. */
function paintEmberHero(c: CanvasRenderingContext2D) {
  glyph(c, "o", EMBER.amber, 13, 12, 3.5, 9);
  glyph(c, "<#>", EMBER.amber, 13, 12, 11.5, 9);
  glyph(c, "/ \\", EMBER.amber, 13, 12, 20, 9);
}

/** A warm dark rim round the board. */
function drawEmberVignette(f: FrameContext) {
  vignette(f, 0.3, "rgba(30, 0, 0, 0)", "rgba(12, 0, 0, 0.6)");
}

export const EMBER_BOARD: ThemedBoard = {
  ground: drawEmberGround, contents: paintEmberContents, heart: paintEmberHeart,
  torch: paintEmberTorch, hero: paintEmberHero, over: drawEmberVignette,
};
