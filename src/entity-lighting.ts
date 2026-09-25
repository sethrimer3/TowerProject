import type { Tile, Torch } from "./entities.ts";
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "./lighting.ts";
import { torchReaches } from "./floor-relief.ts";
import { lightFalloff } from "./torch-light.ts";
import { drawGameSprite } from "./game-sprites.ts";
import { isArea1, paintContents, paintHeroFallback } from "./tile-painters.ts";
import { forEachViewTile, tileOrigin, toTileSpace, type FrameContext } from "./render-frame.ts";

/** Tile kinds that stand up off the floor and so cast torch shadows. */
const SHADOW_CASTERS = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "reward", "treasure", "enemy"]);
type SpriteDir = "e" | "w" | "n" | "s";
const SPRITE_DIRS: { key: SpriteDir; dx: number; dy: number }[] = [
  { key: "e", dx: 1, dy: 0 }, { key: "w", dx: -1, dy: 0 }, { key: "n", dx: 0, dy: -1 }, { key: "s", dx: 0, dy: 1 },
];
/** Something standing in torchlight: where it is, a cache key for its
 * sprite, and how to paint it (in tile space, onto the given context). */
type Caster = { x: number; y: number; key: string; draw: (c: CanvasRenderingContext2D) => void; hero?: boolean };
type LitCaster = Caster & { light: Record<SpriteDir, number> };

/** Torchlight on the things standing in it: the shadows items, enemies,
 * and the hero cast across the floor, and the warm light on their torch-
 * facing sides. Owns the silhouettes and light masks baked from their
 * sprites. drawShadows runs first each frame; its lit casters and shadow
 * layer are then read by drawSpriteLighting and the lighting pass. */
export class EntityLighting {
  /** Black cut-outs of item/enemy/hero sprites used for torch-cast shadows.
   * Rebaked after a short while so sprites that finish loading are picked up. */
  private silhouettes = new Map<string, { canvas: HTMLCanvasElement; at: number }>();
  /** Directional torchlight masks per silhouette (see spriteLightFor). */
  private spriteLightMasks = new Map<string, { at: number; masks: Record<SpriteDir, HTMLCanvasElement> }>();
  /** Items, enemies, and the hero in torchlight this frame, with how much
   * light reaches each side of them. */
  private lit: LitCaster[] = [];
  private shadowCanvas: HTMLCanvasElement | null = null;
  /** Whether this frame drew any cast shadows. */
  private castAny = false;
  /** Last committed vertical-stretch sign per caster/torch pair, so a shadow
   * doesn't flip direction every time sway nudges the torch past level with
   * the caster (see verticalStretch). */
  private shadowVertSign = new Map<string, number>();

  /** This frame's cast shadows (one layer, walls and sprites masked out),
   * or null when there are none. Other light is kept out of them. */
  get shadows() {
    return this.castAny ? this.shadowCanvas : null;
  }

  /** Torch-cast shadows for items, enemies, and the hero. Each caster's
   * sprite silhouette is sheared away from every torch that reaches it,
   * longer the farther it stands from the flame and fainter as the light
   * falls off. Drawn to one layer so walls can be masked out cheaply. */
  drawShadows(f: FrameContext, wallMask: () => HTMLCanvasElement | null) {
    this.lit = [];
    this.castAny = false;
    if (!f.torches.length || typeof document === "undefined") return;
    let layer: CanvasRenderingContext2D | null = null;
    const casterSils: { x: number; y: number; sil: HTMLCanvasElement }[] = [];
    for (const caster of this.casters(f)) {
      const light: Record<SpriteDir, number> = { e: 0, w: 0, n: 0, s: 0 };
      let lit = false;
      for (const t of f.torches) {
        const shadow = this.lightCaster(f, caster, t, light);
        if (!shadow) continue;
        lit = true;
        if (shadow.alpha < 0.02) continue;
        const sil = this.silhouette(caster.key, caster.draw, f.now);
        if (!sil) continue;
        layer ??= this.shadowLayer(f.width);
        if (!layer) return;
        casterSils.push({ x: caster.x, y: caster.y, sil });
        this.castShadow(f, layer, caster, t, shadow, sil);
      }
      if (lit) this.lit.push({ ...caster, hero: !!caster.hero, light });
    }
    if (!layer) return;
    // Shadows fall on the floor only: never over any sprite (its own or a
    // neighbour's; this layer also dims the darkness and glow passes)...
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = "destination-out";
    for (const c of casterSils) {
      const o = tileOrigin(f, c.x, c.y);
      layer.setTransform(1, 0, 0, 1, o.x, o.y);
      layer.scale(f.s / 24, f.s / 24);
      layer.drawImage(c.sil, 0, 0);
    }
    // ...and never across wall tops.
    layer.setTransform(1, 0, 0, 1, 0, 0);
    const walls = wallMask();
    if (walls) layer.drawImage(walls, 0, 0);
    layer.globalCompositeOperation = "source-over";
    f.c.drawImage(this.shadowCanvas!, 0, 0);
    this.castAny = true;
  }

  /** Warm torchlight on items and enemies (or, with `hero`, on the hero in
   * the context's current tile transform), brightest on the torch side. */
  drawSpriteLighting(f: FrameContext, c: CanvasRenderingContext2D, hero = false) {
    for (const lit of this.lit) {
      if (lit.hero !== hero) continue;
      const masks = this.spriteLightFor(lit.key, lit.draw, f.now);
      if (!masks) continue;
      c.save();
      if (!hero) toTileSpace(c, f, lit.x, lit.y);
      c.globalCompositeOperation = "lighter";
      c.imageSmoothingEnabled = false;
      for (const dir of SPRITE_DIRS) {
        const a = lit.light[dir.key];
        if (a < 0.01) continue;
        c.globalAlpha = Math.min(1, a);
        c.drawImage(masks[dir.key], 0, 0);
      }
      c.restore();
    }
  }

  /** Items and enemies in view, then the hero. */
  private casters(f: FrameContext): Caster[] {
    const g = f.game, spritesOff = f.spritesOff, reduceMotion = f.reduceMotion;
    const area1 = isArea1({ mode: g.mode, height: g.run.height });
    const casters: Caster[] = [];
    forEachViewTile(f, (x, y) => {
      const t = g.world.tile(x, y);
      if (!SHADOW_CASTERS.has(t.kind)) return;
      casters.push({
        x, y,
        key: `${t.kind}|${t.color}|${t.tier}|${t.enemy?.name ?? ""}|${area1}`,
        draw: (c) => paintContents(c, t, { x, y, time: f.now, spritesOff, reduceMotion, area1 }),
      });
    });
    casters.push({
      x: f.playerX, y: f.playerY, key: "hero",
      draw: (c) => {
        if (!spritesOff && drawGameSprite(c, "player")) return;
        paintHeroFallback(c);
      },
      hero: true,
    });
    return casters;
  }

  /** Adds torch `t`'s light on each side of `caster` into `light`, and
   * returns the shadow it casts; null when the torch doesn't reach it. */
  private lightCaster(f: FrameContext, caster: Caster, t: Torch, light: Record<SpriteDir, number>) {
    const cfg = LIGHTING_CONFIG.shadow, sl = LIGHTING_CONFIG.spriteLight;
    // Shadows swing gently as the flame sways.
    const sway = getTorchSway(t, f.now, f.reduceMotion);
    const dx = caster.x - t.x - sway.x, dy = caster.y - t.y - sway.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5 || d >= t.lightRadius) return null;
    if (!torchReaches(t, Math.round(caster.x), Math.round(caster.y))) return null;
    const flicker = getTorchFlicker(t, f.now, f.reduceMotion);
    const falloff = lightFalloff(d, t.lightRadius);
    // Light on the caster: split over the sides facing the torch (screen
    // space, y down; the torch lies opposite the shadow direction).
    const toX = -dx / d, toY = dy / d;
    const amount = sl.strength * Math.pow(falloff, sl.falloffPower) * flicker * (1 + sl.darkBoost * f.darkness);
    light.e += Math.max(0, toX) * amount;
    light.w += Math.max(0, -toX) * amount;
    light.s += Math.max(0, toY) * amount;
    light.n += Math.max(0, -toY) * amount;
    // Shadows fade more gently than the light itself so they stay readable,
    // and deepen as the room gets darker.
    const alpha = Math.min(0.95, cfg.strength * Math.sqrt(falloff) * flicker * (1 + cfg.darkBoost * f.darkness));
    return { dx, dy, d, flicker, alpha };
  }

  /** Stamps `caster`'s silhouette onto the shadow layer, sheared away from torch `t`. */
  private castShadow(f: FrameContext, layer: CanvasRenderingContext2D, caster: Caster, t: Torch,
    shadow: { dx: number; dy: number; d: number; flicker: number; alpha: number }, sil: HTMLCanvasElement) {
    const cfg = LIGHTING_CONFIG.shadow;
    const { dx, dy, d } = shadow;
    // Screen-space direction away from the torch (world y is up).
    const ux = dx / d, uy = -dy / d;
    const k = Math.min(cfg.maxLength, cfg.minLength + d * cfg.lengthPerTile) * shadow.flicker;
    // The shadow lies on the floor: the sprite's base line (y = 22) stays
    // put and horizontal, and height above it maps to a vertical stretch
    // (up when the torch is below, down when above) plus a partial lean
    // for side light. No rotation, so nothing swings below the base.
    const lean = ux * cfg.lean;
    const vert = this.verticalStretch(`${caster.x},${caster.y},${t.x},${t.y}`, uy);
    const o = tileOrigin(f, caster.x, caster.y);
    layer.setTransform(1, 0, 0, 1, o.x, o.y);
    layer.scale(f.s / 24, f.s / 24);
    // Sprite point (x, y), height h = 22 - y -> (x + h*k*lean, 22 + h*k*vert).
    layer.transform(1, 0, -k * lean, -k * vert, 22 * k * lean, 22 + 22 * k * vert);
    layer.globalAlpha = Math.min(1, shadow.alpha);
    layer.drawImage(sil, 0, 0);
  }

  /** Below minVertical, the true direction is unreliable noise (the torch
   * is ~level with the caster), so keep the last committed sign instead
   * of snapping on every sway-driven crossing of uy = 0 (which flickered
   * the shadow between two states every few seconds). */
  private verticalStretch(pair: string, uy: number) {
    const minVertical = LIGHTING_CONFIG.shadow.minVertical;
    if (Math.abs(uy) >= minVertical) {
      this.shadowVertSign.set(pair, Math.sign(uy));
      return uy;
    }
    // Never seen a decisive uy yet for this pair (e.g. the caster sits
    // level with the torch, so sway alone keeps uy under the threshold
    // forever): pick a sign once and cache it, rather than recomputing
    // from the current (tiny, noisy) uy every frame.
    let sign = this.shadowVertSign.get(pair);
    if (sign === undefined) {
      sign = uy > 0 ? 1 : -1;
      this.shadowVertSign.set(pair, sign);
    }
    return sign * minVertical;
  }

  private shadowLayer(viewportSize: number) {
    this.shadowCanvas ??= document.createElement("canvas");
    const cv = this.shadowCanvas;
    if (cv.width !== viewportSize || cv.height !== viewportSize) cv.width = cv.height = viewportSize;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, viewportSize, viewportSize);
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  /** A solid, crisp silhouette of whatever `draw` paints into a 24x24 tile.
   * Faint pixels (ground ellipses, glows, sparkles) are dropped so only the
   * body of the sprite casts a shadow. */
  private silhouette(key: string, draw: (c: CanvasRenderingContext2D) => void, now: number) {
    const cached = this.silhouettes.get(key);
    if (cached && now - cached.at < 1500) return cached.canvas;
    const canvas = cached?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    draw(ctx);
    const img = ctx.getImageData(0, 0, 24, 24);
    const [r, g, b] = LIGHTING_CONFIG.shadow.color;
    for (let i = 0; i < img.data.length; i += 4) {
      const solid = img.data[i + 3] > 140;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = solid ? 255 : 0;
    }
    ctx.putImageData(img, 0, 0);
    this.silhouettes.set(key, { canvas, at: now });
    return canvas;
  }

  /** Four directional light masks for a sprite, from its silhouette: a fill
   * that ramps up across the sprite toward the lit side, plus a 1px sheen on
   * the edge pixels facing that way. Rebaked with its silhouette. */
  private spriteLightFor(key: string, draw: (c: CanvasRenderingContext2D) => void, now: number) {
    const sil = this.silhouette(key, draw, now);
    const silAt = this.silhouettes.get(key)?.at;
    if (!sil || silAt === undefined) return null;
    const cached = this.spriteLightMasks.get(key);
    if (cached && cached.at === silAt) return cached.masks;
    const src = sil.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, 24, 24).data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < 24 && y < 24 && src[(y * 24 + x) * 4 + 3] > 0;
    const bounds = solidBounds(solid);
    const masks = {} as Record<SpriteDir, HTMLCanvasElement>;
    for (const dir of SPRITE_DIRS) {
      const cv = cached?.masks[dir.key] ?? document.createElement("canvas");
      cv.width = cv.height = 24;
      const ctx = cv.getContext("2d")!;
      ctx.putImageData(lightMask(ctx, solid, bounds, dir), 0, 0);
      masks[dir.key] = cv;
    }
    this.spriteLightMasks.set(key, { at: silAt, masks });
    return masks;
  }
}

type Solid = (x: number, y: number) => boolean;
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
/** The bounding box of a 24x24 sprite's solid pixels. */
function solidBounds(solid: Solid): Bounds {
  let minX = 24, maxX = -1, minY = 24, maxY = -1;
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      if (solid(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { minX, maxX, minY, maxY };
}
/** How far across the sprite (0 at the far side, 1 at the lit edge) pixel (x, y) sits toward `dir`. */
function towardLight(dir: { dx: number; dy: number }, { minX, maxX, minY, maxY }: Bounds, x: number, y: number) {
  const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
  if (dir.dx > 0) return (x - minX) / spanX;
  if (dir.dx < 0) return (maxX - x) / spanX;
  if (dir.dy < 0) return (maxY - y) / spanY;
  return (y - minY) / spanY;
}
/** One direction's light mask: a fill ramping toward the lit side, plus a
 * rim on the solid pixels whose neighbour that way is empty. */
function lightMask(ctx: CanvasRenderingContext2D, solid: Solid, bounds: Bounds, dir: { dx: number; dy: number }) {
  const cfg = LIGHTING_CONFIG.spriteLight, [r, g, b] = cfg.color;
  const img = ctx.createImageData(24, 24);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (!solid(x, y)) continue;
      const fill = cfg.fill * Math.pow(Math.max(0, towardLight(dir, bounds, x, y)), cfg.fillCurve);
      const rim = solid(x + dir.dx, y + dir.dy) ? 0 : 1;
      const i = (y * 24 + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = Math.round(Math.max(fill, rim) * 255);
    }
  return img;
}
