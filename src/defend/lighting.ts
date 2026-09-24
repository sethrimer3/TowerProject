/** Torchlight for DEFEND's rainy and night-time battles, built on the main
 * game's candle palette, flicker and sway (see ../lighting.ts and
 * ../torch-light.ts).
 *
 * Each light's pool is baked once into a small field: radial falloff, cut by
 * every standing wall and building between the flame and the sample (that is
 * what makes buildings cast shadows), then softened. A tower's light ignores
 * its own building but is blocked by the four corner pillars holding up its
 * roof, so it throws four long shadows out into the street. Bakes are redone
 * only for lights near cells that fell or were rebuilt.
 *
 * Unit shadows stay cheap enough for hundreds of enemies: while baking, each
 * cell records its brightest light ("dominant light"). A unit's shadow is
 * then just a few small rects stepped away from that one light — no ray
 * casting per unit per frame. */
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "../lighting.ts";
import { glowColor, lightFalloff } from "../torch-light.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, ORTHO, cellIndex, hash, hash01, type Rect } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";

export type LightKind = "lantern" | "archerTower" | "cannonTower" | "watchTower" | "door";
export type Light = {
  id: number;
  kind: LightKind;
  /** Flame position in cells. */
  x: number;
  y: number;
  radius: number;
  strength: number;
  /** Building the light belongs to; it goes out while that building is down. */
  owner: number;
  /** The light sits inside its owner, so the owner's cells don't block it. */
  inside: boolean;
  /** Corner pillars that block the light (cells): x, y, radius. */
  pillars: [number, number, number][];
};

/** Samples per cell in a light field. */
const RES = 3;
const SWAY = LIGHTING_CONFIG.glow.swayOffset;

type Bake = {
  canvas: HTMLCanvasElement;
  values: Float32Array;
  cols: number;
  rows: number;
  /** Top-left of the field, in cells. */
  left: number;
  top: number;
};

/** Where the lights of a city go. Deterministic per map. */
export function cityLights(map: CityMap): Light[] {
  const lights: Light[] = [];
  const add = (l: Omit<Light, "id">) => lights.push({ ...l, id: lights.length });
  for (const b of map.buildings) {
    const r = b.rect;
    if (b.kind === "archerTower" || b.kind === "watchTower" || b.kind === "cannonTower") {
      const inset = 0.22;
      add({
        kind: b.kind,
        x: r.x + r.w / 2,
        y: r.y + r.h / 2,
        radius: b.kind === "archerTower" ? 7.5 : b.kind === "cannonTower" ? 5.5 : 6.5,
        strength: 1,
        owner: b.id,
        inside: true,
        pillars:
          b.kind === "archerTower"
            ? [
                [r.x + inset, r.y + inset, 0.2],
                [r.x + r.w - inset, r.y + inset, 0.2],
                [r.x + inset, r.y + r.h - inset, 0.2],
                [r.x + r.w - inset, r.y + r.h - inset, 0.2],
              ]
            : [],
      });
    } else if (b.kind === "keep") {
      // Braziers on the keep's four corners.
      for (const [cx, cy] of [
        [r.x - 0.3, r.y - 0.3],
        [r.x + r.w + 0.3, r.y - 0.3],
        [r.x - 0.3, r.y + r.h + 0.3],
        [r.x + r.w + 0.3, r.y + r.h + 0.3],
      ])
        add({ kind: "door", x: cx, y: cy, radius: 4.5, strength: 0.9, owner: b.id, inside: false, pillars: [] });
    } else if (b.kind === "barracks" || b.kind === "archerBarracks") {
      const door = doorPoint(map, r);
      if (door) add({ kind: "door", x: door.x, y: door.y, radius: 4.5, strength: 0.85, owner: b.id, inside: false, pillars: [] });
    }
  }
  // Street lanterns hung on house walls, spread along the roads.
  const candidates: { i: number; h: number }[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (map.type[i] === CellType.ROAD) candidates.push({ i, h: hash(i, 77) });
  candidates.sort((a, b) => a.h - b.h);
  const taken: { x: number; y: number }[] = lights.map((l) => ({ x: l.x, y: l.y }));
  for (const { i } of candidates) {
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    // Mount on a neighbouring house.
    let mount: [number, number, number] | null = null;
    for (const [dx, dy] of ORTHO) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
      const n = cellIndex(nx, ny);
      if (map.type[n] === CellType.HOUSE) {
        mount = [dx, dy, map.owner[n]];
        break;
      }
    }
    if (!mount) continue;
    const x = cx + 0.5 + mount[0] * 0.36,
      y = cy + 0.5 + mount[1] * 0.36;
    if (taken.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < 5.5 * 5.5)) continue;
    taken.push({ x, y });
    add({ kind: "lantern", x, y, radius: 5.6, strength: 0.95, owner: mount[2], inside: false, pillars: [] });
  }
  return lights;
}

function doorPoint(map: CityMap, r: Rect): { x: number; y: number } | null {
  for (let x = r.x; x < r.x + r.w; x++)
    for (const [y, dy] of [
      [r.y + r.h, 1],
      [r.y - 1, -1],
    ]) {
      if (y < 0 || y >= CELLS_H) continue;
      if (map.type[cellIndex(x, y)] === CellType.ROAD) return { x: r.x + r.w / 2, y: dy > 0 ? r.y + r.h + 0.25 : r.y - 0.25 };
    }
  return null;
}

/** Tiny road stones for the gravel texture and its torchlit relief. */
export type Stone = { x: number; y: number; s: number; shade: number };
export function roadStones(map: CityMap): Stone[] {
  const out: Stone[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (map.type[i] !== CellType.ROAD) continue;
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    const n = 2 + (hash(i, 5) % 3);
    for (let k = 0; k < n; k++)
      out.push({
        x: cx + 0.12 + hash01(i, k, 1) * 0.76,
        y: cy + 0.12 + hash01(i, k, 2) * 0.76,
        s: 0.09 + hash01(i, k, 3) * 0.09,
        shade: hash01(i, k, 4),
      });
  }
  return out;
}

export class DefendLighting {
  lights: Light[] = [];
  private map: CityMap | null = null;
  private stones: Stone[] = [];
  private bakes = new Map<number, [Bake, Bake] | null>();
  private queue = new Set<number>();
  /** Per cell: brightest light's id (-1 = none) and its level. */
  readonly domId = new Int32Array(CELL_COUNT).fill(-1);
  readonly domVal = new Float32Array(CELL_COUNT);
  private domDirty = true;
  private relief: HTMLCanvasElement | null = null;
  private reliefKey = "";
  private dark: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private flameSprite: HTMLCanvasElement | null = null;
  private torchSprite: HTMLCanvasElement | null = null;
  private dyn: HTMLCanvasElement | null = null;
  private ground: HTMLCanvasElement | null = null;
  private groundKey = "";

  /** Point the lighting at a (new) city. */
  setMap(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.lights = cityLights(map);
    this.stones = roadStones(map);
    this.bakes.clear();
    this.queue = new Set(this.lights.map((l) => l.id));
    this.domDirty = true;
    this.reliefKey = "";
  }

  get roadStones() {
    return this.stones;
  }

  /** Mark lights near changed cells for rebaking. */
  invalidate(cells: number[]) {
    if (!cells.length) return;
    const pts = [...new Set(cells)].map((c) => [(c % CELLS_W) + 0.5, Math.floor(c / CELLS_W) + 0.5]);
    for (const l of this.lights) {
      const r2 = (l.radius + 1) ** 2;
      if (pts.some(([x, y]) => (x - l.x) ** 2 + (y - l.y) ** 2 <= r2)) this.queue.add(l.id);
    }
  }

  /** Bake a few queued lights (spread over frames so a big collapse never
   * stalls a frame). */
  bakePending(solid: Uint8Array, budget = 6) {
    if (!this.map) return;
    for (const id of this.queue) {
      if (budget-- <= 0) break;
      this.queue.delete(id);
      const l = this.lights[id];
      this.bakes.set(id, [bakeLight(l, this.map, solid, -SWAY), bakeLight(l, this.map, solid, SWAY)]);
      this.domDirty = true;
    }
  }

  private active(l: Light, intact: (id: number) => boolean) {
    return intact(l.owner) && this.bakes.get(l.id);
  }

  private rebuildDominant(intact: (id: number) => boolean) {
    if (!this.domDirty) return;
    this.domDirty = false;
    this.domId.fill(-1);
    this.domVal.fill(0);
    for (const l of this.lights) {
      const pair = this.active(l, intact);
      if (!pair) continue;
      const b = pair[0];
      const x0 = Math.max(0, b.left),
        y0 = Math.max(0, b.top);
      const x1 = Math.min(CELLS_W, b.left + b.cols / RES),
        y1 = Math.min(CELLS_H, b.top + b.rows / RES);
      for (let cy = y0; cy < y1; cy++)
        for (let cx = x0; cx < x1; cx++) {
          const sx = (cx - b.left) * RES + (RES >> 1),
            sy = (cy - b.top) * RES + (RES >> 1);
          const v = b.values[sy * b.cols + sx] * l.strength;
          const i = cellIndex(cx, cy);
          if (v > this.domVal[i]) {
            this.domVal[i] = v;
            this.domId[i] = l.id;
          }
        }
    }
    this.reliefKey = "";
  }

  /** Fold building state into the lighting. Call once per frame. */
  update(solid: Uint8Array, changed: number[], intact: (id: number) => boolean) {
    this.invalidate(changed);
    this.bakePending(solid);
    // A light going out or coming back also changes who dominates.
    const onKey = this.lights.map((l) => (intact(l.owner) ? 1 : 0)).join("");
    if (onKey !== this.lastOn) {
      this.lastOn = onKey;
      this.domDirty = true;
    }
    this.rebuildDominant(intact);
  }
  private lastOn = "";

  /** Unit shadows, stepped away from each unit's dominant light. Batched by
   * opacity into a handful of fills, so it scales to hundreds of units. */
  drawUnitShadows(c: CanvasRenderingContext2D, px: number, units: { x: number; y: number; size: number }[], strength: number) {
    const buckets: number[][] = [[], [], [], []];
    for (const u of units) {
      const cx = Math.floor(u.x),
        cy = Math.floor(u.y);
      if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) continue;
      const i = cellIndex(cx, cy);
      const id = this.domId[i];
      const v = this.domVal[i];
      if (id < 0 || v < 0.06) continue;
      const l = this.lights[id];
      let dx = u.x - l.x,
        dy = u.y - l.y;
      const d = Math.hypot(dx, dy) || 0.01;
      dx /= d;
      dy /= d;
      const len = u.size * (0.7 + Math.min(1.6, d * 0.35));
      const bucket = Math.min(3, Math.floor(v * 4));
      buckets[bucket].push(u.x, u.y, dx, dy, len, u.size);
    }
    c.save();
    for (let b = 0; b < 4; b++) {
      const list = buckets[b];
      if (!list.length) continue;
      c.fillStyle = `rgba(0,0,0,${(0.18 + b * 0.1) * strength})`;
      c.beginPath();
      for (let k = 0; k < list.length; k += 6) {
        const [x, y, dx, dy, len, size] = list.slice(k, k + 6);
        for (const t of [0.35, 0.7, 1]) {
          const s = size * (1 - t * 0.25) * px;
          c.rect((x + dx * len * t) * px - s / 2, (y + dy * len * t) * px - s / 2, s, s);
        }
      }
      c.fill();
    }
    c.restore();
  }

  /** Darkness carved by light, then warm glow blended as light — the main
   * game's recipe. `ambient` is the overlay colour and opacity. */
  drawLight(
    c: CanvasRenderingContext2D,
    px: number,
    now: number,
    reduceMotion: boolean,
    intact: (id: number) => boolean,
    ambient: { color: string; alpha: number; glow: number },
    /** Hand torches carried by units; masked to open ground. */
    carried: { torches: { x: number; y: number; id: number; r?: number; k?: number }[]; solid: Uint8Array; version: number },
  ) {
    const W = c.canvas.width,
      H = c.canvas.height;
    this.dark = sized(this.dark, W, H);
    this.glow = sized(this.glow, W, H);
    const dk = this.dark.getContext("2d")!;
    const gl = this.glow.getContext("2d")!;
    dk.globalCompositeOperation = "source-over";
    dk.globalAlpha = 1;
    dk.clearRect(0, 0, W, H);
    dk.fillStyle = ambient.color;
    dk.globalAlpha = ambient.alpha;
    dk.fillRect(0, 0, W, H);
    gl.globalCompositeOperation = "source-over";
    gl.globalAlpha = 1;
    gl.clearRect(0, 0, W, H);
    dk.globalCompositeOperation = "destination-out";
    gl.globalCompositeOperation = "lighter";
    dk.imageSmoothingEnabled = gl.imageSmoothingEnabled = true;
    for (const l of this.lights) {
      const pair = this.active(l, intact);
      if (!pair) continue;
      const flicker = getTorchFlicker({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const lean = Math.max(0, Math.min(1, 0.5 + sway.x / (2 * LIGHTING_CONFIG.flicker.swayX)));
      const k = l.strength * flicker;
      for (const [b, w] of [
        [pair[0], 1 - lean],
        [pair[1], lean],
      ] as const) {
        if (w <= 0.01) continue;
        const x = b.left * px,
          y = (b.top + sway.y) * px,
          w2 = (b.cols / RES) * px,
          h2 = (b.rows / RES) * px;
        dk.globalAlpha = Math.min(1, 0.95 * k * w);
        dk.drawImage(b.canvas, x, y, w2, h2);
        gl.globalAlpha = Math.min(1, ambient.glow * k * w);
        gl.drawImage(b.canvas, x, y, w2, h2);
      }
    }
    this.drawCarried(dk, gl, px, now, reduceMotion, ambient.glow, carried);
    c.save();
    c.drawImage(this.dark, 0, 0);
    c.globalCompositeOperation = "soft-light";
    c.drawImage(this.glow, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = LIGHTING_CONFIG.glow.bloom;
    c.drawImage(this.glow, 0, 0);
    c.restore();
  }

  /** Units' hand torches: small unoccluded pools that move with them, so
   * they're drawn fresh each frame onto their own layer, clipped to open
   * ground (a torch in the street never lights a roof), then carved into the
   * darkness and added to the glow like the fixed lights. */
  private drawCarried(
    dk: CanvasRenderingContext2D,
    gl: CanvasRenderingContext2D,
    px: number,
    now: number,
    reduceMotion: boolean,
    glow: number,
    carried: { torches: { x: number; y: number; id: number; r?: number; k?: number }[]; solid: Uint8Array; version: number },
  ) {
    if (!carried.torches.length) return;
    const W = dk.canvas.width,
      H = dk.canvas.height;
    this.torchSprite ??= makeTorchSprite();
    this.dyn = sized(this.dyn, W, H);
    const d = this.dyn.getContext("2d")!;
    d.globalCompositeOperation = "source-over";
    d.globalAlpha = 1;
    d.clearRect(0, 0, W, H);
    d.globalCompositeOperation = "lighter";
    const R = CARRIED_RADIUS * px;
    for (const t of carried.torches) {
      const f = getTorchFlicker({ x: t.id * 11, y: t.id * 5 }, now, reduceMotion);
      // Explosion flashes pass their own reach and brightness.
      d.globalAlpha = Math.min(1, (t.k ?? 0.8) * f);
      const r = (t.r ? t.r * px : R) * (0.95 + (f - 1) * 0.6);
      d.drawImage(this.torchSprite, t.x * px - r, t.y * px - r, r * 2, r * 2);
    }
    d.globalAlpha = 1;
    d.globalCompositeOperation = "destination-in";
    d.drawImage(this.groundMask(carried.solid, carried.version, W, H, px), 0, 0);
    dk.globalCompositeOperation = "destination-out";
    dk.globalAlpha = 0.85;
    dk.drawImage(this.dyn, 0, 0);
    gl.globalCompositeOperation = "lighter";
    gl.globalAlpha = Math.min(1, glow * 0.8);
    gl.drawImage(this.dyn, 0, 0);
  }

  /** White wherever the ground is open (no standing building or wall). */
  private groundMask(solid: Uint8Array, version: number, W: number, H: number, px: number) {
    const key = `${version}:${W}x${H}`;
    if (key !== this.groundKey || !this.ground) {
      this.groundKey = key;
      this.ground = sized(this.ground, W, H);
      const g = this.ground.getContext("2d")!;
      g.clearRect(0, 0, W, H);
      g.fillStyle = "#fff";
      for (let cy = 0; cy < CELLS_H; cy++) {
        let run = -1;
        for (let cx = 0; cx <= CELLS_W; cx++) {
          const open = cx < CELLS_W && (!solid[cellIndex(cx, cy)] || (this.map?.owner[cellIndex(cx, cy)] ?? 0) < 0);
          if (open && run < 0) run = cx;
          if (!open && run >= 0) {
            g.fillRect(Math.floor(run * px), Math.floor(cy * px), Math.ceil((cx - run) * px) + 1, Math.ceil(px) + 1);
            run = -1;
          }
        }
      }
    }
    return this.ground;
  }

  /** Gravel catching the torchlight: each stone gets a bright lip on the
   * side facing its dominant light and a dark one on the far side. Baked
   * into one board-sized layer; redrawn when the lights change. */
  drawRelief(c: CanvasRenderingContext2D, px: number, alpha: number) {
    const W = c.canvas.width,
      H = c.canvas.height;
    const key = `${W}x${H}`;
    if (key !== this.reliefKey || !this.relief) {
      this.reliefKey = key;
      this.relief = sized(this.relief, W, H);
      const r = this.relief.getContext("2d")!;
      r.clearRect(0, 0, W, H);
      const lip = Math.max(1, px * 0.06);
      for (const st of this.stones) {
        const i = cellIndex(Math.floor(st.x), Math.floor(st.y));
        const id = this.domId[i];
        const v = this.domVal[i];
        if (id < 0 || v < 0.05) continue;
        const l = this.lights[id];
        let dx = l.x - st.x,
          dy = l.y - st.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        const s = st.s * px;
        const x = st.x * px,
          y = st.y * px;
        r.fillStyle = `rgba(255,226,170,${Math.min(0.9, v * 1.1)})`;
        r.fillRect(x + dx * s * 0.5 - lip / 2, y + dy * s * 0.5 - lip / 2, lip, lip);
        r.fillStyle = `rgba(0,0,0,${Math.min(0.8, v)})`;
        r.fillRect(x - dx * s * 0.6 - lip / 2, y - dy * s * 0.6 - lip / 2, lip, lip);
      }
    }
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(this.relief!, 0, 0);
    c.restore();
  }

  /** Flames: lantern hoods, tower braziers — a hot flickering core. */
  drawFlames(c: CanvasRenderingContext2D, px: number, now: number, reduceMotion: boolean, intact: (id: number) => boolean) {
    this.flameSprite ??= makeFlameSprite();
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const l of this.lights) {
      if (!this.active(l, intact)) continue;
      const f = getTorchFlicker({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const r = px * (l.kind === "lantern" || l.kind === "door" ? 0.9 : 1.4) * f;
      c.globalAlpha = Math.min(1, 0.7 * f);
      c.drawImage(this.flameSprite, (l.x + sway.x) * px - r, (l.y + sway.y) * px - r, r * 2, r * 2);
    }
    c.restore();
    // A pixel of actual flame on top.
    const s = Math.max(1, px * 0.18);
    for (const l of this.lights) {
      if (!this.active(l, intact)) continue;
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      c.fillStyle = "#ffe6a8";
      c.fillRect((l.x + sway.x) * px - s / 2, (l.y + sway.y * 0.5) * px - s / 2, s, s * sway.stretch);
    }
  }
}

function sized(cv: HTMLCanvasElement | null, w: number, h: number) {
  const c = cv ?? document.createElement("canvas");
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

/** Reach of a unit's hand torch, in cells. */
const CARRIED_RADIUS = 2.4;

/** A soft pool in the candle palette, for hand torches. */
function makeTorchSprite() {
  const n = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const v = lightFalloff(d, 1);
      if (v <= 0) continue;
      const [r, g, b] = glowColor(v);
      const k = (y * n + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = v * 255;
    }
  c.putImageData(img, 0, 0);
  return cv;
}

function makeFlameSprite() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,230,170,0.95)");
  g.addColorStop(0.3, "rgba(255,170,80,0.45)");
  g.addColorStop(1, "rgba(255,120,40,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return cv;
}

/** Bake one light's pool with occlusion (optionally nudged sideways). */
function bakeLight(l: Light, map: CityMap, solid: Uint8Array, offsetX: number): Bake {
  const R = l.radius;
  const left = Math.floor(l.x - R - 1),
    top = Math.floor(l.y - R - 1);
  const size = Math.ceil(R * 2 + 3);
  const cols = size * RES,
    rows = size * RES;
  const ox = l.x + offsetX,
    oy = l.y;
  const raw = new Float32Array(cols * rows);
  const blocks = (i: number) => solid[i] === 1 && map.owner[i] >= 0 && !(l.inside && map.owner[i] === l.owner);
  for (let sy = 0; sy < rows; sy++) {
    const wy = top + (sy + 0.5) / RES;
    for (let sx = 0; sx < cols; sx++) {
      const wx = left + (sx + 0.5) / RES;
      const d = Math.hypot(wx - ox, wy - oy);
      if (d >= R || wx < 0 || wy < 0 || wx >= CELLS_W || wy >= CELLS_H) continue;
      const tcx = Math.floor(wx),
        tcy = Math.floor(wy);
      // March from the flame; the first solid cell other than the sample's
      // own cell casts the shadow (so building faces toward the light glow).
      const steps = Math.ceil(d / 0.2);
      let lit = true;
      for (let k = 1; k < steps; k++) {
        const px = ox + ((wx - ox) * k) / steps,
          py = oy + ((wy - oy) * k) / steps;
        const cx = Math.floor(px),
          cy = Math.floor(py);
        if (cx === tcx && cy === tcy) break;
        if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) continue;
        if (blocks(cellIndex(cx, cy))) {
          lit = false;
          break;
        }
      }
      if (lit)
        for (const [px, py, pr] of l.pillars)
          if (segmentPointDist(ox, oy, wx, wy, px, py) < pr && Math.hypot(px - ox, py - oy) < d) {
            lit = false;
            break;
          }
      if (lit) raw[sy * cols + sx] = lightFalloff(d, R);
    }
  }
  const values = blur(raw, cols, rows);
  // Light lands on open ground only: standing buildings and wall stones stay
  // unlit, so flames read as street-level, never hovering above the roofs.
  for (let sy = 0; sy < rows; sy++) {
    const cy = Math.floor(top + (sy + 0.5) / RES);
    for (let sx = 0; sx < cols; sx++) {
      const cx = Math.floor(left + (sx + 0.5) / RES);
      if (cx >= 0 && cy >= 0 && cx < CELLS_W && cy < CELLS_H && solid[cellIndex(cx, cy)] && map.owner[cellIndex(cx, cy)] >= 0) values[sy * cols + sx] = 0;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cols, rows);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v <= 0.003) continue;
    const [r, g, b] = glowColor(v);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.min(255, v * 255);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, values, cols, rows, left, top };
}

function segmentPointDist(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + dx * t - px, ay + dy * t - py);
}

/** One 3×3 box-blur pass: softens occlusion edges into penumbras. */
function blur(src: Float32Array, cols: number, rows: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let acc = 0,
        n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
          acc += src[yy * cols + xx];
          n++;
        }
      out[y * cols + x] = acc / n;
    }
  return out;
}
