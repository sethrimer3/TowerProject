import type { Board } from "./generation.ts";
import { tileRandom } from "./themes.ts";
import { decorSourceFor, FLOWER_COLORS, TILE_PX, tileDecor, tileKey, waterAt, type DecorSource, type Flower, type Plant, type TileDecor } from "./decor.ts";
import { DecorBaker } from "./decor-bake.ts";
import { DecorEffects, type TileAt } from "./decor-effects.ts";
import { WaterReflections, type ReflectionScene, type Reflections, type Wave } from "./decor-reflections.ts";
import { drawBlades, drawCrates, DRIP_FALL, dripNow, dripRings, PixelBatch, ring, type DripNow, type Sway } from "./decor-sprites.ts";

export type { ReflectionPainter } from "./decor-reflections.ts";

/** Draws the dungeon dressing planned in decor.ts. Static pixels come from
 * decor-bake.ts, which the renderer caches with the rest of the ground; the
 * live parts are drawn here every frame in world pixels (one decor pixel is
 * one of the 24 sprite units across a tile, like the hero sprite):
 * reflections, glints, drips and ripples in pools (decor-reflections.ts),
 * crates and tall grass (decor-sprites.ts), glowing blooms and fireflies,
 * and the particles and hero reactions of decor-effects.ts. Planning is
 * budgeted per frame so entering a room never stalls. */

export type DecorView = { left: number; bottom: number; n: number; s: number };
export type DecorGlow = { x: number; y: number; rgb: readonly number[]; radius: number; strength: number };

const GLOWCAP: readonly number[] = [140, 240, 170];

export class DecorLayer {
  src: DecorSource | null = null;
  private world: Board | null = null;
  private baker = new DecorBaker();
  private effects = new DecorEffects((x, y) => this.plan(x, y));
  private reflections = new WaterReflections();
  /** Tiles already planned; planning past these is budgeted per frame. */
  private plannedTiles = new Set<number>();
  /** The decorated tiles in view, rebuilt only when the view moves a whole
   * tile (or while some are still waiting to be planned). */
  private visible: { key: string; tiles: [number, number, TileDecor][]; complete: boolean } = { key: "", tiles: [], complete: false };
  private glowCache: DecorGlow[] | null = null;
  /** Tiles planned per frame at most, so entering a room never stalls. */
  planBudget = 60;
  private planned = 0;

  /** Crates broken this session, by source + tile. */
  get broken() {
    return this.effects.broken;
  }
  get particles() {
    return this.effects.particles;
  }
  get ripples() {
    return this.effects.ripples;
  }
  /** Whether anything live is still settling (flying pieces, spreading
   * ripples, grass still wobbling), so the frame rate shouldn't drop yet. */
  get busy() {
    return this.effects.busy;
  }

  /** The source's key, or null off the dungeon: part of the ground cache's key. */
  get key() {
    return this.src?.key ?? null;
  }

  /** Points the layer at the current board; clears live effects on change. */
  sync(world: Board, seed: number) {
    if (world === this.world) return;
    this.world = world;
    const src = decorSourceFor(world, seed);
    if (src?.key !== this.src?.key) {
      this.baker.clear();
      this.plannedTiles.clear();
      this.visible = { key: "", tiles: [], complete: false };
      this.glowCache = null;
      this.effects.reset();
    }
    this.src = src;
  }

  /** Paints tile (x, y)'s baked moss, water, vines, and plants, in tile
   * units (0..24), for the renderer's cached ground. False while the tile
   * is still waiting to be planned. */
  bakeTile(c: CanvasRenderingContext2D, x: number, y: number) {
    const d = this.plan(x, y);
    if (!d) return false;
    if (d.empty) return true;
    const img = this.baker.bake(this.src!, x, y, d);
    if (img) c.drawImage(img, 0, 0, TILE_PX, TILE_PX);
    return true;
  }

  /** Advances live effects and reacts to the hero. `hx`/`hy` are the
   * interpolated tile position. */
  update(dt: number, now: number, hx: number, hy: number, tileAt: TileAt, reduceMotion: boolean) {
    this.planned = 0;
    if (this.src) this.effects.update({ src: this.src, dt, now, hx, hy, tileAt, reduceMotion });
  }

  // ---------------------------------------------------------------- planning

  /** The plan for a tile if ready; plans a limited number per frame. */
  private plan(x: number, y: number): TileDecor | null {
    const src = this.src;
    if (!src) return null;
    const key = tileKey(x, y);
    if (!this.plannedTiles.has(key)) {
      if (this.planned >= this.planBudget) return null;
      this.planned++;
      this.plannedTiles.add(key);
    }
    return tileDecor(src, x, y);
  }

  private visibleTiles(v: DecorView) {
    const key = `${Math.floor(v.left)},${Math.floor(v.bottom)},${v.n}`;
    if (this.visible.key === key && this.visible.complete) return this.visible.tiles;
    const tiles: [number, number, TileDecor][] = [];
    let complete = true;
    for (let row = -1; row <= v.n; row++)
      for (let col = -1; col <= v.n; col++) {
        const x = col + Math.floor(v.left), y = Math.floor(v.bottom) + row;
        if (y < 0) continue;
        const d = this.plan(x, y);
        if (!d) complete = false;
        else if (!d.empty) tiles.push([x, y, d]);
      }
    this.visible = { key, tiles, complete };
    this.glowCache = null;
    return tiles;
  }

  private eachTile(v: DecorView, fn: (x: number, y: number, d: TileDecor) => void) {
    for (const [x, y, d] of this.visibleTiles(v)) fn(x, y, d);
  }

  /** Applies the world-pixel transform: tile (x, y) starts at (24x, -24y). */
  private worldSpace(c: CanvasRenderingContext2D, v: DecorView) {
    c.translate(-v.left * v.s, (v.n - 1 + v.bottom) * v.s);
    c.scale(v.s / TILE_PX, v.s / TILE_PX);
  }

  // ---------------------------------------------------------------- ground

  /** The live ground decor: reflections, glints, drips, ripples, crates,
   * and tall grass. (The static pixels come from bakeTile, which the
   * renderer caches with the rest of the ground.) */
  drawGround(c: CanvasRenderingContext2D, v: DecorView, now: number, tileAt: TileAt, reduceMotion: boolean, reflections?: Reflections) {
    if (!this.src) return;
    const src = this.src;
    c.save();
    this.worldSpace(c, v);
    c.imageSmoothingEnabled = false;
    const px = new PixelBatch(), t = now / 1000;
    const crates: [number, number, TileDecor][] = [], thickets: [number, number, TileDecor][] = [];
    this.eachTile(v, (x, y, d) => {
      const floor = tileAt(x, y).kind === "floor";
      if (d.crates.length && floor) crates.push([x, y, d]);
      if (d.thicket && floor) thickets.push([x, y, d]);
      if (!reduceMotion) surfaceSparkle(px, src, [x, y, d], t);
    });
    // Reflections sit on the water, under its glints and ripple rings.
    this.reflections.draw(c, this.reflectionScene(v, now, tileAt, reduceMotion, reflections));
    this.drawRipples(px, src, now);
    px.flush(c);
    for (const [x, y, d] of crates) this.drawCratesAt(c, x, y, d);
    for (const [x, y, d] of thickets) drawBlades(px, d.blades, this.sway(x, y, t, reduceMotion), null);
    px.flush(c);
    c.restore();
  }

  private reflectionScene(v: DecorView, now: number, tileAt: TileAt, reduceMotion: boolean, sprites?: Reflections): ReflectionScene {
    const src = this.src!, pools: [number, number, TileDecor][] = [];
    this.eachTile(v, (x, y, d) => {
      if (d.water && d.waterCount) pools.push([x, y, d]);
    });
    return {
      key: src.key, pools, now, reduceMotion, tileAt, sprites,
      waves: () => this.waves(v, now),
      plan: (x, y) => this.plan(x, y),
      isBroken: (x, y) => this.effects.isBroken(src.key, x, y),
      drawCrates: (ctx, x, y, d) => this.drawCratesAt(ctx, x, y, d),
    };
  }

  /** Rings spreading on the water right now: the hero's ripples and the
   * ceiling drips. */
  private waves(v: DecorView, now: number) {
    const out: Wave[] = this.effects.ripples.map((r) => ({ gx: r.gx, gy: r.gy, r: ((now - r.t0) / 1000) * r.speed, fade: 1 - (now - r.t0) / r.life }));
    const t = now / 1000;
    this.eachTile(v, (x, y, d) => {
      if (!d.drip) return;
      const s = dripNow(x, y, d.drip, t), age = s.local - DRIP_FALL;
      if (age >= 0 && age < 1.8) out.push({ gx: s.gx, gy: s.gy, r: age * 11, fade: 1 - age / 1.8 });
    });
    return out;
  }

  /** The hero's ripples: a bright ring with a fainter one inside it. */
  private drawRipples(px: PixelBatch, src: DecorSource, now: number) {
    for (const r of this.effects.ripples) {
      const age = (now - r.t0) / 1000, fade = 1 - (now - r.t0) / r.life, radius = age * r.speed;
      ring(px, src, { gx: r.gx, gy: r.gy, r: radius }, `rgba(176,214,228,${(fade * 0.8).toFixed(2)})`);
      if (radius > 4) ring(px, src, { gx: r.gx, gy: r.gy, r: radius - 4 }, `rgba(120,168,188,${(fade * 0.5).toFixed(2)})`);
    }
  }

  private drawCratesAt(c: CanvasRenderingContext2D, x: number, y: number, d: TileDecor) {
    drawCrates(c, x, y, d.crates, this.effects.isBroken(this.src!.key, x, y));
  }

  /** How tile (x, y)'s tall grass moves this frame. */
  private sway(x: number, y: number, t: number, reduceMotion: boolean): Sway {
    const hero = this.effects.hero;
    return {
      ox: x * TILE_PX, oy: -y * TILE_PX, t,
      stir: reduceMotion ? 0 : this.effects.stirAt(x, y),
      heroGx: hero.x * TILE_PX + 12, heroGy: -hero.y * TILE_PX + 19,
      breeze: !reduceMotion,
    };
  }

  // ---------------------------------------------------------------- glow

  /** Glowing flowers and caps as light sources for the darkness pass. */
  glows(v: DecorView): DecorGlow[] {
    this.visibleTiles(v);
    if (this.glowCache) return this.glowCache;
    const out: DecorGlow[] = (this.glowCache = []);
    this.eachTile(v, (x, y, d) => {
      for (const f of d.flowers)
        out.push({
          x: x + (f.i + 0.5) / TILE_PX - 0.5, y: y + 0.5 - (f.j + 0.5) / TILE_PX,
          rgb: FLOWER_COLORS[f.color], radius: 0.62, strength: 0.5,
        });
      for (const p of d.plants)
        if (p.kind === "mushrooms" && p.glow)
          out.push({ x: x + (p.i + 0.5) / TILE_PX - 0.5, y: y + 0.5 - (p.j - 1) / TILE_PX, rgb: GLOWCAP, radius: 0.5, strength: 0.42 });
    });
    return out;
  }

  /** Emitted light drawn over the darkness: bright bloom pixels on the
   * glowing flowers and caps, plus fireflies over lush spots. Stronger the
   * darker the dungeon (`k` = 0 at default brightness, 1 at darkest). */
  drawGlow(c: CanvasRenderingContext2D, v: DecorView, now: number, k: number, reduceMotion: boolean) {
    if (!this.src || k <= 0) return;
    const glow: GlowFrame = { t: now / 1000, k, pulse: !reduceMotion }, px = new PixelBatch();
    c.save();
    this.worldSpace(c, v);
    c.globalCompositeOperation = "lighter";
    this.eachTile(v, (x, y, d) => {
      for (const f of d.flowers) flowerGlow(px, [x, y], f, glow);
      for (const p of d.plants) if (p.kind === "mushrooms" && p.glow) capGlow(px, [x, y], p, glow);
      if (!reduceMotion && this.hasFireflies(x, y, d)) firefly(px, [x, y], glow);
    });
    this.effects.drawSporeGlow(px, k);
    px.flush(c);
    c.restore();
  }

  /** Fireflies drift over some overgrown and flowering spots. */
  private hasFireflies(x: number, y: number, d: TileDecor) {
    return (d.thicket || d.flowers.length > 0) && tileRandom(x, y, this.src!.seed ^ 0xf1f) < 0.4;
  }

  // ---------------------------------------------------------------- foreground

  /** World-pixel box around everything drawForeground would draw this
   * frame, or null when it would draw nothing, so the renderer can skip or
   * shrink its darkened foreground pass. */
  foregroundBounds(v: DecorView, now: number, tileAt: TileAt, reduceMotion: boolean) {
    const src = this.src;
    if (!src) return null;
    const box = new Bounds(), { hgx, hgy } = this.heroPixels();
    if (this.grassAroundHero(tileAt) || waterAt(src, hgx + 12, hgy + 21)) box.add(hgx - 4, hgy, hgx + TILE_PX + 4, hgy + TILE_PX + 1);
    this.effects.particleBounds(box.add);
    if (!reduceMotion) {
      const t = now / 1000;
      this.eachTile(v, (x, y, d) => {
        const s = d.drip && dripNow(x, y, d.drip, t);
        if (s && s.local < DRIP_FALL) box.add(s.gx - 1, s.gy - 48, s.gx + 2, s.gy + 3);
      });
    }
    return box.result();
  }

  /** Things in front of the hero: grass over its feet, the water line,
   * flying splinters and falling drips. */
  drawForeground(c: CanvasRenderingContext2D, v: DecorView, now: number, tileAt: TileAt, reduceMotion: boolean) {
    const src = this.src;
    if (!src) return;
    const t = now / 1000, px = new PixelBatch();
    c.save();
    this.worldSpace(c, v);
    c.imageSmoothingEnabled = false;
    const { hgx, hgy } = this.heroPixels();
    // Only blades rooted at or below the hero's feet stand in front of it.
    const area = { gx0: hgx + 2, gx1: hgx + 22, gy0: hgy + 20, gy1: hgy + 24 };
    this.eachTileAroundHero((x, y) => {
      const d = this.plan(x, y);
      if (d?.thicket && tileAt(x, y).kind === "floor") drawBlades(px, d.blades, this.sway(x, y, t, reduceMotion), area);
      return false;
    });
    wetFeet(px, src, hgx, hgy);
    this.eachTile(v, (x, y, d) => {
      if (d.drip && !reduceMotion) fallingDrop(px, dripNow(x, y, d.drip, t));
    });
    this.effects.drawParticles(px);
    px.flush(c);
    c.restore();
  }

  /** The hero sprite's top-left corner in world pixels. */
  private heroPixels() {
    const hero = this.effects.hero;
    return { hgx: Math.round(hero.x * TILE_PX), hgy: Math.round(-hero.y * TILE_PX) };
  }

  /** Visits the 3x3 tiles around the hero, row by row, until `fn` returns true. */
  private eachTileAroundHero(fn: (x: number, y: number) => boolean) {
    const tx = Math.round(this.effects.hero.x), ty = Math.round(this.effects.hero.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (fn(tx + dx, ty + dy)) return true;
    return false;
  }

  private grassAroundHero(tileAt: TileAt) {
    return this.eachTileAroundHero((x, y) => !!this.plan(x, y)?.thicket && tileAt(x, y).kind === "floor");
  }
}

/** A growing world-pixel box. */
class Bounds {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add = (ax: number, ay: number, bx: number, by: number) => {
    this.x0 = Math.min(this.x0, ax); this.y0 = Math.min(this.y0, ay);
    this.x1 = Math.max(this.x1, bx); this.y1 = Math.max(this.y1, by);
  };
  result() {
    return this.x0 === Infinity ? null : { x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 };
  }
}

/** Glints catching the light on a pool, and a drip's rings. */
function surfaceSparkle(px: PixelBatch, src: DecorSource, [x, y, d]: [number, number, TileDecor], t: number) {
  for (const [i, j] of d.glints) {
    const s = Math.sin(t * 1.4 + i * 0.9 + j * 1.7 + x * 3.1 + y * 1.3);
    if (s > 0.55) px.add(`rgba(196,228,238,${((s - 0.55) * 1.6).toFixed(2)})`, x * TILE_PX + i, -y * TILE_PX + j, 2, 1);
  }
  if (d.drip) dripRings(px, src, dripNow(x, y, d.drip, t));
}

/** The hero's feet sink below the surface of a pool. */
function wetFeet(px: PixelBatch, src: DecorSource, hgx: number, hgy: number) {
  for (let j = 20; j < 24; j++)
    for (let i = 5; i < 20; i++)
      if (waterAt(src, hgx + i, hgy + j)) px.add(j === 20 ? "rgba(150,196,214,0.55)" : "rgba(34,70,92,0.6)", hgx + i, hgy + j);
}

/** A drop falling from the ceiling, accelerating toward its landing spot. */
function fallingDrop(px: PixelBatch, { gx, gy: landing, local }: DripNow) {
  if (local >= DRIP_FALL) return;
  const k = local / DRIP_FALL, gy = landing - Math.round((1 - k * k) * 46);
  px.add("rgba(170,214,232,0.9)", gx, gy - 1, 1, 2);
  px.add("rgba(235,250,255,0.9)", gx, gy + 1);
}

/** Seconds, the glow strength (see drawGlow), and whether it pulses. */
type GlowFrame = { t: number; k: number; pulse: boolean };

function flowerGlow(px: PixelBatch, [x, y]: [number, number], f: Flower, g: GlowFrame) {
  const ox = x * TILE_PX, oy = -y * TILE_PX;
  const pulse = g.pulse ? 0.8 + 0.2 * Math.sin(g.t * 1.6 + f.i + x * 2.1 + y) : 1;
  const [r, gr, b] = FLOWER_COLORS[f.color];
  const a = Math.min(1, g.k * pulse);
  px.add(`rgba(${r},${gr},${b},${(a * 0.9).toFixed(2)})`, ox + f.i - 1, oy + f.j, 3, 1);
  px.add(`rgba(${r},${gr},${b},${(a * 0.9).toFixed(2)})`, ox + f.i, oy + f.j - 1, 1, 3);
  px.add(`rgba(255,255,240,${a.toFixed(2)})`, ox + f.i, oy + f.j);
  px.add(`rgba(${r},${gr},${b},${(a * 0.28).toFixed(2)})`, ox + f.i - 2, oy + f.j - 1, 5, 3);
  px.add(`rgba(${r},${gr},${b},${(a * 0.28).toFixed(2)})`, ox + f.i - 1, oy + f.j - 2, 3, 1);
  px.add(`rgba(${r},${gr},${b},${(a * 0.28).toFixed(2)})`, ox + f.i - 1, oy + f.j + 2, 3, 1);
}

function capGlow(px: PixelBatch, [x, y]: [number, number], p: Plant, g: GlowFrame) {
  const ox = x * TILE_PX, oy = -y * TILE_PX;
  const a = Math.min(1, g.k * (g.pulse ? 0.75 + 0.25 * Math.sin(g.t * 0.9 + p.i * 1.7 + y) : 1));
  px.add(`rgba(140,240,170,${(a * 0.7).toFixed(2)})`, ox + p.i - 1, oy + p.j - 2, 3, 2);
  px.add(`rgba(210,255,225,${(a * 0.8).toFixed(2)})`, ox + p.i, oy + p.j - 2);
}

function firefly(px: PixelBatch, [x, y]: [number, number], g: GlowFrame) {
  const ox = x * TILE_PX, oy = -y * TILE_PX, t = g.t;
  const ph = tileRandom(y, x, 0x51) * 20;
  const fx = ox + 12 + Math.sin(t * 0.7 + ph) * 11 + Math.sin(t * 1.9 + ph * 2) * 3;
  const fy = oy + 10 + Math.cos(t * 0.53 + ph) * 8 - 4;
  const blink = Math.max(0, Math.sin(t * 1.3 + ph * 3));
  const a = g.k * blink * blink;
  if (a <= 0.02) return;
  px.add(`rgba(230,255,150,${a.toFixed(2)})`, Math.round(fx), Math.round(fy));
  px.add(`rgba(200,255,120,${(a * 0.3).toFixed(2)})`, Math.round(fx) - 1, Math.round(fy) - 1, 3, 3);
}
