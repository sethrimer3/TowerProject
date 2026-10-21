import { boardFont } from "./sprite-font.ts";
import { drawBoardMark } from "./sprite-board-marks.ts";
import { CHUNK, TOWER_HEIGHT, VIEWPORT_TILES } from "./config.ts";
import { drawFlyers } from "./flyer-art.ts";
import type { Game } from "./state.ts";
import type { Tile, Torch } from "./entities.ts";
import { TIER_BONUS_TENTHS, tierNumeral } from "./tiers.ts";
import { factorText } from "./gold-multipliers.ts";
import { drawBlacksmith, drawEntrance, drawTournamentHall, OutsideWorld, OUTSIDE_SIZE, outsideWeather, roadsOf } from "./outside.ts";
import { DecorLayer, type DecorFrame, type MirroredSprites } from "./decor-render.ts";
import { OutsideGrass } from "./outside-grass.ts";
import { ForestFoliage } from "./forest-foliage.ts";
import { forestSpritesReady } from "./sprite-forest.ts";
import { TileLayerCache } from "./tile-cache.ts";
import { OutdoorWeather } from "./weather.ts";
import { torchAnimationFrame } from "./game-sprites.ts";
import { towerTileset } from "./sprite-dungeon.ts";
import { isArea1, paintHero, paintHeroFallback, paintTile, paintTorch, type BoardLook } from "./tile-painters.ts";
import type { AtmosphereConfig } from "./lighting-pass.ts";
import { DungeonLight, type LitBoard } from "./dungeon-light.ts";
import { drawThemedBoard, themedBoardOf } from "./themed-boards.ts";
import { RoutePath } from "./route-path.ts";
import { BoardPopups, goldCoin, lunges } from "./board-popups.ts";
import { DamagePredictions, drawDamageLabels } from "./damage-labels.ts";
import { BossFlash } from "./boss-flash.ts";
import { goalUnlocked } from "./goals.ts";
import { DEFEAT_MS, drawStruckDown } from "./struck-down.ts";
import { AREA_BURST_MS, drawAreaBurst, preloadAreaBurst, drawLevelUp, drawRevive, drawWarpLoot, LEVEL_UP_MS, POINTS_MS, REVIVE_MS, WARP_LOOT_MS } from "./level-up.ts";
import { drawPoof, POOF_MS } from "./poof.ts";
import { drawGem, drawGemSparkle, GEM_SPARKLE_MS } from "./gem-art.ts";
import { DashEchoes } from "./dash-echoes.ts";
import { drawVolley, ShotsInFlight } from "./volley-art.ts";
import { volleyOver } from "./volley.ts";
import { drawShields } from "./shield-art.ts";
import { drawChestMarks } from "./chest-marks.ts";
import type { Dash, ShownTurn } from "./shown.ts";
import { darknessOf, forEachViewTile, tileTransform, toTileSpace, type FrameContext } from "./render-frame.ts";
import { gameLook } from "./theme-collection.ts";
import { usesGameSprites } from "./sprite-style.ts";
import { spriteRevision } from "./sprite-kit.ts";
import { HeroIdleAnimation, pickupAnimationFrame } from "./sprite-animations.ts";
import { FAST_GLIDE_SECONDS, FollowCamera, GLIDE_SECONDS, pointsAhead, type CameraView } from "./camera.ts";

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
  private heroIdle = new HeroIdleAnimation();
  private routePath = new RoutePath();
  private predictions = new DamagePredictions();
  private bossFlash = new BossFlash();
  /** Damage numbers and rewards rising off their tiles. */
  popups = new BoardPopups();
  /** The Tower floor the hero was last drawn on (seed and height), and when
   * it arrived on the one it stands on now. */
  private floorKey = "";
  private arrived = -Infinity;
  /** The latest dash drawn: a new one snaps the hero to where it landed. */
  private dashed: Dash | null = null;
  private echoes = new DashEchoes();
  /** The turns' shots still flying, and the enemies they felled still standing until they land. */
  private inFlight = new ShotsInFlight();
  /** The turn's step the hero last walked, and when its walk began. */
  private turnSeen: ShownTurn | null = null;
  private turnStart = 0;
  /** The Delve's camera, which trails the hero with a dead zone and momentum. */
  private camera = new FollowCamera();
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
  /** Inside the Delve the camera trails the hero (camera.ts); the Tower and
   * the forest hold still. */
  private get followsHero() {
    return this.game.mode === "delve" && !this.game.run.outside;
  }
  private cameraView(n: number): CameraView {
    return { n, width: this.game.world.width };
  }
  /** Where the camera settles. */
  target(n: number) {
    const g = this.game;
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
    const view = this.cameraView(n);
    return { bottom: this.camera.restingBottom(view), left: this.camera.restingLeft(view) };
  }
  draw(now: number) {
    const f = this.beginFrame(now);
    const themed = f.look.themed;
    if (themed) drawThemedBoard(f, themed, this.enemyLunge, () => this.drawRoute(f), this.game.run.player, this.game.mode === "delve" ? this.game.world.width : 0);
    else {
      // Ground first; in the dungeon the light then runs the frame (relief,
      // decor, shadows, contents, torches, route, hero, frame) over it.
      this.drawGround(f);
      if (f.look.outside) this.drawOutside(f);
      else {
        this.light.draw(f, this.litBoard(f));
        // Flying enemies hover over it all, the hero included.
        drawFlyers(f, this.game.run.player, this.game.mode === "delve" ? this.game.world.width : 0, (c, t, x, y) => this.tile(c, f, t, x, y, 1), false);
      }
    }
    this.echoes.draw(f, themed ? (c, facing) => themed.hero(c, facing) : (c) => paintHero(c, f.look.spritesOff, f.look.styledSprites, f.heroFacing));
    this.drawOverlays(f);
  }
  /** Gameplay feedback drawn over every board. */
  private drawOverlays(f: FrameContext) {
    // A Shielded enemy's bubble shows above the darkness, under the labels.
    if (!this.game.run.outside) drawShields(f, this.game.world.shields?.() ?? [], this.game.mode === "delve" ? this.game.world.width : 0);
    // Supply and Equipment Chests show their kind, opened or not.
    if (!this.game.run.outside) drawChestMarks(f);
    this.drawDamageLabels(f);
    if (!this.game.run.outside) this.bossFlash.draw(f, this.game.run.seed, this.game.run.height, f.look.reduceMotion);
    this.drawSkipMarks(f);
    this.drawBadgeMarks(f);
    this.drawChargeMarks(f);
    this.drawBlockedMark(f);
    // A Gem shines above the darkness, so it can be seen and tapped.
    const gem = this.game.gemFinder.gem, sparkle = this.game.gemFinder.sparkle;
    if (gem) drawGem(f, gem.x, gem.y);
    if (sparkle) drawGemSparkle(f, sparkle.x, sparkle.y, f.now - sparkle.at);
    drawVolley(f, this.inFlight.volleys, this.game.mode === "delve" ? this.game.world.width : 0);
    this.popups.draw(f);
    this.drawEffectText(f);
    for (const at of this.game.fights.struckDown) drawStruckDown(f, f.now - at);
    for (const at of this.game.fights.revivedAt) drawRevive(f, f.now - at);
    drawLevelUp(f, f.now - this.game.levelUpAt, this.game.levelUpPoints);
    for (const area of this.game.areaBursts) if (f.now >= area.at) drawAreaBurst(f, f.now - area.at, area.reward, area.inspiration);
    const loot = this.game.warpLooted;
    if (loot) drawWarpLoot(f, f.now - loot.at, loot.silver);
    const summoned = this.game.summoned;
    if (summoned) drawPoof(f, summoned.x, summoned.y, f.now - summoned.at);
    const vanished = this.game.vanished;
    if (vanished) drawPoof(f, vanished.x, vanished.y, f.now - vanished.at);
  }
  /** The forest clearing: its contents, the entrance, the route, the hero
   * in its grass, and the weather. */
  private drawOutside(f: FrameContext) {
    this.drawEachContents(f, f.c);
    const forest = f.look.styledSprites && this.game.world instanceof OutsideWorld && forestSpritesReady();
    if (forest) {
      if (this.decorOn) this.drawForestGrass(f, "back");
      this.forestFoliage.draw(f.c, f, this.game.world as OutsideWorld, this.decorOn);
    }
    this.drawForestEntrance(f);
    this.drawRoute(f);
    this.drawHeroOutside(f, forest);
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
      hero: (ctx) => paintHero(ctx, f.look.spritesOff, f.look.styledSprites, f.heroFacing, f.heroIdleFrame),
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
    this.follow(n, dt, now);
    this.inFlight.update(g.volley, now, g.mode === "delve" ? g.world.width : 0);
    this.popups.update({ run: g.run, gains: g.gains, fight: g.fights.shown, lastHeal: g.lastHeal, volley: g.volley, save: g.save }, now);
    const lunge = lunges(g.fights.encounter, now, g.save.settings.reduceMotion);
    this.enemyLunge = { ...(g.fights.encounter?.to ?? { x: 0, y: 0 }), ...lunge.enemy };
    const c = this.ctx, s = this.size, outside = !!g.run.outside, settings = g.save.settings;
    c.fillStyle = "#0b1017";
    c.fillRect(0, 0, box.width, box.width);
    const look = this.look(), p = g.run.player;
    const idle = look.styledSprites && look.spriteAnimations && !look.reduceMotion && !g.route.length && !g.fights.encounter && p.hp > 0
      && Math.abs(this.playerX - p.x) < .01 && Math.abs(this.playerY - p.y) < .01;
    const idleKey = `${g.run.seed}:${g.run.height}:${g.run.tier}:${outside}:${p.x},${p.y}:${g.facing.dx},${g.facing.dy}`;
    const heroIdleFrame = this.heroIdle.frame(now, !!idle, idleKey);
    const f: FrameContext = {
      c, now, dt, dpr, width: box.width, n, s, left: this.left, bottom: this.bottom, playerX: this.playerX + lunge.hero.dx, playerY: this.playerY + lunge.hero.dy, heroFacing: g.facing,
      world: this.inFlight.board(g.world), look, heroIdleFrame, darkness: darknessOf(g), torches: [], walls: [], glows: [],
    };
    f.torches = outside ? [] : this.visibleTorches();
    f.walls = outside ? [] : this.visibleWallTiles();
    f.glows = outside || this.themed ? [] : this.light.glows(f);
    if (!outside && this.decorOn) {
      this.decor.sync(g.world, g.run.seed);
      this.decor.update({ dt, now, hx: this.playerX, hy: this.playerY, tileAt: this.tileAt, reduceMotion: f.look.reduceMotion });
      f.glows.push(...this.decor.glows(f, f.look.styledSprites));
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
      this.echoes.clear();
      const sameRun = floor && this.floorKey.startsWith(`${g.run.seed}|`);
      this.floorKey = floor;
      if (sameRun) {
        this.playerX = p.x;
        this.playerY = p.y;
        this.arrived = now;
      }
    }
    if (this.seed !== g.run.seed || this.outside !== !!g.run.outside) {
      this.echoes.clear();
      this.outside = !!g.run.outside;
      this.weather.silence();
      this.seed = g.run.seed;
      this.playerX = p.x;
      this.playerY = p.y;
      this.camera.reset({ x: p.x + 0.5, y: p.y + 0.5 }, this.cameraView(n));
      const t = this.target(n);
      this.bottom = t.bottom;
      this.left = t.left;
    }
    if (Math.abs(p.x - this.playerX) > g.world.width / 2) this.playerX = p.x;
    // A dash is one step: the hero is there at once, its echoes left behind.
    if (g.dash !== this.dashed) {
      this.dashed = g.dash;
      if (g.dash) {
        this.echoes.add(g.dash, now);
        this.camera.leap();
      }
      this.playerX = p.x;
      this.playerY = p.y;
    }
  }
  /** Glides the drawn hero, then the camera, toward where they belong (or
   * snaps them, with motion reduced or transitions off). In the Delve the
   * camera trails where the hero is drawn (camera.ts); elsewhere it eases to
   * its fixed spot. */
  private follow(n: number, dt: number, now: number) {
    const settings = this.game.save.settings, snaps = settings.reduceMotion || settings.transition === "instant";
    const fast = settings.transition === "fast", blend = snaps ? 1 : 1 - Math.exp(-dt * (fast ? 32 : 14));
    this.walkHero(blend, snaps, now);
    if (this.followsHero) {
      const view = this.cameraView(n);
      const ahead = pointsAhead(this.game.run.player, this.game.pathAhead);
      this.camera.update({ x: this.playerX + 0.5, y: this.playerY + 0.5 }, view, dt, fast ? FAST_GLIDE_SECONDS : GLIDE_SECONDS, snaps, ahead);
      this.left = this.camera.left(view);
      this.bottom = this.camera.bottom(view);
      return;
    }
    const target = this.target(n);
    this.bottom += (target.bottom - this.bottom) * blend;
    this.left += (target.left - this.left) * blend;
  }
  /** Moves the drawn hero toward its tile. Through a turn's step inside a
   * run (`Game.turnShown`) it walks the step at an even pace instead, so it
   * stands where the turn's shots leave from. */
  private walkHero(blend: number, snaps: boolean, now: number) {
    const p = this.game.run.player, turn = this.game.turnShown;
    // A turn stamped after the first frame showing it (a clock that frame doesn't keep) walks from that frame.
    if (turn !== this.turnSeen) {
      this.turnSeen = turn;
      this.turnStart = turn ? Math.min(turn.at, now) : 0;
    }
    const k = turn && !snaps && turn.to.x === p.x && turn.to.y === p.y ? (now - this.turnStart) / turn.ms : 1;
    if (turn && k < 1) {
      this.playerX = turn.from.x + (turn.to.x - turn.from.x) * Math.max(0, k);
      this.playerY = turn.from.y + (turn.to.y - turn.from.y) * Math.max(0, k);
      return;
    }
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
      f.look.styledSprites ? `kit:${spriteRevision()}` : "",
      ...(f.look.styledSprites && towerTileset(f.look.mode, f.look.tier) ? [`tower:${f.look.tier}`] : []),
    ].join("|");
    this.groundCache.draw(f.c, f, f.dpr, groundKey, f.now, CACHE_COLUMNS,
      (ctx, x, y) => this.tile(ctx, f, g.world.tile(x, y), x, y, 0));
  }
  /** Decor over the stone (so pools and crates hide the bricks beneath
   * them), with the board's sprites mirrored in its water. */
  private drawDecorGround(f: FrameContext) {
    if (!this.decorOn || !this.decor.key) return;
    const key = this.decor.key + (f.look.styledSprites ? `:kit:${spriteRevision()}` : "");
    this.decorCache.draw(f.c, f, f.dpr, key, f.now, CACHE_COLUMNS, (ctx, x, y) => this.decor.bakeTile(ctx, x, y, f.look.styledSprites));
    this.decor.drawGround(f.c, this.decorFrame(f), this.mirroredSprites(f));
  }
  /** The tiles, torches and hero, for the water to mirror. */
  private mirroredSprites(f: FrameContext): MirroredSprites {
    const s = f.s, n = f.n;
    const animated = !!f.look.spriteAnimations && !f.look.reduceMotion;
    return {
      style: `${f.look.spritesOff}|${!!f.look.styledSprites}|${f.look.styledSprites ? spriteRevision() : 0}${f.look.squareDoors ? "|square" : ""}${f.look.spriteAnimations ? "|animated" : ""}${f.look.styledSprites && towerTileset(f.look.mode, f.look.tier) ? `|tower:${f.look.tier}` : ""}`,
      tile: (ctx, t, x, y, layer) => this.tile(ctx, f, t, x, y, layer),
      contentFrame: animated ? (t, x, y) => pickupAnimationFrame(t, x, y, f.now, f.look.seed) : undefined,
      torches: f.torches.map((t) => ({
        x: t.x, y: t.y, frame: torchAnimationFrame(t.x, t.y, f.now, f.look.reduceMotion),
        // The torch draws in screen space: map its tile back to 0..24.
        paint: (c) => {
          c.setTransform(24 / s, 0, 0, 24 / s, -(t.x - f.left) * 24, -(n - 1 - (t.y - f.bottom)) * 24);
          this.drawTorchSprite(c, f, t);
        },
      })),
      hero: { x: this.playerX, y: this.playerY, frame: animated ? `${f.heroFacing.dx},${f.heroFacing.dy}:${f.heroIdleFrame}` : undefined,
        paint: (c) => paintHero(c, f.look.spritesOff, f.look.styledSprites, f.heroFacing, f.heroIdleFrame) },
    };
  }
  /** Doors, stairs, items, and enemies, drawn onto `ctx`. */
  private drawEachContents(f: FrameContext, ctx: CanvasRenderingContext2D) {
    forEachViewTile(f, (x, y) => {
      const t = f.world.tile(x, y);
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
    const tiers = slice.tiersOpen > 1;
    drawEntrance(c, g.mode, Math.floor(g.world.width / 2), tiers ? tierNumeral(slice.tier) : "",
      tiers ? { text: factorText(TIER_BONUS_TENTHS[slice.tier - 1]! / 10), coin: goldCoin() } : undefined, f.look.styledSprites);
    if (g.world instanceof OutsideWorld && g.world.blacksmith) drawBlacksmith(c, g.world.entranceX, f.look.styledSprites);
    if (g.world instanceof OutsideWorld && g.world.hall) drawTournamentHall(c, g.world.entranceX, f.look.styledSprites);
    c.restore();
  }
  private drawRoute(f: FrameContext) {
    this.routePath.update(this.game.route, this.previewRoute, this.game.run.player, f.dt);
    this.routePath.draw(f);
  }
  private forestFoliage = new ForestFoliage();
  private drawForestGrass(f: FrameContext, layer: "back" | "front") {
    this.grass.draw(f.c, f, this.game.world, this.game.run.seed, Math.floor(this.game.world.width / 2), outsideWeather(this.game.run.seed), f.now, f.dt,
      this.playerX, this.playerY, f.look.reduceMotion, layer);
  }
  /** The hero between the forest grass behind it and the blades at its feet. */
  private drawHeroOutside(f: FrameContext, grassBehindFoliage = false) {
    const c = f.c, g = this.game;
    const m = tileTransform(f, f.playerX, f.playerY);
    if (this.decorOn && !grassBehindFoliage) this.drawForestGrass(f, "back");
    c.save();
    c.setTransform(m);
    paintHero(c, f.look.spritesOff, f.look.styledSprites, f.heroFacing, f.heroIdleFrame);
    c.restore();
    if (this.decorOn) this.drawForestGrass(f, "front");
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
  /** Damage Visual: what each enemy in view would cost, and what each item
   * gives, once its goal is claimed and while each one's setting is on, a fight
   * coloured by its share of the hero's HP once Relative Damage Color is
   * claimed too; critical strikes count only with Critical Prediction. The
   * enemy being fought wears none while its fight plays out, but the latest
   * fight once over hides nothing: an enemy may appear where it ended (a
   * Greater Boss on a kill's tile by the stairs). */
  private drawDamageLabels(f: FrameContext) {
    const g = this.game;
    const { damageVisual: enemies, itemLabels } = g.save.settings;
    if (g.run.outside || (!enemies && !itemLabels) || !goalUnlocked(g.save, "damageVisual")) return;
    const crit = g.save.upgrades.critPrediction ? g.crit : undefined;
    const items = itemLabels ? { rules: g.stepRules, chestGold: (x: number, y: number) => g.chestGold(x, y) } : undefined;
    drawDamageLabels(f, this.predictions, g.run.player, g.fights.encounter, goalUnlocked(g.save, "relativeDamageColor"), crit, items, enemies);
  }
  /** A fading red cross where a step was refused. */
  /** Skip Open Nodes' marks: a violet X on each door or monster it passed
   * over on this floor. */
  private drawSkipMarks(f: FrameContext) {
    const marks = this.game.handRules.skipMarks;
    if (!marks.length) return;
    const c = f.c, s = f.s, r = s * 0.2;
    c.save();
    c.lineCap = "round";
    for (const k of marks) {
      const [wx, wy] = k.split(",").map(Number), x = (wx - f.left + 0.5) * s + s * 0.22, y = (f.n - 0.5 - (wy - f.bottom)) * s - s * 0.22;
      if (drawBoardMark(f, "skip", x, y)) continue;
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
    const { asked, bangs } = this.game.handRules.badgeMarks;
    if (!asked.length && !bangs.length) return;
    const c = f.c, s = f.s;
    c.save();
    c.font = boardFont(f.look.styledSprites, Math.max(10, Math.round(s * 0.42)), "bold", "Cinzel, serif");
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
    const g = this.game, ignored = g.handRules.ignored, targeted = g.run.outside ? undefined : g.run.targeted;
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
      if (drawBoardMark(f, "ignore", x, y)) continue;
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
      if (drawBoardMark(f, "target", x, y)) { c.restore(); return; }
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
    if (drawBoardMark(f, "blocked", x, y)) { c.restore(); return; }
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
    c.font = boardFont(f.look.styledSprites, Math.max(11, s * 0.6), 600);
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

  /** How the Game theme worn draws the dungeon, or null for Classic. */
  private get themed() {
    return themedBoardOf(gameLook(this.game.save));
  }
  /** Decor waits for versions of its own in each Game theme, so a Game theme
   * other than Classic turns it off. */
  private get decorOn() {
    return !this.game.save.settings.decorOff && !this.themed;
  }
  private tileAt = (x: number, y: number) => this.game.world.tile(x, y);
  private decorFrame(f: FrameContext): DecorFrame {
    return { view: f, now: f.now, tileAt: this.tileAt, reduceMotion: f.look.reduceMotion, styledSprites: f.look.styledSprites };
  }
  private look(): BoardLook {
    const g = this.game;
    return {
      mode: g.mode, tier: g.run.tier ?? 1, height: g.run.height, seed: g.run.seed, outside: !!g.run.outside, entranceX: Math.floor(g.world.width / 2),
      roads: g.run.outside ? roadsOf(g.world) : undefined,
      spritesOff: g.save.settings.spritesOff, reduceMotion: g.save.settings.reduceMotion, area1: !g.save.settings.spritesOff && isArea1(g.mode, g.run.height),
      styledSprites: usesGameSprites(g.save),
      spriteAnimations: usesGameSprites(g.save) && g.save.settings.spriteAnimations,
      squareDoors: usesGameSprites(g.save) && g.save.settings.squareDoors,
      themed: g.run.outside ? null : this.themed,
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
    paintTorch(c, t, f.now, f.look.reduceMotion, f.look.spritesOff, f.look.styledSprites, f.look.spriteAnimations);
    c.restore();
  }

  /** True when nothing on the board is moving: the hero and camera have
   * settled, no route is being walked, no fight is playing out, no feedback
   * or popup is showing, no level-up is shining, and no decor
   * effect is playing. (Torches and grass still sway.) Used by Battery saver. */
  isIdle(now: number) {
    const g = this.game;
    return this.settled() && !g.route.length && !g.fights.encounter && this.popups.idle(now) && !this.decor.busy && this.effectsOver(now);
  }
  /** The hero and the camera stand where they are headed. */
  private settled() {
    const p = this.game.run.player, t = this.target(this.density), near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    return near(this.playerX, p.x) && near(this.playerY, p.y) && near(this.left, t.left) && near(this.bottom, t.bottom) && (!this.followsHero || this.camera.settled());
  }
  /** Every timed effect has played out: the arrival glow, a dash's echoes,
   * a blocked step, the feedback text, the level-up, skulls, revivals, an area
   * reward's burst, Warp Loot's, a Greater Boss's poof, a Gem's sparkle and the turn's
   * shots in flight. */
  private effectsOver(now: number) {
    const g = this.game, sparkle = g.gemFinder.sparkle;
    return now - this.arrived > ARRIVAL_GLOW_MS && this.echoes.over(now) && g.blocked.until <= now && g.effect.until <= now &&
      now - g.levelUpAt >= LEVEL_UP_MS + POINTS_MS && g.fights.revivedAt.every((at) => now - at >= REVIVE_MS) && g.fights.struckDown.every((at) => now - at >= DEFEAT_MS) &&
      g.areaBursts.every((b) => now - b.at >= AREA_BURST_MS) && (!g.warpLooted || now - g.warpLooted.at >= WARP_LOOT_MS) &&
      (!g.summoned || now - g.summoned.at >= POOF_MS) && (!g.vanished || now - g.vanished.at >= POOF_MS) &&
      (!sparkle || now - sparkle.at >= GEM_SPARKLE_MS) && (!g.volley || volleyOver(g.volley, now)) && this.inFlight.over(now);
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
