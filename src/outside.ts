import { boardFont } from "./sprites/font.ts";
import type { Mode, Tile } from "./entities.ts";
import type { Board } from "./board.ts";
import { tileRandom } from "./random.ts";
import { MODES } from "./modes.ts";
import { drawKit } from "./sprites/kit.ts";
import { drawForestLandmark, drawForestSprite } from "./sprites/forest.ts";

export const OUTSIDE_SIZE = 20;
/** The gold trial square sits on open grass beside the Tower path. */
export const PROVING_GROUNDS = { dx: 2, y: 4 } as const;
export const ENTRANCE_Y = 12;
/** The row a run's hero starts the forest on: the crossroads partway up
 * the path, where it widens (`onPath`). */
export const OUTSIDE_START_Y = 7;
export type Weather = "cloudy" | "sunny" | "rain" | "storm";
export function weatherForRoll(roll: number): Weather {
  return roll < 0.4 ? "cloudy" : roll < 0.7 ? "sunny" : roll < 0.9 ? "rain" : "storm";
}
export const outsideWeather = (seed: number) => weatherForRoll(tileRandom(81, 37, seed));
/** A tile of the forest clearing: its cell, the run seed, and the entrance
 * column the dirt path runs along. */
export type ForestSpot = { x: number; y: number; seed: number; center: number; roads?: Roads };

/** The roads the clearing's crossroads has laid: to the buildings in it,
 * each built once what opens it is (Equipment's Blacksmith, the
 * Tournament's Hall), and out to the forest's edge toward the previous and
 * next opened tier (`prev`, `next`), the way the forest's tier arrows lead. */
export type Roads = { blacksmith: boolean; hall: boolean; prev: boolean; next: boolean };

/** The dirt path up to the entrance, widening every fifth row; its
 * crossroads (the row the hero starts on) goes on to a building's door
 * once the building stands, or on out of the clearing (`roads`). */
export const onPath = ({ x, y, center, roads }: ForestSpot) => {
  if (Math.abs(x - center) <= (y % 5 === 2 ? 1 : 0)) return true;
  if (!roads || y !== OUTSIDE_START_Y) return false;
  // Each door is in the middle column of its building, on the row in front.
  if (x < center) return roads.prev || (roads.blacksmith && x >= center + BLACKSMITH.dx + 1);
  return roads.next || (roads.hall && x <= center + TOURNAMENT_HALL.dx + 1);
};

/** Where the Blacksmith stands once Equipment is open: up and to the left
 * of the path, by the entrance column `center`. It takes `BLACKSMITH`'s
 * tiles (walls under its walls and roof), and the trees around them make
 * way for a small yard (`yard`). */
export const BLACKSMITH = { dx: -6, width: 3, y: 8, height: 3 } as const;
const YARD = { dx: BLACKSMITH.dx - 1, width: BLACKSMITH.width + 2, y: BLACKSMITH.y - 1, height: BLACKSMITH.height + 1 };
const within = (r: { dx: number; width: number; y: number; height: number }, center: number, x: number, y: number) =>
  x >= center + r.dx && x < center + r.dx + r.width && y >= r.y && y < r.y + r.height;
/** Whether (x, y) is one of the Blacksmith's tiles, by the entrance column. */
export const onBlacksmith = (center: number, x: number, y: number) => within(BLACKSMITH, center, x, y);
/** Where the Tournament Hall stands once the Tournament is open: the
 * Blacksmith's mirror across the path, up and to the right, in a yard of
 * its own (`HALL_YARD`). */
export const TOURNAMENT_HALL = { dx: 4, width: 3, y: 8, height: 3 } as const;
const HALL_YARD = { dx: TOURNAMENT_HALL.dx - 1, width: TOURNAMENT_HALL.width + 2, y: TOURNAMENT_HALL.y - 1, height: TOURNAMENT_HALL.height + 1 };
/** Whether (x, y) is one of the Tournament Hall's tiles, by the entrance column. */
export const onTournamentHall = (center: number, x: number, y: number) => within(TOURNAMENT_HALL, center, x, y);

/** The roads `world` has laid (none unless it is the clearing). */
export const roadsOf = (world: unknown): Roads | undefined =>
  world instanceof OutsideWorld ? { blacksmith: world.blacksmith, hall: world.hall, prev: world.prevRoad, next: world.nextRoad } : undefined;

export class OutsideWorld implements Board {
  width: number;
  floor = 0;
  entranceX: number;
  /** `blacksmith`: Equipment is open, so its Blacksmith stands in the
   * clearing; `hall`: the Tournament is, so its Hall does; `prevRoad`,
   * `nextRoad`: a tier before or after this one is open, so the crossroads
   * runs on through the trees to the left or right edge. */
  constructor(public seed: number, public mode: Mode, public blacksmith = false, public hall = false, public prevRoad = false, public nextRoad = false) {
    this.width = MODES[mode].width;
    this.entranceX = MODES[mode].entranceX;
  }
  tile(x: number, y: number): Tile {
    // A road out runs on past the board's edge, across the view's spare
    // columns (the Tower's board is narrower than the forest's view).
    if (y === OUTSIDE_START_Y && (x < this.entranceX ? this.prevRoad : this.nextRoad)) return { kind: "floor" };
    if (!this.inside(x, y)) return { kind: "wall" };
    if (x === this.entranceX && y === ENTRANCE_Y) return { kind: "stairs" };
    if (this.blacksmith && within(YARD, this.entranceX, x, y)) return { kind: onBlacksmith(this.entranceX, x, y) ? "wall" : "floor" };
    if (this.hall && within(HALL_YARD, this.entranceX, x, y)) return { kind: onTournamentHall(this.entranceX, x, y) ? "wall" : "floor" };
    return this.wooded(x, y) ? { kind: "wall" } : { kind: "floor" };
  }
  isProvingGrounds(x: number, y: number) {
    return this.mode === "tower" && x === this.entranceX + PROVING_GROUNDS.dx && y === PROVING_GROUNDS.y;
  }
  /** Whether (x, y) is the Blacksmith, which a tap opens. */
  isBlacksmith(x: number, y: number) {
    return this.blacksmith && onBlacksmith(this.entranceX, x, y);
  }
  /** Whether (x, y) is the Tournament Hall, which a tap opens. */
  isTournamentHall(x: number, y: number) {
    return this.hall && onTournamentHall(this.entranceX, x, y);
  }
  /** Whether (x, y) is the foot of the path, under the sign to the other
   * mode's forest: stepping onto it goes there (`Game.swapForest`). */
  atExit(x: number, y: number) {
    return x === this.entranceX && y === 0;
  }
  step(x: number, y: number, dx: number, dy: number) {
    const xx = x + dx, yy = y + dy;
    return this.inside(xx, yy) ? { x: xx, y: yy } : null;
  }
  clear() {}
  private inside(x: number, y: number) {
    return x >= 0 && x < this.width && y >= 0 && y < OUTSIDE_SIZE;
  }
  /** Trees and rocks: everything from the entrance row down, the far sides,
   * and a scattering beyond the clear strip around the path. */
  private wooded(x: number, y: number) {
    const d = Math.abs(x - this.entranceX);
    return y >= ENTRANCE_Y || d >= 9 || (d > 2 && tileRandom(x, y, this.seed) < 0.26);
  }
}

/** The forest uses the same preloaded native pixel density in every Game theme. */
export function drawForestTile(c: CanvasRenderingContext2D, t: Tile, s: ForestSpot) {
  return drawForestSprite(c, onPath(s) ? "forest-path" : t.kind === "wall" ? "forest-litter" : "forest-grass", 0, 0);
}

export function drawEntrance(c: CanvasRenderingContext2D, mode: Mode, center: number, numeral = "", bonus?: { text: string; coin: CanvasImageSource | null }, styled = false) {
  const x = center * 24 + 12, base = (OUTSIDE_SIZE - 1 - ENTRANCE_Y) * 24;
  c.save();
  const landmark = drawForestLandmark(c, mode === "tower", x, base + 24);
  const y = landmark && mode === "tower" ? (bonus ? 46 : 22) : base - (mode === "tower" ? 66 : 76);
  if (numeral) {
    drawTierNumeral(c, numeral, x, bonus ? y - 24 : y, styled);
    if (bonus) drawGoldBonus(c, bonus.text, bonus.coin, x, y, styled);
  }
  c.restore();
}

/** The Gold coin, ×, and the multiplier, centred on (x, y), in gold. */
function drawGoldBonus(c: CanvasRenderingContext2D, text: string, coin: CanvasImageSource | null, x: number, y: number, styled = false) {
  const size = 14, gap = 3, width = size + gap + text.length * 8, left = x - width / 2;
  if (coin) { c.save(); c.imageSmoothingEnabled = false; c.drawImage(coin, left, y - size / 2, size, size); c.restore(); }
  c.font = boardFont(styled, 14);
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.shadowColor = "#ffc94a";
  c.shadowBlur = 8;
  c.fillStyle = "#ffe9a8";
  c.fillText(text, left + size + gap, y + 1);
}

/** The tier's number, glowing gold. */
function drawTierNumeral(c: CanvasRenderingContext2D, numeral: string, x: number, y: number, styled = false) {
  c.font = boardFont(styled, 22);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = "#ffc94a";
  c.shadowBlur = 14;
  c.fillStyle = "#ffe9a8";
  c.fillText(numeral, x, y);
  c.shadowBlur = 4;
  c.fillStyle = "#fff6d8";
  c.fillText(numeral, x, y);
}

/** Forest buildings retain their original footprints and interaction yards. */
export function drawBlacksmith(c: CanvasRenderingContext2D, center: number, _styled = true) {
  drawKit(c, "blacksmith", (center + BLACKSMITH.dx) * 24,
    (OUTSIDE_SIZE - BLACKSMITH.y - BLACKSMITH.height) * 24, BLACKSMITH.width * 24, BLACKSMITH.height * 24);
}
export function drawTournamentHall(c: CanvasRenderingContext2D, center: number, _styled = true) {
  drawKit(c, "hall", (center + TOURNAMENT_HALL.dx) * 24,
    (OUTSIDE_SIZE - TOURNAMENT_HALL.y - TOURNAMENT_HALL.height) * 24, TOURNAMENT_HALL.width * 24, TOURNAMENT_HALL.height * 24);
}

export function drawProvingGrounds(c: CanvasRenderingContext2D, center: number) {
  const x = (center + PROVING_GROUNDS.dx) * 24, y = (OUTSIDE_SIZE - 1 - PROVING_GROUNDS.y) * 24;
  c.save(); c.translate(x, y);
  c.fillStyle = "#b88a2544"; c.fillRect(1, 1, 22, 22);
  c.fillStyle = "#6c4a1d"; c.fillRect(1, 1, 22, 2); c.fillRect(1, 1, 2, 22);
  c.fillStyle = "#e8bc57"; c.fillRect(2, 2, 20, 1); c.fillRect(2, 21, 20, 1); c.fillRect(2, 2, 1, 20); c.fillRect(21, 2, 1, 20);
  c.fillStyle = "#fff0a1";
  for (const [xx, yy] of [[2,2],[20,2],[2,20],[20,20]]) c.fillRect(xx, yy, 2, 2);
  c.fillRect(10, 9, 4, 6); c.fillRect(9, 10, 6, 4);
  c.fillStyle = "#d69b39";
  for (const [xx, yy] of [[11,5],[11,17],[5,11],[17,11],[6,6],[16,6],[6,16],[16,16]]) c.fillRect(xx, yy, 2, 2);
  c.restore();
}
