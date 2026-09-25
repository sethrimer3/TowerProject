import type { Torch } from "./entities.ts";
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "./lighting.ts";
import { area1FloorSprite } from "./area1-tileset.ts";
import { bakeTorchRelief, type BakedRelief } from "./floor-relief.ts";
import { bakeTorchLight, type BakedLight } from "./torch-light.ts";
import { doorColor, doorId } from "./doors.ts";
import type { Tile } from "./entities.ts";
import { isArea1 } from "./tile-painters.ts";
import {
  forEachViewTile, screenX, screenY, sized, tileCenter, type FrameContext, type GlowSource, type Rect,
} from "./render-frame.ts";

export interface AtmosphereConfig {
  /** Screen tint color for cool dungeon atmosphere (e.g. subtle purple-blue) */
  ambientColor: string;
  /** Opacity / strength of the cool screen tint (0 to 1) */
  ambientStrength: number;
  /** Vignette edge opacity / strength (0 to 1) */
  vignetteStrength: number;
  /** Vignette softness / inner radius factor (0 to 1, higher = softer inner spread) */
  vignetteSoftness: number;
  /** Torch atmospheric haze opacity / strength (0 to 1) */
  torchHazeStrength: number;
  /** Torch haze radius multiplier relative to torch light radius (e.g. 1.2 - 1.5) */
  torchHazeRadius: number;
  /** Blur filter pixel amount applied to torch haze feathering (in px) */
  torchHazeBlur: number;
}

export const ATMOSPHERE_CONFIG: AtmosphereConfig = {
  // Gentle cool purple-blue tone that provides moody contrast against amber torches
  ambientColor: "rgba(36, 26, 60, 1)",
  ambientStrength: 0.06,
  vignetteStrength: 0.12,
  vignetteSoftness: 0.6,
  torchHazeStrength: 0.08,
  torchHazeRadius: 1.2,
  torchHazeBlur: 4,
};

const GLOW_ITEMS = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "reward", "treasure"]);
const hexRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};
/** How far between its two baked sway positions a torch's light leans (0..1). */
const leanOf = (sway: { x: number }) => Math.max(0, Math.min(1, 0.5 + sway.x / (2 * LIGHTING_CONFIG.flicker.swayX)));

/** Darkens the relief's shaded side of the bricks and lights the other. */
function blitRelief(f: FrameContext, b: BakedRelief, alpha: number) {
  const c = f.c, x0 = screenX(f, b.left), y0 = screenY(f, b.top), size = b.tiles * f.s;
  c.globalAlpha = alpha;
  c.globalCompositeOperation = "source-over";
  c.drawImage(b.shadow, x0, y0, size, size);
  c.globalCompositeOperation = "lighter";
  c.drawImage(b.highlight, x0, y0, size, size);
}

/** The dungeon's light: torch relief on the floor, the Brightness setting's
 * darkness, object glows, the torch lightmap, and the vignette. Owns the
 * offscreen layers and per-torch bakes these need; each method is one step
 * of Renderer.draw, called in order with that frame's context. */
export class LightingPass {
  atmosphere: AtmosphereConfig = { ...ATMOSPHERE_CONFIG };
  private lightmapCanvas: HTMLCanvasElement | null = null;
  private lightmapCtx: CanvasRenderingContext2D | null = null;
  private torchGlowCanvas: HTMLCanvasElement | null = null;
  private darkCanvas: HTMLCanvasElement | null = null;
  /** The darkness layer before object glows are added, used to darken the
   * sprites themselves so their own glow never tints them. */
  private spriteDarkCanvas: HTMLCanvasElement | null = null;
  private contentsCanvas: HTMLCanvasElement | null = null;
  private contentsMaskCanvas: HTMLCanvasElement | null = null;
  private glowCanvas: HTMLCanvasElement | null = null;
  private glowWallCanvas: HTMLCanvasElement | null = null;
  /** Soft round glow images, one per color, drawn scaled for every glow. */
  private glowSprites = new Map<string, HTMLCanvasElement>();
  /** Opaque wall tiles for the current camera, used to mask darkness and
   * shadows off walls with a single blit. Rebuilt only when the view moves. */
  private wallMaskCache: { canvas: HTMLCanvasElement; key: string; world: unknown } | null = null;
  /** Each torch's glow baked with the flame nudged left and right. */
  private torchBakes = new WeakMap<Torch, { left: BakedLight; right: BakedLight } | null>();
  /** Each torch's relief baked with the light nudged left and right. */
  private reliefBakes = new WeakMap<Torch, { left: BakedRelief; right: BakedRelief } | null>();
  /** Torch bakes cost a few ms each; spread them over frames on room entry. */
  private bakeBudget = 0;

  /** Resets the per-frame torch-baking budget. */
  startFrame() {
    this.bakeBudget = 2;
  }

  /** Doors, stairs, items, and enemies in view, with their glow settings. */
  glowSources(f: Pick<FrameContext, "game" | "n" | "left" | "bottom" | "now" | "reduceMotion">): GlowSource[] {
    const og = LIGHTING_CONFIG.objectGlow, dk = LIGHTING_CONFIG.darkness;
    const out: GlowSource[] = [];
    forEachViewTile(f, (x, y) => {
      const t = f.game.world.tile(x, y);
      // Slow, per-object breathing so a room of glows doesn't pulse in unison.
      const breathe = f.reduceMotion ? 1 : 1 - og.pulse + og.pulse * Math.sin(f.now / 650 + x * 1.7 + y * 2.3);
      if (t.kind === "enemy") out.push({ x, y, rgb: og.enemy.color, radius: og.enemy.radius, strength: og.enemy.strength * breathe });
      else if (GLOW_ITEMS.has(t.kind)) out.push({ x, y, rgb: og.item.color, radius: og.item.radius, strength: og.item.strength * breathe });
      else if (t.kind === "door") {
        const id = doorId(t);
        const rgb = id === "heart" ? og.door.heart : id === "steel" ? og.door.steel : hexRgb(doorColor(t));
        out.push({ x, y, rgb, radius: og.door.radius, strength: og.door.strength, door: true });
      }
      else if (t.kind === "stairs" || t.kind === "stairsDown")
        out.push({ x, y, rgb: [150, 160, 200], radius: dk.heroHaloRadius * og.stairsRadiusScale, strength: dk.heroHaloAlpha * og.stairsAlphaScale });
    });
    return out;
  }

  /** Opaque squares over the wall tiles in view (see wallMaskCache). */
  wallMask(f: FrameContext) {
    const key = `${f.left},${f.bottom},${f.s},${f.width}`;
    const world = f.game.world;
    if (this.wallMaskCache?.key === key && this.wallMaskCache.world === world) return this.wallMaskCache.canvas;
    const canvas = this.wallMaskCache?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = f.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.beginPath();
    for (const [wx, wy] of f.walls) ctx.rect(screenX(f, wx), screenY(f, wy + 1), f.s, f.s);
    ctx.fill();
    this.wallMaskCache = { canvas, key, world };
    return canvas;
  }

  /** Torch bump lighting on area-one floor sprites (see floor-relief.ts):
   * each torch's relief is baked once, then blitted with its flicker. */
  drawTorchRelief(f: FrameContext) {
    const g = f.game;
    if (!isArea1({ mode: g.mode, height: g.run.height })) return;
    const c = f.c;
    const cfg = LIGHTING_CONFIG.relief;
    const floorSprite = (x: number, y: number) =>
      g.world.tile(x, y)?.kind === "wall" ? null : area1FloorSprite(x, y, g.run.seed) ?? undefined;
    c.save();
    c.imageSmoothingEnabled = false;
    for (const t of f.torches) {
      const bake = this.reliefBake(t, floorSprite);
      if (!bake) continue;
      // Brightness follows the flicker, amplified so it reads on the floor;
      // the two nudged bakes cross-fade with the flame's lean.
      const flicker = getTorchFlicker(t, f.now, f.reduceMotion);
      const lean = leanOf(getTorchSway(t, f.now, f.reduceMotion));
      const alpha = Math.max(0, Math.min(1, cfg.flickerBase + (flicker - 1) * cfg.flickerGain));
      for (const [b, share] of [[bake.left, 1 - lean], [bake.right, lean]] as const)
        if (share >= 0.02) blitRelief(f, b, alpha * share);
    }
    c.restore();
  }
  /** A torch's baked floor relief; null when it has none, undefined while
   * it can't be baked yet (budget spent or sprites still loading). */
  private reliefBake(t: Torch, floorSprite: (x: number, y: number) => HTMLImageElement | null | undefined) {
    const known = this.reliefBakes.get(t);
    if (known !== undefined) return known;
    if (this.bakeBudget <= 0) return undefined;
    const offset = LIGHTING_CONFIG.relief.swayOffset;
    const left = bakeTorchRelief(t, floorSprite, -offset);
    if (left === undefined) return undefined; // sprites still loading; retry next frame (cheap early exit)
    const right = bakeTorchRelief(t, floorSprite, offset);
    if (right === undefined) return undefined;
    this.bakeBudget--;
    const bake = left && right ? { left, right } : null;
    this.reliefBakes.set(t, bake);
    return bake;
  }

  /** The "Brightness" setting's dark-delving layer: a cool, near-black
   * multiply tone that torchlight lifts back out as warm light, plus a
   * faint halo around the hero. The caller multiplies it over the ground,
   * and a softened version (`spriteDark`, taken before the object glows go
   * in) over doors, stairs, items, and enemies. One fill and one blit per
   * torch. Returns null at the default brightness. */
  buildDarkness(f: FrameContext, shadows: HTMLCanvasElement | null) {
    const k = f.darkness, size = f.width;
    if (k <= 0 || typeof document === "undefined") return null;
    const cv = this.darkCanvas = sized(this.darkCanvas, size);
    const dc = cv.getContext("2d");
    if (!dc) return null;
    const cfg = LIGHTING_CONFIG.darkness;
    const mix = (i: number) => Math.round(255 + (cfg.color[i] - 255) * k);
    dc.globalCompositeOperation = "source-over";
    dc.globalAlpha = 1;
    dc.fillStyle = `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
    dc.fillRect(0, 0, size, size);
    for (const t of f.torches) this.drawTorchLight(f, dc, t, "lighter", cfg.torchLift * k * t.baseIntensity);
    // A shadow is where the torch's light doesn't reach: cast shadows take
    // the torchlight back out of the darkness layer, so they read clearly.
    if (shadows) {
      dc.globalCompositeOperation = "source-over";
      dc.globalAlpha = Math.min(1, LIGHTING_CONFIG.shadow.blockLight * k);
      dc.drawImage(shadows, 0, 0);
    }
    const hero = tileCenter(f, f.playerX, f.playerY);
    const r = cfg.heroHaloRadius * f.s;
    const halo = dc.createRadialGradient(hero.x, hero.y, 0, hero.x, hero.y, r);
    halo.addColorStop(0, `rgba(150, 160, 200, ${cfg.heroHaloAlpha * k})`);
    halo.addColorStop(1, "rgba(150, 160, 200, 0)");
    dc.globalCompositeOperation = "lighter";
    dc.globalAlpha = 1;
    dc.fillStyle = halo;
    dc.fillRect(hero.x - r, hero.y - r, r * 2, r * 2);
    dc.globalCompositeOperation = "source-over";
    // Snapshot for darkening the sprites, before the object glows go in.
    const sd = this.spriteDarkCanvas = sized(this.spriteDarkCanvas, size);
    const sdc = sd.getContext("2d");
    if (sdc) {
      sdc.globalCompositeOperation = "copy";
      sdc.drawImage(cv, 0, 0);
      sdc.globalCompositeOperation = "source-over";
    }
    // Object glows lift the darkness like light does, so they brighten and
    // color the stone while keeping its texture, instead of fogging over it.
    const glowLayer = this.objectGlowLayer(f);
    if (glowLayer) {
      dc.globalCompositeOperation = "lighter";
      dc.globalAlpha = Math.min(1, LIGHTING_CONFIG.objectGlow.darkStrength * k);
      dc.drawImage(glowLayer, 0, 0);
      dc.globalCompositeOperation = "source-over";
      dc.globalAlpha = 1;
    }
    return { dark: cv, spriteDark: sd };
  }

  /** Object glows, laid on the already-darkened ground so the sprites drawn
   * next sit on top of them. They grow with darkness: none at the default
   * brightness, full strength at the darkest. */
  drawObjectBloom(f: FrameContext) {
    const layer = this.glowCanvas;
    if (!layer || !f.glows.length) return;
    const c = f.c;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = Math.min(1, LIGHTING_CONFIG.objectGlow.bloom * f.darkness);
    c.drawImage(layer, 0, 0, f.width, f.width);
    c.restore();
  }

  /** A faint wash of each door's glow color over the door sprite itself. */
  drawDoorWash(f: FrameContext) {
    const k = f.darkness, og = LIGHTING_CONFIG.objectGlow;
    const doors = f.glows.filter((o) => o.door);
    if (!doors.length || k <= 0) return;
    const c = f.c, r = 0.62 * f.s;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = Math.min(1, og.door.onTop * k);
    for (const o of doors) {
      const center = tileCenter(f, o.x, o.y);
      c.drawImage(this.glowSprite(o.rgb), center.x - r, center.y - r, r * 2, r * 2);
    }
    c.restore();
  }

  /** Draws tile contents (doors, stairs, items, enemies) on their own layer,
   * multiplies a softened copy of the darkness over just their pixels, then
   * lays them on the scene: they stay a little brighter than the stone.
   * `draw` paints onto the context it's given (CSS-pixel transform). Work
   * is limited to `region` (CSS pixels; one box, or several whose union is
   * used) when given: every step is a full-canvas blit otherwise, which is
   * costly when the sprites cover a small part of the board. */
  drawDarkened(f: FrameContext, dark: HTMLCanvasElement, amount: number, draw: (c: CanvasRenderingContext2D) => void,
    region?: Rect | Rect[]) {
    const main = f.c, dpr = f.dpr, w = main.canvas.width, h = main.canvas.height;
    const boxes = (region ? (Array.isArray(region) ? region : [region]) : [{ x: 0, y: 0, w: w / dpr, h: h / dpr }])
      .map((r) => {
        const x = Math.max(0, Math.floor(r.x * dpr)), y = Math.max(0, Math.floor(r.y * dpr));
        return { x, y, w: Math.min(w, Math.ceil((r.x + r.w) * dpr)) - x, h: Math.min(h, Math.ceil((r.y + r.h) * dpr)) - y };
      })
      .filter((r) => r.w > 0 && r.h > 0);
    if (!boxes.length) return;
    const rx = Math.min(...boxes.map((r) => r.x)), ry = Math.min(...boxes.map((r) => r.y));
    const rw = Math.max(...boxes.map((r) => r.x + r.w)) - rx, rh = Math.max(...boxes.map((r) => r.y + r.h)) - ry;
    // Each step runs clipped to the union (multiply must not run twice
    // where boxes overlap).
    const clipped = (c: CanvasRenderingContext2D, step: () => void) => {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (boxes.length > 1) {
        c.beginPath();
        for (const b of boxes) c.rect(b.x, b.y, b.w, b.h);
        c.clip();
      }
      step();
      c.restore();
    };
    const contents = this.contentsCanvas = sized(this.contentsCanvas, w, h);
    const mask = this.contentsMaskCanvas = sized(this.contentsMaskCanvas, w, h);
    const cc = contents.getContext("2d"), mc = mask.getContext("2d");
    if (!cc || !mc) return draw(main);
    cc.globalCompositeOperation = "source-over";
    cc.globalAlpha = 1;
    clipped(cc, () => {
      cc.clearRect(rx, ry, rw, rh);
      if (boxes.length === 1) {
        cc.beginPath();
        cc.rect(rx, ry, rw, rh);
        cc.clip();
      }
      cc.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(cc);
    });
    // Keep the sprites' shape: multiply paints into empty pixels too, so
    // the original coverage is restored afterwards.
    mc.globalCompositeOperation = "source-over";
    clipped(mc, () => {
      mc.clearRect(rx, ry, rw, rh);
      mc.drawImage(contents, rx, ry, rw, rh, rx, ry, rw, rh);
    });
    const k = f.width / w;
    clipped(cc, () => {
      cc.globalCompositeOperation = "multiply";
      cc.globalAlpha = amount;
      cc.drawImage(dark, rx * k, ry * k, rw * k, rh * k, rx, ry, rw, rh);
      cc.globalCompositeOperation = "destination-in";
      cc.globalAlpha = 1;
      cc.drawImage(mask, rx, ry, rw, rh, rx, ry, rw, rh);
    });
    cc.globalCompositeOperation = "source-over";
    clipped(main, () => main.drawImage(contents, rx, ry, rw, rh, rx, ry, rw, rh));
  }

  /** Renders ambient darkness and baked torch light to an offscreen lightmap,
   * then composites the result over the dungeon tiles; then the torches'
   * warm haze and glow on their own layer, blended as light. Per frame this
   * is a couple of fills plus a few image blits per torch; no canvas filters. */
  drawLightmap(f: FrameContext, shadows: HTMLCanvasElement | null) {
    const lm = this.ensureLightmap(f.width);
    if (!lm) {
      // Fallback if offscreen canvas cannot be instantiated (e.g. headless tests without canvas DOM)
      const mainCtx = f.c;
      mainCtx.save();
      mainCtx.fillStyle = LIGHTING_CONFIG.ambient.color;
      mainCtx.globalAlpha = LIGHTING_CONFIG.ambient.opacity;
      mainCtx.fillRect(0, 0, f.width, f.width);
      mainCtx.restore();
      return;
    }
    this.drawAmbientDarkness(f, lm);
    this.drawTorchGlow(f, shadows);
  }
  /** Creates or resizes an offscreen canvas for rendering the composite lightmap. */
  private ensureLightmap(viewportSize: number) {
    if (!this.lightmapCanvas) {
      this.lightmapCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (this.lightmapCanvas) {
        this.lightmapCtx = this.lightmapCanvas.getContext("2d");
      }
    }
    if (this.lightmapCanvas && (this.lightmapCanvas.width !== viewportSize || this.lightmapCanvas.height !== viewportSize)) {
      this.lightmapCanvas.width = viewportSize;
      this.lightmapCanvas.height = viewportSize;
    }
    return this.lightmapCtx;
  }
  private drawAmbientDarkness(f: FrameContext, lm: CanvasRenderingContext2D) {
    const size = f.width, atm = this.atmosphere;
    // 1. Clear offscreen lightmap
    lm.globalCompositeOperation = "source-over";
    lm.globalAlpha = 1;
    lm.clearRect(0, 0, size, size);

    // 2. Base ambient darkness overlay (subtle dark purple)
    lm.fillStyle = LIGHTING_CONFIG.ambient.color;
    lm.globalAlpha = LIGHTING_CONFIG.ambient.opacity;
    lm.fillRect(0, 0, size, size);

    // 3. Optional cool atmospheric tint
    if (atm.ambientStrength > 0) {
      lm.globalAlpha = atm.ambientStrength;
      lm.fillStyle = atm.ambientColor;
      lm.fillRect(0, 0, size, size);
    }

    // 3b. Punch the darkness mask out over structural walls so they stay
    // fully readable regardless of torch proximity (darkness should only
    // ever dim walkable floor, not the architecture around it).
    lm.globalCompositeOperation = "destination-out";
    lm.globalAlpha = 1;
    const walls = this.wallMask(f);
    if (walls) lm.drawImage(walls, 0, 0);

    // 4. Torchlight carves the darkness away where it falls...
    for (const t of f.torches) this.drawTorchLight(f, lm, t, "destination-out", LIGHTING_CONFIG.glow.carve);
    lm.globalCompositeOperation = "source-over";
    lm.globalAlpha = 1;

    // 5. Composite the darkness onto the main canvas.
    f.c.drawImage(this.lightmapCanvas!, 0, 0);
  }
  /** Warm haze and candle glow go on their own layer, blended as light:
   * soft-light warms and brightens while keeping dark grout dark, and a
   * little additive bloom adds glow near the flame. (Laying the glow over
   * the scene with normal alpha, as before, flattened contrast into fog.) */
  private drawTorchGlow(f: FrameContext, shadows: HTMLCanvasElement | null) {
    const size = f.width, glow = LIGHTING_CONFIG.glow;
    const gcv = this.torchGlowCanvas = sized(this.torchGlowCanvas, size);
    const gl = gcv.getContext("2d");
    if (!gl || !f.torches.length) return;
    gl.globalCompositeOperation = "source-over";
    gl.globalAlpha = 1;
    gl.clearRect(0, 0, size, size);
    if (this.atmosphere.torchHazeStrength > 0) {
      for (const t of f.torches) this.drawTorchHaze(f, gl, t);
    }
    // The warm glow eases off a little as the Brightness setting goes up.
    const glowScale = 1 - glow.brightDim * (1 - f.darkness);
    for (const t of f.torches) this.drawTorchLight(f, gl, t, "lighter", glow.strength * glowScale * t.baseIntensity);
    // Cast shadows block the warm glow too, or it would light them back up.
    if (shadows) {
      gl.globalCompositeOperation = "destination-out";
      gl.globalAlpha = LIGHTING_CONFIG.shadow.blockLight;
      gl.drawImage(shadows, 0, 0);
    }
    gl.globalCompositeOperation = "source-over";
    gl.globalAlpha = 1;
    const mainCtx = f.c;
    mainCtx.save();
    mainCtx.globalCompositeOperation = "soft-light";
    mainCtx.globalAlpha = glow.softLight;
    mainCtx.drawImage(gcv, 0, 0);
    mainCtx.globalCompositeOperation = "lighter";
    mainCtx.globalAlpha = glow.bloom;
    mainCtx.drawImage(gcv, 0, 0);
    mainCtx.restore();
  }

  /** Faint radial vignette around the perimeter of the dungeon viewport
   * to subtly guide focus inward and add depth without obscuring readability. */
  drawVignette(f: FrameContext) {
    const atm = this.atmosphere, viewportSize = f.width;
    // Darker brightness settings close the edges in further.
    const strength = Math.min(1, atm.vignetteStrength + f.darkness * LIGHTING_CONFIG.darkness.vignette);
    if (strength <= 0) return;
    const c = f.c,
      half = viewportSize / 2,
      maxRadius = half * Math.SQRT2,
      innerRadius = Math.max(0, half * Math.min(1, Math.max(0, atm.vignetteSoftness)));
    c.save();
    const gr = c.createRadialGradient(half, half, innerRadius, half, half, maxRadius);
    gr.addColorStop(0, "rgba(5, 7, 14, 0)");
    gr.addColorStop(0.65, `rgba(5, 7, 14, ${strength * 0.35})`);
    gr.addColorStop(1, `rgba(5, 7, 14, ${strength})`);
    c.fillStyle = gr;
    c.fillRect(0, 0, viewportSize, viewportSize);
    c.restore();
  }

  /** A soft round glow (color at full strength in the middle, fading to
   * nothing at the rim), cached per color and drawn scaled. */
  private glowSprite(rgb: readonly number[]) {
    const key = rgb.join(",");
    let cv = this.glowSprites.get(key);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = cv.height = 64;
      const ctx = cv.getContext("2d")!;
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      // Concentrated core, quick falloff: neighbouring glows stay distinct.
      gr.addColorStop(0, `rgba(${key}, 1)`);
      gr.addColorStop(0.3, `rgba(${key}, 0.55)`);
      gr.addColorStop(0.65, `rgba(${key}, 0.15)`);
      gr.addColorStop(1, `rgba(${key}, 0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 64);
      this.glowSprites.set(key, cv);
    }
    return cv;
  }

  /** All object glows for this frame on one layer. Floor glow is wide and
   * kept off the wall tops; wall glow is brighter but reaches half as far
   * and is kept to wall tiles, so stone right beside a glowing object
   * catches a bright wash that falls off quickly, like light on a wall face.
   * One blit per glow (from a cached glow image) plus a few layer masks. */
  private objectGlowLayer(f: FrameContext) {
    const sources = f.glows;
    if (!sources.length || typeof document === "undefined") return null;
    this.glowCanvas = sized(this.glowCanvas, f.width);
    this.glowWallCanvas = sized(this.glowWallCanvas, f.width);
    const floor = this.glowCanvas.getContext("2d"), wall = this.glowWallCanvas.getContext("2d");
    const mask = this.wallMask(f);
    if (!floor || !wall || !mask) return null;
    const og = LIGHTING_CONFIG.objectGlow, s = f.s;
    for (const ctx of [floor, wall]) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, f.width, f.width);
      ctx.globalCompositeOperation = "lighter";
    }
    for (const o of sources) {
      const sprite = this.glowSprite(o.rgb);
      const { x: cx, y: cy } = tileCenter(f, o.x, o.y);
      const r = o.radius * s, rw = r * og.wallRadiusScale, rwx = rw * og.wallWiden;
      floor.globalAlpha = Math.min(1, o.strength);
      floor.drawImage(sprite, cx - r, cy - r, r * 2, r * 2);
      // Wider than tall and nudged up: side and upper walls catch the most.
      const wy = cy - og.wallLift * s;
      wall.globalAlpha = Math.min(1, o.strength * og.wallBoost);
      wall.drawImage(sprite, cx - rwx, wy - rw, rwx * 2, rw * 2);
    }
    floor.globalAlpha = 1;
    wall.globalAlpha = 1;
    floor.globalCompositeOperation = "destination-out";
    floor.drawImage(mask, 0, 0);
    wall.globalCompositeOperation = "destination-in";
    wall.drawImage(mask, 0, 0);
    floor.globalCompositeOperation = "lighter";
    floor.drawImage(this.glowWallCanvas, 0, 0);
    floor.globalCompositeOperation = "source-over";
    return this.glowCanvas;
  }

  /** The torch's baked light field (see torch-light.ts), created on first use. */
  private torchBake(f: FrameContext, t: Torch) {
    let bake = this.torchBakes.get(t);
    if (bake === undefined) {
      if (this.bakeBudget <= 0) return null;
      this.bakeBudget--;
      const world = f.game.world;
      const isWall = (x: number, y: number) => world.tile(x, y)?.kind === "wall";
      const offset = LIGHTING_CONFIG.glow.swayOffset;
      const left = bakeTorchLight(t, isWall, -offset), right = bakeTorchLight(t, isWall, offset);
      bake = left && right ? { left, right } : null;
      this.torchBakes.set(t, bake);
    }
    return bake;
  }

  /** Blits a torch's baked light, gently flickering in brightness and reach.
   * The field is low-resolution and upscaled with smoothing, which keeps the
   * falloff soft for free. */
  private drawTorchLight(f: FrameContext, c: CanvasRenderingContext2D, t: Torch, op: GlobalCompositeOperation, alpha: number) {
    const bake = this.torchBake(f, t);
    if (!bake) return;
    const flicker = getTorchFlicker(t, f.now, f.reduceMotion);
    // Both bakes sit on the tile grid (never moved or scaled), so the light's
    // edges stay flush with the walls; the lean only cross-fades between them.
    const lean = leanOf(getTorchSway(t, f.now, f.reduceMotion));
    const field = bake.left.field;
    const x0 = screenX(f, field.left), y0 = screenY(f, field.top), size = field.tiles * f.s;
    c.globalCompositeOperation = op;
    c.imageSmoothingEnabled = true;
    for (const [b, share] of [[bake.left, 1 - lean], [bake.right, lean]] as const) {
      if (share < 0.02) continue;
      c.globalAlpha = Math.min(1, alpha * flicker * share);
      c.drawImage(b.canvas, x0, y0, size, size);
    }
  }

  /** Soft warm atmospheric haze that diffuses into ambient air around torches.
   * Uses gentle additive blending with wide radial feathering. */
  private drawTorchHaze(f: FrameContext, c: CanvasRenderingContext2D, t: Torch) {
    const atm = this.atmosphere;
    const flicker = getTorchFlicker(t, f.now, f.reduceMotion);
    // The haze isn't occluded, so it stays put (a moving circle would slide
    // across the walls); it only breathes with the flicker.
    const cx = screenX(f, t.x + 0.5),
      cy = screenY(f, t.y + 0.5),
      hazeRadius = t.lightRadius * f.s * atm.torchHazeRadius,
      alpha = atm.torchHazeStrength * t.baseIntensity * flicker;
    if (alpha <= 0 || hazeRadius <= 0) return;

    // The radial gradient is already soft, so no blur filter is needed.
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = 1;
    const gr = c.createRadialGradient(cx, cy, 0, cx, cy, hazeRadius);
    gr.addColorStop(0, `rgba(255, 200, 140, ${0.30 * alpha})`);
    gr.addColorStop(0.35, `rgba(240, 170, 100, ${0.14 * alpha})`);
    gr.addColorStop(0.70, `rgba(220, 140, 70, ${0.04 * alpha})`);
    gr.addColorStop(1, "rgba(200, 120, 50, 0)");
    c.fillStyle = gr;
    c.fillRect(cx - hazeRadius, cy - hazeRadius, hazeRadius * 2, hazeRadius * 2);
    c.restore();
  }
}
