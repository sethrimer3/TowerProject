/** Chunky pixel art for the Game themes drawn in pixels (Arcade, Kroz):
 * a sprite is rows of letters, each standing for a colour. Drawing only. */

export type Sprite = readonly string[];

/** Draws a sprite of letters, each standing for a colour in `colors` ('.'
 * left clear), centred on (cx, cy) in tile space with pixels `cell` units
 * wide. Each row's runs of one colour are filled as one rectangle, a hair
 * wider, so no seams show between them. */
export function sprite(c: CanvasRenderingContext2D, rows: Sprite, colors: Record<string, string>, cell = 2, cx = 12, cy = 12) {
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
