import type { Tile, Torch, KeyColor } from "./entities.ts";
import { forEachViewTile, toTileSpace, type FrameContext } from "./render-frame.ts";
import { contentsFrom, type ThemedBoard } from "./themed-board.ts";
import { rankChevrons } from "./rank-chevrons.ts";

/** The Terminal Game theme's dungeon board, as an old green-phosphor
 * monitor shows a text dungeon: every wall, tile content, torch and the
 * hero a glowing character of the bundled VT323 face (the Terminal UI
 * theme's), with faint scanlines over it all. */

export const TERMINAL = {
  ground: "#020b04",
  /** Floor dots and spent things. */
  dim: "#1f6e2e",
  green: "#33ff66",
  hero: "#c4ffd2",
  heart: "#ff7a9a",
} as const;
/** Keys and the doors they open keep their colour, in phosphor tints. */
const KEY_TERMINAL: Record<KeyColor, string> = { yellow: "#e8ff52", blue: "#52fff0", red: "#ff8a52" };
const keyColor = (k: KeyColor | undefined) => (k ? KEY_TERMINAL[k] ?? TERMINAL.green : TERMINAL.green);

const FONT = "VT323";
let fontAsked = false;
/** Asks the browser for the face once, so the board isn't drawn in the
 * fallback face for long (no `document.fonts` under tests). */
function askFont() {
  if (fontAsked) return;
  fontAsked = true;
  if (typeof document !== "undefined") void document.fonts?.load(`24px ${FONT}`).catch(() => {});
}

/** One glowing character, centred on (x, y) in tile space. */
function glyph(c: CanvasRenderingContext2D, ch: string, color: string, size = 24, x = 12, y = 12.5, glow = 6) {
  c.font = `${size}px ${FONT}, monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = color;
  c.shadowBlur = glow;
  c.fillStyle = color;
  c.fillText(ch, x, y);
  c.shadowBlur = 0;
}

/** Black ground, a dot per floor tile, and a `#` for every wall touching
 * open ground (deeper rock stays dark) but those holding a torch. */
function drawTerminalGround(f: FrameContext) {
  askFont();
  const c = f.c;
  c.fillStyle = TERMINAL.ground;
  c.fillRect(0, 0, f.width, f.width);
  const isWall = (x: number, y: number) => (f.world.tile(x, y)?.kind ?? "wall") === "wall";
  const torches = new Set(f.torches.map((t) => `${t.x},${t.y}`));
  forEachViewTile(f, (x, y) => {
    const wall = isWall(x, y);
    if (wall && torches.has(`${x},${y}`)) return;
    if (wall && [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => isWall(x + dx, y + dy)))) return;
    c.save();
    toTileSpace(c, f, x, y);
    if (wall) glyph(c, "#", TERMINAL.green, 24, 12, 12.5, 3);
    else glyph(c, ".", TERMINAL.dim, 24, 12, 10, 0);
    c.restore();
  });
}

/** One tile's contents in tile space (24x24): the text dungeon's letters. */
const paintTerminalContents = contentsFrom({
  enemy(c, t) {
    // Its name's first letter: small for weak and normal enemies, capital
    // for strong and elite ones, and a boss's in inverse video.
    const e = t.enemy;
    const letter = (e?.name.trim()[0] ?? "e").toLowerCase();
    const strength = e?.strength ?? "normal";
    if (strength === "boss" || strength === "greaterBoss") {
      c.shadowColor = TERMINAL.green;
      c.shadowBlur = 6;
      c.fillStyle = TERMINAL.green;
      c.fillRect(3, 2, 18, 21);
      c.shadowBlur = 0;
      glyph(c, letter.toUpperCase(), TERMINAL.ground, 26, 12, 12.5, 0);
    } else glyph(c, strength === "strong" || strength === "elite" ? letter.toUpperCase() : letter, TERMINAL.green, 26);
    rankChevrons(c, strength, TERMINAL.green, TERMINAL.ground, 1, 1, 4);
    // A Ranged enemy's arrow at the top right, and a Fast enemy's » there,
    // or below the arrow when it has both.
    if (e?.ranged) {
      c.beginPath();
      c.moveTo(17, 6); c.lineTo(22, 1); c.moveTo(19, 1); c.lineTo(22, 1); c.lineTo(22, 4);
      c.strokeStyle = TERMINAL.green;
      c.lineWidth = 1.2;
      c.stroke();
    }
    if (e?.fast) glyph(c, "»", TERMINAL.green, 14, 20, e.ranged ? 9 : 3, 3);
  },
  key(c, t) {
    glyph(c, "k", keyColor(t.color));
  },
  door(c, t) {
    const rule = t.door;
    if (rule?.type === "fullHp") {
      paintTerminalHeart(c);
      return;
    }
    if (rule?.type === "wood") {
      // Boarded up: any key opens it, or the hero breaks it down.
      glyph(c, "=", TERMINAL.green, 28);
      return;
    }
    const keys = rule?.type === "keys" ? rule.keys : t.color ? [t.color] : [];
    glyph(c, "+", keyColor(keys[0]), 28, 12, 11);
    // A dot per key the door takes, in that key's colour.
    keys.forEach((k, i) => {
      c.fillStyle = keyColor(k);
      c.fillRect(12 - keys.length * 2 + i * 4, 20, 2.5, 2.5);
    });
    if (rule?.type === "keys" && rule.heart) glyph(c, "<3", TERMINAL.heart, 11, 20, 3, 2);
  },
  potion(c, t) {
    glyph(c, "!", TERMINAL.green);
    // The red potion heals a share of HP: its % beside it.
    if (t.color === "red") glyph(c, "%", TERMINAL.green, 12, 19, 5, 2);
  },
  attack(c) {
    glyph(c, ")", TERMINAL.green);
  },
  defense(c) {
    glyph(c, "]", TERMINAL.green);
  },
  reward(c) {
    glyph(c, "$", TERMINAL.green);
  },
  openedChest(c) {
    glyph(c, "_", TERMINAL.dim, 24, 12, 10, 0);
  },
  treasure(c) {
    glyph(c, "*", TERMINAL.green);
  },
  stairs(c) {
    glyph(c, "<", TERMINAL.green, 26);
  },
  oneway(c) {
    glyph(c, "^", TERMINAL.green);
  },
});
/** The Heart Door's heart, typed. */
function paintTerminalHeart(c: CanvasRenderingContext2D) {
  glyph(c, "<3", TERMINAL.heart, 20);
}

/** A torch: a flickering ¥, dim once put out. */
function paintTerminalTorch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
  if (!t.active) {
    glyph(c, "¥", TERMINAL.dim, 22, 12, 12.5, 0);
    return;
  }
  const flicker = f.look.reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(f.now / 90 + t.x * 3 + t.y);
  c.globalAlpha *= flicker;
  glyph(c, "¥", TERMINAL.green, 22, 12, 12.5, 8);
}

/** The hero: the text dungeon's @. */
function paintTerminalHero(c: CanvasRenderingContext2D) {
  glyph(c, "@", TERMINAL.hero, 26, 12, 12.5, 8);
}

/** Scanlines over the whole board, as on the monitor's glass. */
function drawScanlines(f: FrameContext) {
  const c = f.c;
  c.fillStyle = "rgba(0, 0, 0, 0.28)";
  for (let y = 0; y < f.width; y += 3) c.fillRect(0, y, f.width, 1);
}

export const TERMINAL_BOARD: ThemedBoard = {
  ground: drawTerminalGround, contents: paintTerminalContents, heart: paintTerminalHeart,
  torch: paintTerminalTorch, hero: paintTerminalHero, over: drawScanlines,
};
