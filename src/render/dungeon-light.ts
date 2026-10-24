import { LIGHTING_CONFIG } from "./lighting.ts";
import { LightingPass, type AtmosphereConfig } from "./lighting-pass.ts";
import { EntityLighting } from "./entity-lighting.ts";
import { forEachViewTile, tileOrigin, tileTransform, type FrameContext, type GlowSource, type Rect } from "./render-frame.ts";

/** A box in world pixels (24 per tile; y grows downward, so row y spans
 * -24·y to -24·y + 24). */
export type WorldBox = { x0: number; y0: number; x1: number; y1: number };

/** Whatever stands in front of the hero this frame (grass over its feet,
 * splinters, drips), and the box it covers. */
export type Foreground = { bounds: WorldBox; draw: (ctx: CanvasRenderingContext2D) => void };

/** What the board draws between the light's steps. Each is called once a
 * frame, in the order listed; `contents` may draw onto an offscreen layer,
 * so it paints onto the context it's given. */
export type LitBoard = {
  /** Decor on the stone: after the torch relief, under the cast shadows. */
  floor(): void;
  /** Extra glows laid on the darkened ground after the objects' own (decor
   * blooms). Only called below the default brightness. */
  glow(): void;
  /** Tile contents (doors, stairs, items, enemies), in screen space. */
  contents(ctx: CanvasRenderingContext2D): void;
  /** Torch sprites: over the darkness, so the flames are never dimmed. */
  torches(): void;
  /** Whatever goes between the torchlight and the hero (the route line). */
  route(): void;
  /** Light around the hero, in 24×24 tile space: drawn on the board after
   * the darkness and just before the hero, so it is never dimmed. */
  halo?(ctx: CanvasRenderingContext2D): void;
  /** The hero, in 24×24 tile space. */
  hero(ctx: CanvasRenderingContext2D): void;
  /** Called after the hero; null when nothing stands in front of it. */
  foreground(): Foreground | null;
  /** The board's frame, under the vignette. */
  edge(): void;
};

/** The dungeon's light over one frame of the board: torch relief on the
 * floor, torch-cast shadows, the Brightness darkness with object glows and
 * less-darkened sprites, torchlight on sprites, the lightmap and haze, and
 * the vignette. It runs the whole dungeon frame in that order, calling back
 * into the board (a LitBoard) for what it draws in between. The two passes
 * behind it are render/lighting-pass.ts (the board's light) and
 * render/entity-lighting.ts (shadows and light on sprites). */
export class DungeonLight {
  private pass = new LightingPass();
  private entities = new EntityLighting();

  /** The dungeon atmosphere (tint, vignette, torch haze). */
  get atmosphere(): AtmosphereConfig {
    return this.pass.atmosphere;
  }
  set atmosphere(config: AtmosphereConfig) {
    this.pass.atmosphere = config;
  }

  /** Starts a frame: the glowing tile contents in view (doors, stairs,
   * items, enemies). The board may add its own before `draw`. */
  glows(f: FrameContext): GlowSource[] {
    this.pass.startFrame();
    return this.pass.glowSources(f);
  }

  /** Draws the rest of the dungeon frame over the ground already on `f.c`. */
  draw(f: FrameContext, board: LitBoard) {
    this.pass.drawTorchRelief(f);
    board.floor();
    this.entities.drawShadows(f, () => this.pass.wallMask(f));
    const spriteDark = this.drawContents(f, board);
    board.torches();
    this.pass.drawLightmap(f, this.entities.shadows);
    board.route();
    this.drawHalo(f, board);
    if (spriteDark) this.drawHeroInDarkness(f, spriteDark, board);
    else this.drawHeroInLight(f, board);
    board.edge();
    this.pass.drawVignette(f);
  }

  /** Below the default brightness: darken the ground, lay the object glows
   * on it, then draw the contents (less darkened) on top of their glows.
   * Then torchlight on them. Returns the sprite darkness layer, if any. */
  private drawContents(f: FrameContext, board: LitBoard) {
    const c = f.c;
    const dark = this.pass.buildDarkness(f, this.entities.shadows);
    if (dark) {
      c.save();
      c.globalCompositeOperation = "multiply";
      c.drawImage(dark.dark, 0, 0, f.width, f.width);
      c.restore();
      this.pass.drawObjectBloom(f);
      board.glow();
      const region = occupiedRegion(f);
      if (region)
        this.pass.drawDarkened(f, dark.spriteDark, {
          amount: LIGHTING_CONFIG.objectGlow.spriteDarkness, draw: (ctx) => board.contents(ctx), region,
        });
      this.pass.drawDoorWash(f);
    } else board.contents(c);
    this.entities.drawSpriteLighting(f, c);
    return dark?.spriteDark ?? null;
  }

  private drawHalo(f: FrameContext, board: LitBoard) {
    if (!board.halo) return;
    const c = f.c;
    c.save();
    c.setTransform(tileTransform(f, f.playerX, f.playerY));
    board.halo(c);
    c.restore();
  }

  /** The hero with torchlight on it, and what stands in front of it. */
  private drawHero(f: FrameContext, c: CanvasRenderingContext2D, board: LitBoard) {
    board.hero(c);
    this.entities.drawSpriteLighting(f, c, true);
  }

  /** The hero takes only a light touch of the darkness, through the same
   * masked layer as the other sprites; what stands in front of it sits in
   * the same darkness as the ground it grows from. */
  private drawHeroInDarkness(f: FrameContext, spriteDark: HTMLCanvasElement, board: LitBoard) {
    const m = tileTransform(f, f.playerX, f.playerY), s = f.s;
    // Only the hero's surroundings need the darkening pass.
    const hero = tileOrigin(f, f.playerX, f.playerY);
    this.pass.drawDarkened(f, spriteDark, {
      amount: LIGHTING_CONFIG.objectGlow.heroDarkness,
      draw: (ctx) => {
        ctx.setTransform(m);
        this.drawHero(f, ctx, board);
      },
      region: { x: hero.x - 0.7 * s, y: hero.y - 0.7 * s, w: 2.4 * s, h: 2.4 * s },
    });
    const fg = board.foreground();
    if (fg)
      this.pass.drawDarkened(f, spriteDark, { amount: 1, draw: fg.draw, region: screenBox(f, fg.bounds) });
  }

  private drawHeroInLight(f: FrameContext, board: LitBoard) {
    const c = f.c, m = tileTransform(f, f.playerX, f.playerY);
    c.save();
    c.setTransform(m);
    this.drawHero(f, c, board);
    c.restore();
    board.foreground()?.draw(c);
  }
}

/** One box around every tile with something on it (plus room for
 * outlines): clipping to many small boxes costs more than it saves. */
function occupiedRegion(f: FrameContext): Rect | null {
  const occupied: Rect[] = [];
  forEachViewTile(f, (x, y) => {
    const kind = f.world.tile(x, y).kind;
    if (kind === "wall" || kind === "floor") return;
    occupied.push({ x: (x - f.left - 0.15) * f.s, y: (f.n - 1 - (y - f.bottom) - 0.15) * f.s, w: 1.3 * f.s, h: 1.3 * f.s });
  });
  if (!occupied.length) return null;
  const x0 = Math.min(...occupied.map((r) => r.x)), y0 = Math.min(...occupied.map((r) => r.y));
  const x1 = Math.max(...occupied.map((r) => r.x + r.w)), y1 = Math.max(...occupied.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A world-pixel box on screen, padded by 2 pixels. */
function screenBox(f: FrameContext, b: WorldBox): Rect {
  const s = f.s;
  return {
    x: (b.x0 / 24 - f.left) * s - 2, y: (b.y0 / 24 + f.n - 1 + f.bottom) * s - 2,
    w: ((b.x1 - b.x0) / 24) * s + 4, h: ((b.y1 - b.y0) / 24) * s + 4,
  };
}
