/** Canvas renderer for DEFEND: the camera, and each frame's passes in order.
 * The city (ground, streets, houses, walls; city-layer.ts) is painted once
 * into an offscreen layer and only repainted when a building falls or is
 * rebuilt. Over it each frame: park fences, damage, unit shadows, the
 * overcast and torchlight (lighting.ts), the keep's banner, scorches, units
 * and effects (battle-art.ts), the building grid and drag overlay
 * (edit-overlay.ts), then rain in screen space. */
import { CELLS_H, CELLS_W } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { DefendLighting, type LightFrame } from "./lighting.ts";
import { Fences } from "./fences.ts";
import { Rain, ambientFor, type Weather } from "./weather.ts";
import { onCityArtLoaded, paintCityLayer } from "./city-layer.ts";
import { carriedLights, drawDamage, drawScorches, drawUnits, shadowCasters, type Brush } from "./battle-art.ts";
import { drawGrid, drawOverlay, type Overlay } from "./edit-overlay.ts";
import { drawFlag } from "./structure-art.ts";

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
    onCityArtLoaded(() => (this.layerKey = ""));
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
    this.refreshLayer(map, sim);
    const dt = this.lastNow ? (opts.now - this.lastNow) / 1000 : 0;
    this.lastNow = opts.now;
    this.drawCity(map, sim);
    if (sim) this.drawBattle(map, sim, opts);
    this.drawKeepFlag(map, sim, opts);
    if (sim) this.drawBattleUnits(sim, !!opts.weather);
    this.drawEditing(overlay, opts.grid);
    // Rain falls in screen space, in front of the camera.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sim && opts.weather?.rain) this.drawRain(dt);
  }

  /** The building grid (brighter during a drag) and the drag's overlay. */
  private drawEditing(overlay: Overlay | null, grid: boolean) {
    if (grid) drawGrid(this.ctx, this.px, overlay ? 0.2 : 0.11);
    if (overlay) drawOverlay(this.ctx, this.px, overlay);
  }

  /** The city layer through the camera, and the park fences on it. */
  private drawCity(map: CityMap, sim: DefendSim | null) {
    const ctx = this.ctx;
    ctx.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.x, this.cam.y);
    ctx.imageSmoothingEnabled = this.cam.s / this.layerScale < 1;
    ctx.drawImage(this.layer, 0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    // Park fences sit on the ground layer, under the lighting and units.
    this.fences.sync(map);
    if (sim) this.fences.update(sim);
    this.fences.draw(ctx, this.px);
  }

  /** What a battle lays over the city before its units: damage, and in
   * weather (battles are always under cloud, so the city's lights are always
   * lit) unit shadows, the overcast and the torchlight. */
  private drawBattle(map: CityMap, sim: DefendSim, opts: DrawOptions) {
    const weather = opts.weather;
    this.drawBattleGround(map, sim, weather, opts.night);
    if (!weather) return;
    Rain.overcast(this.ctx, weather.rain ? 0.3 : 0.18);
    this.drawLighting(map, sim, weather, opts);
  }

  /** The keep's banner, while the keep stands. */
  private drawKeepFlag(map: CityMap, sim: DefendSim | null, opts: DrawOptions) {
    const keep = standingKeep(map, sim);
    if (!keep) return;
    drawFlag(this.ctx, this.px, { x: (keep.x + keep.w / 2) * this.px, y: (keep.y + keep.h / 2) * this.px, t: opts.now / 1000, reduceMotion: opts.reduceMotion });
  }

  /** Blast scorches, then units, projectiles and effects (carrying torches
   * in weather). */
  private drawBattleUnits(sim: DefendSim, torches: boolean) {
    const brush: Brush = { c: this.ctx, px: this.px };
    drawScorches(brush, sim);
    drawUnits(brush, sim, torches);
  }

  private drawRain(dt: number) {
    this.rain.update(dt, this.canvas.width, this.canvas.height);
    this.rain.draw(this.ctx, this.px);
  }

  /** Repaints the city layer if the map, size, zoom band or buildings
   * changed. Zoomed in, the city is painted at 2–3× so edges stay crisp. */
  private refreshLayer(map: CityMap, sim: DefendSim | null) {
    const W = this.canvas.width,
      H = this.canvas.height;
    let k = this.cam.s >= 2.5 ? 3 : this.cam.s >= 1.4 ? 2 : 1;
    while (k > 1 && W * H * k * k > 18e6) k--;
    this.layerScale = k;
    const key = `${W}:${k}:${sim ? sim.mapVersion : -1}`;
    if (map === this.map && key === this.layerKey) return;
    this.map = map;
    this.layerKey = key;
    this.lighting.setMap(map);
    this.layer.width = W * k;
    this.layer.height = H * k;
    paintCityLayer(this.lctx, this.px * k, { map, sim, lights: this.lighting.lights, stones: this.lighting.roadStones });
  }

  /** Folds fallen and rebuilt buildings into the lighting, then draws what
   * lies on the ground: building damage, and (in weather) unit shadows. */
  private drawBattleGround(map: CityMap, sim: DefendSim, weather: Weather | null, night: number) {
    const changed = sim.changed.splice(0);
    if (weather) this.lighting.update(sim.solid, changed, standing(map, sim));
    else if (changed.length) this.lighting.invalidate(changed);
    drawDamage({ c: this.ctx, px: this.px }, sim);
    if (weather) this.lighting.drawUnitShadows(this.ctx, this.px, shadowCasters(sim), 0.8 + 0.2 * night);
  }

  /** Darkness and torchlight, the gravel's lit relief, and the flames. */
  private drawLighting(map: CityMap, sim: DefendSim, weather: Weather, opts: DrawOptions) {
    const frame: LightFrame = { px: this.px, now: opts.now, reduceMotion: opts.reduceMotion, intact: standing(map, sim) };
    this.lighting.drawLight(this.ctx, frame, ambientFor(weather, opts.night), {
      torches: carriedLights(sim),
      solid: sim.solid,
      version: sim.mapVersion,
    });
    this.lighting.drawRelief(this.ctx, this.px, weather.rain ? 0.85 : 0.65);
    this.lighting.drawFlames(this.ctx, frame);
  }

}

/** The keep's rect while it stands (its banner flies over it), else null. */
function standingKeep(map: CityMap, sim: DefendSim | null) {
  const keep = map.buildings.find((b) => b.kind === "keep");
  if (!keep) return null;
  return !sim || sim.intact(keep) ? keep.rect : null;
}

/** Whether building `id` still stands in the battle. */
const standing = (map: CityMap, sim: DefendSim) => (id: number) => sim.intact(map.buildings[id]);
