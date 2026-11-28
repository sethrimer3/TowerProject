// An enemy's grounding shadow as pixel art: a stepped oval on the 24-pixel
// tile grid, sized from the sprite's own feet. Worked out once per baked
// enemy (paintEnemy bakes it under the rings), so it costs nothing a frame.

/** One row of the shadow: columns x0..x1 (inclusive) at row y, and whether it is the darker core. */
export type ShadowRow = { y: number; x0: number; x1: number; core: boolean };

/** How dark the shadow's rim and core are. Both stay under the torch
 * silhouette's alpha cut (toShadow in entity-lighting.ts), so the ground
 * shadow never casts a torch shadow of its own. */
export const SHADOW_ALPHA = { rim: 0.24, core: 0.42 };

const SIZE = 24, SOLID = 128;
/** The oval for a sprite without solid pixels (art missing): the old fixed shadow's size. */
const FALLBACK = { left: 4, right: 19, bottom: 20 };

/** The shadow's rows for a 24x24 sprite's alpha channel (row-major, one byte a
 * pixel). The oval is two pixels wider than the sprite's bottom four solid
 * rows, centred under them, with its middle on the sprite's lowest row so it
 * peeks out below the feet. A flying enemy's sits lower and smaller, on the
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
  let width = Math.min(20, Math.max(8, right - left + 3));
  if (flying) { width = Math.max(6, width - 4); bottom = 21; }
  const height = width >= 14 ? 5 : width >= 10 ? 4 : 3;
  const x0 = Math.min(SIZE - width, Math.max(0, Math.round((left + right + 1 - width) / 2)));
  const top = Math.min(SIZE + 1 - height, bottom - Math.floor(height / 2) + 1);
  const rows: ShadowRow[] = [];
  for (let r = 0; r < height; r++) {
    const t = (r + 0.5) / (height / 2) - 1;
    const inset = Math.round((width / 2) * (1 - Math.sqrt(1 - t * t)));
    rows.push({ y: top + r, x0: x0 + inset, x1: x0 + width - 1 - inset, core: false });
    if (r > 0 && r < height - 1 && width - 2 * inset > 4) rows.push({ y: top + r, x0: x0 + inset + 2, x1: x0 + width - 3 - inset, core: true });
  }
  return rows;
}

/** Paints the shadow's rows onto `c`, offset by `m` pixels (the bake's margin). */
export function paintShadowRows(c: CanvasRenderingContext2D, rows: ShadowRow[], m: number) {
  c.save();
  for (const core of [false, true]) {
    c.fillStyle = `rgba(0,0,0,${(core ? coreOver() : SHADOW_ALPHA.rim).toFixed(3)})`;
    for (const row of rows) if (row.core === core) c.fillRect(m + row.x0, m + row.y, row.x1 - row.x0 + 1, 1);
  }
  c.restore();
}

/** The core's own alpha, laid over the rim so the two together reach SHADOW_ALPHA.core. */
function coreOver() {
  return 1 - (1 - SHADOW_ALPHA.core) / (1 - SHADOW_ALPHA.rim);
}
