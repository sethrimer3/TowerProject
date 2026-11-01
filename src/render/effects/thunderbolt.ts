import { sprite, type Sprite } from "../../sprites/pixel-sprite.ts";
import { tileRandom } from "../../random.ts";

/** How often the jagged light round a struck enemy flips, in ms. */
const LIGHT_FLIP_MS = 60;
/** The jagged light round a struck enemy, a little wider than its tile. */
const LIGHT: Sprite = [
  "......w......w..",
  ".w...www...www..",
  ".ww.w...w.w..w..",
  "..ww.....w...ww.",
  "..w...........ww",
  ".ww...........w.",
  "ww...........ww.",
  ".ww...........ww",
  "..w..........ww.",
  "www...........w.",
  ".ww..........ww.",
  "..w...........ww",
  "..ww.....w...w..",
  ".w..w...w.w.ww..",
  "...www.w...www..",
  "....w.......w...",
];
const FLIPPED: Sprite = LIGHT.map((row) => [...row].reverse().join(""));
const WHITE = { w: "#ffffff" };

/** A thunderbolt falling straight down to (x, bottom) from the top of the
 * canvas (y 0), `fallen` of the way there (0 to 1): a jagged white line, hard
 * edged, kinked at fixed points by the tile it strikes and `salt`. `unit` is a
 * tile's size. Leaves the canvas's state changed: the caller saves it. */
export function paintThunderbolt(c: CanvasRenderingContext2D, x: number, bottom: number, fallen: number, tileX: number, tileY: number, salt: number, unit: number) {
  const reach = bottom * Math.min(1, fallen), step = unit * 0.7, points: [number, number][] = [[x, 0]];
  for (let i = 1, y = step; y < reach; i++, y += step) points.push([x + (tileRandom(tileX, tileY, salt + i) - 0.5) * unit * 0.8, y]);
  // It lands dead on its target once it has fallen; until then its tip is mid-air.
  points.push([fallen >= 1 ? x : (points.at(-1)![0] + x) / 2, reach]);
  c.lineJoin = "miter";
  c.lineCap = "butt";
  for (const [color, width] of [["#10151c", unit * 0.2], ["#ffffff", unit * 0.1]] as const) {
    c.strokeStyle = color;
    c.lineWidth = Math.max(1, width);
    c.beginPath();
    points.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.stroke();
  }
}

/** The jagged white light round a struck enemy, `age` ms into its flash, in a
 * tile's own 24-unit space: a sprite, flipped back and forth so it crackles. */
export function paintThunderlight(c: CanvasRenderingContext2D, age: number) {
  sprite(c, Math.floor(age / LIGHT_FLIP_MS) % 2 ? FLIPPED : LIGHT, WHITE, 2, 12, 12);
}
