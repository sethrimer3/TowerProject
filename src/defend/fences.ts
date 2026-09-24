/** Thin wooden fences along the street sides of some parks. Purely
 * decorative — nothing is blocked by them — but enemies that walk across a
 * section (or a blast next to it) snap it: it splinters into pieces that
 * scatter, settle on the ground and fade away after 5–10 seconds. Fences
 * live only in the renderer and are rebuilt fresh for every city/run. */
import { CELL_COUNT, CELLS_H, CELLS_W, ORTHO, cellIndex, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { ENEMIES } from "./catalog.ts";
import type { DefendSim } from "./sim.ts";

/** One cell-long section of fence, in cell coordinates. */
export type FenceSection = { x1: number; y1: number; x2: number; y2: number; broken: boolean };
type Splinter = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; len: number; age: number; life: number; shade: number };

/** How far inside the park edge the fence runs (cells). */
const INSET = 0.12;
/** Share of parks that are fenced. */
const FENCED = 0.6;

export function parkFences(map: CityMap): FenceSection[] {
  const out: FenceSection[] = [];
  const isPark = (i: number) => map.type[i] === CellType.PARK || map.type[i] === CellType.WATER;
  const region = new Int32Array(CELL_COUNT).fill(-1);
  let id = 0;
  for (let start = 0; start < CELL_COUNT; start++) {
    if (!isPark(start) || region[start] >= 0) continue;
    // Flood the whole park (grass and pond together).
    const cells = [start];
    region[start] = id;
    for (let h = 0; h < cells.length; h++) {
      const x = cells[h] % CELLS_W,
        y = (cells[h] - x) / CELLS_W;
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
        const n = cellIndex(nx, ny);
        if (isPark(n) && region[n] < 0) {
          region[n] = id;
          cells.push(n);
        }
      }
    }
    id++;
    if (cells.length < 4 || hash01(start, 91) > FENCED) continue;
    // Street-facing edges of grass cells get a fence section.
    const sections: FenceSection[] = [];
    for (const c of cells) {
      if (map.type[c] !== CellType.PARK) continue;
      const x = c % CELLS_W,
        y = (c - x) / CELLS_W;
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H || map.type[cellIndex(nx, ny)] !== CellType.ROAD) continue;
        if (dy === -1) sections.push({ x1: x, y1: y + INSET, x2: x + 1, y2: y + INSET, broken: false });
        else if (dy === 1) sections.push({ x1: x, y1: y + 1 - INSET, x2: x + 1, y2: y + 1 - INSET, broken: false });
        else if (dx === -1) sections.push({ x1: x + INSET, y1: y, x2: x + INSET, y2: y + 1, broken: false });
        else sections.push({ x1: x + 1 - INSET, y1: y, x2: x + 1 - INSET, y2: y + 1, broken: false });
      }
    }
    // Leave one section open as a gate.
    if (sections.length > 2) sections.splice(Math.floor(hash01(start, 92) * sections.length), 1);
    out.push(...sections);
  }
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
    for (const s of this.sections) {
      const mx = (s.x1 + s.x2) / 2,
        my = (s.y1 + s.y2) / 2;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = Math.floor(mx) + dx,
            cy = Math.floor(my) + dy;
          if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) continue;
          const k = cellIndex(cx, cy);
          const list = this.byCell.get(k);
          if (list) list.push(s);
          else this.byCell.set(k, [s]);
        }
    }
  }

  /** Trample and blast fences, and move the splinters along in sim time. */
  update(sim: DefendSim) {
    const dt = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.5, sim.time - this.lastTime));
    this.lastTime = sim.time;
    for (const e of sim.enemies) {
      const def = ENEMIES[e.kind];
      if (def.flying) continue;
      const list = this.byCell.get(cellIndex(Math.floor(e.x), Math.floor(e.y)));
      if (!list) continue;
      for (const s of list)
        if (!s.broken && segDist(s, e.x, e.y) < def.size / 2 + 0.06) this.snap(s, e.x, e.y);
    }
    for (const fx of sim.effects) {
      if (fx.kind !== "boom" || fx.seed === undefined || this.seenBlasts.has(fx.seed)) continue;
      this.seenBlasts.add(fx.seed);
      for (const s of this.sections) if (!s.broken && segDist(s, fx.x, fx.y) < fx.r) this.snap(s, fx.x, fx.y, 2.2);
    }
    if (this.seenBlasts.size > 200) this.seenBlasts.clear();
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
      let dx = x - fromX,
        dy = y - fromY;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const speed = (0.8 + Math.random() * 1.6) * force;
      this.splinters.push({
        x,
        y,
        vx: dx * speed + (Math.random() - 0.5) * 1.2,
        vy: dy * speed + (Math.random() - 0.5) * 1.2,
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
    const dark = Math.max(1, Math.round(px * 0.13)),
      light = Math.max(1, Math.round(px * 0.06));
    // Rails: a dark outline with a lighter wooden top.
    c.save();
    c.lineCap = "butt";
    for (const [w, color] of [
      [dark, "#1c140c"],
      [light, "#9a7648"],
    ] as const) {
      c.strokeStyle = color;
      c.lineWidth = w;
      c.beginPath();
      for (const s of this.sections) {
        if (s.broken) continue;
        c.moveTo(s.x1 * px, s.y1 * px);
        c.lineTo(s.x2 * px, s.y2 * px);
      }
      c.stroke();
    }
    // Posts at each end of an intact section.
    const post = Math.max(2, Math.round(px * 0.2));
    for (const s of this.sections) {
      if (s.broken) continue;
      for (const [x, y] of [
        [s.x1, s.y1],
        [s.x2, s.y2],
      ]) {
        const X = Math.round(x * px - post / 2),
          Y = Math.round(y * px - post / 2);
        c.fillStyle = "#1c140c";
        c.fillRect(X, Y, post, post);
        c.fillStyle = "#7a5a34";
        c.fillRect(X + 1, Y + 1, Math.max(1, post - 2), Math.max(1, post - 2));
      }
    }
    // Splinters, fading out over their last couple of seconds.
    for (const p of this.splinters) {
      const fade = Math.min(1, (p.life - p.age) / 2);
      c.globalAlpha = fade;
      c.save();
      c.translate(p.x * px, p.y * px);
      c.rotate(p.rot);
      const L = p.len * px,
        W = Math.max(1, px * 0.06);
      c.fillStyle = "#1c140c";
      c.fillRect(-L / 2 - 0.5, -W / 2 - 0.5, L + 1, W + 1);
      c.fillStyle = p.shade < 0.5 ? "#9a7648" : "#b8925c";
      c.fillRect(-L / 2, -W / 2, L, W);
      c.restore();
    }
    c.restore();
  }
}

function segDist(s: FenceSection, x: number, y: number) {
  const dx = s.x2 - s.x1,
    dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(s.x1 + dx * t - x, s.y1 + dy * t - y);
}
