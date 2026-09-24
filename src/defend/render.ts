/** Canvas renderer for DEFEND. The city (ground, streets, houses, walls) is
 * painted once into an offscreen layer and only repainted when a building
 * falls or is rebuilt; units, projectiles and overlays are drawn each frame. */
import { CELLS_H, CELLS_W, SPAWN_ROW, SUB, TILES_H, TILES_W, cellIndex, hash, hash01, tileKey, type Rect } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { ARCHER_UNIT, ENEMIES, SOLDIER, CIVILIAN, watchRadius, type StructureKind } from "./catalog.ts";
import { BUILDING_FLASH, center, type DefendSim } from "./sim.ts";
import { DefendLighting } from "./lighting.ts";
import { Rain, ambientFor, type Weather } from "./weather.ts";

const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const floorImages: HTMLImageElement[] = [];
const floorListeners = new Set<() => void>();
/** Wall art is cut from two hand-drawn sprites (see paintWall). */
const wallArt: { cap?: HTMLImageElement; face?: HTMLImageElement } = {};
function loadImage(name: string) {
  const img = new Image();
  img.onload = () => floorListeners.forEach((f) => f());
  img.src = `${ASSET_BASE}assets/defend/${name}.png`;
  return img;
}
function loadFloors() {
  if (floorImages.length || typeof Image === "undefined") return;
  for (let i = 1; i <= 4; i++) floorImages.push(loadImage(`floor-${i}`));
  wallArt.cap = loadImage("wall-cap");
  wallArt.face = loadImage("wall-face");
}
const ready = (img?: HTMLImageElement): img is HTMLImageElement => !!img?.complete && !!img.naturalWidth;

/** The mossy flagstone floor tiles (floor-1..4.png) specifically: drawn in
 * their PNG orientation (rotating them made the baked-in lighting look
 * wrong) and grown 15% past their tile so the gaps between them close up. */
const FLOOR_TILE_SCALE = 1.15;

/** Wall sprites, in source pixels. wall-cap.png holds a vertical run of
 * mossy cap stones at x 38–54, lit from the left; each wall cell shows a
 * 16 px window of it, continuing down the run. wall-face.png holds the dark
 * brick face, hung below any wall stone with open ground to its south. */
const CAP = { x: 38, w: 16, y0: 1, span: 62 };
const FACE = { x0: 8, span: 64, y: 44, h: 14 };

const ROOFS = ["#9a5140", "#7d5b43", "#626c78", "#8f6f3f", "#744c5e", "#56705f"];
const ROAD = "#5f584d";
const PARK = "#3c5d31";
const RUBBLE = "#4a443d";
const WALL = "#8e897c";

export type Overlay = {
  /** Tile keys that accept the dragged item. */
  legal: Set<string>;
  hover: string | null;
  ghost: { rect: Rect; kind: StructureKind | "cityTile" } | null;
  /** A bomb being aimed: centre in cells. */
  bomb?: { x: number; y: number; r: number } | null;
};

export type DrawOptions = {
  /** Show the (dim, gold) tile grid — while the player is editing. */
  grid: boolean;
  weather: Weather | null;
  /** How far night has fallen, 0–1 (boss waves). */
  night: number;
  now: number;
  reduceMotion: boolean;
};

export class DefendRenderer {
  readonly lighting = new DefendLighting();
  private rain = new Rain();
  private lastNow = 0;
  /** Camera: zoom `s` and translation (canvas pixels) applied to the whole
   * board. s = 1 shows everything; the view is clamped to the board. */
  readonly cam = { s: 1, x: 0, y: 0 };
  static readonly MAX_ZOOM = 4;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private layerKey = "";
  private map: CityMap | null = null;
  px = 8;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.layer = document.createElement("canvas");
    this.lctx = this.layer.getContext("2d")!;
    loadFloors();
    floorListeners.add(() => (this.layerKey = ""));
  }

  /** Size the backing store to `cssWidth` CSS pixels (height follows 9:13). */
  resize(cssWidth: number) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(CELLS_W, Math.round(cssWidth * dpr));
    const h = Math.round((w * CELLS_H) / CELLS_W);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${(cssWidth * CELLS_H) / CELLS_W}px`;
      this.layerKey = "";
    }
    this.px = w / CELLS_W;
    this.clampCam();
  }

  /** Client (CSS) point → canvas pixels. */
  private toCanvas(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * this.canvas.width, y: ((clientY - r.top) / r.height) * this.canvas.height };
  }

  /** Client point → board position in cells (through the camera). */
  toCell(clientX: number, clientY: number) {
    const p = this.toCanvas(clientX, clientY);
    return { fx: (p.x - this.cam.x) / this.cam.s / this.px, fy: (p.y - this.cam.y) / this.cam.s / this.px };
  }

  /** Zoom by `factor`, keeping the board point under the client point fixed. */
  zoomAt(clientX: number, clientY: number, factor: number) {
    const p = this.toCanvas(clientX, clientY);
    const s = Math.max(1, Math.min(DefendRenderer.MAX_ZOOM, this.cam.s * factor));
    const k = s / this.cam.s;
    this.cam.x = p.x - (p.x - this.cam.x) * k;
    this.cam.y = p.y - (p.y - this.cam.y) * k;
    this.cam.s = s;
    this.clampCam();
  }

  /** Pan by a client-pixel delta. */
  panBy(dx: number, dy: number) {
    const r = this.canvas.getBoundingClientRect();
    this.cam.x += (dx / r.width) * this.canvas.width;
    this.cam.y += (dy / r.height) * this.canvas.height;
    this.clampCam();
  }

  resetCam() {
    this.cam.s = 1;
    this.cam.x = this.cam.y = 0;
  }

  private clampCam() {
    const W = this.canvas.width,
      H = this.canvas.height;
    this.cam.x = Math.min(0, Math.max(W - W * this.cam.s, this.cam.x));
    this.cam.y = Math.min(0, Math.max(H - H * this.cam.s, this.cam.y));
  }

  draw(map: CityMap, sim: DefendSim | null, overlay: Overlay | null, opts: DrawOptions) {
    const key = `${this.canvas.width}:${sim ? sim.mapVersion : -1}`;
    if (map !== this.map || key !== this.layerKey) {
      this.map = map;
      this.layerKey = key;
      this.lighting.setMap(map);
      this.paintLayer(map, sim);
    }
    const dt = this.lastNow ? (opts.now - this.lastNow) / 1000 : 0;
    this.lastNow = opts.now;
    const ctx = this.ctx;
    const px = this.px;
    ctx.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.x, this.cam.y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.layer, 0, 0);
    // Battles are always under cloud, so the city's lights are always lit.
    const weather = sim ? opts.weather : null;
    const lit = !!weather;
    const intact = (id: number) => !sim || sim.intact(map.buildings[id]);
    if (sim) {
      const changed = sim.changed.splice(0);
      if (lit) this.lighting.update(sim.solid, changed, intact);
      else if (changed.length) this.lighting.invalidate(changed);
      this.drawDamage(sim);
      if (lit) {
        const units = [
          ...sim.soldiers.map((u) => ({ x: u.x, y: u.y, size: u.kind === "archer" ? ARCHER_UNIT.size : SOLDIER.size })),
          ...sim.civilians.map((u) => ({ x: u.x, y: u.y, size: CIVILIAN.size })),
          ...sim.enemies.filter((e) => !ENEMIES[e.kind].flying).map((e) => ({ x: e.x, y: e.y, size: ENEMIES[e.kind].size })),
        ];
        this.lighting.drawUnitShadows(ctx, px, units, 0.8 + 0.2 * opts.night);
      }
    }
    if (weather) Rain.overcast(ctx, weather.rain ? 0.3 : 0.18);
    if (lit && sim) {
      const torches: { x: number; y: number; id: number; r?: number; k?: number }[] = [...sim.soldiers, ...sim.civilians].map((u) => ({ x: u.x, y: u.y, id: u.id }));
      // Explosions light up their surroundings for a moment.
      for (const fx of sim.effects)
        if (fx.kind === "boom") torches.push({ x: fx.x, y: fx.y, id: fx.seed ?? 0, r: fx.r * 2.4, k: 1.6 * (1 - fx.t / 0.6) });
      this.lighting.drawLight(ctx, px, opts.now, opts.reduceMotion, intact, ambientFor(weather!, opts.night), {
        torches,
        solid: sim.solid,
        version: sim.mapVersion,
      });
      this.lighting.drawRelief(ctx, px, weather!.rain ? 0.85 : 0.65);
      this.lighting.drawFlames(ctx, px, opts.now, opts.reduceMotion, intact);
    }
    if (sim) {
      this.drawScorches(sim);
      this.drawUnits(sim, lit);
    }
    if (opts.grid) this.drawGrid(overlay ? 0.2 : 0.11);
    if (overlay) this.drawOverlay(overlay);
    // Rain falls in screen space, in front of the camera.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (weather?.rain) {
      this.rain.update(dt, this.canvas.width, this.canvas.height);
      this.rain.draw(ctx, px);
    }
  }

  /** Dim gold tile lines, shown only while the player is editing. */
  private drawGrid(alpha: number) {
    const c = this.ctx;
    const T = this.px * SUB;
    c.save();
    c.strokeStyle = `rgba(216,181,114,${alpha})`;
    c.lineWidth = 1;
    c.beginPath();
    for (let tx = 1; tx < TILES_W; tx++) {
      const x = Math.round(tx * T) + 0.5;
      c.moveTo(x, 0);
      c.lineTo(x, this.canvas.height);
    }
    for (let ty = 1; ty < TILES_H; ty++) {
      const y = Math.round(ty * T) + 0.5;
      c.moveTo(0, y);
      c.lineTo(this.canvas.width, y);
    }
    c.stroke();
    c.restore();
  }

  // ── Static layer ──────────────────────────────────────────────────────
  private paintLayer(map: CityMap, sim: DefendSim | null) {
    const L = this.layer;
    L.width = this.canvas.width;
    L.height = this.canvas.height;
    const c = this.lctx;
    const px = this.px;
    const T = px * SUB;
    c.imageSmoothingEnabled = false;
    // Very dark grey shows in the gaps around the flagstone sprites.
    c.fillStyle = "#17181b";
    c.fillRect(0, 0, L.width, L.height);
    // Ground: the mossy flagstones, one randomly turned tile per board tile.
    for (let ty = 0; ty < TILES_H; ty++)
      for (let tx = 0; tx < TILES_W; tx++) {
        const img = floorImages[hash(tx, ty, 3) % 4];
        const x = Math.floor(tx * T),
          y = Math.floor(ty * T),
          s = Math.ceil(T) + 1;
        if (ready(img)) {
          // Mossy floor tiles only: unrotated, grown 15% about their centre.
          const g = s * FLOOR_TILE_SCALE;
          c.drawImage(img, x + (s - g) / 2, y + (s - g) / 2, g, g);
        } else {
          c.fillStyle = "#2c3a26";
          c.fillRect(x, y, s, s);
        }
      }
    // The spawn lane reads as darker, hostile ground.
    const g = c.createLinearGradient(0, 0, 0, T * (SPAWN_ROW + 1));
    g.addColorStop(0, "rgba(40,6,6,0.55)");
    g.addColorStop(1, "rgba(20,0,0,0.25)");
    c.fillStyle = g;
    c.fillRect(0, 0, L.width, T * (SPAWN_ROW + 1));

    const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
    // City ground.
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) {
        const i = cellIndex(cx, cy);
        const t = map.type[i];
        if (t === CellType.OUT) continue;
        const x = cx * px,
          y = cy * px;
        if (t === CellType.PARK) {
          c.fillStyle = PARK;
          c.fillRect(x, y, px + 0.5, px + 0.5);
          if (hash01(cx, cy, 21) < 0.45) {
            c.fillStyle = hash01(cx, cy, 22) < 0.5 ? "#2c4a25" : "#476d38";
            const r = px * (0.22 + hash01(cx, cy, 23) * 0.15);
            c.beginPath();
            c.arc(x + px * (0.3 + hash01(cx, cy, 24) * 0.4), y + px * (0.3 + hash01(cx, cy, 25) * 0.4), r, 0, Math.PI * 2);
            c.fill();
          }
        } else if (t !== CellType.WALL || !solid(i)) {
          c.fillStyle = map.owner[i] >= 0 && !solid(i) ? RUBBLE : ROAD;
          c.fillRect(x, y, px + 0.5, px + 0.5);
          // Gravel: fine grit speckle.
          const grit = Math.max(1, px * 0.07);
          for (let k = 0; k < 6; k++) {
            const h = hash01(cx, cy, 60 + k);
            c.fillStyle = h < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,240,215,0.07)";
            c.fillRect(x + hash01(cx, cy, 70 + k) * (px - grit), y + hash01(cx, cy, 80 + k) * (px - grit), grit, grit);
          }
        }
      }
    // Road stones, with a darker underside so they sit in the gravel.
    for (const st of this.lighting.roadStones) {
      const s = Math.max(1, st.s * px);
      const x = st.x * px - s / 2,
        y = st.y * px - s / 2;
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.fillRect(x + s * 0.3, y + s * 0.35, s, s);
      c.fillStyle = st.shade < 0.33 ? "#7a7266" : st.shade < 0.66 ? "#6b645a" : "#857c6d";
      c.fillRect(x, y, s, s);
    }
    // Buildings.
    for (const b of map.buildings) this.paintBuilding(c, b, sim, solid);
    // Lantern brackets on house walls (lit during battles).
    for (const l of this.lighting.lights) {
      if (l.kind !== "lantern" && l.kind !== "door") continue;
      if (sim && !sim.intact(map.buildings[l.owner])) continue;
      const s = Math.max(2, px * 0.28);
      c.fillStyle = "#2b2622";
      c.fillRect(l.x * px - s / 2, l.y * px - s / 2, s, s);
      c.fillStyle = "#8a7045";
      c.fillRect(l.x * px - s / 4, l.y * px - s / 4, s / 2, s / 2);
    }
    // Rubble chunks.
    for (let i = 0; i < map.type.length; i++) {
      if (map.owner[i] < 0 || solid(i)) continue;
      const cx = i % CELLS_W,
        cy = (i - cx) / CELLS_W;
      for (let k = 0; k < 3; k++) {
        c.fillStyle = k === 0 ? "#6b645a" : "#57514a";
        const s = px * (0.14 + hash01(i, k, 41) * 0.16);
        c.fillRect(cx * px + hash01(i, k, 42) * (px - s), cy * px + hash01(i, k, 43) * (px - s), s, s);
      }
    }
  }

  /** One wall stone. Edges and the hanging brick face follow the *standing*
   * wall, so a breach gets proper broken edges. */
  private paintWall(c: CanvasRenderingContext2D, cx: number, cy: number, solid: (i: number) => boolean) {
    const px = this.px;
    const x = cx * px,
      y = cy * px;
    const standing = (dx: number, dy: number) => {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) return false;
      const i = cellIndex(nx, ny);
      return this.map!.wall[i] === 1 && solid(i);
    };
    if (ready(wallArt.cap)) {
      const sy = CAP.y0 + ((cy * CAP.w + cx * 37) % CAP.span);
      c.drawImage(wallArt.cap, CAP.x, sy, CAP.w, CAP.w, x, y, px + 0.5, px + 0.5);
    } else {
      c.fillStyle = WALL;
      c.fillRect(x, y, px + 0.5, px + 0.5);
    }
    const e = Math.max(1, px * 0.12);
    c.fillStyle = "rgba(0,0,0,0.35)";
    if (!standing(1, 0)) c.fillRect(x + px - e, y, e, px);
    if (!standing(-1, 0)) c.fillRect(x, y, e, px);
    c.fillStyle = "rgba(255,255,255,0.1)";
    if (!standing(0, -1)) c.fillRect(x, y, px, e);
    // The wall's south face, seen from above at a slant.
    if (!standing(0, 1) && cy + 1 < CELLS_H) {
      const h = px * 0.45;
      if (ready(wallArt.face)) {
        const sx = FACE.x0 + ((cx * CAP.w) % FACE.span);
        c.drawImage(wallArt.face, sx, FACE.y, CAP.w, FACE.h, x, y + px, px + 0.5, h);
      } else {
        c.fillStyle = "#3a3a33";
        c.fillRect(x, y + px, px + 0.5, h);
      }
      c.fillStyle = "rgba(0,0,0,0.3)";
      c.fillRect(x, y + px + h - e, px + 0.5, e);
    }
  }

  private paintBuilding(c: CanvasRenderingContext2D, b: Building, sim: DefendSim | null, solid: (i: number) => boolean) {
    const px = this.px;
    const r = b.rect;
    const intact = !sim || sim.intact(b);
    if (b.kind === "wall") {
      if (solid(b.cells[0])) this.paintWall(c, r.x, r.y, solid);
      return;
    }
    if (!intact) {
      // Partially rebuilt: finished sections show as fresh timber framing.
      for (const i of b.cells) {
        if (!solid(i)) continue;
        const cx = i % CELLS_W,
          cy = (i - cx) / CELLS_W;
        c.fillStyle = "#9c8356";
        c.fillRect(cx * px + 1, cy * px + 1, px - 2, px - 2);
        c.strokeStyle = "#5b4a2e";
        c.lineWidth = Math.max(1, px * 0.08);
        c.strokeRect(cx * px + 1.5, cy * px + 1.5, px - 3, px - 3);
      }
      return;
    }
    const x = r.x * px,
      y = r.y * px,
      w = r.w * px,
      h = r.h * px;
    const inset = Math.max(1, px * 0.1);
    // Drop shadow.
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(x + inset + px * 0.12, y + inset + px * 0.14, w - inset * 2, h - inset * 2);
    if (b.kind === "house") {
      const roof = ROOFS[b.variant % ROOFS.length];
      c.fillStyle = "rgba(0,0,0,0.4)";
      c.fillRect(x + inset - 1, y + inset - 1, w - inset * 2 + 2, h - inset * 2 + 2);
      c.fillStyle = roof;
      c.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
      // Ridge along the long axis, lighter slope on one side.
      c.fillStyle = "rgba(255,255,255,0.13)";
      if (r.w >= r.h) c.fillRect(x + inset, y + inset, w - inset * 2, (h - inset * 2) / 2);
      else c.fillRect(x + inset, y + inset, (w - inset * 2) / 2, h - inset * 2);
      c.fillStyle = "rgba(0,0,0,0.25)";
      if (r.w >= r.h) c.fillRect(x + inset, y + h / 2 - 0.5, w - inset * 2, Math.max(1, px * 0.07));
      else c.fillRect(x + w / 2 - 0.5, y + inset, Math.max(1, px * 0.07), h - inset * 2);
      return;
    }
    paintStructureArt(c, b.kind, x, y, w, h, px);
  }

  // ── Dynamic layer ─────────────────────────────────────────────────────
  private drawDamage(sim: DefendSim) {
    const c = this.ctx;
    const px = this.px;
    // Struck buildings flash pale for a moment.
    for (const b of sim.map.buildings) {
      const f = sim.flash[b.id];
      if (f <= 0 || !sim.intact(b)) continue;
      const r = b.rect;
      c.fillStyle = `rgba(255,244,220,${(f / BUILDING_FLASH) * 0.55})`;
      c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
    }
    // Damage: darken hurt buildings; bars over structures.
    for (const b of sim.map.buildings) {
      const hp = sim.hp[b.id],
        max = sim.maxHp[b.id];
      if (!sim.intact(b) || hp >= max) continue;
      const r = b.rect;
      const frac = hp / max;
      if (b.kind === "house" || b.kind === "wall") {
        c.fillStyle = `rgba(20,10,5,${(1 - frac) * 0.5})`;
        c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
      } else {
        const bw = r.w * px,
          bh = Math.max(2, px * 0.22);
        c.fillStyle = "rgba(0,0,0,0.7)";
        c.fillRect(r.x * px, r.y * px - bh - 1, bw, bh);
        c.fillStyle = frac > 0.5 ? "#8fcf6a" : frac > 0.25 ? "#e3b14c" : "#d9635a";
        c.fillRect(r.x * px, r.y * px - bh - 1, bw * frac, bh);
      }
    }
  }

  /** The flame of a unit's hand torch: a flickering pixel or two. */
  private drawHandTorch(x: number, y: number, id: number, t: number) {
    const c = this.ctx;
    const s = Math.max(1, this.px * 0.14);
    const f = Math.sin(t * 17 + id * 1.7) * 0.5 + 0.5;
    c.fillStyle = "#5a3b1e";
    c.fillRect(x * this.px - s / 2, y * this.px, s, s * 1.6);
    c.fillStyle = f > 0.5 ? "#ffe6a8" : "#ffb35c";
    c.fillRect(x * this.px - s / 2, y * this.px - s * (1 + f * 0.5), s, s * (1 + f * 0.5));
  }

  private drawUnits(sim: DefendSim, torches: boolean) {
    const c = this.ctx;
    const px = this.px;
    // Watch-tower radii, very faint.
    c.strokeStyle = "rgba(242,210,122,0.16)";
    c.lineWidth = Math.max(1, px * 0.08);
    for (const b of sim.map.buildings) {
      if (b.kind !== "watchTower" || !sim.intact(b)) continue;
      const p = center(b.rect);
      c.beginPath();
      c.arc(p.x * px, p.y * px, watchRadius(sim.levels.watchRadius) * px, 0, Math.PI * 2);
      c.stroke();
    }
    // Civilians.
    for (const u of sim.civilians) {
      const s = Math.max(2, CIVILIAN.size * px);
      c.fillStyle = u.flash > 0 ? "#fff" : CIVILIAN.color;
      c.fillRect(u.x * px - s / 2, u.y * px - s / 2, s, s);
      if (torches) this.drawHandTorch(u.x + CIVILIAN.size * 0.6, u.y - CIVILIAN.size * 0.4, u.id, sim.time);
      if (u.state === "working" && Math.floor(sim.time * 6) % 2) {
        c.fillStyle = "#f2d27a";
        c.fillRect(u.x * px + s / 2, u.y * px - s, Math.max(1, s / 2), Math.max(1, s / 2));
      }
    }
    // Soldiers.
    for (const u of sim.soldiers) {
      const archer = u.kind === "archer";
      const s = Math.max(2, (archer ? ARCHER_UNIT.size : SOLDIER.size) * px);
      c.fillStyle = archer ? "#1b3324" : "#1c2a40";
      c.fillRect(u.x * px - s / 2 - 1, u.y * px - s / 2 - 1, s + 2, s + 2);
      c.fillStyle = u.flash > 0 ? "#fff" : archer ? ARCHER_UNIT.color : SOLDIER.color;
      c.fillRect(u.x * px - s / 2, u.y * px - s / 2, s, s);
      if (archer) {
        // A little bow on the off side.
        c.fillStyle = "#b58a4f";
        c.fillRect(u.x * px - s / 2 - Math.max(1, s * 0.3), u.y * px - s / 2, Math.max(1, s * 0.2), s);
      }
      if (torches) this.drawHandTorch(u.x + SOLDIER.size * 0.65, u.y - SOLDIER.size * 0.45, u.id, sim.time);
    }
    // Enemies: tiny squares, gold-outlined when marked.
    for (const e of sim.enemies) {
      const def = ENEMIES[e.kind];
      const s = Math.max(2, Math.round(def.size * px));
      const x = Math.round(e.x * px - s / 2),
        y = Math.round(e.y * px - s / 2);
      if (e.marked) {
        c.fillStyle = "#f2c94c";
        c.fillRect(x - 1, y - 1, s + 2, s + 2);
      } else if (def.flying) {
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(x + px * 0.2, y + px * 0.35, s, s);
      }
      if (def.boss) {
        c.fillStyle = "#1a0606";
        c.fillRect(x - 1, y - 1, s + 2, s + 2);
      }
      c.fillStyle = e.flash > 0 ? "#fff" : def.color;
      c.fillRect(x, y, s, s);
      if (def.boss) {
        // Crown of spikes and a health bar, so the boss reads at a glance.
        c.fillStyle = "#f2c94c";
        const k = Math.max(1, s / 5);
        for (let n = 0; n < 3; n++) c.fillRect(x + (n * (s - k)) / 2, y - k, k, k);
        const bw = s * 1.6,
          bh = Math.max(2, px * 0.18);
        c.fillStyle = "rgba(0,0,0,0.75)";
        c.fillRect(e.x * px - bw / 2, y - k - bh - 2, bw, bh);
        c.fillStyle = "#d9635a";
        c.fillRect(e.x * px - bw / 2, y - k - bh - 2, bw * Math.max(0, e.hp / e.maxHp), bh);
      }
    }
    // Arrows.
    c.strokeStyle = "#eadcb2";
    c.lineWidth = Math.max(1, px * 0.1);
    c.beginPath();
    for (const a of sim.arrows) {
      const dx = a.tx - a.x,
        dy = a.ty - a.y;
      const d = Math.hypot(dx, dy) || 1;
      c.moveTo(a.x * px, a.y * px);
      c.lineTo((a.x - (dx / d) * 0.6) * px, (a.y - (dy / d) * 0.6) * px);
    }
    c.stroke();
    // Cannon shells: an iron ball arcing over, its shadow on the ground.
    for (const sh of sim.shells) {
      const k = sh.t / sh.dur;
      const gx = sh.x0 + (sh.x1 - sh.x0) * k,
        gy = sh.y0 + (sh.y1 - sh.y0) * k;
      const lift = Math.sin(Math.PI * k) * (0.8 + Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) * 0.12);
      const s = Math.max(2, px * 0.3);
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(gx * px - s / 2, gy * px - s / 2, s, s * 0.7);
      c.fillStyle = "#1d1d20";
      c.fillRect(gx * px - s / 2, (gy - lift) * px - s / 2, s, s);
      c.fillStyle = "#6a6a70";
      c.fillRect(gx * px - s / 2, (gy - lift) * px - s / 2, Math.max(1, s / 3), Math.max(1, s / 3));
    }
    // Effects.
    for (const fx of sim.effects) {
      const k = fx.t / 0.6;
      if (fx.kind === "boom") {
        this.drawExplosion(fx.x, fx.y, fx.r, k, fx.seed ?? 0);
      } else if (fx.kind === "dust") {
        c.fillStyle = `rgba(150,140,125,${0.45 * (1 - k)})`;
        c.beginPath();
        c.arc(fx.x * px, fx.y * px, fx.r * px * (0.6 + k * 0.6), 0, Math.PI * 2);
        c.fill();
      } else {
        c.fillStyle = `rgba(255,230,180,${1 - k})`;
        const s = Math.max(1, px * 0.15);
        for (let n = 0; n < 4; n++) {
          const a = n * 1.57 + fx.x;
          c.fillRect((fx.x + Math.cos(a) * k * 0.6) * px, (fx.y + Math.sin(a) * k * 0.6) * px, s, s);
        }
      }
    }
  }

  /** A ragged fireball: noisy blob outlines (never a clean circle) for the
   * smoke, flame and white-hot core, plus flung sparks and debris. */
  private drawExplosion(x: number, y: number, r: number, k: number, seed: number) {
    const c = this.ctx;
    const px = this.px;
    const blob = (radius: number, salt: number, wobble: number) => {
      const n = 16;
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2 + hash01(seed, salt) * 0.8;
        const rr = radius * (1 - wobble + wobble * 2 * hash01(seed, salt, i % n));
        const px2 = (x + Math.cos(a) * rr) * px,
          py2 = (y + Math.sin(a) * rr * 0.9) * px;
        if (i === 0) c.moveTo(px2, py2);
        else c.lineTo(px2, py2);
      }
      c.closePath();
      c.fill();
    };
    const grow = 0.35 + 0.65 * Math.sqrt(k);
    c.save();
    // Smoke billows out and lingers darkest at the end.
    c.fillStyle = `rgba(40,32,28,${0.45 * (1 - k) * Math.min(1, k * 4)})`;
    blob(r * grow * 1.05, 1, 0.3);
    c.globalCompositeOperation = "lighter";
    c.fillStyle = `rgba(255,120,30,${0.75 * (1 - k)})`;
    blob(r * grow * 0.85, 2, 0.28);
    c.fillStyle = `rgba(255,200,90,${0.8 * (1 - k) ** 1.5})`;
    blob(r * grow * 0.55, 3, 0.25);
    c.fillStyle = `rgba(255,250,220,${0.9 * (1 - k) ** 3})`;
    blob(r * grow * 0.28, 4, 0.2);
    // Sparks and debris flung outwards.
    const s = Math.max(1, px * 0.12);
    for (let i = 0; i < 12; i++) {
      const a = hash01(seed, 20, i) * Math.PI * 2;
      const d = r * (0.3 + hash01(seed, 21, i) * 1.1) * Math.sqrt(k);
      c.fillStyle = i % 3 ? `rgba(255,190,90,${1 - k})` : `rgba(90,70,55,${1 - k})`;
      c.fillRect((x + Math.cos(a) * d) * px, (y + Math.sin(a) * d) * px, s, s);
    }
    c.restore();
  }

  /** Branching cracks, glowing like cooling embers where a blast landed. */
  private drawScorches(sim: DefendSim) {
    const c = this.ctx;
    const px = this.px;
    for (const sc of sim.scorches) {
      const k = sc.t / sc.life;
      const heat = (1 - k) ** 1.6;
      // Scorched ground under the cracks.
      c.fillStyle = `rgba(20,14,10,${0.35 * (1 - k)})`;
      c.beginPath();
      c.ellipse(sc.x * px, sc.y * px, sc.r * 0.55 * px, sc.r * 0.5 * px, 0, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      const arms = 5 + (hash01(sc.seed, 30) * 3) | 0;
      for (const [width, color] of [
        [0.22, `rgba(255,90,20,${0.35 * heat})`],
        [0.09, `rgba(255,190,90,${0.9 * heat})`],
      ] as const) {
        c.strokeStyle = color;
        c.lineWidth = Math.max(1, px * width);
        c.beginPath();
        for (let i = 0; i < arms; i++) {
          let a = (i / arms) * Math.PI * 2 + hash01(sc.seed, 31, i) * 0.9;
          let cx = sc.x,
            cy = sc.y;
          c.moveTo(cx * px, cy * px);
          const len = sc.r * (0.45 + hash01(sc.seed, 32, i) * 0.45);
          const steps = 4;
          for (let j = 1; j <= steps; j++) {
            a += (hash01(sc.seed, 33, i * 7 + j) - 0.5) * 0.9;
            cx += (Math.cos(a) * len) / steps;
            cy += (Math.sin(a) * len) / steps;
            c.lineTo(cx * px, cy * px);
            // The odd little fork.
            if (j === 2 && hash01(sc.seed, 34, i) < 0.6) {
              const b = a + (hash01(sc.seed, 35, i) < 0.5 ? 0.9 : -0.9);
              c.lineTo((cx + Math.cos(b) * len * 0.3) * px, (cy + Math.sin(b) * len * 0.3) * px);
              c.moveTo(cx * px, cy * px);
            }
          }
        }
        c.stroke();
      }
      c.restore();
    }
  }

  private drawOverlay(o: Overlay) {
    const c = this.ctx;
    const px = this.px;
    const T = px * SUB;
    if (o.legal.size || o.ghost || o.hover !== null) {
      for (let ty = 0; ty < TILES_H; ty++)
        for (let tx = 0; tx < TILES_W; tx++) {
          const key = tileKey(tx, ty);
          const x = Math.round(tx * T),
            y = Math.round(ty * T),
            s = Math.round((tx + 1) * T) - x;
          if (!o.legal.has(key)) {
            c.fillStyle = "rgba(0,0,0,0.38)";
            c.fillRect(x, y, s, s);
            continue;
          }
          c.fillStyle = key === o.hover ? "rgba(242,201,76,0.16)" : "rgba(242,201,76,0.04)";
          c.fillRect(x, y, s, s);
          c.strokeStyle = key === o.hover ? "rgba(242,201,76,0.9)" : "rgba(242,201,76,0.38)";
          c.lineWidth = Math.max(1, px * (key === o.hover ? 0.16 : 0.08));
          c.strokeRect(x + c.lineWidth / 2, y + c.lineWidth / 2, s - c.lineWidth, s - c.lineWidth);
        }
    }
    if (o.ghost) {
      const r = o.ghost.rect;
      c.fillStyle = "rgba(242,210,122,0.45)";
      c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
      c.strokeStyle = "#f2d27a";
      c.lineWidth = Math.max(1, px * 0.12);
      c.strokeRect(r.x * px, r.y * px, r.w * px, r.h * px);
    }
    if (o.bomb) {
      c.strokeStyle = "rgba(255,150,60,0.9)";
      c.fillStyle = "rgba(255,120,40,0.15)";
      c.lineWidth = Math.max(1, px * 0.12);
      c.beginPath();
      c.arc(o.bomb.x * px, o.bomb.y * px, o.bomb.r * px, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
}

export function paintStructureArt(c: CanvasRenderingContext2D, kind: StructureKind, x: number, y: number, w: number, h: number, px: number) {
  const inset = Math.max(1, px * 0.1);
  const stone = (fill: string) => {
    c.fillStyle = fill;
    c.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    c.strokeStyle = "rgba(0,0,0,0.45)";
    c.lineWidth = Math.max(1, px * 0.1);
    c.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  };
  if (kind === "keep") {
    stone("#a39d90");
    // Crenellations.
    c.fillStyle = "#7f796d";
    const n = 5;
    for (let k = 0; k < n; k++) {
      const s = (w - inset * 2) / (n * 2 - 1);
      c.fillRect(x + inset + k * s * 2, y + inset, s, s);
      c.fillRect(x + inset + k * s * 2, y + h - inset - s, s, s);
    }
    c.fillStyle = "#d8b572";
    c.fillRect(x + w * 0.33, y + h * 0.33, w * 0.34, h * 0.34);
    c.fillStyle = "#8a6a2c";
    c.fillRect(x + w * 0.46, y + h * 0.22, w * 0.08, h * 0.14);
  } else if (kind === "barracks") {
    stone("#7a6a5a");
    c.fillStyle = "#a03a2e";
    c.fillRect(x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4);
    c.fillStyle = "rgba(255,255,255,0.15)";
    c.fillRect(x + inset * 2, y + inset * 2, (w - inset * 4) / 2, h - inset * 4);
    c.fillStyle = SOLDIER.color;
    c.fillRect(x + w / 2 - px * 0.3, y + h / 2 - px * 0.3, px * 0.6, px * 0.6);
  } else if (kind === "archerBarracks") {
    stone("#6f7a5e");
    // Green-roofed hall with a target butt out front.
    c.fillStyle = "#3f6a45";
    c.fillRect(x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4);
    c.fillStyle = "rgba(255,255,255,0.14)";
    c.fillRect(x + inset * 2, y + inset * 2, (w - inset * 4) / 2, h - inset * 4);
    const cx = x + w / 2,
      cy = y + h / 2,
      r = Math.min(w, h) * 0.16;
    c.fillStyle = "#e8dcc0";
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#b3372f";
    c.beginPath();
    c.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e8dcc0";
    c.beginPath();
    c.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
    c.fill();
  } else if (kind === "archerTower") {
    stone("#8c8577");
    c.fillStyle = "#6e4a2c";
    c.beginPath();
    c.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c9a36a";
    c.fillRect(x + w / 2 - px * 0.12, y + h / 2 - px * 0.5, px * 0.24, px);
  } else if (kind === "cannonTower") {
    stone("#6f6a62");
    // Iron gun on a round turntable, barrel pointing north.
    c.fillStyle = "#4a4038";
    c.beginPath();
    c.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.32, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#26262a";
    c.fillRect(x + w / 2 - px * 0.2, y + h * 0.12, px * 0.4, h * 0.45);
    c.beginPath();
    c.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.17, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#6a6a70";
    c.fillRect(x + w / 2 - px * 0.1, y + h * 0.14, px * 0.12, h * 0.1);
  } else if (kind === "watchTower") {
    stone("#7d8288");
    c.fillStyle = "#3d3f44";
    c.fillRect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4);
    c.fillStyle = "#f2d27a";
    c.beginPath();
    c.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.13, 0, Math.PI * 2);
    c.fill();
  }
}

/** Palette icon for an item, drawn into a small square canvas. */
export function paintIcon(canvas: HTMLCanvasElement, item: StructureKind | "cityTile" | "bomb") {
  const c = canvas.getContext("2d")!;
  const n = canvas.width;
  c.clearRect(0, 0, n, n);
  c.imageSmoothingEnabled = false;
  if (item === "cityTile") {
    const px = n / 7;
    c.fillStyle = ROAD;
    c.fillRect(0, 0, n, n);
    const houses: [number, number, number, number, number][] = [
      [0, 0, 3, 2, 0], [4, 0, 3, 3, 2], [0, 3, 2, 4, 3], [4, 4, 3, 3, 1], [3, 5, 1, 2, 4],
    ];
    for (const [x, y, w, h, v] of houses) {
      c.fillStyle = ROOFS[v];
      c.fillRect(x * px + 1, y * px + 1, w * px - 2, h * px - 2);
    }
    c.fillStyle = PARK;
    c.fillRect(2 * px, 3 * px + 1, px, px);
    return;
  }
  if (item === "bomb") {
    c.fillStyle = "#2a2a2e";
    c.beginPath();
    c.arc(n * 0.45, n * 0.58, n * 0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.fillRect(n * 0.3, n * 0.42, n * 0.1, n * 0.1);
    c.fillStyle = "#8a6a3c";
    c.fillRect(n * 0.58, n * 0.18, n * 0.08, n * 0.18);
    c.fillStyle = "#ffb347";
    c.fillRect(n * 0.62, n * 0.1, n * 0.12, n * 0.1);
    return;
  }
  const def = { keep: [3, 3], barracks: [3, 4], archerBarracks: [3, 3], archerTower: [2, 2], cannonTower: [2, 2], watchTower: [2, 2] }[item];
  const px = n / Math.max(def[0], def[1]) / 1.1;
  const w = def[0] * px,
    h = def[1] * px;
  paintStructureArt(c, item, (n - w) / 2, (n - h) / 2, w, h, px);
}
