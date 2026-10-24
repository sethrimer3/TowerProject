import type { Tile, Torch } from "../entities.ts";
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "./lighting.ts";
import { torchReaches } from "./floor-relief.ts";
import { lightFalloff } from "./torch-light.ts";
import { drawGameSprite } from "../sprites/game-sprites.ts";
import { paintContents, paintHero, paintHeroFallback } from "./tile-painters.ts";
import { spriteRevision } from "../sprites/kit.ts";
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
type LightMasks = Record<SpriteDir, HTMLCanvasElement>;
/** The shadow torch `t` casts from a caster: the caster's offset from the
 * swaying flame and its distance, the flicker, and the shadow's opacity. */
type Shadow = { t: Torch; dx: number; dy: number; d: number; flicker: number; alpha: number };
/** A silhouette stamped at a caster's tile. */
type Stamp = { x: number; y: number; sil: HTMLCanvasElement };
/** This frame's shadow layer (made on first use) and what was stamped on it. */
type ShadowLayer = { layer: CanvasRenderingContext2D | null; stamps: Stamp[] };

/** Torchlight on the things standing in it: the shadows items, enemies,
 * and the hero cast across the floor, and the warm light on their torch-
 * facing sides. Owns the silhouettes and light masks baked from their
 * sprites. drawShadows runs first each frame; its lit casters and shadow
 * layer are then read by drawSpriteLighting and the lighting pass. */
export class EntityLighting {
  private spriteState = "";
  /** Black cut-outs of item/enemy/hero sprites used for torch-cast shadows.
   * Rebaked after a short while so sprites that finish loading are picked up. */
  private silhouettes = new Map<string, { canvas: HTMLCanvasElement; at: number }>();
  /** Directional torchlight masks per silhouette (see spriteLightFor). */
  private spriteLightMasks = new Map<string, { at: number; masks: LightMasks }>();
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
    // Swap masks immediately on a toggle or image arrival, keeping old
    // revisions out of the caches rather than accumulating one per load.
    const style = `${f.look.spritesOff}|${!!f.look.styledSprites}|${spriteRevision()}${f.look.squareDoors ? "|square" : ""}`;
    if (style !== this.spriteState) {
      this.spriteState = style;
      this.silhouettes.clear();
      this.spriteLightMasks.clear();
    }
    this.lit = [];
    this.castAny = false;
    if (!f.torches.length || typeof document === "undefined") return;
    const cast: ShadowLayer = { layer: null, stamps: [] };
    for (const caster of this.casters(f)) {
      const { light, shadows } = this.torchlightOn(f, caster);
      for (const shadow of shadows) if (!this.stampShadow(f, cast, caster, shadow)) return;
      if (shadows.length) this.lit.push({ ...caster, hero: !!caster.hero, light });
    }
    if (cast.layer) this.finishShadows(f, cast.layer, cast.stamps, wallMask);
  }

  /** The light every torch puts on each side of `caster`, and the shadows
   * cast by the torches that reach it. */
  private torchlightOn(f: FrameContext, caster: Caster) {
    const light: Record<SpriteDir, number> = { e: 0, w: 0, n: 0, s: 0 };
    const shadows: Shadow[] = [];
    for (const t of f.torches) {
      const shadow = this.lightCaster(f, caster, t, light);
      if (shadow) shadows.push(shadow);
    }
    return { light, shadows };
  }

  /** Stamps one of `caster`'s shadows on this frame's layer (made on first
   * use), unless it is too faint or the sprite has no silhouette yet.
   * False when there is no layer to draw on. */
  private stampShadow(f: FrameContext, cast: ShadowLayer, caster: Caster, shadow: Shadow) {
    if (shadow.alpha < 0.02) return true;
    const sil = this.silhouette(caster.key, caster.draw, f.now);
    if (!sil) return true;
    cast.layer ??= this.shadowLayer(f.width);
    if (!cast.layer) return false;
    const stamp = { x: caster.x, y: caster.y, sil };
    cast.stamps.push(stamp);
    this.castShadow(f, cast.layer, stamp, shadow);
    return true;
  }

  /** Cuts the sprites and walls out of the stamped shadows and lays them on the board. */
  private finishShadows(f: FrameContext, layer: CanvasRenderingContext2D, stamps: Stamp[], wallMask: () => HTMLCanvasElement | null) {
    // Shadows fall on the floor only: never over any sprite (its own or a
    // neighbour's; this layer also dims the darkness and glow passes)...
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = "destination-out";
    for (const c of stamps) {
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
      glaze(c, masks, lit.light);
      c.restore();
    }
  }

  /** Items and enemies in view, then the hero. */
  private casters(f: FrameContext): Caster[] {
    const { spritesOff, reduceMotion, area1, styledSprites, squareDoors } = f.look;
    const casters: Caster[] = [];
    forEachViewTile(f, (x, y) => {
      const t = f.world.tile(x, y);
      if (!SHADOW_CASTERS.has(t.kind)) return;
      casters.push({
        x, y,
        key: `${t.kind}|${t.color}|${t.tier}|${t.enemy?.name ?? ""}|${t.enemy?.tier}|${t.enemy?.strength}|${area1}${styledSprites ? `|kit|${t.enemy?.fast}|${t.enemy?.ranged}|${t.enemy?.flying}` : ""}`,
        draw: (c) => paintContents(c, t, { x, y, time: f.now, spritesOff, reduceMotion, area1, styledSprites, squareDoors }),
      });
    });
    casters.push({
      x: f.playerX, y: f.playerY, key: `hero${styledSprites ? `|kit|${f.heroFacing.dx},${f.heroFacing.dy}` : ""}`,
      draw: (c) => {
        if (styledSprites) return paintHero(c, spritesOff, true, f.heroFacing);
        if (!spritesOff && drawGameSprite(c, "player")) return;
        paintHeroFallback(c);
      },
      hero: true,
    });
    return casters;
  }

  /** Adds torch `t`'s light on each side of `caster` into `light`, and
   * returns the shadow it casts; null when the torch doesn't reach it. */
  private lightCaster(f: FrameContext, caster: Caster, t: Torch, light: Record<SpriteDir, number>): Shadow | null {
    const cfg = LIGHTING_CONFIG.shadow, sl = LIGHTING_CONFIG.spriteLight;
    // Shadows swing gently as the flame sways.
    const sway = getTorchSway(t, f.now, f.look.reduceMotion);
    const dx = caster.x - t.x - sway.x, dy = caster.y - t.y - sway.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5 || d >= t.lightRadius) return null;
    if (!torchReaches(t, Math.round(caster.x), Math.round(caster.y))) return null;
    const flicker = getTorchFlicker(t, f.now, f.look.reduceMotion);
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
    return { t, dx, dy, d, flicker, alpha };
  }

  /** Stamps a caster's silhouette onto the shadow layer, sheared away from the shadow's torch. */
  private castShadow(f: FrameContext, layer: CanvasRenderingContext2D, { x, y, sil }: Stamp, shadow: Shadow) {
    const cfg = LIGHTING_CONFIG.shadow;
    const { t, dx, dy, d } = shadow;
    // Screen-space direction away from the torch (world y is up).
    const ux = dx / d, uy = -dy / d;
    const k = Math.min(cfg.maxLength, cfg.minLength + d * cfg.lengthPerTile) * shadow.flicker;
    // The shadow lies on the floor: the sprite's base line (y = 22) stays
    // put and horizontal, and height above it maps to a vertical stretch
    // (up when the torch is below, down when above) plus a partial lean
    // for side light. No rotation, so nothing swings below the base.
    const lean = ux * cfg.lean;
    const vert = this.verticalStretch(`${x},${y},${t.x},${t.y}`, uy);
    const o = tileOrigin(f, x, y);
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
    toShadow(img.data);
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
    if (cached?.at === silAt) return cached.masks;
    const masks = lightMasks(sil, cached?.masks);
    this.spriteLightMasks.set(key, { at: silAt, masks });
    return masks;
  }
}

/** Adds each side's torchlight onto a sprite through its masks. */
function glaze(c: CanvasRenderingContext2D, masks: LightMasks, light: Record<SpriteDir, number>) {
  c.globalCompositeOperation = "lighter";
  c.imageSmoothingEnabled = false;
  for (const dir of SPRITE_DIRS) {
    const a = light[dir.key];
    if (a < 0.01) continue;
    c.globalAlpha = Math.min(1, a);
    c.drawImage(masks[dir.key], 0, 0);
  }
}

/** Bakes the four light masks of a silhouette, reusing `reuse`'s canvases when given. */
function lightMasks(sil: HTMLCanvasElement, reuse?: LightMasks): LightMasks {
  const src = sil.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, 24, 24).data;
  const solid = (x: number, y: number) => inTile(x, y) && src[(y * 24 + x) * 4 + 3] > 0;
  const bounds = solidBounds(solid);
  const masks = {} as LightMasks;
  for (const dir of SPRITE_DIRS) {
    const cv = reuse?.[dir.key] ?? document.createElement("canvas");
    cv.width = cv.height = 24;
    const ctx = cv.getContext("2d")!;
    ctx.putImageData(lightMask(ctx, solid, bounds, dir), 0, 0);
    masks[dir.key] = cv;
  }
  return masks;
}

/** Turns sprite pixels into shadow: solid where fairly opaque, clear elsewhere. */
function toShadow(data: Uint8ClampedArray) {
  const [r, g, b] = LIGHTING_CONFIG.shadow.color;
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, data[i + 3] > 140 ? 255 : 0], i);
}

/** Whether (x, y) is a pixel of a 24x24 sprite. */
function inTile(x: number, y: number) {
  return Math.min(x, y) >= 0 && Math.max(x, y) < 24;
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
      const rim = Number(!solid(x + dir.dx, y + dir.dy));
      const i = (y * 24 + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
      img.data[i + 3] = Math.round(Math.max(fill, rim) * 255);
    }
  return img;
}
