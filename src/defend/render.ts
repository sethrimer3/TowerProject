/** Canvas renderer for DEFEND. The city (ground, streets, houses, walls) is
 * painted once into an offscreen layer and only repainted when a building
 * falls or is rebuilt; units, projectiles and overlays are drawn each frame. */
import { CELL_COUNT, CELLS_H, CELLS_W, SPAWN_ROW, SUB, TILES_H, TILES_W, cellIndex, hash, hash01, tileKey, type Rect } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { ARCHER_UNIT, ENEMIES, SOLDIER, CIVILIAN, watchRadius, type StructureKind } from "./catalog.ts";
import { BUILDING_FLASH, center, type DefendSim } from "./sim.ts";
import { DefendLighting } from "./lighting.ts";
import { Fences } from "./fences.ts";
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

/** Medieval roofing: terracotta tile, old brick, weathered timber, thatch,
 * slate and straw. */
const ROOFS = ["#8e4a36", "#a35a3e", "#6b5540", "#86704b", "#5a5c62", "#9a7a4a"];
const OUTLINE = "#0b0907";
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
  readonly fences = new Fences();
  private rain = new Rain();
  private lastNow = 0;
  private layerScale = 1;
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
    // Zoomed in, the city is repainted at 2–3× so edges stay crisp.
    const W = this.canvas.width,
      H = this.canvas.height;
    let k = this.cam.s >= 2.5 ? 3 : this.cam.s >= 1.4 ? 2 : 1;
    while (k > 1 && W * H * k * k > 18e6) k--;
    const key = `${W}:${k}:${sim ? sim.mapVersion : -1}`;
    if (map !== this.map || key !== this.layerKey) {
      this.map = map;
      this.layerKey = key;
      this.lighting.setMap(map);
      const px0 = this.px;
      this.px = px0 * k;
      try {
        this.paintLayer(map, sim, k);
      } finally {
        this.px = px0;
      }
    }
    this.layerScale = k;
    const dt = this.lastNow ? (opts.now - this.lastNow) / 1000 : 0;
    this.lastNow = opts.now;
    const ctx = this.ctx;
    const px = this.px;
    ctx.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.x, this.cam.y);
    ctx.imageSmoothingEnabled = this.cam.s / this.layerScale < 1;
    ctx.drawImage(this.layer, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    // Park fences sit on the ground layer, under the lighting and units.
    this.fences.sync(map);
    if (sim) this.fences.update(sim);
    this.fences.draw(ctx, this.px);
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
    this.drawKeepFlag(map, sim, opts);
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

  private drawKeepFlag(map: CityMap, sim: DefendSim | null, opts: DrawOptions) {
    const keep = map.buildings.find((b) => b.kind === "keep");
    if (!keep || (sim && !sim.intact(keep))) return;
    const r = keep.rect;
    drawFlag(this.ctx, this.px, (r.x + r.w / 2) * this.px, (r.y + r.h / 2) * this.px, opts.now / 1000, opts.reduceMotion);
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
  private paintLayer(map: CityMap, sim: DefendSim | null, k = 1) {
    const L = this.layer;
    L.width = this.canvas.width * k;
    L.height = this.canvas.height * k;
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
        if (t === CellType.PARK || t === CellType.WATER) {
          this.paintGrass(c, cx, cy);
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
    // Ponds, then trees, over the park grass.
    this.paintWater(c, map);
    this.paintTrees(c, map);
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

  /** Park grass: two greens in soft patches, tufts and the odd flower. */
  private paintGrass(c: CanvasRenderingContext2D, cx: number, cy: number) {
    const px = this.px;
    const x = Math.round(cx * px),
      y = Math.round(cy * px),
      s = Math.round((cx + 1) * px) - x,
      t = Math.round((cy + 1) * px) - y;
    const patch = hash01(Math.floor(cx / 2), Math.floor(cy / 2), 50);
    c.fillStyle = patch < 0.5 ? "#3d5e30" : "#446834";
    c.fillRect(x, y, s, t);
    const d = Math.max(1, Math.round(px * 0.09));
    for (let k = 0; k < 5; k++) {
      const hx = x + Math.floor(hash01(cx, cy, 51, k) * (s - d)),
        hy = y + Math.floor(hash01(cx, cy, 52, k) * (t - d * 2));
      c.fillStyle = k % 2 ? "#2f4b26" : "#56803f";
      c.fillRect(hx, hy, d, d * 2);
    }
    if (hash01(cx, cy, 53) < 0.18) {
      c.fillStyle = ["#e8d57a", "#e6e1d6", "#c96a5a", "#b7a3d6"][hash(cx, cy, 54) % 4];
      c.fillRect(x + Math.floor(hash01(cx, cy, 55) * (s - d)), y + Math.floor(hash01(cx, cy, 56) * (t - d)), d, d);
    }
  }

  /** Ponds, with irregular natural shores: each water cell contributes a
   * slightly jittered disc, and the union of discs forms the pond. Drawn in
   * passes — outline, muddy bank, reed-dark shallows, open water —
   * then ripples and lily pads. */
  private paintWater(c: CanvasRenderingContext2D, map: CityMap) {
    const px = this.px;
    const cells: [number, number][] = [];
    for (let i = 0; i < CELL_COUNT; i++)
      if (map.type[i] === CellType.WATER) cells.push([i % CELLS_W, Math.floor(i / CELLS_W)]);
    if (!cells.length) return;
    const pass = (color: string, scale: number) => {
      c.fillStyle = color;
      c.beginPath();
      for (const [cx, cy] of cells) {
        const x = (cx + 0.5 + (hash01(cx, cy, 66) - 0.5) * 0.3) * px,
          y = (cy + 0.5 + (hash01(cx, cy, 67) - 0.5) * 0.3) * px;
        const r = px * scale * (0.9 + hash01(cx, cy, 68) * 0.25);
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, Math.PI * 2);
      }
      c.fill();
    };
    pass(OUTLINE, 0.86);
    pass("#3a3524", 0.8);
    pass("#2a4f45", 0.7);
    pass("#2b5d71", 0.6);
    for (const [cx, cy] of cells) {
      const x = cx * px,
        y = cy * px;
      c.fillStyle = "rgba(210,235,240,0.4)";
      const rw = Math.max(2, Math.round(px * 0.34));
      c.fillRect(Math.round(x + px * (0.2 + hash01(cx, cy, 61) * 0.4)), Math.round(y + px * (0.25 + hash01(cx, cy, 62) * 0.5)), rw, 1);
      if (hash01(cx, cy, 63) < 0.35) {
        const r = Math.max(1.5, px * 0.15);
        const lx = x + px * (0.25 + hash01(cx, cy, 64) * 0.5),
          ly = y + px * (0.25 + hash01(cx, cy, 65) * 0.5);
        c.fillStyle = "#4f7d3b";
        c.beginPath();
        c.moveTo(lx, ly);
        c.arc(lx, ly, r, 0.5, Math.PI * 2);
        c.closePath();
        c.fill();
        if (hash01(cx, cy, 69) < 0.4) {
          c.fillStyle = "#e9d7e0";
          c.fillRect(Math.round(lx - r * 0.3), Math.round(ly - r * 0.3), Math.max(1, Math.round(px * 0.08)), Math.max(1, Math.round(px * 0.08)));
        }
      }
    }
  }

  /** Park trees: layered, lit canopies with a black outline and a shadow. */
  private paintTrees(c: CanvasRenderingContext2D, map: CityMap) {
    const px = this.px;
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) {
        if (map.type[cellIndex(cx, cy)] !== CellType.PARK || hash01(cx, cy, 21) > 0.42) continue;
        const r = px * (0.3 + hash01(cx, cy, 23) * 0.18);
        const x = (cx + 0.3 + hash01(cx, cy, 24) * 0.4) * px,
          y = (cy + 0.3 + hash01(cx, cy, 25) * 0.4) * px;
        c.fillStyle = "rgba(0,0,0,0.3)";
        c.beginPath();
        c.arc(x + r * 0.35, y + r * 0.4, r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = OUTLINE;
        c.beginPath();
        c.arc(x, y, r + Math.max(1, px * 0.06), 0, Math.PI * 2);
        c.fill();
        const dark = hash01(cx, cy, 22) < 0.5;
        c.fillStyle = dark ? "#284420" : "#335a27";
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = dark ? "#3b6330" : "#4a7a36";
        c.beginPath();
        c.arc(x - r * 0.2, y - r * 0.22, r * 0.66, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = dark ? "#55864a" : "#679c4e";
        c.beginPath();
        c.arc(x - r * 0.35, y - r * 0.38, r * 0.3, 0, Math.PI * 2);
        c.fill();
      }
  }

  /** One wall stone. Edges and the hanging brick face follow the *standing*
   * wall, so a breach gets proper broken edges. */
  private paintWall(c: CanvasRenderingContext2D, cx: number, cy: number, solid: (i: number) => boolean) {
    const px = this.px;
    const x = Math.round(cx * px),
      y = Math.round(cy * px);
    const standing = (dx: number, dy: number) => {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) return false;
      const i = cellIndex(nx, ny);
      return this.map!.wall[i] === 1 && solid(i);
    };
    if (ready(wallArt.cap)) {
      const sy = CAP.y0 + ((cy * CAP.w + cx * 37) % CAP.span);
      c.drawImage(wallArt.cap, CAP.x, sy, CAP.w, CAP.w, x, y, Math.round((cx + 1) * px) - x, Math.round((cy + 1) * px) - y);
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
    // Everything snaps to whole pixels so outlines stay crisp.
    const x = Math.round(r.x * px),
      y = Math.round(r.y * px),
      w = Math.round((r.x + r.w) * px) - x,
      h = Math.round((r.y + r.h) * px) - y;
    const gap = Math.max(1, Math.round(px * 0.09));
    const line = Math.max(1, Math.round(px * 0.08));
    // Drop shadow.
    const sh = Math.max(1, Math.round(px * 0.14));
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.fillRect(x + gap + sh, y + gap + sh, w - gap * 2, h - gap * 2);
    if (b.kind === "house") {
      const bx = x + gap,
        by = y + gap,
        bw = w - gap * 2,
        bh = h - gap * 2;
      c.fillStyle = OUTLINE;
      c.fillRect(bx, by, bw, bh);
      const ix = bx + line,
        iy = by + line,
        iw = bw - line * 2,
        ih = bh - line * 2;
      c.fillStyle = ROOFS[b.variant % ROOFS.length];
      c.fillRect(ix, iy, iw, ih);
      // Two roof slopes meeting at a ridge along the long axis: the sunny
      // slope lighter, a crisp dark ridge line, and faint tile courses.
      const along = r.w >= r.h;
      c.fillStyle = "rgba(255,240,210,0.14)";
      if (along) c.fillRect(ix, iy, iw, Math.floor(ih / 2));
      else c.fillRect(ix, iy, Math.floor(iw / 2), ih);
      c.fillStyle = "rgba(0,0,0,0.18)";
      const course = Math.max(2, Math.round(px * 0.3));
      if (along) for (let yy = iy + course; yy < iy + ih - 1; yy += course) c.fillRect(ix, yy, iw, 1);
      else for (let xx = ix + course; xx < ix + iw - 1; xx += course) c.fillRect(xx, iy, 1, ih);
      c.fillStyle = OUTLINE;
      if (along) c.fillRect(ix, iy + Math.floor(ih / 2), iw, line);
      else c.fillRect(ix + Math.floor(iw / 2), iy, line, ih);
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
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  const inset = Math.max(1, Math.round(px * 0.1));
  const line = Math.max(1, Math.round(px * 0.08));
  // A solid black outline, then the fill inside it.
  const stone = (fill: string) => {
    c.fillStyle = OUTLINE;
    c.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    c.fillStyle = fill;
    c.fillRect(x + inset + line, y + inset + line, w - (inset + line) * 2, h - (inset + line) * 2);
  };
  if (kind === "keep") {
    paintKeep(c, x, y, w, h, px);
  } else if (kind === "barracks") {
    stone("#7a6a5a");
    c.fillStyle = "#a03a2e";
    c.fillRect(x + inset * 2, y + inset * 2, w - inset * 4, h - inset * 4);
    c.fillStyle = "rgba(255,255,255,0.15)";
    c.fillRect(x + inset * 2, y + inset * 2, (w - inset * 4) / 2, h - inset * 4);
    c.fillStyle = SOLDIER.color;
    c.fillRect(x + w / 2 - px * 0.3, y + h / 2 - px * 0.3, px * 0.6, px * 0.6);
  } else if (kind === "archerBarracks") {
    stone("#7a6e5c");
    // Green-roofed hall with a target butt out front.
    c.fillStyle = "#5e4632";
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

/** The keep, from above: a square curtain of crenellated wall with a round
 * turret on each corner, a flagstone courtyard, and the great tower in the
 * middle under a four-sided slate roof. The flag is drawn live (drawFlag). */
function paintKeep(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, px: number) {
  const line = Math.max(1, Math.round(px * 0.08));
  const inset = Math.max(1, Math.round(px * 0.12));
  const X = x + inset,
    Y = y + inset,
    W = w - inset * 2,
    H = h - inset * 2;
  // Curtain wall.
  c.fillStyle = OUTLINE;
  c.fillRect(X, Y, W, H);
  c.fillStyle = "#9d968a";
  c.fillRect(X + line, Y + line, W - line * 2, H - line * 2);
  // Merlons around the wall walk.
  const m = Math.max(1, Math.round(px * 0.2));
  c.fillStyle = "#bcb5a6";
  for (let xx = X + line + m; xx < X + W - line - m; xx += m * 2) {
    c.fillRect(xx, Y + line, m, m);
    c.fillRect(xx, Y + H - line - m, m, m);
  }
  for (let yy = Y + line + m; yy < Y + H - line - m; yy += m * 2) {
    c.fillRect(X + line, yy, m, m);
    c.fillRect(X + W - line - m, yy, m, m);
  }
  // Courtyard.
  const wall = Math.round(px * 0.45);
  c.fillStyle = OUTLINE;
  c.fillRect(X + wall, Y + wall, W - wall * 2, H - wall * 2);
  c.fillStyle = "#6f6a60";
  c.fillRect(X + wall + line, Y + wall + line, W - (wall + line) * 2, H - (wall + line) * 2);
  // The great tower with a hipped slate roof (four shaded faces).
  const tw = Math.round(W * 0.46),
    tx = Math.round(X + (W - tw) / 2),
    ty = Math.round(Y + (H - tw) / 2);
  c.fillStyle = OUTLINE;
  c.fillRect(tx - line, ty - line, tw + line * 2, tw + line * 2);
  const cx = tx + tw / 2,
    cy = ty + tw / 2;
  const face = (pts: [number, number][], fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fill();
  };
  face([[tx, ty], [tx + tw, ty], [cx, cy]], "#6a707a");
  face([[tx + tw, ty], [tx + tw, ty + tw], [cx, cy]], "#474c55");
  face([[tx, ty + tw], [tx + tw, ty + tw], [cx, cy]], "#3b3f47");
  face([[tx, ty], [tx, ty + tw], [cx, cy]], "#5a6069");
  c.strokeStyle = OUTLINE;
  c.lineWidth = line;
  c.beginPath();
  c.moveTo(tx, ty);
  c.lineTo(tx + tw, ty + tw);
  c.moveTo(tx + tw, ty);
  c.lineTo(tx, ty + tw);
  c.stroke();
  // Corner turrets: round towers with conical slate caps.
  const tr = Math.max(2, Math.round(px * 0.5));
  for (const [ox, oy] of [
    [X + tr * 0.7, Y + tr * 0.7],
    [X + W - tr * 0.7, Y + tr * 0.7],
    [X + tr * 0.7, Y + H - tr * 0.7],
    [X + W - tr * 0.7, Y + H - tr * 0.7],
  ]) {
    c.fillStyle = OUTLINE;
    c.beginPath();
    c.arc(ox, oy, tr + line, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#a8a194";
    c.beginPath();
    c.arc(ox, oy, tr, 0, Math.PI * 2);
    c.fill();
    const g = c.createRadialGradient(ox - tr * 0.3, oy - tr * 0.3, 0, ox, oy, tr * 0.72);
    g.addColorStop(0, "#7d848f");
    g.addColorStop(1, "#3f444c");
    c.fillStyle = g;
    c.beginPath();
    c.arc(ox, oy, tr * 0.72, 0, Math.PI * 2);
    c.fill();
  }
}

/** The keep's banner, seen from above, rippling in the wind. Drawn every
 * frame from the time, so it keeps waving. */
export function drawFlag(c: CanvasRenderingContext2D, px: number, ax: number, ay: number, t: number, reduceMotion: boolean) {
  const len = 1.35 * px,
    wid = 0.5 * px;
  const n = 10;
  const wind = -0.35; // Blowing a little north of east.
  const cw = Math.cos(wind),
    sw = Math.sin(wind);
  const amp = reduceMotion ? 0.03 : 0.12;
  const pt = (u: number, v: number) => {
    // u along the flag (0 at the pole), v across it; the ripple grows with u.
    const wave = Math.sin(t * 7 - u * 5.5) * amp * px * (0.25 + u);
    const along = u * len,
      across = v * wid + wave;
    return [ax + along * cw - across * sw, ay + along * sw + across * cw] as const;
  };
  // Shadow on the roof below.
  c.save();
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = pt(i / n, -0.5);
    if (i === 0) c.moveTo(x + px * 0.25, y + px * 0.3);
    else c.lineTo(x + px * 0.25, y + px * 0.3);
  }
  for (let i = n; i >= 0; i--) {
    const [x, y] = pt(i / n, 0.5);
    c.lineTo(x + px * 0.25, y + px * 0.3);
  }
  c.fill();
  // The cloth, strip by strip, shaded by the slope of each fold.
  for (let i = 0; i < n; i++) {
    const u0 = i / n,
      u1 = (i + 1) / n;
    const slope = Math.cos(t * 7 - ((u0 + u1) / 2) * 5.5);
    const light = Math.round(150 + slope * 45);
    c.fillStyle = `rgb(${light + 40},${Math.round(light * 0.2)},${Math.round(light * 0.18)})`;
    const a = pt(u0, -0.5),
      b = pt(u1, -0.5),
      d = pt(u1, 0.5),
      e = pt(u0, 0.5);
    c.beginPath();
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.lineTo(d[0], d[1]);
    c.lineTo(e[0], e[1]);
    c.closePath();
    c.fill();
    // A gold stripe down the middle.
    const s0 = pt(u0, -0.1),
      s1 = pt(u1, -0.1),
      s2 = pt(u1, 0.1),
      s3 = pt(u0, 0.1);
    c.fillStyle = `rgb(${Math.round(200 + slope * 40)},${Math.round(160 + slope * 35)},70)`;
    c.beginPath();
    c.moveTo(s0[0], s0[1]);
    c.lineTo(s1[0], s1[1]);
    c.lineTo(s2[0], s2[1]);
    c.lineTo(s3[0], s3[1]);
    c.closePath();
    c.fill();
  }
  // Outline and pole cap.
  c.strokeStyle = OUTLINE;
  c.lineWidth = Math.max(1, px * 0.06);
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = pt(i / n, -0.5);
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const [x, y] = pt(i / n, 0.5);
    c.lineTo(x, y);
  }
  c.closePath();
  c.stroke();
  c.fillStyle = "#d8b572";
  c.strokeStyle = OUTLINE;
  c.beginPath();
  c.arc(ax, ay, Math.max(1.5, px * 0.14), 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.restore();
}
