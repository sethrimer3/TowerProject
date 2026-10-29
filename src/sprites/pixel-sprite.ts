/** Chunky pixel art for the Game themes drawn in pixels (Arcade, Kroz):
 * a sprite is rows of letters, each standing for a colour. Drawing only. */

export type Sprite = readonly string[];

/** While the Experimental pixel filter draws a board on a grid of art
 * pixels, how many tile units one of them is (0 while it doesn't): sprites
 * then take a whole number of grid pixels a pixel and start on the grid. */
let grid = 0;
/** Puts the sprites on a grid of `unit` tile units a pixel, or off it (0). */
export function snapSprites(unit: number) {
  grid = unit;
}
/** A sprite's pixel size `cell` on the grid: the nearest whole number of grid
 * pixels, at least one. */
export const snapCell = (cell: number) => (grid ? Math.max(1, Math.round(cell / grid)) * grid : cell);
/** A sprite's top or left edge `at` on the grid. */
export const snapEdge = (at: number) => (grid ? Math.round(at / grid) * grid : at);

/** Draws a sprite of letters, each standing for a colour in `colors` ('.'
 * left clear), centred on (cx, cy) in tile space with pixels `cell` units
 * wide. Each row's runs of one colour are filled as one rectangle, a hair
 * wider, so no seams show between them. */
export function sprite(c: CanvasRenderingContext2D, rows: Sprite, colors: Record<string, string>, cell = 2, cx = 12, cy = 12) {
  cell = snapCell(cell);
  const w = rows[0].length * cell, h = rows.length * cell;
  fillSprite(c, rows, colors, cell, snapEdge(cx - w / 2), snapEdge(cy - h / 2));
}

/** Fills a sprite's pixels, `cell` units each, from its top left (x0, y0),
 * off the pixel filter's grid: as a sprite is baked at one pixel a pixel. */
export function fillSprite(c: CanvasRenderingContext2D, rows: Sprite, colors: Record<string, string>, cell: number, x0: number, y0: number) {
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
