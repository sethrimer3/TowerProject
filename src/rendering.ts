import { CHUNK, TOWER_HEIGHT, VIEWPORT_TILES } from "./config.ts";
import type { Game } from "./state.ts";
import type { Tile, Torch } from "./entities.ts";
import { tierNumeral } from "./tiers.ts";
import { drawBlacksmith, drawEntrance, drawTournamentHall, OutsideWorld, OUTSIDE_SIZE, outsideWeather } from "./outside.ts";
import { DecorLayer, type DecorFrame, type MirroredSprites } from "./decor-render.ts";
import { OutsideGrass } from "./outside-grass.ts";
import { TileLayerCache } from "./tile-cache.ts";
import { OutdoorWeather } from "./weather.ts";
import { torchAnimationFrame } from "./game-sprites.ts";
import { isArea1, paintHero, paintHeroFallback, paintTile, paintTorch, type BoardLook } from "./tile-painters.ts";
import type { AtmosphereConfig } from "./lighting-pass.ts";
import { DungeonLight, type LitBoard } from "./dungeon-light.ts";
import { drawNeonContents, drawNeonGround, drawNeonTorch, paintNeonHero } from "./neon-board.ts";
import { RoutePath } from "./route-path.ts";
import { BoardPopups, lunges } from "./board-popups.ts";
import { DamagePredictions, drawDamageLabels } from "./damage-labels.ts";
import { goalUnlocked } from "./goals.ts";
import { AREA_BURST_MS, drawAreaBurst, preloadAreaBurst, drawLevelUp, drawRevive, LEVEL_UP_MS, POINTS_MS, REVIVE_MS } from "./level-up.ts";
import { drawPoof, POOF_MS } from "./poof.ts";
import { drawGem, drawGemSparkle, GEM_SPARKLE_MS } from "./gem-art.ts";
import { drawRushEchoes, RUSH_ECHO_MS } from "./rush-echoes.ts";
import type { Rush } from "./state.ts";
import { darknessOf, forEachViewTile, tileTransform, toTileSpace, type FrameContext } from "./render-frame.ts";

export { ATMOSPHERE_CONFIG, type AtmosphereConfig } from "./lighting-pass.ts";

/** How long the glow behind the hero lasts after it reaches a new floor (ms). */
const ARRIVAL_GLOW_MS = 700;

/** Columns the ground and decor caches may cover (Delve wraps around). */
const CACHE_COLUMNS: [number, number] = [-64, 191];

/** Draws the Tower/Delve board: owns the camera (which glides after the
 * hero), and runs each frame as an ordered list of passes over one
 * FrameContext. Tile art lives in tile-painters.ts, the golden route line
 * in route-path.ts, and the dungeon's light in dungeon-light.ts, which runs
 * the rest of a dungeon frame once the ground is down. */
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
  private light = new DungeonLight();
  private routePath = new RoutePath();
  private predictions = new DamagePredictions();
  /** Damage numbers and rewards rising off their tiles. */
  popups = new BoardPopups();
  /** The Tower floor the hero was last drawn on (seed and height), and when
   * it arrived on the one it stands on now. */
  private floorKey = "";
  private arrived = -Infinity;
  /** The latest rush drawn: a new one snaps the hero to where it landed. */
  private rushed: Rush | null = null;
  /** The enemy's lean into its strike this frame, drawn at its tile. */
  private enemyLunge = { x: 0, y: 0, dx: 0, dy: 0 };
  /** A golden path to preview for a highlighted-but-unconfirmed destination.
   * Drawn via the same line as an in-progress walk whenever no walk is
   * actually underway (game.route takes priority when both are set). */
  previewRoute: Array<{ x: number; y: number }> | null = null;
  /** The dungeon atmosphere (tint, vignette, torch haze), tunable per renderer. */
  get atmosphere(): AtmosphereConfig {
    return this.light.atmosphere;
  }
  set atmosphere(config: AtmosphereConfig) {
    this.light.atmosphere = config;
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
    preloadAreaBurst();
    this.playerX = game.run.player.x;
    this.playerY = game.run.player.y;
    const unlock = () => {
      if (game.run.outside && game.save.settings.weatherSound) this.weather.unlock();
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
    if (this.neon && !f.look.outside) this.drawNeonBoard(f);
    else {
      // Ground first; in the dungeon the light then runs the frame (relief,
      // decor, shadows, contents, torches, route, hero, frame) over it.
      this.drawGround(f);
      if (f.look.outside) this.drawOutside(f);
      else this.light.draw(f, this.litBoard(f));
    }
    drawRushEchoes(f, this.game.rush);
    this.drawOverlays(f);
  }
  /** The Neon theme's dungeon: laser-line walls, contents, torches, route
   * and hero on black, with no lighting, decor or ambient effects. */
  private drawNeonBoard(f: FrameContext) {
    drawNeonGround(f);
    drawNeonContents(f, this.enemyLunge);
    for (const t of f.torches) drawNeonTorch(f, t);
    this.drawRoute(f);
    const c = f.c;
    c.save();
    c.setTransform(tileTransform(f, f.playerX, f.playerY));
    paintNeonHero(c);
    c.restore();
  }
  /** Gameplay feedback drawn over every board. */
  private drawOverlays(f: FrameContext) {
    this.drawDamageLabels(f);
    this.drawSkipMarks(f);
    this.drawBadgeMarks(f);
    this.drawChargeMarks(f);
    this.drawBlockedMark(f);
    // A Gem shines above the darkness, so it can be seen and tapped.
    const gem = this.game.gemFinder.gem, sparkle = this.game.gemFinder.sparkle;
    if (gem) drawGem(f, gem.x, gem.y);
    if (sparkle) drawGemSparkle(f, sparkle.x, sparkle.y, f.now - sparkle.at);
    this.popups.draw(f);
    this.drawEffectText(f);
    for (const at of this.game.revivedAt) drawRevive(f, f.now - at);
    drawLevelUp(f, f.now - this.game.levelUpAt, this.game.levelUpPoints);
    for (const area of this.game.areaBursts) if (f.now >= area.at) drawAreaBurst(f, f.now - area.at, area.reward);
    const summoned = this.game.summoned;
    if (summoned) drawPoof(f, summoned.x, summoned.y, f.now - summoned.at);
    const vanished = this.game.vanished;
    if (vanished) drawPoof(f, vanished.x, vanished.y, f.now - vanished.at);
  }
  /** The forest clearing: its contents, the entrance, the route, the hero
   * in its grass, and the weather. */
  private drawOutside(f: FrameContext) {
    this.drawEachContents(f, f.c);
    this.drawForestEntrance(f);
    this.drawRoute(f);
    this.drawHeroOutside(f);
    this.drawWeather(f);
  }
  /** What the dungeon board draws between the light's steps. */
  private litBoard(f: FrameContext): LitBoard {
    const decor = this.decorOn ? this.decorFrame(f) : null;
    return {
      floor: () => this.drawDecorGround(f),
      glow: () => { if (decor) this.decor.drawGlow(f.c, decor, f.darkness); },
      contents: (ctx) => this.drawEachContents(f, ctx),
      torches: () => { for (const t of f.torches) this.drawTorchSprite(f.c, f, t); },
      route: () => this.drawRoute(f),
      // Only while the hero has just reached a new floor.
      halo: f.now - this.arrived < ARRIVAL_GLOW_MS ? (ctx) => this.drawArrivalGlow(ctx, f.now) : undefined,
      hero: (ctx) => paintHero(ctx, f.look.spritesOff),
      foreground: () => {
        const bounds = decor && this.decor.foregroundBounds(decor);
        return bounds ? { bounds, draw: (ctx) => this.decor.drawForeground(ctx, decor!) } : null;
      },
      edge: () => this.drawFrameEdge(f),
    };
  }

  /** Sizes the canvas, moves the camera and hero toward their targets,
   * clears the board, and gathers what this frame shows. */
  private beginFrame(now: number): FrameContext {
    const g = this.game, n = this.density;
    this.snapOnNewBoard(n, now);
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
    this.popups.update(g, now);
    const lunge = lunges(g.encounter, now, g.save.settings.reduceMotion);
    this.enemyLunge = { ...(g.encounter?.to ?? { x: 0, y: 0 }), ...lunge.enemy };
    const c = this.ctx, s = this.size, outside = !!g.run.outside, settings = g.save.settings;
    c.fillStyle = "#0b1017";
    c.fillRect(0, 0, box.width, box.width);
    const f: FrameContext = {
      c, now, dt, dpr, width: box.width, n, s, left: this.left, bottom: this.bottom, playerX: this.playerX + lunge.hero.dx, playerY: this.playerY + lunge.hero.dy,
      world: g.world, look: this.look(), darkness: darknessOf(g), torches: [], walls: [], glows: [],
    };
    f.torches = outside ? [] : this.visibleTorches();
    f.walls = outside ? [] : this.visibleWallTiles();
    f.glows = outside || this.neon ? [] : this.light.glows(f);
    if (!outside && this.decorOn) {
      this.decor.sync(g.world, g.run.seed);
      this.decor.update({ dt, now, hx: this.playerX, hy: this.playerY, tileAt: this.tileAt, reduceMotion: f.look.reduceMotion });
      f.glows.push(...this.decor.glows(f));
    }
    return f;
  }
  /** A new run or a step outside resets the camera and hero onto their
   * targets; reaching another Tower floor snaps the hero onto its tile there,
   * with a glow behind it. */
  private snapOnNewBoard(n: number, now: number) {
    const g = this.game, p = g.run.player;
    const floor = g.mode === "tower" && !g.run.outside ? `${g.run.seed}|${g.run.height}` : "";
    if (floor !== this.floorKey) {
      const sameRun = floor && this.floorKey.startsWith(`${g.run.seed}|`);
      this.floorKey = floor;
      if (sameRun) {
        this.playerX = p.x;
        this.playerY = p.y;
        this.arrived = now;
      }
    }
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
    // A rush is one step: the hero is there at once, its echoes left behind.
    if (g.rush !== this.rushed) {
      this.rushed = g.rush;
      this.playerX = p.x;
      this.playerY = p.y;
    }
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
    this.groundCache.draw(f.c, f, f.dpr, groundKey, f.now, CACHE_COLUMNS,
      (ctx, x, y) => this.tile(ctx, f, g.world.tile(x, y), x, y, 0));
  }
  /** Decor over the stone (so pools and crates hide the bricks beneath
   * them), with the board's sprites mirrored in its water. */
  private drawDecorGround(f: FrameContext) {
    if (!this.decorOn || !this.decor.key) return;
    this.decorCache.draw(f.c, f, f.dpr, this.decor.key, f.now, CACHE_COLUMNS, (ctx, x, y) => this.decor.bakeTile(ctx, x, y));
    this.decor.drawGround(f.c, this.decorFrame(f), this.mirroredSprites(f));
  }
  /** The tiles, torches and hero, for the water to mirror. */
  private mirroredSprites(f: FrameContext): MirroredSprites {
    const s = f.s, n = f.n;
    return {
      tile: (ctx, t, x, y, layer) => this.tile(ctx, f, t, x, y, layer),
      torches: f.torches.map((t) => ({
        x: t.x, y: t.y, frame: torchAnimationFrame(t.x, t.y, f.now, f.look.reduceMotion),
        // The torch draws in screen space: map its tile back to 0..24.
        paint: (c) => {
          c.setTransform(24 / s, 0, 0, 24 / s, -(t.x - f.left) * 24, -(n - 1 - (t.y - f.bottom)) * 24);
          this.drawTorchSprite(c, f, t);
        },
      })),
      hero: { x: this.playerX, y: this.playerY, paint: (c) => paintHero(c, f.look.spritesOff) },
    };
  }
  /** Doors, stairs, items, and enemies, drawn onto `ctx`. */
  private drawEachContents(f: FrameContext, ctx: CanvasRenderingContext2D) {
    forEachViewTile(f, (x, y) => {
      const t = this.game.world.tile(x, y);
      if (t.kind === "wall" || t.kind === "floor") return;
      const lunge = this.enemyLunge, leaning = x === lunge.x && y === lunge.y;
      ctx.save();
      toTileSpace(ctx, f, leaning ? x + lunge.dx : x, leaning ? y + lunge.dy : y);
      this.tile(ctx, f, t, x, y, 1);
      ctx.restore();
    });
  }
  private drawForestEntrance(f: FrameContext) {
    const c = f.c, g = this.game;
    c.save();
    c.translate(-f.left * f.s, (f.n - OUTSIDE_SIZE + f.bottom) * f.s);
    c.scale(f.s / 24, f.s / 24);
    const slice = g.save[g.mode];
    drawEntrance(c, g.mode, Math.floor(g.world.width / 2), slice.tiersOpen > 1 ? tierNumeral(slice.tier) : "");
    if (g.world instanceof OutsideWorld && g.world.blacksmith) drawBlacksmith(c, g.world.entranceX);
    if (g.world instanceof OutsideWorld && g.world.hall) drawTournamentHall(c, g.world.entranceX);
    c.restore();
  }
  private drawRoute(f: FrameContext) {
    this.routePath.update(this.game.route, this.previewRoute, this.game.run.player, f.dt);
    this.routePath.draw(f);
  }
  /** The hero between the forest grass behind it and the blades at its feet. */
  private drawHeroOutside(f: FrameContext) {
    const c = f.c, g = this.game;
    const grass = (layer: "back" | "front") =>
      this.grass.draw(c, f, g.world, g.run.seed, Math.floor(g.world.width / 2), outsideWeather(g.run.seed), f.now, f.dt,
        this.playerX, this.playerY, f.look.reduceMotion, layer);
    const m = tileTransform(f, f.playerX, f.playerY);
    if (this.decorOn) grass("back");
    c.save();
    c.setTransform(m);
    paintHero(c, f.look.spritesOff);
    c.restore();
    if (this.decorOn) grass("front");
  }
  private drawWeather(f: FrameContext) {
    const g = this.game;
    this.weather.draw(f.c, f.width, g.run.seed, { dt: f.dt, reduceMotion: g.save.settings.reduceMotion,
      active: !g.paused && !g.fallen && !document.hidden, sound: g.save.settings.weatherSound });
  }
  /** A white glow fading behind the hero just after it reaches a new floor,
   * drawn in its tile space. */
  private drawArrivalGlow(c: CanvasRenderingContext2D, now: number) {
    const left = 1 - (now - this.arrived) / ARRIVAL_GLOW_MS;
    if (left <= 0) return;
    const glow = c.createRadialGradient(12, 13, 0, 12, 13, 27);
    glow.addColorStop(0, `rgba(255, 255, 255, ${left})`);
    glow.addColorStop(0.5, `rgba(255, 255, 255, ${0.7 * left})`);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    c.save();
    c.fillStyle = glow;
    c.fillRect(-15, -14, 54, 54);
    c.restore();
  }
  /** The dungeon board's thin stone frame. */
  private drawFrameEdge(f: FrameContext) {
    const c = f.c, w = f.width;
    c.fillStyle = "#606b79";
    c.fillRect(0, 0, w, 2);
    c.fillRect(0, w - 2, w, 2);
    c.fillRect(0, 0, 2, w);
    c.fillRect(w - 2, 0, 2, w);
  }
  /** Damage Visual: what each enemy in view would cost, once its goal is
   * claimed and while its setting is on, coloured by its share of the
   * hero's HP once Relative Damage Color is claimed too. */
  private drawDamageLabels(f: FrameContext) {
    const g = this.game;
    if (g.run.outside || !g.save.settings.damageVisual || !goalUnlocked(g.save, "damageVisual")) return;
    drawDamageLabels(f, this.predictions, g.run.player, g.fight, goalUnlocked(g.save, "relativeDamageColor"));
  }
  /** A fading red cross where a step was refused. */
  /** Skip Open Nodes' marks: a violet X on each door or monster it passed
   * over on this floor. */
  private drawSkipMarks(f: FrameContext) {
    const marks = this.game.skipMarks;
    if (!marks.length) return;
    const c = f.c, s = f.s, r = s * 0.2;
    c.save();
    c.lineCap = "round";
    for (const k of marks) {
      const [wx, wy] = k.split(",").map(Number), x = (wx - f.left + 0.5) * s + s * 0.22, y = (f.n - 0.5 - (wy - f.bottom)) * s - s * 0.22;
      for (const [color, width] of [["#000c", Math.max(3, s * 0.12)], ["#d7a6ff", Math.max(1.5, s * 0.06)]] as const) {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(x - r / 2, y - r / 2);
        c.lineTo(x + r / 2, y + r / 2);
        c.moveTo(x + r / 2, y - r / 2);
        c.lineTo(x - r / 2, y + r / 2);
        c.stroke();
      }
    }
    c.restore();
  }
  /** Deprioritize's marks: an amber ? on each tile it passed over on this
   * floor, and a red ! on each the stuck hand now heads for. */
  private drawBadgeMarks(f: FrameContext) {
    const { asked, bangs } = this.game.badgeMarks;
    if (!asked.length && !bangs.length) return;
    const c = f.c, s = f.s;
    c.save();
    c.font = `bold ${Math.max(10, Math.round(s * 0.42))}px Cinzel, serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = Math.max(2, s * 0.08);
    c.strokeStyle = "#000c";
    for (const [marks, glyph, color] of [[asked, "?", "#ffb347"], [bangs, "!", "#ff5a5a"]] as const)
      for (const k of marks) {
        const [wx, wy] = k.split(",").map(Number), x = (wx - f.left + 0.5) * s + s * 0.22, y = (f.n - 0.5 - (wy - f.bottom)) * s - s * 0.22;
        c.strokeText(glyph, x, y);
        c.fillStyle = color;
        c.fillText(glyph, x, y);
      }
    c.restore();
  }
  /** Ignore's marks: a red ⊘ over each tile ignored on this floor; and
   * Target's: a blue ring and cross over the tile the hero heads for. */
  private drawChargeMarks(f: FrameContext) {
    const g = this.game, ignored = g.ignored, targeted = g.run.outside ? undefined : g.run.targeted;
    if (!ignored.size && !targeted) return;
    const c = f.c, s = f.s, r = s * 0.3;
    const centre = (k: string) => {
      const [wx, wy] = k.split(",").map(Number);
      return [(wx - f.left + 0.5) * s, (f.n - 0.5 - (wy - f.bottom)) * s] as const;
    };
    c.save();
    c.lineCap = "round";
    for (const k of ignored) {
      const [x, y] = centre(k);
      for (const [color, width] of [["#000c", Math.max(3, s * 0.13)], ["#ff6a5a", Math.max(1.5, s * 0.07)]] as const) {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.moveTo(x - r * 0.7, y + r * 0.7);
        c.lineTo(x + r * 0.7, y - r * 0.7);
        c.stroke();
      }
    }
    if (targeted) {
      const [x, y] = centre(targeted);
      for (const [color, width] of [["#000c", Math.max(3, s * 0.12)], ["#7ad8ff", Math.max(1.5, s * 0.06)]] as const) {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          c.moveTo(x + dx * r * 0.6, y + dy * r * 0.6);
          c.lineTo(x + dx * r * 1.4, y + dy * r * 1.4);
        }
        c.stroke();
      }
    }
    c.restore();
  }
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

  private get neon() {
    return this.game.save.settings.neonTheme;
  }
  /** Decor waits for neon versions of its own, so the Neon theme turns it off. */
  private get decorOn() {
    return !this.game.save.settings.decorOff && !this.neon;
  }
  private tileAt = (x: number, y: number) => this.game.world.tile(x, y);
  private decorFrame(f: FrameContext): DecorFrame {
    return { view: f, now: f.now, tileAt: this.tileAt, reduceMotion: f.look.reduceMotion };
  }
  private look(): BoardLook {
    const g = this.game;
    return {
      mode: g.mode, height: g.run.height, seed: g.run.seed, outside: !!g.run.outside, entranceX: Math.floor(g.world.width / 2),
      spritesOff: g.save.settings.spritesOff, reduceMotion: g.save.settings.reduceMotion, area1: !g.save.settings.spritesOff && isArea1(g.mode, g.run.height),
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
    paintTorch(c, t, f.now, f.look.reduceMotion, f.look.spritesOff);
    c.restore();
  }

  /** True when nothing on the board is moving: the hero and camera have
   * settled, no route is being walked, no fight is playing out, no feedback
   * or popup is showing, no level-up is shining, and no decor
   * effect is playing. (Torches and grass still sway.) Used by Battery saver. */
  isIdle(now: number) {
    const g = this.game;
    return this.settled() && !g.route.length && !g.encounter && this.popups.idle(now) && !this.decor.busy && this.effectsOver(now);
  }
  /** The hero and the camera stand where they are headed. */
  private settled() {
    const p = this.game.run.player, t = this.target(this.density), near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    return near(this.playerX, p.x) && near(this.playerY, p.y) && near(this.left, t.left) && near(this.bottom, t.bottom);
  }
  /** Every timed effect has played out: the arrival glow, a rush's echoes,
   * a blocked step, the feedback text, the level-up, revivals, an area
   * reward's burst, a Greater Boss's poof and a Gem's sparkle. */
  private effectsOver(now: number) {
    const g = this.game, sparkle = g.gemFinder.sparkle;
    return now - this.arrived > ARRIVAL_GLOW_MS && (!g.rush || now - g.rush.at >= RUSH_ECHO_MS) && g.blocked.until <= now && g.effect.until <= now &&
      now - g.levelUpAt >= LEVEL_UP_MS + POINTS_MS && g.revivedAt.every((at) => now - at >= REVIVE_MS) &&
      g.areaBursts.every((b) => now - b.at >= AREA_BURST_MS) &&
      (!g.summoned || now - g.summoned.at >= POOF_MS) && (!g.vanished || now - g.vanished.at >= POOF_MS) &&
      (!sparkle || now - sparkle.at >= GEM_SPARKLE_MS);
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
