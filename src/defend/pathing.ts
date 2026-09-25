/** Grid geometry and pathing for DEFEND, as pure functions over a `solid`
 * mask (1 where a standing building or pond blocks the cell): A* routes for
 * troops and civilians, the enemies' flow field toward the keep, and the
 * collision test for a unit's body. Units live in continuous cell
 * coordinates, so (x, y) lies in cell (floor x, floor y). */
import { CELLS_H, CELLS_W, cellInBounds, cellIndex, type Rect } from "./grid.ts";
import { MinHeap } from "./heap.ts";

export type Point = { x: number; y: number };

const SQRT2 = Math.SQRT2;

/** The eight neighbour offsets, row by row. Searches visit them in this
 * order, which decides ties, so it must not change. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export const clampCell = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.floor(v)));
/** The cell under a point, clamped onto the board. */
export const cellAt = (x: number, y: number) => cellIndex(clampCell(x, CELLS_W), clampCell(y, CELLS_H));
export const cellCenter = (i: number): Point => ({ x: (i % CELLS_W) + 0.5, y: Math.floor(i / CELLS_W) + 0.5 });
export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export function nearestPoint(r: Rect, x: number, y: number): Point {
  return { x: Math.max(r.x, Math.min(r.x + r.w, x)), y: Math.max(r.y, Math.min(r.y + r.h, y)) };
}
export function rectDist(r: Rect, x: number, y: number) {
  const p = nearestPoint(r, x, y);
  return Math.hypot(p.x - x, p.y - y);
}

/** The item nearest `p` strictly within squared distance `within`. Earlier
 * items win ties, or later ones with `lastWins` (then `within` itself counts). */
export function nearest<T extends Point>(items: Iterable<T>, p: Point, within = Infinity, lastWins = false): T | null {
  const closer = lastWins ? (d: number, bd: number) => d <= bd : (d: number, bd: number) => d < bd;
  let best: T | null = null,
    bd = within;
  for (const it of items) {
    const d = (it.x - p.x) ** 2 + (it.y - p.y) ** 2;
    if (closer(d, bd)) {
      bd = d;
      best = it;
    }
  }
  return best;
}

/** A diagonal step from (x, y) would squeeze between two solid corners. */
const cutsCorner = (solid: Uint8Array, x: number, y: number, dx: number, dy: number) =>
  dx !== 0 && dy !== 0 && (solid[cellIndex(x + dx, y)] === 1 || solid[cellIndex(x, y + dy)] === 1);

/** A small body centred at (x, y) would overlap a solid cell or leave the board. */
export function blocked(solid: Uint8Array, x: number, y: number, r = 0.18): boolean {
  for (const [px, py] of [
    [x - r, y - r],
    [x + r, y - r],
    [x - r, y + r],
    [x + r, y + r],
  ]) {
    if (!cellInBounds(px, py) || solid[cellIndex(Math.floor(px), Math.floor(py))]) return true;
  }
  return false;
}

/** The open cell around cell (cx, cy) whose centre is nearest `from`, as
 * that centre, or null when every neighbour is solid or off the board. */
export function nearestOpen(solid: Uint8Array, cx: number, cy: number, from: Point): [number, number] | null {
  let best: [number, number] | null = null,
    bd = Infinity;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = cx + dx,
      ny = cy + dy;
    if (!cellInBounds(nx, ny) || solid[cellIndex(nx, ny)]) continue;
    const d = Math.hypot(nx + 0.5 - from.x, ny + 0.5 - from.y);
    if (d < bd) {
      bd = d;
      best = [nx + 0.5, ny + 0.5];
    }
  }
  return best;
}

// ── A* ────────────────────────────────────────────────────────────────────

export type PathLimits = {
  /** Paths costlier than this (in cells walked) are not extended. */
  maxCost: number;
  /** Cells expanded before giving up. */
  maxNodes?: number;
};

/** A* over open cells (8-way, no corner cutting). Returns cell indices from
 * the start's neighbour up to the goal cell, [] when already there, or null
 * when the goal is solid or out of reach within the limits. */
export function findPath(solid: Uint8Array, from: Point, to: Point, { maxCost, maxNodes = 4000 }: PathLimits): number[] | null {
  const start = cellAt(from.x, from.y),
    goal = cellAt(to.x, to.y);
  if (solid[goal]) return null;
  if (start === goal) return [];
  return new AStar(solid, start, goal).search(maxCost, maxNodes);
}

class AStar {
  private g = new Map<number, number>();
  private prev = new Map<number, number>();
  private heap = new MinHeap();
  private gx: number;
  private gy: number;

  constructor(
    private solid: Uint8Array,
    private start: number,
    private goal: number,
  ) {
    this.gx = goal % CELLS_W;
    this.gy = (goal - this.gx) / CELLS_W;
    this.g.set(start, 0);
    this.heap.push(start, this.h(start));
  }

  /** Octile distance to the goal. */
  private h(i: number) {
    const x = i % CELLS_W,
      y = (i - x) / CELLS_W;
    const ax = Math.abs(x - this.gx),
      ay = Math.abs(y - this.gy);
    return Math.max(ax, ay) + (SQRT2 - 1) * Math.min(ax, ay);
  }

  search(maxCost: number, maxNodes: number): number[] | null {
    let expanded = 0;
    while (this.heap.size && expanded++ < maxNodes) {
      const i = this.heap.pop();
      if (i === this.goal) return this.route();
      const gi = this.g.get(i)!;
      if (gi <= maxCost) this.expand(i, gi);
    }
    return null;
  }

  private expand(i: number, gi: number) {
    const x = i % CELLS_W,
      y = (i - x) / CELLS_W;
    for (const [dx, dy] of NEIGHBOURS) {
      const n = this.openStep(x, y, dx, dy);
      if (n < 0) continue;
      const ng = gi + (dx && dy ? SQRT2 : 1);
      if (ng < (this.g.get(n) ?? Infinity)) {
        this.g.set(n, ng);
        this.prev.set(n, i);
        this.heap.push(n, ng + this.h(n));
      }
    }
  }

  /** The cell one step from (x, y), or -1 if it's off the board, solid, or
   * past a corner. */
  private openStep(x: number, y: number, dx: number, dy: number) {
    const nx = x + dx,
      ny = y + dy;
    if (!cellInBounds(nx, ny)) return -1;
    const n = cellIndex(nx, ny);
    return this.solid[n] || cutsCorner(this.solid, x, y, dx, dy) ? -1 : n;
  }

  private route() {
    const out: number[] = [];
    for (let c = this.goal; c !== this.start; c = this.prev.get(c)!) out.push(c);
    return out.reverse();
  }
}

// ── Flow field ────────────────────────────────────────────────────────────

/** What the flow field needs to know about the board. */
export type FieldTerrain = {
  solid: Uint8Array;
  /** Cells nothing on foot can enter (ponds), even at a cost. */
  impassable: (i: number) => boolean;
  /** The price of walking out of cell i: solid buildings must be smashed. */
  cost: (i: number) => number;
};

/** Fills `field` with each cell's cheapest walking cost to the nearest goal
 * cell (Dijkstra outward from the goals). Solid cells are passable at their
 * cost, but no diagonal step may touch one. */
export function fillFlowField(field: Float64Array, goals: readonly number[], terrain: FieldTerrain) {
  new FlowFill(field, terrain).run(goals);
}

class FlowFill {
  private heap = new MinHeap();

  constructor(
    private field: Float64Array,
    private terrain: FieldTerrain,
  ) {}

  run(goals: readonly number[]) {
    const { field, heap } = this;
    field.fill(Infinity);
    for (const c of goals) {
      field[c] = 0;
      heap.push(c, 0);
    }
    while (heap.size) {
      const i = heap.pop();
      const k = heap.lastKey;
      if (k <= field[i]) this.relax(i, k);
    }
  }

  private relax(i: number, k: number) {
    const { field, terrain } = this;
    const x = i % CELLS_W,
      y = (i - x) / CELLS_W;
    for (const [dx, dy] of NEIGHBOURS) {
      const n = this.step(x, y, dx, dy);
      if (n < 0) continue;
      // Walking *out of* cell i toward n costs i's price, which makes the
      // field value at n the true cost of the path n → goal.
      const nk = k + (field[i] === 0 ? 1 : terrain.cost(i) * (dx && dy ? SQRT2 : 1));
      if (nk < field[n]) {
        field[n] = nk;
        this.heap.push(n, nk);
      }
    }
  }

  /** The cell one step from (x, y), or -1 if it's off the board or a pond,
   * or a diagonal that touches a solid cell. */
  private step(x: number, y: number, dx: number, dy: number) {
    const { solid, impassable } = this.terrain;
    const nx = x + dx,
      ny = y + dy;
    if (!cellInBounds(nx, ny)) return -1;
    const n = cellIndex(nx, ny);
    if (impassable(n)) return -1;
    const diagonalIntoSolid = dx !== 0 && dy !== 0 && solid[n] === 1;
    return diagonalIntoSolid || cutsCorner(solid, x, y, dx, dy) ? -1 : n;
  }
}

/** The neighbour of cell (cx, cy) with the lowest field value, if any is
 * lower than the cell's own; -1 at a local minimum. Diagonals may not cut a
 * solid corner (but may enter a solid cell, to smash it). */
export function downhill(field: Float64Array, solid: Uint8Array, cx: number, cy: number): number {
  let best = -1,
    bestV = field[cellIndex(cx, cy)];
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = cx + dx,
      ny = cy + dy;
    if (!cellInBounds(nx, ny) || cutsCorner(solid, cx, cy, dx, dy)) continue;
    const n = cellIndex(nx, ny);
    if (field[n] < bestV) {
      bestV = field[n];
      best = n;
    }
  }
  return best;
}
