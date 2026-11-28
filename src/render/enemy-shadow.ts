// An enemy's grounding shadow as pixel art: a stepped oval on the 24-pixel
// tile grid, sized from the sprite's own feet. Worked out once per sprite
// (paintEnemyShadow in tile-painters.ts caches it), and multiplied onto the
// ground after the room's darkness, so it darkens whatever it lies on.

/** One row of the shadow: columns x0..x1 (inclusive) at row y, and whether it is the darker core. */
export type ShadowRow = { y: number; x0: number; x1: number; core: boolean };

/** The shadow's rim and core as multiply tones: each channel of the ground
 * under it is scaled by tone / 255, a touch cool so it reads as shade, not grey. */
export const SHADOW_TONE = { rim: [148, 144, 160], core: [96, 92, 112] } as const;

const SIZE = 24, SOLID = 128;
/** How far past the tile the shadow may spread: the bake's margin (ENEMY_MARGIN). */
const REACH = 3;
/** The oval for a sprite without solid pixels (art missing): the old fixed shadow's size. */
const FALLBACK = { left: 4, right: 19, bottom: 20 };

/** The shadow's rows for a 24x24 sprite's alpha channel (row-major, one byte a
 * pixel). The oval is three pixels wider each side than the sprite's bottom
 * four solid rows, centred under them, with its middle a row below the
 * sprite's lowest so it shows past the enemy's outline and rim. A flying enemy's sits lower and smaller, on the
 * floor beneath it. Each row is one horizontal span, so its edge only ever
 * steps orthogonally; the core is the same oval inset by two pixels. */
export function shadowRows(alpha: ArrayLike<number>, flying = false): ShadowRow[] {
  let bottom = -1;
  for (let y = SIZE - 1; y >= 0 && bottom < 0; y--)
    for (let x = 0; x < SIZE; x++) if (alpha[y * SIZE + x] >= SOLID) { bottom = y; break; }
  let { left, right } = FALLBACK;
  if (bottom < 0) bottom = FALLBACK.bottom;
  else {
    left = SIZE; right = -1;
    for (let y = Math.max(0, bottom - 3); y <= bottom; y++)
      for (let x = 0; x < SIZE; x++)
        if (alpha[y * SIZE + x] >= SOLID) { left = Math.min(left, x); right = Math.max(right, x); }
  }
  let width = Math.min(24, Math.max(10, right - left + 7));
  if (flying) { width = Math.max(8, width - 6); bottom = 21; }
  const height = width >= 16 ? 5 : width >= 11 ? 4 : 3;
  const x0 = Math.min(SIZE + REACH - width, Math.max(-REACH, Math.round((left + right + 1 - width) / 2)));
  const top = Math.min(SIZE + REACH - height, bottom - Math.floor(height / 2) + 2);
  const rows: ShadowRow[] = [];
  for (let r = 0; r < height; r++) {
    const t = (r + 0.5) / (height / 2) - 1;
    const inset = Math.round((width / 2) * (1 - Math.sqrt(1 - t * t)));
    rows.push({ y: top + r, x0: x0 + inset, x1: x0 + width - 1 - inset, core: false });
    if (r > 0 && r < height - 1 && width - 2 * inset > 4) rows.push({ y: top + r, x0: x0 + inset + 2, x1: x0 + width - 3 - inset, core: true });
  }
  return rows;
}

/** Paints the shadow's rows onto `c` as opaque tones, offset by `m` pixels;
 * the core overwrites the rim, so the canvas is ready to multiply. */
export function paintShadowRows(c: CanvasRenderingContext2D, rows: ShadowRow[], m: number) {
  c.save();
  for (const core of [false, true]) {
    c.fillStyle = `rgb(${SHADOW_TONE[core ? "core" : "rim"].join(",")})`;
    for (const row of rows) if (row.core === core) c.fillRect(m + row.x0, m + row.y, row.x1 - row.x0 + 1, 1);
  }
  c.restore();
}
