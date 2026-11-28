// The route line's traced look (RoutePath draws it on the board): five
// lines side by side, each a third of an art pixel wide, drawn out from the
// hero along the route as the tapped tile's outline is (tile-trace.ts).
// Each line runs at its own random speed, never slower than twice the
// hero's steps a second nor than ten times the tile's trace. Each cell
// starts pale at the head and settles to a shade of gold. At every turn,
// and where the route ends, a square seven lines wide appears as the first
// line arrives; the end's pops a few tiny gold sparks that fade at once. The old glowing line
// stays as the fallback (`legacyHighlight`).

import { settling, TRACE_TILES_PER_S, type Rgb } from "./tile-trace.ts";

/** How many lines draw the route, side by side. */
export const ROUTE_LINES = 5;
/** Third-of-a-pixel cells along a tile: 24 art pixels, three cells each. */
export const ROUTE_CELLS = 72;
/** How much faster than the slowest allowed a line may run (up to +35%). */
const SPEED_SPREAD = 0.35;
/** A cell's settle time from pale to gold, and its spread either way. */
const SETTLE_S = 0.3;
const SETTLE_SPREAD = 0.35;
/** The side of the squares at the route's turns and end, in cells: seven
 * lines wide. */
const END_CELLS = 7;
/** How many times the tile trace's speed the route line draws, at least. */
const ROUTE_SPEEDUP = 10;
/** The end square's sparks: how many, how far they fly (cells), how long
 * they live, and their size (half an art pixel). */
const SPARKS = 6;
const SPARK_REACH = 9;
const SPARK_S = 0.35;
const SPARK_CELLS = 1.5;
const SPARK_COLOR = "rgb(255, 214, 110)";
/** Fade steps a cell's color is drawn in, so cells share fills. */
const MIX_STEPS = 8;
/** Shades of gold the settled cells come in. */
const SHADES = 5;

type Point = { x: number; y: number };

/** One cell of a line: the route vertex it is measured from, its offset
 * from that vertex's tile centre in cells (screen axes, y down), and how
 * far along the route it lies, in cells of the centre line. */
export type RouteCell = { at: number; ox: number; oy: number; d: number };

/** A walk's trace: each line's cells and speed (tiles a second), the
 * route's length in cells, and the seed its cells' shades come from. */
export type RoutePlan = { lines: RouteCell[][]; speeds: number[]; length: number; seed: number; turns: number[] };

/** The route's turns: the vertices where a step turns 90° from the last
 * (a wrap round the world is no turn). */
export function routeTurns(route: readonly Point[]): number[] {
  const step = (i: number) => ({ x: route[i + 1].x - route[i].x, y: route[i + 1].y - route[i].y });
  const unit = (u: Point) => Math.abs(u.x) + Math.abs(u.y) === 1;
  const turns: number[] = [];
  for (let i = 1; i + 1 < route.length; i++) {
    const a = step(i - 1), b = step(i);
    if (unit(a) && unit(b) && a.x * b.x + a.y * b.y === 0) turns.push(i);
  }
  return turns;
}

/** A fixed number in [0, 1) for each (seed, a, b): a cell's own shade or
 * settle time, the same every frame. */
export function cellNoise(seed: number, a: number, b: number) {
  let h = Math.imul(seed ^ Math.imul(a + 1, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(b + 1, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The slowest a line may draw, in tiles a second: twice the hero's steps
 * a second (`moveRate`), and never slower than ten times the tapped
 * tile's trace. */
export function slowestSpeed(moveRate: number) {
  return Math.max(2 * moveRate, ROUTE_SPEEDUP * TRACE_TILES_PER_S);
}

/** A route's cells, line by line: each line offset a cell to either side
 * of the centre line (or on it), with square corners where the route
 * turns, so the lines meet edge to edge. A step longer than one tile (the
 * Delve's wrap round the world) breaks the lines there. */
export function routeCells(route: readonly Point[]): RouteCell[][] {
  const lines: RouteCell[][] = [];
  // The route's unbroken runs, as vertex indices.
  const runs: number[][] = [];
  let run = [0];
  for (let i = 1; i < route.length; i++) {
    const wrap = Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y) !== 1;
    if (wrap) {
      runs.push(run);
      run = [i];
    } else run.push(i);
  }
  runs.push(run);
  // Each step's direction on screen (y down) and its normal.
  const dir = (i: number) => ({ x: route[i + 1].x - route[i].x, y: -(route[i + 1].y - route[i].y) });
  for (let line = 0; line < ROUTE_LINES; line++) {
    const o = line - (ROUTE_LINES - 1) / 2, cells: RouteCell[] = [];
    for (const r of runs) {
      if (r.length < 2) continue;
      // The line's corners: each vertex moved out along its steps' normals.
      const corner = (k: number) => {
        const i = r[k], inN = k > 0 ? normal(dir(i - 1)) : null, outN = k < r.length - 1 ? normal(dir(i)) : null;
        const a = inN ?? outN!, b = outN ?? inN!;
        const same = a.x === b.x && a.y === b.y;
        return { at: i, ox: o * (same ? a.x : a.x + b.x), oy: o * (same ? a.y : a.y + b.y) };
      };
      for (let k = 0; k + 1 < r.length; k++) {
        const from = corner(k), to = corner(k + 1), u = dir(r[k]);
        // The run from one corner to the next, in cells; the last step
        // includes its end, the others leave it to the next step.
        const len = ROUTE_CELLS + (to.ox - from.ox) * u.x + (to.oy - from.oy) * u.y;
        const last = k + 2 === r.length;
        for (let j = 0; j < len + (last ? 1 : 0); j++) {
          cells.push({ at: from.at, ox: from.ox + u.x * j, oy: from.oy + u.y * j, d: r[k] * ROUTE_CELLS + (j * ROUTE_CELLS) / len });
        }
      }
    }
    lines.push(cells);
  }
  return lines;
}

/** The normal to a step's direction, turned clockwise on screen. */
const normal = (u: Point) => ({ x: -u.y, y: u.x });

/** A new trace for `route` (the hero's tile first), each line's speed
 * drawn from `rng` above the slowest `moveRate` allows. */
export function planRoute(route: readonly Point[], moveRate: number, rng: () => number): RoutePlan {
  const slowest = slowestSpeed(moveRate);
  const speeds = Array.from({ length: ROUTE_LINES }, () => slowest * (1 + SPEED_SPREAD * rng()));
  return { lines: routeCells(route), speeds, length: (route.length - 1) * ROUTE_CELLS, seed: Math.floor(rng() * 4294967296), turns: routeTurns(route) };
}

/** When line `line`'s head reaches `d` cells along. */
const reachedAt = (plan: RoutePlan, line: number, d: number) => d / (plan.speeds[line] * ROUTE_CELLS);
/** When the first line reaches `d` cells along: a turn's or the end's square appears then. */
const firstAt = (plan: RoutePlan, d: number) => Math.min(...plan.speeds.map((_, line) => reachedAt(plan, line, d)));
/** When the first line reaches the route's end, and the square appears. */
export const endsAt = (plan: RoutePlan) => firstAt(plan, plan.length);

/** A cell's settle time and shade (-1 to 1), fixed by the plan's seed. */
function cellLook(plan: RoutePlan, line: number, k: number) {
  const settle = SETTLE_S * (1 + SETTLE_SPREAD * (2 * cellNoise(plan.seed, line, k) - 1));
  const shade = Math.round((2 * cellNoise(plan.seed + 1, line, k) - 1) * ((SHADES - 1) / 2)) / ((SHADES - 1) / 2);
  return { settle, shade };
}

/** Line `line`'s cell `k`'s color `t` seconds in, or null while its head
 * hasn't reached it; the fade is drawn in MIX_STEPS steps. */
export function routeCellColor(plan: RoutePlan, line: number, k: number, t: number): Rgb | null {
  const cell = plan.lines[line][k], age = t - reachedAt(plan, line, cell.d);
  if (age < 0) return null;
  const { settle, shade } = cellLook(plan, line, k);
  return settling(Math.ceil((age / settle) * MIX_STEPS) / MIX_STEPS, shade);
}

/** The end square's sparks `age` seconds after it appeared: each one's
 * offset from the square's centre in cells, and its opacity. */
export function sparks(plan: RoutePlan, age: number): Array<{ ox: number; oy: number; alpha: number }> {
  if (age < 0 || age >= SPARK_S) return [];
  const u = age / SPARK_S, out = 1 - (1 - u) * (1 - u);
  return Array.from({ length: SPARKS }, (_, i) => {
    const angle = 2 * Math.PI * ((i + cellNoise(plan.seed, 99, i)) / SPARKS), reach = SPARK_REACH * (0.6 + 0.4 * cellNoise(plan.seed, 98, i));
    return { ox: Math.cos(angle) * reach * out, oy: Math.sin(angle) * reach * out, alpha: 1 - u };
  });
}

/** Draws the route's trace `t` seconds in on `c`: `center` gives a route
 * vertex's tile centre on screen, `cell` the screen pixels a cell, and
 * `consumed` the cells the hero has already walked, which are left off.
 * `pulse` (0 to 1) brightens the lines a touch, as the old line pulsed. */
export function drawRouteTrace(c: CanvasRenderingContext2D, plan: RoutePlan, t: number, cell: number, consumed: number, center: (at: number) => Point, pulse = 0) {
  const fills = new Map<string, number[]>();
  const add = (color: Rgb, x: number, y: number, size: number) => {
    const key = `rgb(${color[0] | 0}, ${color[1] | 0}, ${color[2] | 0})`;
    let list = fills.get(key);
    if (!list) fills.set(key, (list = []));
    const left = Math.round(x - size / 2), top = Math.round(y - size / 2);
    list.push(left, top, Math.max(1, Math.round(x + size / 2) - left), Math.max(1, Math.round(y + size / 2) - top));
  };
  const centers = new Map<number, Point>();
  const at = (i: number) => {
    let p = centers.get(i);
    if (!p) centers.set(i, (p = center(i)));
    return p;
  };
  for (let line = 0; line < ROUTE_LINES; line++) {
    const cells = plan.lines[line];
    for (let k = 0; k < cells.length; k++) {
      const cl = cells[k];
      if (cl.d < consumed) continue;
      const color = routeCellColor(plan, line, k, t);
      if (!color) break;
      const p = at(cl.at);
      add(color, p.x + cl.ox * cell, p.y + cl.oy * cell, cell);
    }
  }
  for (const turn of plan.turns) {
    const turnAge = t - firstAt(plan, turn * ROUTE_CELLS), p = at(turn);
    if (turn * ROUTE_CELLS >= consumed && turnAge >= 0) add(settling(Math.ceil((turnAge / SETTLE_S) * MIX_STEPS) / MIX_STEPS, 0.5), p.x, p.y, END_CELLS * cell);
  }
  const age = t - endsAt(plan), last = at(plan.length / ROUTE_CELLS);
  if (age >= 0) add(settling(Math.ceil((age / SETTLE_S) * MIX_STEPS) / MIX_STEPS, 0.5), last.x, last.y, END_CELLS * cell);
  const alpha = c.globalAlpha;
  c.globalAlpha = alpha * (0.85 + 0.15 * pulse);
  for (const [style, rects] of fills) {
    c.fillStyle = style;
    c.beginPath();
    for (let i = 0; i < rects.length; i += 4) c.rect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
    c.fill();
  }
  c.fillStyle = SPARK_COLOR;
  const size = SPARK_CELLS * cell;
  for (const s of sparks(plan, age)) {
    c.globalAlpha = alpha * s.alpha;
    const x = Math.round(last.x + s.ox * cell - size / 2), y = Math.round(last.y + s.oy * cell - size / 2);
    c.fillRect(x, y, Math.max(1, Math.round(size)), Math.max(1, Math.round(size)));
  }
  c.globalAlpha = alpha;
}

/** Whether every line has reached the end and settled, and the sparks are gone. */
export function routeSettled(plan: RoutePlan, t: number) {
  const slowest = Math.max(...plan.speeds.map((_, line) => reachedAt(plan, line, plan.length)));
  return t >= slowest + SETTLE_S * (1 + SETTLE_SPREAD) && t >= endsAt(plan) + SPARK_S;
}
