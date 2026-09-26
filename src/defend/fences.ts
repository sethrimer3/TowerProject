/** Thin wooden fences along the street sides of some parks. Purely
 * decorative — nothing is blocked by them — but enemies that walk across a
 * section (or a blast next to it) snap it: it splinters into pieces that
 * scatter, settle on the ground and fade away after 5–10 seconds. Fences
 * live only in the renderer and are rebuilt fresh for every city/run. */
import { CELL_COUNT, CELLS_W, ORTHO, cellInBounds, cellIndex, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { ENEMIES } from "./catalog.ts";
import type { DefendSim, Effect } from "./sim.ts";

/** One cell-long section of fence, in cell coordinates. */
export type FenceSection = { x1: number; y1: number; x2: number; y2: number; broken: boolean };
type Splinter = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; len: number; age: number; life: number; shade: number };

/** How far inside the park edge the fence runs (cells). */
const INSET = 0.12;
/** Share of parks that are fenced. */
const FENCED = 0.6;
/** Blasts remembered so each breaks fences once; forgotten past this many. */
const BLAST_MEMORY = 200;
const OUTLINE = "#1c140c";

const isPark = (map: CityMap, i: number) => map.type[i] === CellType.PARK || map.type[i] === CellType.WATER;

/** The in-bounds orthogonal neighbours of cell `c`, with their direction. */
function* neighbours(c: number): Generator<[number, number, number]> {
  const x = c % CELLS_W,
    y = (c - x) / CELLS_W;
  for (const [dx, dy] of ORTHO) if (cellInBounds(x + dx, y + dy)) yield [cellIndex(x + dx, y + dy), dx, dy];
}

export function parkFences(map: CityMap): FenceSection[] {
  const out: FenceSection[] = [];
  const flooded = new Uint8Array(CELL_COUNT);
  for (let start = 0; start < CELL_COUNT; start++) {
    if (!isPark(map, start) || flooded[start]) continue;
    const cells = floodPark(map, start, flooded);
    if (cells.length < 4 || hash01(start, 91) > FENCED) continue;
    const sections = cells.flatMap((c) => streetEdges(map, c));
    // Leave one section open as a gate.
    if (sections.length > 2) sections.splice(Math.floor(hash01(start, 92) * sections.length), 1);
    out.push(...sections);
  }
  return out;
}

/** Every cell of the park holding `start`, grass and pond together. */
function floodPark(map: CityMap, start: number, flooded: Uint8Array): number[] {
  const cells = [start];
  flooded[start] = 1;
  for (let h = 0; h < cells.length; h++)
    for (const [n] of neighbours(cells[h]))
      if (isPark(map, n) && !flooded[n]) {
        flooded[n] = 1;
        cells.push(n);
      }
  return cells;
}

/** A fence section on each street-facing edge of grass cell `c`. */
function streetEdges(map: CityMap, c: number): FenceSection[] {
  if (map.type[c] !== CellType.PARK) return [];
  const x = c % CELLS_W,
    y = (c - x) / CELLS_W;
  const out: FenceSection[] = [];
  for (const [n, dx, dy] of neighbours(c)) if (map.type[n] === CellType.ROAD) out.push(edgeSection(x, y, dx, dy));
  return out;
}

/** The fence just inside cell (x, y)'s edge facing (dx, dy). */
function edgeSection(x: number, y: number, dx: number, dy: number): FenceSection {
  if (dy !== 0) {
    const fy = dy < 0 ? y + INSET : y + 1 - INSET;
    return { x1: x, y1: fy, x2: x + 1, y2: fy, broken: false };
  }
  const fx = dx < 0 ? x + INSET : x + 1 - INSET;
  return { x1: fx, y1: y, x2: fx, y2: y + 1, broken: false };
}

/** The in-bounds cells of the 3×3 block around a section's midpoint. */
function cellsAround(s: FenceSection): number[] {
  const mx = Math.floor((s.x1 + s.x2) / 2),
    my = Math.floor((s.y1 + s.y2) / 2);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (cellInBounds(mx + dx, my + dy)) out.push(cellIndex(mx + dx, my + dy));
  return out;
}

export class Fences {
  sections: FenceSection[] = [];
  splinters: Splinter[] = [];
  private map: CityMap | null = null;
  /** Sections indexed by every cell they touch, for cheap trampling checks. */
  private byCell = new Map<number, FenceSection[]>();
  private lastTime = -1;
  private seenBlasts = new Set<number>();

  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.sections = parkFences(map);
    this.splinters = [];
    this.seenBlasts.clear();
    this.lastTime = -1;
    this.byCell.clear();
    for (const s of this.sections)
      for (const k of cellsAround(s)) {
        const list = this.byCell.get(k);
        if (list) list.push(s);
        else this.byCell.set(k, [s]);
      }
  }

  /** Trample and blast fences, and move the splinters along in sim time. */
  update(sim: DefendSim) {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.5, sim.time - this.lastTime));
    this.lastTime = sim.time;
    this.trample(sim);
    this.blast(sim);
    this.drift(dt);
  }

  /** Walking enemies snap the sections they touch. */
  private trample(sim: DefendSim) {
    for (const e of sim.enemies) {
      const def = ENEMIES[e.kind];
      if (def.flying) continue;
      for (const s of this.byCell.get(cellIndex(Math.floor(e.x), Math.floor(e.y))) ?? [])
        if (!s.broken && segDist(s, e.x, e.y) < def.size / 2 + 0.06) this.snap(s, e.x, e.y);
    }
  }

  /** Each new blast snaps every section within its radius, once. */
  private blast(sim: DefendSim) {
    for (const fx of sim.effects) {
      if (!this.firstSight(fx)) continue;
      for (const s of this.sections) if (!s.broken && segDist(s, fx.x, fx.y) < fx.r) this.snap(s, fx.x, fx.y, 2.2);
    }
    if (this.seenBlasts.size > BLAST_MEMORY) this.seenBlasts.clear();
  }

  /** True the first time a blast is seen, remembering it. */
  private firstSight(fx: Effect) {
    if (fx.kind !== "boom" || fx.seed === undefined || this.seenBlasts.has(fx.seed)) return false;
    this.seenBlasts.add(fx.seed);
    return true;
  }

  /** Splinters slide, spin and slow, and are gone at the end of their life. */
  private drift(dt: number) {
    const drag = Math.exp(-5 * dt);
    for (const p of this.splinters) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.rot += p.vr * dt;
      p.vr *= drag;
    }
    this.splinters = this.splinters.filter((p) => p.age < p.life);
  }

  /** Break a section: it bursts into splinters flung away from the cause. */
  snap(s: FenceSection, fromX: number, fromY: number, force = 1) {
    s.broken = true;
    const n = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = s.x1 + (s.x2 - s.x1) * t,
        y = s.y1 + (s.y2 - s.y1) * t;
      const d = Math.hypot(x - fromX, y - fromY) || 1;
      const speed = (0.8 + Math.random() * 1.6) * force;
      this.splinters.push({
        x,
        y,
        vx: ((x - fromX) / d) * speed + (Math.random() - 0.5) * 1.2,
        vy: ((y - fromY) / d) * speed + (Math.random() - 0.5) * 1.2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 18,
        len: 0.12 + Math.random() * 0.22,
        age: 0,
        life: 5 + Math.random() * 5,
        shade: Math.random(),
      });
    }
  }

  draw(c: CanvasRenderingContext2D, px: number) {
    const intact = this.sections.filter((s) => !s.broken);
    c.save();
    drawRails(c, px, intact);
    drawPosts(c, px, intact);
    for (const p of this.splinters) drawSplinter(c, px, p);
    c.restore();
  }
}

/** Rails: a dark outline with a lighter wooden top. */
function drawRails(c: CanvasRenderingContext2D, px: number, sections: FenceSection[]) {
  c.lineCap = "butt";
  const dark = Math.max(1, Math.round(px * 0.13)),
    light = Math.max(1, Math.round(px * 0.06));
  for (const [w, color] of [
    [dark, OUTLINE],
    [light, "#9a7648"],
  ] as const) {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    for (const s of sections) {
      c.moveTo(s.x1 * px, s.y1 * px);
      c.lineTo(s.x2 * px, s.y2 * px);
    }
    c.stroke();
  }
}

/** Posts at each end of an intact section. */
function drawPosts(c: CanvasRenderingContext2D, px: number, sections: FenceSection[]) {
  const post = Math.max(2, Math.round(px * 0.2));
  for (const s of sections)
    for (const [x, y] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ]) {
      const X = Math.round(x * px - post / 2),
        Y = Math.round(y * px - post / 2);
      c.fillStyle = OUTLINE;
      c.fillRect(X, Y, post, post);
      c.fillStyle = "#7a5a34";
      c.fillRect(X + 1, Y + 1, Math.max(1, post - 2), Math.max(1, post - 2));
    }
}

/** A splinter, fading out over its last couple of seconds. */
function drawSplinter(c: CanvasRenderingContext2D, px: number, p: Splinter) {
  c.globalAlpha = Math.min(1, (p.life - p.age) / 2);
  c.save();
  c.translate(p.x * px, p.y * px);
  c.rotate(p.rot);
  const L = p.len * px,
    W = Math.max(1, px * 0.06);
  c.fillStyle = OUTLINE;
  c.fillRect(-L / 2 - 0.5, -W / 2 - 0.5, L + 1, W + 1);
  c.fillStyle = p.shade < 0.5 ? "#9a7648" : "#b8925c";
  c.fillRect(-L / 2, -W / 2, L, W);
  c.restore();
}

function segDist(s: FenceSection, x: number, y: number) {
  const dx = s.x2 - s.x1,
    dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(s.x1 + dx * t - x, s.y1 + dy * t - y);
}
