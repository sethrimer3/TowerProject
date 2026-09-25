import { CHUNK, TOWER_HEIGHT, VIEWPORT_TILES } from "./config.ts";
import type { Game } from "./state.ts";
import type { Tile, Torch } from "./entities.ts";
import { drawEntrance, OUTSIDE_SIZE, outsideWeather } from "./outside.ts";
import { DecorLayer, type DecorView, type ReflectionPainter } from "./decor-render.ts";
import { OutsideGrass } from "./outside-grass.ts";
import { TileLayerCache } from "./tile-cache.ts";
import { OutdoorWeather } from "./weather.ts";
import { LIGHTING_CONFIG } from "./lighting.ts";
import { torchAnimationFrame } from "./game-sprites.ts";
import { paintHero, paintHeroFallback, paintTile, paintTorch, type BoardLook } from "./tile-painters.ts";
import { LightingPass, type AtmosphereConfig } from "./lighting-pass.ts";
import { EntityLighting } from "./entity-lighting.ts";
import { RoutePath } from "./route-path.ts";
import { darknessOf, forEachViewTile, tileOrigin, toTileSpace, type FrameContext, type Rect } from "./render-frame.ts";

export { ATMOSPHERE_CONFIG, type AtmosphereConfig } from "./lighting-pass.ts";

/** Columns the ground and decor caches may cover (Delve wraps around). */
const CACHE_COLUMNS: [number, number] = [-64, 191];

/** Draws the Tower/Delve board: owns the camera (which glides after the
 * hero), and runs each frame as an ordered list of passes over one
 * FrameContext. Tile art lives in tile-painters.ts, the dungeon's light in
 * lighting-pass.ts, torchlight on sprites in entity-lighting.ts, and the
 * golden route line in route-path.ts. */
export class Renderer {
  ctx: CanvasRenderingContext2D;
  bottom = 0;
  left = 5;
  size = 0;
  playerX = 15;
  playerY = 0;
  last = 0;
  seed = -1;
  outside = false;
  weather = new OutdoorWeather();
  /** Moss, vines, plants, crates, and pools dressing the dungeon floor. */
  decor = new DecorLayer();
  /** Wind-blown grass in the forest outside. */
  grass = new OutsideGrass();
  /** The stone (or forest floor) under everything, painted once and reused
   * until the view leaves it or the board changes. Art still loading is
   * retried for a few seconds. */
  groundCache = new TileLayerCache(4, 250, 8000);
  /** The decor's baked moss, water, vines, and plants, cached the same way
   * (retried every frame until all of it is planned). */
  decorCache = new TileLayerCache(2, 0);
  private worldIds = new WeakMap<object, number>();
  private nextWorldId = 1;
  private lighting = new LightingPass();
  private entities = new EntityLighting();
  private routePath = new RoutePath();
  /** A golden path to preview for a highlighted-but-unconfirmed destination.
   * Drawn via the same line as an in-progress walk whenever no walk is
   * actually underway (game.route takes priority when both are set). */
  previewRoute: Array<{ x: number; y: number }> | null = null;
  /** Moving sprites (hero, torch frames) for the reflections, snapshotted
   * into small canvases so their outline passes aren't redone every frame.
   * Refreshed every few seconds so sprite art that loads late shows up. */
  private reflectionSprites = new Map<string, { canvas: HTMLCanvasElement; at: number }>();
  /** The dungeon atmosphere (tint, vignette, torch haze), tunable per renderer. */
  get atmosphere(): AtmosphereConfig {
    return this.lighting.atmosphere;
  }
  set atmosphere(config: AtmosphereConfig) {
    this.lighting.atmosphere = config;
  }
  get density() {
    if (this.game.run.outside) return OUTSIDE_SIZE;
    return VIEWPORT_TILES;
  }
  constructor(
    public canvas: HTMLCanvasElement,
    public game: Game,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.playerX = game.run.player.x;
    this.playerY = game.run.player.y;
    const unlock = () => {
      if (game.run.outside && game.save.settings.weatherSound !== false) this.weather.unlock();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.weather.silence(); });
    }
  }
  target(n: number) {
    const g = this.game,
      p = g.run.player;
    // A Tower room is one fixed, fully-enclosed challenge: the camera holds
    // still and shows the room rather than following the player around it.
    if (g.mode === "tower")
      return {
        bottom: Math.max(0, Math.floor((TOWER_HEIGHT - n) / 2)),
        left: Math.max(0, Math.floor((g.world.width - n) / 2)),
      };
    if (g.run.outside)
      return {
        bottom: Math.max(0, Math.floor((CHUNK - n) / 2)),
        left: Math.max(0, Math.floor((g.world.width - n) / 2)),
      };
    return {
      bottom: Math.max(0, p.y - Math.floor(n / 2)),
      left: Math.max(0, Math.min(g.world.width - n, p.x - Math.floor(n / 2))),
    };
  }
  draw(now: number) {
    const f = this.beginFrame(now);
    // Ground first, then torch-cast shadows, then tile contents on top, so
    // shadows fall across the floor but never over the things casting them.
    this.drawGround(f);
    if (!f.outside) this.drawFloorLight(f);
    const spriteDark = this.drawContents(f);
    if (f.outside) this.drawForestEntrance(f);
    else this.drawTorches(f);
    this.routePath.update(this.game.route, this.previewRoute, this.game.run.player, f.dt);
    this.routePath.draw(f);
    if (spriteDark) this.drawHeroInDarkness(f, spriteDark);
    else this.drawHeroInLight(f);
    if (f.outside) this.drawWeather(f);
    else this.drawFrameEdge(f);
    this.drawBlockedMark(f);
    this.drawEffectText(f);
  }

  /** Sizes the canvas, moves the camera and hero toward their targets,
   * clears the board, and gathers what this frame shows. */
  private beginFrame(now: number): FrameContext {
    const g = this.game, n = this.density;
    this.snapOnNewBoard(n);
    const box = this.canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(box.width * dpr)) {
      this.canvas.width = Math.round(box.width * dpr);
      this.canvas.height = this.canvas.width;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = box.width / n;
    const dt = Math.min(0.1, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.follow(n, dt);
    const c = this.ctx, s = this.size, outside = !!g.run.outside, settings = g.save.settings;
    c.fillStyle = "#0b1017";
    c.fillRect(0, 0, box.width, box.width);
    const f: FrameContext = {
      c, now, dt, dpr, width: box.width, n, s, left: this.left, bottom: this.bottom, playerX: this.playerX, playerY: this.playerY,
      game: g, outside, reduceMotion: settings.reduceMotion, spritesOff: !!settings.spritesOff, look: this.look(),
      darkness: darknessOf(g), torches: [], walls: [], glows: [],
    };
    f.torches = outside ? [] : this.visibleTorches();
    this.lighting.startFrame();
    f.walls = outside ? [] : this.visibleWallTiles();
    f.glows = outside ? [] : this.lighting.glowSources(f);
    if (!outside && this.decorOn) {
      this.decor.sync(g.world, g.run.seed);
      this.decor.update(dt, now, this.playerX, this.playerY, this.tileAt, f.reduceMotion);
      f.glows.push(...this.decor.glows(this.decorView(f)));
    }
    return f;
  }
  /** A new run or a step outside resets the camera and hero onto their targets. */
  private snapOnNewBoard(n: number) {
    const g = this.game, p = g.run.player;
    if (this.seed !== g.run.seed || this.outside !== !!g.run.outside) {
      this.outside = !!g.run.outside;
      this.weather.silence();
      this.seed = g.run.seed;
      this.playerX = p.x;
      this.playerY = p.y;
      const t = this.target(n);
      this.bottom = t.bottom;
      this.left = t.left;
    }
    if (Math.abs(p.x - this.playerX) > g.world.width / 2) this.playerX = p.x;
  }
  /** Glides the camera and the drawn hero toward where they belong (or
   * snaps them, with motion reduced or transitions off). */
  private follow(n: number, dt: number) {
    const p = this.game.run.player, settings = this.game.save.settings;
    const blend =
      settings.reduceMotion || settings.transition === "instant"
        ? 1
        : 1 - Math.exp(-dt * (settings.transition === "fast" ? 32 : 14));
    const target = this.target(n);
    this.bottom += (target.bottom - this.bottom) * blend;
    this.left += (target.left - this.left) * blend;
    this.playerX += (p.x - this.playerX) * blend;
    this.playerY += (p.y - this.playerY) * blend;
  }

  /** The ground rarely changes: draw it from a cache instead of tile by tile. */
  private drawGround(f: FrameContext) {
    const g = this.game;
    const anyWorld = g.world as { milestone?: number };
    if (!this.worldIds.has(g.world)) this.worldIds.set(g.world, this.nextWorldId++);
    const groundKey = [
      this.worldIds.get(g.world), g.run.seed, g.mode, g.run.height, g.run.outside ? 1 : 0, g.world.floor, anyWorld.milestone ?? 0,
      // Without sprite art, floor under items is drawn differently, so edits matter.
      g.save.settings.spritesOff ? `off:${Object.keys(g.run.changes).length}` : "",
    ].join("|");
    this.groundCache.draw(f.c, this.decorView(f), f.dpr, groundKey, f.now, CACHE_COLUMNS,
      (ctx, x, y) => this.tile(ctx, f, g.world.tile(x, y), x, y, 0));
  }
  /** Torch relief on the stone, then decor over it (so pools and crates hide
   * the bricks beneath them), then the shadows things cast in torchlight. */
  private drawFloorLight(f: FrameContext) {
    this.lighting.drawTorchRelief(f);
    if (this.decorOn && this.decor.key) {
      const view = this.decorView(f);
      this.decorCache.draw(f.c, view, f.dpr, this.decor.key, f.now, CACHE_COLUMNS, (ctx, x, y) => this.decor.bakeTile(ctx, x, y));
      this.decor.drawGround(f.c, view, f.now, this.tileAt, f.reduceMotion, {
        paint: (p) => this.paintReflections(p, f),
        key: this.reflectionKey(f),
      });
    }
    this.entities.drawShadows(f, () => this.lighting.wallMask(f));
  }
  /** Doors, stairs, items, and enemies. Below the default brightness:
   * darken the ground, lay the object glows on it, then draw the objects
   * (less darkened) on top of their glows. Returns the sprite darkness
   * layer when there is one, for the hero pass. */
  private drawContents(f: FrameContext) {
    const c = f.c;
    const dark = f.outside ? null : this.lighting.buildDarkness(f, this.entities.shadows);
    if (dark) {
      c.save();
      c.globalCompositeOperation = "multiply";
      c.drawImage(dark.dark, 0, 0, f.width, f.width);
      c.restore();
      this.lighting.drawObjectBloom(f);
      if (this.decorOn) this.decor.drawGlow(c, this.decorView(f), f.now, f.darkness, f.reduceMotion);
      const region = this.occupiedRegion(f);
      if (region)
        this.lighting.drawDarkened(f, dark.spriteDark, LIGHTING_CONFIG.objectGlow.spriteDarkness, (ctx) => this.drawEachContents(f, ctx), region);
      this.lighting.drawDoorWash(f);
    } else this.drawEachContents(f, c);
    if (!f.outside) this.entities.drawSpriteLighting(f, c);
    return dark?.spriteDark ?? null;
  }
  private drawEachContents(f: FrameContext, ctx: CanvasRenderingContext2D) {
    forEachViewTile(f, (x, y) => {
      const t = this.game.world.tile(x, y);
      if (t.kind === "wall" || t.kind === "floor") return;
      ctx.save();
      toTileSpace(ctx, f, x, y);
      this.tile(ctx, f, t, x, y, 1);
      ctx.restore();
    });
  }
  /** One box around every tile with something on it (plus room for
   * outlines): clipping to many small boxes costs more than it saves. */
  private occupiedRegion(f: FrameContext): Rect | null {
    const occupied: Rect[] = [];
    forEachViewTile(f, (x, y) => {
      const kind = this.game.world.tile(x, y).kind;
      if (kind === "wall" || kind === "floor") return;
      occupied.push({ x: (x - f.left - 0.15) * f.s, y: (f.n - 1 - (y - f.bottom) - 0.15) * f.s, w: 1.3 * f.s, h: 1.3 * f.s });
    });
    if (!occupied.length) return null;
    const x0 = Math.min(...occupied.map((r) => r.x)), y0 = Math.min(...occupied.map((r) => r.y));
    const x1 = Math.max(...occupied.map((r) => r.x + r.w)), y1 = Math.max(...occupied.map((r) => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  private drawForestEntrance(f: FrameContext) {
    const c = f.c, g = this.game;
    c.save();
    c.translate(-f.left * f.s, (f.n - OUTSIDE_SIZE + f.bottom) * f.s);
    c.scale(f.s / 24, f.s / 24);
    drawEntrance(c, g.mode, Math.floor(g.world.width / 2));
    c.restore();
  }
  /** Torch sprites (after the darkness, so the flames themselves are never
   * dimmed), then the torch lightmap. */
  private drawTorches(f: FrameContext) {
    for (const t of f.torches) this.drawTorchSprite(f.c, f, t);
    this.lighting.drawLightmap(f, this.entities.shadows);
  }
  /** The context transform that draws the hero, in tile space. */
  private heroTransform(f: FrameContext) {
    const c = f.c;
    c.save();
    toTileSpace(c, f, f.playerX, f.playerY);
    const m = c.getTransform();
    c.restore();
    return m;
  }
  private drawHero(f: FrameContext, c: CanvasRenderingContext2D) {
    paintHero(c, f.spritesOff);
    if (!f.outside) this.entities.drawSpriteLighting(f, c, true);
  }
  /** The hero takes only a light touch of the darkness, through the same
   * masked layer as the other sprites; grass and water in front of it sit
   * in the same darkness as the ground they grow from. */
  private drawHeroInDarkness(f: FrameContext, spriteDark: HTMLCanvasElement) {
    const m = this.heroTransform(f), s = f.s;
    // Only the hero's surroundings need the darkening pass.
    const hero = tileOrigin(f, f.playerX, f.playerY);
    this.lighting.drawDarkened(f, spriteDark, LIGHTING_CONFIG.objectGlow.heroDarkness, (ctx) => {
      ctx.setTransform(m);
      this.drawHero(f, ctx);
    }, { x: hero.x - 0.7 * s, y: hero.y - 0.7 * s, w: 2.4 * s, h: 2.4 * s });
    // Skipped when there's no foreground this frame.
    const view = this.decorView(f), fg = this.decorOn ? this.decor.foregroundBounds(view, f.now, this.tileAt, f.reduceMotion) : null;
    if (fg)
      this.lighting.drawDarkened(f, spriteDark, 1, (ctx) => this.decor.drawForeground(ctx, view, f.now, this.tileAt, f.reduceMotion), {
        x: (fg.x0 / 24 - f.left) * s - 2, y: (fg.y0 / 24 + f.n - 1 + f.bottom) * s - 2,
        w: ((fg.x1 - fg.x0) / 24) * s + 4, h: ((fg.y1 - fg.y0) / 24) * s + 4,
      });
  }
  /** The hero between whatever grows behind and in front of it: forest
   * grass outside, decor foreground in the dungeon. */
  private drawHeroInLight(f: FrameContext) {
    const c = f.c, g = this.game, view = this.decorView(f);
    const grass = (layer: "back" | "front") =>
      this.grass.draw(c, view, g.world, g.run.seed, Math.floor(g.world.width / 2), outsideWeather(g.run.seed), f.now, f.dt,
        this.playerX, this.playerY, f.reduceMotion, layer);
    const m = this.heroTransform(f);
    // Grass behind the hero goes under it; the blades at its feet over it.
    if (f.outside && this.decorOn) grass("back");
    c.save();
    c.setTransform(m);
    this.drawHero(f, c);
    c.restore();
    if (f.outside) { if (this.decorOn) grass("front"); }
    else if (this.decorOn && this.decor.foregroundBounds(view, f.now, this.tileAt, f.reduceMotion))
      this.decor.drawForeground(c, view, f.now, this.tileAt, f.reduceMotion);
  }
  private drawWeather(f: FrameContext) {
    const g = this.game;
    this.weather.draw(f.c, f.width, g.run.seed, f.dt, g.save.settings.reduceMotion,
      !g.paused && !g.summary && !document.hidden, g.save.settings.weatherSound !== false);
  }
  /** The dungeon board's thin stone frame and vignette. */
  private drawFrameEdge(f: FrameContext) {
    const c = f.c, w = f.width;
    c.fillStyle = "#606b79";
    c.fillRect(0, 0, w, 2);
    c.fillRect(0, w - 2, w, 2);
    c.fillRect(0, 0, 2, w);
    c.fillRect(w - 2, 0, 2, w);
    this.lighting.drawVignette(f);
  }
  /** A fading red cross where a step was refused. */
  private drawBlockedMark(f: FrameContext) {
    const g = this.game, c = f.c, s = f.s;
    if (g.blocked.until <= f.now) return;
    const x = (g.blocked.x - f.left + 0.5) * s,
      y = (f.n - 0.5 - (g.blocked.y - f.bottom)) * s,
      r = s * 0.28;
    c.save();
    c.globalAlpha = Math.min(1, (g.blocked.until - f.now) / 700);
    c.strokeStyle = "#ff5869";
    c.lineWidth = Math.max(2, s * 0.13);
    c.beginPath();
    c.moveTo(x - r, y - r);
    c.lineTo(x + r, y + r);
    c.moveTo(x + r, y - r);
    c.lineTo(x - r, y + r);
    c.stroke();
    c.restore();
  }
  /** Rising pickup/combat feedback text. */
  private drawEffectText(f: FrameContext) {
    const g = this.game, c = f.c, s = f.s;
    if (g.effect.until <= f.now) return;
    c.font = `600 ${Math.max(11, s * 0.6)}px Cinzel`;
    c.textAlign = "center";
    c.fillStyle = "#f3d69a";
    c.shadowColor = "#000";
    c.shadowBlur = 5;
    const offset = g.save.settings.reduceMotion
      ? 0
      : (1300 - (g.effect.until - f.now)) / 65;
    c.fillText(g.effect.text, f.width / 2, f.width * 0.2 - offset);
    c.shadowBlur = 0;
  }

  private get decorOn() {
    return !this.game.save.settings.decorOff;
  }
  private tileAt = (x: number, y: number) => this.game.world.tile(x, y);
  private decorView(f: FrameContext): DecorView {
    return { left: f.left, bottom: f.bottom, n: f.n, s: f.s };
  }
  private look(): BoardLook {
    const g = this.game;
    return {
      mode: g.mode, height: g.run.height, seed: g.run.seed, outside: !!g.run.outside, entranceX: Math.floor(g.world.width / 2),
      spritesOff: !!g.save.settings.spritesOff, reduceMotion: g.save.settings.reduceMotion,
    };
  }
  /** Paints one tile in tile space (see paintTile); false while its ground
   * art is still loading. */
  private tile(c: CanvasRenderingContext2D, f: FrameContext, t: Tile, x: number, y: number, layer: 0 | 1) {
    return paintTile(c, this.game.world, t, x, y, f.now, layer, f.look);
  }
  private drawTorchSprite(c: CanvasRenderingContext2D, f: FrameContext, t: Torch) {
    c.save();
    toTileSpace(c, f, t.x, t.y);
    paintTorch(c, t, f.now, f.reduceMotion, f.spritesOff);
    c.restore();
  }

  /** Changes whenever a moving thing that shows in the water (the hero, a
   * torch flame) would look different, so an unchanged reflection is reused. */
  private reflectionKey(f: FrameContext) {
    let key = `${Math.round(this.playerX * 24)},${Math.round(this.playerY * 24)}`;
    for (const t of f.torches) key += `|${torchAnimationFrame(t.x, t.y, f.now, f.reduceMotion)}`;
    return key;
  }
  /** True when nothing on the board is moving: the hero and camera have
   * settled, no route is being walked, no feedback is showing, and no decor
   * effect is playing. (Torches and grass still sway.) Used by Battery saver. */
  isIdle(now: number) {
    const g = this.game, p = g.run.player, t = this.target(this.density), eps = 0.01;
    return Math.abs(this.playerX - p.x) < eps && Math.abs(this.playerY - p.y) < eps &&
      Math.abs(this.left - t.left) < eps && Math.abs(this.bottom - t.bottom) < eps &&
      !g.route.length && g.blocked.until <= now && g.effect.until <= now && !this.decor.busy;
  }
  /** Paints, mirrored, everything that shows in the water: the wall faces
   * above a pool, tile contents, torches, and the hero. Each is drawn by its
   * usual routine into the decor layer's reflection buffer. */
  private paintReflections(p: ReflectionPainter, f: FrameContext) {
    if (p.phase === "static") this.reflectTiles(p, f);
    if (p.phase === "moving") this.reflectMoving(p, f);
  }
  /** Walls and tile contents beside the water. */
  private reflectTiles(p: ReflectionPainter, f: FrameContext) {
    for (const [x, y] of p.tiles) {
      const t = this.game.world.tile(x, y);
      if (t.kind === "floor") continue;
      // A wall mirrors from its lower edge; things standing on a tile, from their feet.
      p.flip(-y * 24 + (t.kind === "wall" ? 24 : 23));
      p.ctx.translate(x * 24, -y * 24);
      // Stone mirrors faintly, so the pool still reads as water.
      p.ctx.globalAlpha = t.kind === "wall" ? 0.45 : 1;
      this.tile(p.ctx, f, t, x, y, t.kind === "wall" ? 0 : 1);
      p.ctx.globalAlpha = 1;
    }
  }
  /** Torch flames and the hero, from snapshotted sprites. */
  private reflectMoving(p: ReflectionPainter, f: FrameContext) {
    const s = f.s, n = f.n;
    for (const t of f.torches) {
      if (!p.near(t.x, t.y)) continue;
      // The torch draws in screen space: map its tile back to 0..24.
      const frame = torchAnimationFrame(t.x, t.y, f.now, f.reduceMotion);
      const sprite = this.reflectionSprite(`torch:${frame}`, f.now, (c) => {
        c.setTransform(24 / s, 0, 0, 24 / s, -(t.x - f.left) * 24, -(n - 1 - (t.y - f.bottom)) * 24);
        this.drawTorchSprite(c, f, t);
      });
      p.flip(-t.y * 24 + 21);
      if (sprite) p.ctx.drawImage(sprite, t.x * 24, -t.y * 24);
    }
    if (p.near(Math.round(this.playerX), Math.round(this.playerY))) {
      const sprite = this.reflectionSprite("hero", f.now, (c) => paintHero(c, f.spritesOff));
      p.flip(-this.playerY * 24 + 23);
      if (sprite) p.ctx.drawImage(sprite, this.playerX * 24, -this.playerY * 24);
    }
  }
  private reflectionSprite(key: string, now: number, draw: (c: CanvasRenderingContext2D) => void) {
    const cached = this.reflectionSprites.get(key);
    if (cached && now - cached.at < 4000) return cached.canvas;
    const canvas = cached?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const c = canvas.getContext("2d");
    if (!c) return null;
    c.imageSmoothingEnabled = false;
    draw(c);
    this.reflectionSprites.set(key, { canvas, at: now });
    return canvas;
  }

  /** Active torches roughly within the camera viewport, padded so a torch
   * whose center is just offscreen can still light visible ground. Cheap
   * per-frame culling; the expensive part (the visibility polygon) is
   * cached on the torch itself and computed only once. */
  private visibleTorches(): Torch[] {
    const list = this.game.world.torches;
    if (!list) return [];
    const n = this.density,
      pad = 8;
    return list.filter(
      (t) =>
        t.active &&
        t.x > this.left - pad &&
        t.x < this.left + n + pad &&
        t.y > this.bottom - pad &&
        t.y < this.bottom + n + pad,
    );
  }
  /** Wall tiles in view, in the same order as the tile passes, so the
   * darkness and shadow masks can exclude them. */
  private visibleWallTiles(): [number, number][] {
    const walls: [number, number][] = [];
    forEachViewTile({ n: this.density, left: this.left, bottom: this.bottom }, (x, y) => {
      if (this.game.world.tile(x, y)?.kind === "wall") walls.push([x, y]);
    });
    return walls;
  }
  static drawHero(c: CanvasRenderingContext2D) {
    paintHeroFallback(c);
  }
  position(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor((clientX - r.left) / this.size + this.left),
      y: Math.floor(
        this.bottom +
          this.density -
          (clientY - r.top) / this.size,
      ),
    };
  }
}
