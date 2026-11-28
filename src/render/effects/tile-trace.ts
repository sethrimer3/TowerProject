// The tapped tile's traced outline (BoardOverlay draws it on a canvas over
// the board): four lines, each a quarter of an art pixel wide, stacked
// outward round the tile so none of them covers it. All four start at 12
// o'clock and trace the tile clockwise, each at its own slightly random
// speed. A line's head is bright and pale, and each quarter-pixel cell it
// leaves behind settles to the highlight's gold, each a shade apart. Once
// every cell has settled, the outline holds still and its canvas pulses
// gently (`tile-trace-pulse` in `style.css`, whose 1.6s delay waits out
// the slowest trace: keep it in step with TRACE_S and SETTLE_S).
// The old glowing box stays as the fallback (`legacyHighlight`, and
// Battery saver).

/** How many lines trace the tile, stacked outward from its edge. */
export const TRACE_LINES = 4;
/** Quarter-pixel cells along a tile's side: 24 art pixels, four cells each. */
export const TILE_CELLS = 96;
/** How long a line takes to go round, before its own speed's spread. */
const TRACE_S = 1;
/** How far a line's time may stray from TRACE_S either way (±15%). */
const SPEED_SPREAD = 0.15;
/** How long a cell takes to settle from the head's pale to its gold, and how
 * far a cell's own time may stray from it. */
const SETTLE_S = 0.32;
const SETTLE_SPREAD = 0.35;
/** The head's pale and the settled gold (the old box's #ffd166). */
const PALE: Rgb = [255, 250, 228];
const GOLD: Rgb = [255, 209, 102];

export type Rgb = [number, number, number];

/** One tap's trace: each line's time round, and each of its cells' settle
 * time and shade of gold (-1 to 1). */
export type TracePlan = { durations: number[]; settle: number[][]; shade: number[][] };

/** Line `line`'s cells, clockwise from 12 o'clock, in quarter-pixel cells
 * from the tile's top-left corner (the tile covers 0 to TILE_CELLS - 1 on
 * both axes): the ring of cells `line + 1` out from the tile. */
export function ringCells(line: number): Array<[number, number]> {
  const lo = -(line + 1), hi = TILE_CELLS + line, mid = TILE_CELLS / 2, cells: Array<[number, number]> = [];
  for (let x = mid; x <= hi; x++) cells.push([x, lo]);
  for (let y = lo + 1; y <= hi; y++) cells.push([hi, y]);
  for (let x = hi - 1; x >= lo; x--) cells.push([x, hi]);
  for (let y = hi - 1; y >= lo; y--) cells.push([lo, y]);
  for (let x = lo + 1; x < mid; x++) cells.push([x, lo]);
  return cells;
}

const RINGS = Array.from({ length: TRACE_LINES }, (_, line) => ringCells(line));

/** A new trace's speeds, settle times and shades, drawn from `rng`. */
export function planTrace(rng: () => number): TracePlan {
  const durations = RINGS.map(() => TRACE_S * (1 + SPEED_SPREAD * (2 * rng() - 1)));
  const settle = RINGS.map((ring) => ring.map(() => SETTLE_S * (1 + SETTLE_SPREAD * (2 * rng() - 1))));
  const shade = RINGS.map((ring) => ring.map(() => 2 * rng() - 1));
  return { durations, settle, shade };
}

/** The share of its way round a line has come `t` seconds in: quick off the
 * mark and easing into 12 o'clock. */
const progress = (t: number, duration: number) => {
  const x = Math.min(1, Math.max(0, t / duration));
  return x * (1.5 - 0.5 * x);
};
/** When a line's head reached the share `f` of its way round. */
const reached = (f: number, duration: number) => duration * (1.5 - Math.sqrt(Math.max(0, 2.25 - 2 * f)));

/** Cell `k`'s settled gold: a shade lighter or deeper than the box's. */
export function settledColor(shade: number): Rgb {
  return [GOLD[0], GOLD[1] + 14 * shade, GOLD[2] + 22 * shade];
}

/** Cell `k` of line `line`'s color `t` seconds in, or null while the line's
 * head hasn't reached it. */
export function cellColor(plan: TracePlan, line: number, k: number, t: number): Rgb | null {
  const count = RINGS[line].length, duration = plan.durations[line];
  if (k >= progress(t, duration) * count) return null;
  const age = t - reached(k / count, duration), settle = plan.settle[line][k];
  const u = Math.min(1, Math.max(0, age / settle)), eased = u * u * (3 - 2 * u);
  const gold = settledColor(plan.shade[line][k]);
  return [0, 1, 2].map((i) => PALE[i] + (gold[i] - PALE[i]) * eased) as Rgb;
}

/** Whether every line has gone round and every cell has settled by `t`. */
export function traceSettled(plan: TracePlan, t: number): boolean {
  return plan.durations.every((d, line) => t >= d + Math.max(...plan.settle[line]));
}

/** Draws the trace `t` seconds in on `c`, whose origin is the outer corner
 * of the outermost line, `cell` device pixels a quarter-pixel cell. Each
 * cell's edges are rounded to whole device pixels, so the lines stay crisp
 * and meet without gaps. With `still`, every cell is drawn settled. */
export function drawTrace(c: CanvasRenderingContext2D, cell: number, plan: TracePlan, t: number, still = false) {
  const edge = (n: number) => Math.round((n + TRACE_LINES) * cell);
  for (let line = 0; line < TRACE_LINES; line++) {
    const ring = RINGS[line];
    for (let k = 0; k < ring.length; k++) {
      const rgb = still ? settledColor(plan.shade[line][k]) : cellColor(plan, line, k, t);
      if (!rgb) break;
      const [x, y] = ring[k], left = edge(x), top = edge(y);
      c.fillStyle = `rgb(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0})`;
      c.fillRect(left, top, Math.max(1, edge(x + 1) - left), Math.max(1, edge(y + 1) - top));
    }
  }
}
