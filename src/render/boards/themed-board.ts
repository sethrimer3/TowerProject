import type { Tile, Torch } from "../../entities.ts";
import type { Facing } from "../../shown.ts";
import type { FrameContext } from "../render-frame.ts";
import type { GoldenLook } from "../tile-painters.ts";

/** How a Game theme other than Classic draws the dungeon board in place of
 * its lit art: the ground, each tile's contents, torches and the hero, each
 * in tile space (24x24) but the ground. Lighting, glows and decor are off
 * while one is worn, until each has a version of its own. Every board in
 * `THEMED_BOARDS` (themed-boards.ts) is one. */
export type ThemedBoard = {
  /** The background, floor and walls over the whole board. */
  ground(f: FrameContext): void;
  /** One tile's contents (also as they rise off the board). */
  contents(c: CanvasRenderingContext2D, t: Tile): void;
  /** The Heart Door's heart on its own, as its toll rises off the door. */
  heart(c: CanvasRenderingContext2D): void;
  torch(c: CanvasRenderingContext2D, f: FrameContext, t: Torch): void;
  /** The hero, facing `facing` (its last step), for a board whose hero turns. */
  hero(c: CanvasRenderingContext2D, facing: Facing): void;
  /** Drawn over the whole board after the hero, before the feedback
   * overlays. */
  over?(f: FrameContext): void;
  /** How a Golden Floor wears its gold over the ground: its walls, for a
   * board whose open ground is black or without hue; its open ground,
   * tinted gold, without. */
  golden?: GoldenLook;
};

/** The kinds of tile contents a board paints: every tile kind but open
 * ground and rock, which its ground draws. */
export type ContentKind = Exclude<Tile["kind"], "wall" | "floor">;
/** How a board paints each kind of tile contents, in tile space (24x24):
 * one painter a kind, so a new kind of tile can't go undrawn. */
export type ContentPainters = Readonly<Record<ContentKind, (c: CanvasRenderingContext2D, t: Tile) => void>>;

/** A board's `contents` from its painters: open ground and rock have none. */
export function contentsFrom(painters: ContentPainters): ThemedBoard["contents"] {
  return (c, t) => {
    if (t.kind !== "wall" && t.kind !== "floor") painters[t.kind](c, t);
  };
}
