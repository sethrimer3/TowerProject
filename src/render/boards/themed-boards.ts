import type { ThemedBoard } from "./themed-board.ts";
import { drawFlyers } from "../flyer-art.ts";
import type { GameLook } from "../../theme-collection.ts";
import { forEachViewTile, tileTransform, toTileSpace, type FrameContext } from "../render-frame.ts";
import { gild, type GoldenLook } from "../tile-painters.ts";
import { NEON_BOARD } from "./neon-board.ts";
import { TERMINAL_BOARD } from "./terminal-board.ts";
import { DESKTOP_BOARD } from "./desktop-board.ts";
import { GLYPH_BOARD } from "./glyph-board.ts";
import { EMBER_BOARD } from "./ember-board.ts";
import { YANG_BOARD, YIN_BOARD } from "./zen-board.ts";
import { KURO_BOARD, SHIRO_BOARD } from "./bare-board.ts";
import { ARCADE_BOARD } from "./arcade-board.ts";
import { SYSTEM_BOARD } from "./system-board.ts";
import { KROZ_BOARD } from "./kroz-board.ts";
import { ORBIT_BOARD } from "./orbit-board.ts";
import { PIXEL_BOARD } from "./pixel-board.ts";
import { DOODLE_BOARD } from "./doodle-board.ts";
import { MURK_BOARD } from "./murk-board.ts";

/** The Game theme looks that draw the board their own way. */
export type ThemedLook = Exclude<GameLook, "classic">;
const BOARDS: Readonly<Record<ThemedLook, ThemedBoard>> = {
  neon: NEON_BOARD, terminal: TERMINAL_BOARD, desktop: DESKTOP_BOARD,
  glyph: GLYPH_BOARD, ember: EMBER_BOARD,
  yang: YANG_BOARD, yin: YIN_BOARD,
  shiro: SHIRO_BOARD, kuro: KURO_BOARD,
  arcade: ARCADE_BOARD,
  system: SYSTEM_BOARD,
  kroz: KROZ_BOARD,
  orbit: ORBIT_BOARD,
  pixel: PIXEL_BOARD,
  doodle: DOODLE_BOARD,
  murk: MURK_BOARD,
};
/** A board's light open ground in gold, lifted a little. */
const GOLD_FLOOR: GoldenLook = { on: "floor", color: "#f0b429", blend: "color", alpha: 0.9, lift: "rgba(255, 214, 92, 0.18)" };
/** A board's dark open ground in gold, lifted more so it still reads gold. */
const GOLD_FLOOR_DARK: GoldenLook = { ...GOLD_FLOOR, lift: "rgba(255, 200, 70, 0.32)" };
/** The lines, glyphs or plates drawn on a board's walls over black ground,
 * in gold, dodged brighter (black stays black). */
const GOLD_WALL_LINES: GoldenLook = { on: "wall", color: "#ffc93a", blend: "color", alpha: 1, lift: "#906c00", liftBlend: "color-dodge" };
/** Light walls by white ground, shaded gold. */
const GOLD_WALL_LIGHT: GoldenLook = { on: "wall", color: "#f0b429", blend: "multiply", alpha: 0.85 };
/** Dark walls by black ground, in gold and lifted. */
const GOLD_WALL_DARK: GoldenLook = { on: "wall", color: "#f0b429", blend: "color", alpha: 1, lift: "rgba(255, 200, 60, 0.3)" };
/** Where each board wears a Golden Floor's gold: its open ground where it
 * has hue, else its walls, so gold always shows. */
const GOLDEN_LOOKS: Readonly<Record<ThemedLook, GoldenLook>> = {
  neon: GOLD_WALL_LINES, terminal: GOLD_WALL_LINES, desktop: GOLD_FLOOR,
  glyph: GOLD_WALL_LINES, ember: GOLD_WALL_LINES,
  yang: GOLD_FLOOR, yin: GOLD_FLOOR_DARK,
  shiro: GOLD_WALL_LIGHT, kuro: GOLD_WALL_DARK,
  arcade: GOLD_WALL_LINES,
  system: GOLD_WALL_LIGHT,
  kroz: GOLD_WALL_DARK,
  orbit: GOLD_WALL_LINES,
  pixel: GOLD_FLOOR_DARK,
  doodle: GOLD_WALL_LIGHT,
  murk: GOLD_FLOOR_DARK,
};
export const THEMED_BOARDS: Readonly<Record<ThemedLook, ThemedBoard>> = Object.fromEntries(
  (Object.keys(BOARDS) as ThemedLook[]).map((look) => [look, { ...BOARDS[look], golden: GOLDEN_LOOKS[look] }]),
) as Record<ThemedLook, ThemedBoard>;
/** How a Game theme look draws the board, or null for Classic's lit art. */
export const themedBoardOf = (look: GameLook): ThemedBoard | null => (look === "classic" ? null : THEMED_BOARDS[look]);

/** The dungeon board in a Game theme's own art: ground (gilded on a Golden
 * Floor), contents (the enemy struck leaning into its lunge), torches, then
 * the route and the hero. */
export function drawThemedBoard(f: FrameContext, board: ThemedBoard, lunge: { x: number; y: number; dx: number; dy: number }, drawRoute: () => void, hero: { x: number; y: number }, wrap: number, beforeOver?: () => void) {
  const c = f.c;
  board.ground(f);
  const golden = f.look.golden;
  if (golden) {
    const look = board.golden ?? GOLD_FLOOR;
    forEachViewTile(f, (x, y) => {
      const t = f.world.tile(x, y);
      if (!t || (t.kind === "wall") !== (look.on === "wall") || !golden(x, y)) return;
      c.save();
      toTileSpace(c, f, x, y);
      gild(c, look);
      c.restore();
    });
  }
  forEachViewTile(f, (x, y) => {
    const t = f.world.tile(x, y);
    if (!t || t.kind === "wall" || t.kind === "floor") return;
    const leaning = x === lunge.x && y === lunge.y;
    c.save();
    toTileSpace(c, f, leaning ? x + lunge.dx : x, leaning ? y + lunge.dy : y);
    board.contents(c, t);
    c.restore();
  });
  for (const t of f.torches) {
    c.save();
    toTileSpace(c, f, t.x, t.y);
    board.torch(c, f, t);
    c.restore();
  }
  drawRoute();
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  board.hero(c, f.heroFacing);
  c.restore();
  drawFlyers(f, hero, wrap, (ctx, t) => board.contents(ctx, t), true);
  beforeOver?.();
  board.over?.(f);
}
