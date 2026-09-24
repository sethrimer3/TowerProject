import { CHUNK, COLORS, TOWER_HEIGHT, VIEWPORT_TILES } from "./config.ts";
import { drawTerrain, tileRandom } from "./themes.ts";
import type { Game } from "./state.ts";
import type { Tile, Torch } from "./entities.ts";
import { drawForestTile, drawEntrance, OUTSIDE_SIZE } from "./outside.ts";
import { OutdoorWeather } from "./weather.ts";
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "./lighting.ts";
import { area1FloorSprite, drawArea1Door, drawArea1Item } from "./area1-tileset.ts";
import { drawThemedTile } from "./themed-tilesets.ts";
import { bakeTorchRelief, torchReaches, type BakedRelief } from "./floor-relief.ts";
import { bakeTorchLight, lightFalloff, type BakedLight } from "./torch-light.ts";
import { doorColor, doorId } from "./doors.ts";
import { drawEnemySprite } from "./enemy-sprites.ts";
import { drawGameSprite, drawGameSpriteFrame, gameSprite, torchAnimationFrame, TORCH_FRAME_COUNT } from "./game-sprites.ts";

/** Tile kinds that stand up off the floor and so cast torch shadows. */
const SHADOW_CASTERS = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "reward", "treasure", "enemy"]);
type SpriteDir = "e" | "w" | "n" | "s";
const SPRITE_DIRS: { key: SpriteDir; dx: number; dy: number }[] = [
  { key: "e", dx: 1, dy: 0 }, { key: "w", dx: -1, dy: 0 }, { key: "n", dx: 0, dy: -1 }, { key: "s", dx: 0, dy: 1 },
];
type LitCaster = { x: number; y: number; key: string; draw: () => void; hero: boolean; light: Record<SpriteDir, number> };
const GLOW_ITEMS = new Set<Tile["kind"]>(["key", "potion", "attack", "defense", "reward", "treasure"]);
/** A glowing object this frame: tile position, color, reach (tiles), and strength. */
type GlowSource = { x: number; y: number; rgb: readonly number[]; radius: number; strength: number; door?: boolean };
const hexRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

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

/** Thin outline colors that mark ground items/treasure as interactable and
 * enemies as hostile, independent of each sprite's own fill colors. */
const DARK_GOLD = "#6e4c17";
const DARK_RED = "#6e1c26";
const DARK_ORANGE = "#7d3f14";
const DARK_BLUE = "#1a3670";
/** Outline thickness in sprite pixels (24x24 sprite space) — chunky pixel-art
 * strokes rather than a thin 1px line. */
const OUTLINE_THICKNESS = 2;

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
  atmosphere: AtmosphereConfig = { ...ATMOSPHERE_CONFIG };
  lightmapCanvas: HTMLCanvasElement | null = null;
  lightmapCtx: CanvasRenderingContext2D | null = null;
  outlineCanvas: HTMLCanvasElement | null = null;
  outlineSilCanvas: HTMLCanvasElement | null = null;
  /** A golden path to preview for a highlighted-but-unconfirmed destination.
   * Drawn via the same line as an in-progress walk whenever no walk is
   * actually underway (game.route takes priority when both are set). */
  previewRoute: Array<{ x: number; y: number }> | null = null;
  /** Fixed polyline (tile centers) for the currently drawn golden path —
   * recomputed only when a walk/preview starts, so its shape never changes
   * mid-walk. pathProgress is a smoothed arclength (in tiles) consumed along
   * it, advanced independently of the hero sprite's own interpolation so the
   * line neither skips a tile at a time nor bends toward the sprite. */
  pathPoints: Array<{ x: number; y: number }> | null = null;
  pathProgress = 0;
  private pathGoalKey: string | null = null;
  private pathLastLen = 0;
  private pathWasLive = false;
  /** Torches near the viewport this frame, gathered before the tile pass so
   * floor tiles can pick up torch relief. */
  frameTorches: Torch[] = [];
  /** Wall tiles in view this frame (shared by the shadow and darkness passes). */
  frameWalls: [number, number][] = [];
  /** Baked per-torch glow, computed once since walls never move. */
  /** Each torch's glow baked with the flame nudged left and right. */
  torchBakes = new WeakMap<Torch, { left: BakedLight; right: BakedLight } | null>();
  /** Each torch's relief baked with the light nudged left and right. */
  reliefBakes = new WeakMap<Torch, { left: BakedRelief; right: BakedRelief } | null>();
  /** Torch bakes cost a few ms each; spread them over frames on room entry. */
  bakeBudget = 0;
  shadowCanvas: HTMLCanvasElement | null = null;
  darkCanvas: HTMLCanvasElement | null = null;
  /** The darkness layer before object glows are added, used to darken the
   * sprites themselves so their own glow never tints them. */
  spriteDarkCanvas: HTMLCanvasElement | null = null;
  torchGlowCanvas: HTMLCanvasElement | null = null;
  contentsCanvas: HTMLCanvasElement | null = null;
  contentsMaskCanvas: HTMLCanvasElement | null = null;
  glowCanvas: HTMLCanvasElement | null = null;
  glowWallCanvas: HTMLCanvasElement | null = null;
  /** Soft round glow images, one per color, drawn scaled for every glow. */
  glowSprites = new Map<string, HTMLCanvasElement>();
  /** This frame's glowing objects. */
  frameGlows: GlowSource[] = [];
  /** Opaque wall tiles for the current camera, used to mask darkness and
   * shadows off walls with a single blit. Rebuilt only when the view moves. */
  wallMask: { canvas: HTMLCanvasElement; key: string; world: unknown } | null = null;
  /** Black cut-outs of item/enemy/hero sprites used for torch-cast shadows.
   * Rebaked after a short while so sprites that finish loading are picked up. */
  silhouettes = new Map<string, { canvas: HTMLCanvasElement; at: number }>();
  /** Directional torchlight masks per silhouette (see bakeSpriteLight). */
  spriteLightMasks = new Map<string, { at: number; masks: Record<SpriteDir, HTMLCanvasElement> }>();
  /** Items, enemies, and the hero in torchlight this frame, with how much
   * light reaches each side of them. */
  frameLit: LitCaster[] = [];
  /** Whether this frame drew any cast shadows (reused by the darkness pass). */
  frameShadows = false;
  /** Last committed vertical-stretch sign per caster/torch pair, so a shadow
   * doesn't flip direction every time sway nudges the torch past level with
   * the caster (see the vert calculation in drawEntityShadows). */
  shadowVertSign = new Map<string, number>();
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
    const g = this.game,
      p = g.run.player,
      n = this.density;
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
    const blend =
      g.save.settings.reduceMotion || g.save.settings.transition === "instant"
        ? 1
        : 1 - Math.exp(-dt * (g.save.settings.transition === "fast" ? 32 : 14));
    const target = this.target(n);
    this.bottom += (target.bottom - this.bottom) * blend;
    this.left += (target.left - this.left) * blend;
    this.playerX += (p.x - this.playerX) * blend;
    this.playerY += (p.y - this.playerY) * blend;
    const c = this.ctx,
      s = this.size;
    c.fillStyle = "#0b1017";
    c.fillRect(0, 0, box.width, box.width);
    this.frameTorches = g.run.outside ? [] : this.visibleTorches();
    this.bakeBudget = 2;
    this.frameWalls = g.run.outside ? [] : this.visibleWallTiles();
    this.frameGlows = g.run.outside ? [] : this.visibleGlowSources(now);
    // Ground first, then torch-cast shadows, then tile contents on top, so
    // shadows fall across the floor but never over the things casting them.
    const eachTile = (layer: 0 | 1) => {
      for (let row = -1; row <= n; row++)
        for (let col = -1; col <= n; col++) {
          const x = col + Math.floor(this.left),
            y = Math.floor(this.bottom) + row;
          if (y < 0) continue;
          const t = g.world.tile(x, y);
          if (layer === 1 && (t.kind === "wall" || t.kind === "floor")) continue;
          const sy = (n - 1 - (y - this.bottom)) * s;
          const tc = this.ctx;
          tc.save();
          tc.translate((x - this.left) * s, sy);
          tc.scale(s / 24, s / 24);
          this.tile(t, x, y, now, layer);
          tc.restore();
        }
    };
    eachTile(0);
    if (!g.run.outside) {
      this.drawTorchRelief(now);
      this.drawEntityShadows(box.width, now);
    }
    // Below the default brightness: darken the ground, lay the object glows
    // on it, then draw the objects (less darkened) on top of their glows.
    const dark = g.run.outside ? null : this.buildDarkness(box.width, this.frameTorches, now);
    const spriteDark = dark && this.spriteDarkCanvas;
    if (dark && spriteDark) {
      c.save();
      c.globalCompositeOperation = "multiply";
      c.drawImage(dark, 0, 0, box.width, box.width);
      c.restore();
      this.drawObjectBloom(box.width);
      this.drawDarkened(spriteDark, box.width, dpr, LIGHTING_CONFIG.objectGlow.spriteDarkness, () => eachTile(1));
      this.drawDoorWash();
    } else eachTile(1);
    if (!g.run.outside) this.drawSpriteLighting(now);
    if (g.run.outside) {
      c.save();
      c.translate(-this.left * s, (n - OUTSIDE_SIZE + this.bottom) * s);
      c.scale(s / 24, s / 24);
      drawEntrance(c, g.mode, Math.floor(g.world.width / 2));
      c.restore();
    } else {
      const torches = this.frameTorches;
      // Drawn after the darkness so the flames themselves are never dimmed.
      for (const t of torches) this.drawTorchSprite(t, now);
      // Render lighting overlay via offscreen lightmap
      this.drawDungeonLightmap(box.width, torches, now);
    }
    this.updateRoutePath(dt);
    this.drawRoutePath(now);
    c.save();
    c.translate(
      (this.playerX - this.left) * s,
      (n - 1 - (this.playerY - this.bottom)) * s,
    );
    c.scale(s / 24, s / 24);
    const drawHero = () => {
      this.hero();
      if (!g.run.outside) this.drawSpriteLighting(now, true);
    };
    if (spriteDark) {
      // The hero takes only a light touch of the darkness, through the same
      // masked layer as the other sprites.
      const heroTransform = c.getTransform();
      c.restore();
      this.drawDarkened(spriteDark, box.width, dpr, LIGHTING_CONFIG.objectGlow.heroDarkness, () => {
        this.ctx.setTransform(heroTransform);
        drawHero();
      });
    } else {
      drawHero();
      c.restore();
    }
    if (g.run.outside) {
      this.weather.draw(c, box.width, g.run.seed, dt, g.save.settings.reduceMotion,
        !g.paused && !g.summary && !document.hidden, g.save.settings.weatherSound !== false);
    } else {
    c.fillStyle = "#606b79";
    c.fillRect(0, 0, box.width, 2);
    c.fillRect(0, box.width - 2, box.width, 2);
    c.fillRect(0, 0, 2, box.width);
    c.fillRect(box.width - 2, 0, 2, box.width);
    this.drawVignette(box.width);
    }
    if (g.blocked.until > now) {
      const x = (g.blocked.x - this.left + 0.5) * s,
        y = (n - 0.5 - (g.blocked.y - this.bottom)) * s,
        r = s * 0.28;
      c.save();
      c.globalAlpha = Math.min(1, (g.blocked.until - now) / 700);
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
    if (g.effect.until > now) {
      c.font = `600 ${Math.max(11, s * 0.6)}px Cinzel`;
      c.textAlign = "center";
      c.fillStyle = "#f3d69a";
      c.shadowColor = "#000";
      c.shadowBlur = 5;
      const offset = g.save.settings.reduceMotion
        ? 0
        : (1300 - (g.effect.until - now)) / 65;
      c.fillText(g.effect.text, box.width / 2, box.width * 0.2 - offset);
      c.shadowBlur = 0;
    }
  }
  /** Cheap, restrained grounding shadow: a soft dark ellipse under a sprite's
   * feet. No blur filter — a two-stop radial gradient reads as soft at this
   * tile scale for near-zero cost. */
  groundShadow(cx: number, cy: number, rx: number, ry: number, alpha: number) {
    const c = this.ctx;
    const gr = c.createRadialGradient(cx, cy, 0, cx, cy, rx);
    gr.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gr.addColorStop(0.7, `rgba(0,0,0,${alpha * 0.55})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    c.save();
    c.fillStyle = gr;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  /** Draws a sprite into an offscreen 24x24 buffer, then stamps a solid-color
   * silhouette outward along the four cardinal directions before the real
   * sprite on top — a chunky pixel-art outline that hugs the sprite's actual
   * shape. Diagonal shifts are deliberately omitted, so outer corners of the
   * silhouette stay bare instead of rounding out into a diagonal fill. */
  withOutline(color: string, draw: (c: CanvasRenderingContext2D) => void) {
    const s = 24;
    if (!this.outlineCanvas) this.outlineCanvas = document.createElement("canvas");
    if (!this.outlineSilCanvas) this.outlineSilCanvas = document.createElement("canvas");
    const off = this.outlineCanvas, sil = this.outlineSilCanvas;
    off.width = s; off.height = s; sil.width = s; sil.height = s;
    const offCtx = off.getContext("2d")!, silCtx = sil.getContext("2d")!;
    offCtx.clearRect(0, 0, s, s);
    draw(offCtx);
    silCtx.clearRect(0, 0, s, s);
    silCtx.drawImage(off, 0, 0);
    silCtx.globalCompositeOperation = "source-in";
    silCtx.fillStyle = color;
    silCtx.fillRect(0, 0, s, s);
    silCtx.globalCompositeOperation = "source-over";
    const c = this.ctx;
    c.save();
    for (let n = 1; n <= OUTLINE_THICKNESS; n++) {
      for (const [dx, dy] of [[-n, 0], [n, 0], [0, -n], [0, n]]) c.drawImage(sil, dx, dy);
    }
    c.restore();
    c.drawImage(off, 0, 0);
  }
  /** Layer 0 draws the ground (terrain + floor relief); layer 1 draws
   * whatever stands on it (items, doors, enemies...). */
  tile(t: Tile, x: number, y: number, time: number, layer: 0 | 1 = 0) {
    const c = this.ctx;
    const g = this.game;
    if (g.run.outside) {
      if (layer === 0) drawForestTile(c, t, x, y, g.run.seed, Math.floor(g.world.width / 2), !g.save.settings.spritesOff);
      return;
    }
    const area1 = !g.save.settings.spritesOff && g.mode === "tower" && g.run.height >= 0 && g.run.height < 10;
    if (layer === 0) {
      this.ground(t, x, y, time, area1);
      return;
    }
    if (t.kind === "wall" || t.kind === "floor") return;
    this.contents(t, x, y, time, area1);
  }
  ground(t: Tile, x: number, y: number, time: number, area1: boolean) {
    const c = this.ctx;
    const g = this.game;
    const northWall = g.world.tile(x, y + 1)?.kind === "wall";
    const southWall = g.world.tile(x, y - 1)?.kind === "wall";
    const westWall = g.world.tile(x - 1, y)?.kind === "wall";
    const eastWall = g.world.tile(x + 1, y)?.kind === "wall";
    const neighbors = {
      northWall,
      southWall,
      westWall,
      eastWall,
    };
    // Every biome has a PNG floor/wall set. Images load asynchronously; until
    // ready (or if an asset fails), the procedural renderer remains a complete
    // fallback and the Sprites setting can still opt out of bitmap art.
    const drewSprite = !g.save.settings.spritesOff && drawThemedTile(
      c, g.mode, g.run.height, t.kind === "wall", x, y, g.run.seed, neighbors,
    );
    if (!drewSprite)
      drawTerrain(c, t.kind === "wall", g.mode, g.run.height, x, y, g.run.seed, t.kind === "floor", neighbors);
    if (t.kind === "wall") return;
  }
  contents(t: Tile, x: number, y: number, time: number, area1: boolean) {
    const c = this.ctx;
    const g = this.game;

    if (t.kind === "oneway") {
      c.fillStyle = "#8a7e93";
      c.fillRect(0, 10, 24, 5);
      c.fillStyle = "#a89fb3";
      c.beginPath(); c.moveTo(5, 10); c.lineTo(12, 19); c.lineTo(19, 10); c.fill();
      return;
    }
    if (t.kind === "stairs") {
      if (!g.save.settings.spritesOff && drawGameSprite(c, "stairsUp")) return;
      const exit = y % CHUNK === CHUNK - 1;
      c.fillStyle = exit ? "#dec58c20" : "#8eacc520";
      c.fillRect(2, 1, 20, 22);
      // Restrained stone framing so stairways read as a deliberate architectural
      // feature rather than a plain floor tile with steps drawn on it.
      c.strokeStyle = exit ? "#e8c98a55" : "#9fb7cc45";
      c.lineWidth = 1;
      c.strokeRect(1.5, 0.5, 21, 23);
      for (let i = 0; i < 4; i++) {
        c.fillStyle = exit ? "#bda67a" : "#65707b";
        c.fillRect(4, 11 + i * 3, 16, 2);
      }
      if (exit) {
        c.fillStyle = "#f1d396";
        c.beginPath();
        c.moveTo(12, 1);
        c.lineTo(6, 7);
        c.lineTo(10, 7);
        c.lineTo(10, 11);
        c.lineTo(14, 11);
        c.lineTo(14, 7);
        c.lineTo(18, 7);
        c.fill();
      }
      return;
    }
    if (t.kind === "stairsDown") {
      if (!g.save.settings.spritesOff && drawGameSprite(c, "stairsDown")) return;
      c.fillStyle = "#7a9a9420";
      c.fillRect(2, 1, 20, 22);
      c.strokeStyle = "#a9d0c845";
      c.lineWidth = 1;
      c.strokeRect(1.5, 0.5, 21, 23);
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#6f8a86";
        c.fillRect(4, 6 + i * 3, 16, 2);
      }
      c.fillStyle = "#bcd9d2";
      c.beginPath();
      c.moveTo(12, 22);
      c.lineTo(6, 16);
      c.lineTo(10, 16);
      c.lineTo(10, 12);
      c.lineTo(14, 12);
      c.lineTo(14, 16);
      c.lineTo(18, 16);
      c.fill();
      return;
    }
    if (t.kind === "key") {
      this.groundShadow(11, 18, 5, 1.8, 0.3);
      this.withOutline(DARK_GOLD, (c) => {
        if (area1 && drawArea1Item(c, t)) return;
        c.strokeStyle = COLORS[t.color!];
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(15, 7, 4, 0, Math.PI * 2);
        c.moveTo(12, 10);
        c.lineTo(5, 18);
        c.lineTo(3, 16);
        c.moveTo(8, 15);
        c.lineTo(6, 13);
        c.stroke();
      });
      return;
    }
    if (t.kind === "door") {
      if (area1 && drawArea1Door(c, t)) return;
      c.fillStyle = "#090d14";
      c.fillRect(4, 2, 16, 22);
      c.fillStyle = doorColor(t);
      c.fillRect(5, 4, 14, 19);
      c.fillStyle = "#101b28bb";
      c.fillRect(7, 5, 10, 17);
      c.fillStyle = doorColor(t);
      c.fillRect(11, 10, 3, 7);
      c.fillRect(10, 9, 5, 4);
      return;
    }
    if (t.kind === "potion") {
      this.groundShadow(12, 22, 6, 1.6, 0.3);
      this.withOutline(DARK_GOLD, (c) => {
        if (area1 && drawArea1Item(c, t)) return;
        const isPercent = t.color === "red";
        c.fillStyle = "#bbc4ca";
        c.fillRect(9, 4, 6, 5);
        c.fillRect(6, 10, 12, 11);
        c.fillStyle = COLORS[t.color ?? "blue"];
        c.fillRect(8, 12, 8, 7);
        if (isPercent) {
          // Diagonal stripes distinguish the percent potion by shape, not just color.
          c.fillStyle = "#ffffffaa";
          c.fillRect(9, 12, 1, 7);
          c.fillRect(12, 12, 1, 7);
          c.fillRect(15, 12, 1, 7);
        } else {
          // Solid highlight plus a "+" mark identifies the flat-heal potion.
          c.fillStyle = "#ffffffcc";
          c.fillRect(11, 13, 2, 5);
          c.fillRect(9, 15, 6, 1);
        }
        c.fillStyle = "#ffd9d9";
        c.fillRect(8, 12, 2, 4);
        c.fillStyle = "#bd9661";
        c.fillRect(9, 3, 6, 3);
      });
      return;
    }
    if (t.kind === "attack") {
      this.groundShadow(12, 22, 6, 1.6, 0.3);
      this.withOutline(DARK_GOLD, (c) => {
        if (area1 && drawArea1Item(c, t)) return;
        c.save();
        c.translate(12, 12);
        c.rotate(0.65);
        c.fillStyle = "#dbe3e7";
        c.fillRect(-2, -10, 4, 15);
        c.fillStyle = "#8194a2";
        c.fillRect(0, -8, 2, 12);
        c.fillStyle = "#d6ad60";
        c.fillRect(-6, 4, 12, 3);
        c.fillStyle = "#8f6545";
        c.fillRect(-2, 7, 4, 4);
        c.restore();
      });
      return;
    }
    if (t.kind === "defense") {
      this.groundShadow(12, 22, 6, 1.6, 0.3);
      this.withOutline(DARK_GOLD, (c) => {
        if (area1 && drawArea1Item(c, t)) return;
        c.fillStyle = "#9cb0c2";
        c.beginPath();
        c.moveTo(4, 4);
        c.lineTo(12, 2);
        c.lineTo(20, 4);
        c.lineTo(18, 16);
        c.lineTo(12, 22);
        c.lineTo(6, 16);
        c.fill();
        c.fillStyle = "#416391";
        c.fillRect(7, 6, 10, 9);
        c.fillRect(10, 13, 5, 5);
        c.fillStyle = "#b9d3e8";
        c.fillRect(10, 5, 2, 12);
      });
      return;
    }
    if (t.kind === "reward") {
      this.groundShadow(12, 22.5, 8, 1.8, 0.32);
      this.withOutline(DARK_GOLD, (c) => {
        if (area1 && drawArea1Item(c, t)) return;
        const metal = { silver: "#c5d0df", gold: "#f5cd62", platinum: "#bcfff3" }[t.tier!];
        c.fillStyle = metal;
        c.shadowColor = metal;
        c.shadowBlur = 5;
        c.fillRect(3, 7, 18, 14);
        c.shadowBlur = 0;
        c.fillStyle = "#283040";
        c.fillRect(5, 9, 14, 10);
        c.fillStyle = metal;
        c.fillRect(3, 12, 18, 2);
        c.fillRect(10, 11, 4, 6);
        if (t.tier === "platinum") { c.fillStyle = "#ffffff"; c.fillRect(11, 3, 2, 3); }
      });
      for (let i = 0; i < 3; i++) {
        const phase = g.save.settings.reduceMotion ? 0.6 : (Math.sin(time / 240 + i * 2 + x + y) + 1) / 2;
        c.globalAlpha = 0.25 + phase * 0.75;
        c.fillStyle = "#ffffff";
        const sx = 3 + i * 9, sy = i === 1 ? 2 : 6;
        c.fillRect(sx - 2, sy, 5, 1); c.fillRect(sx, sy - 2, 1, 5);
      }
      c.globalAlpha = 1;
      return;
    }
    if (t.kind === "treasure") {
      this.groundShadow(12, 22.5, 8, 1.8, 0.32);
      this.withOutline(DARK_GOLD, (c) => {
        if (area1 && drawArea1Item(c, t)) return;
        c.fillStyle = "#d0a34d";
        c.fillRect(3, 7, 18, 14);
        c.fillStyle = "#714829";
        c.fillRect(5, 9, 14, 10);
        c.fillStyle = "#ebbd58";
        c.fillRect(3, 12, 18, 2);
        c.fillRect(10, 11, 4, 6);
      });
      return;
    }
    const tier = t.enemy!.tier;
    this.groundShadow(12, 21, 8, 2.6, 0.4);
    this.withOutline(DARK_RED, (c) => {
      if (!g.save.settings.spritesOff && drawEnemySprite(c, t.enemy!.name)) return;
      if (tier === 0) {
        c.fillStyle = "#568c45";
        c.fillRect(4, 12, 17, 8);
        c.fillRect(7, 7, 11, 7);
        c.fillStyle = "#8abc58";
        c.fillRect(8, 7, 7, 3);
      } else if (tier === 1) {
        c.fillStyle = "#c6c3b0";
        c.fillRect(7, 3, 10, 9);
        c.fillRect(10, 12, 4, 7);
        c.fillRect(6, 13, 12, 2);
        c.fillRect(7, 18, 3, 5);
        c.fillRect(15, 18, 3, 5);
        c.fillStyle = "#686d77";
        c.fillRect(3, 12, 3, 8);
      } else if (tier === 2) {
        c.fillStyle = "#934354";
        c.fillRect(9, 9, 8, 12);
        c.fillRect(2, 6, 6, 9);
        c.fillRect(18, 6, 5, 9);
        c.fillRect(6, 10, 14, 5);
      } else {
        c.fillStyle = "#554985";
        c.fillRect(6, 8, 13, 14);
        c.fillRect(9, 3, 8, 10);
        c.fillStyle = "#222033";
        c.fillRect(8, 9, 10, 7);
      }
      c.fillStyle = tier === 1 ? "#17202a" : "#f5ca7d";
      c.fillRect(9, 11, 2, 2);
      c.fillRect(15, 11, 2, 2);
    });
  }
  /** Active torches roughly within the camera viewport, padded so a torch
   * whose center is just offscreen can still light visible ground. Cheap
   * per-frame culling; the expensive part (the visibility polygon) is
   * cached on the torch itself and computed only once. */
  visibleTorches(): Torch[] {
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
  toScreenX(wx: number) {
    return (wx - this.left) * this.size;
  }
  toScreenY(wy: number) {
    return (this.density - (wy - this.bottom)) * this.size;
  }
  /** Torch + a living flame: the flame stretches, shrinks, and leans side
   * to side from its base (in step with the light's sway), and its core
   * pulses with the light's flicker. The handle stays put. */
  drawTorchSprite(t: Torch, now: number) {
    const c = this.ctx,
      s = this.size,
      sx = (t.x - this.left) * s,
      sy = (this.density - 1 - (t.y - this.bottom)) * s;
    const reduceMotion = this.game.save.settings.reduceMotion;
    const sway = getTorchSway(t, now, reduceMotion);
    const flicker = getTorchFlicker(t, now, reduceMotion);
    // Small deterministic per-torch variation (flame height/width) so a room
    // full of torches doesn't read as one sprite stamped repeatedly.
    const jitter = tileRandom(t.x, t.y, 0x7a4c);
    const flameH = 8 + Math.round(jitter * 2); // 8-9px
    const flameTopY = 13 - flameH;
    const flameW = jitter > 0.5 ? 6 : 5;
    const flameX = 12 - flameW / 2;
    const spriteFrames = !this.game.save.settings.spritesOff && !!gameSprite("torchFrames");
    const frame = torchAnimationFrame(t.x, t.y, now, reduceMotion);
    // Flame base in tile space (the PNG's flame meets its handle at row 36 of 96).
    const baseX = 12, baseY = spriteFrames ? 9 : 13, height = spriteFrames ? 9 : flameH;
    const leanPx = sway.x * 24 * 1.4;
    const bend = (c: CanvasRenderingContext2D) => {
      // Stretch vertically about the base and shear so the tip leans.
      c.translate(baseX, baseY);
      c.transform(1 / Math.sqrt(sway.stretch), 0, -leanPx / height, sway.stretch, 0, 0);
      c.translate(-baseX, -baseY);
    };
    c.save();
    c.translate(sx, sy);
    c.scale(s / 24, s / 24);
    this.withOutline(DARK_ORANGE, (c) => {
      c.imageSmoothingEnabled = false;
      if (spriteFrames && drawGameSpriteFrame(c, "torchFrames", frame, TORCH_FRAME_COUNT)) {
        return;
      }
      c.fillStyle = "#59412c";
      c.fillRect(10, 10, 4, 10);
      c.save();
      bend(c);
      c.fillStyle = "#df7b32";
      c.fillRect(flameX, flameTopY, flameW, flameH);
      c.fillStyle = "#ffe3a0";
      c.fillRect(11, flameTopY + 1, 3, flameH - 2);
      c.restore();
    });
    // Hot core glow that pulses with the flicker, following the lean.
    const coreX = baseX + leanPx * 0.45, coreY = baseY - height * 0.45 * sway.stretch;
    const pulse = Math.max(0, Math.min(1, 0.45 + (flicker - 1) * 5));
    const gr = c.createRadialGradient(coreX, coreY, 0, coreX, coreY, 6);
    gr.addColorStop(0, `rgba(255, 236, 170, ${0.55 * pulse})`);
    gr.addColorStop(1, "rgba(255, 160, 60, 0)");
    c.globalCompositeOperation = "lighter";
    c.fillStyle = gr;
    c.fillRect(coreX - 6, coreY - 6, 12, 12);
    c.restore();
  }
  /** Enumerates wall tiles currently within the viewport, in the same grid
   * range used by draw()'s tile loop, so the darkness mask can exclude them. */
  visibleWallTiles(): [number, number][] {
    const g = this.game,
      n = this.density;
    const walls: [number, number][] = [];
    for (let row = -1; row <= n; row++)
      for (let col = -1; col <= n; col++) {
        const x = col + Math.floor(this.left),
          y = Math.floor(this.bottom) + row;
        if (y < 0) continue;
        if (g.world.tile(x, y)?.kind === "wall") walls.push([x, y]);
      }
    return walls;
  }
  /** Creates or resizes an offscreen canvas for rendering the composite lightmap. */
  ensureLightmap(viewportSize: number) {
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

  /** Renders ambient darkness and baked torch light to an offscreen lightmap,
   * then composites the result over the dungeon tiles. Per frame this is a
   * couple of fills plus two image blits per torch; no canvas filters. */
  drawDungeonLightmap(viewportSize: number, torches: Torch[], now: number) {
    const lm = this.ensureLightmap(viewportSize);
    const mainCtx = this.ctx;
    const atm = this.atmosphere;
    const reduceMotion = this.game.save.settings.reduceMotion;

    if (!lm) {
      // Fallback if offscreen canvas cannot be instantiated (e.g. headless tests without canvas DOM)
      mainCtx.save();
      mainCtx.fillStyle = LIGHTING_CONFIG.ambient.color;
      mainCtx.globalAlpha = LIGHTING_CONFIG.ambient.opacity;
      mainCtx.fillRect(0, 0, viewportSize, viewportSize);
      mainCtx.restore();
      return;
    }
    // 1. Clear offscreen lightmap
    lm.globalCompositeOperation = "source-over";
    lm.globalAlpha = 1;
    lm.clearRect(0, 0, viewportSize, viewportSize);

    // 2. Base ambient darkness overlay (subtle dark purple)
    lm.fillStyle = LIGHTING_CONFIG.ambient.color;
    lm.globalAlpha = LIGHTING_CONFIG.ambient.opacity;
    lm.fillRect(0, 0, viewportSize, viewportSize);

    // 3. Optional cool atmospheric tint
    if (atm.ambientStrength > 0) {
      lm.globalAlpha = atm.ambientStrength;
      lm.fillStyle = atm.ambientColor;
      lm.fillRect(0, 0, viewportSize, viewportSize);
    }

    // 3b. Punch the darkness mask out over structural walls so they stay
    // fully readable regardless of torch proximity (darkness should only
    // ever dim walkable floor, not the architecture around it).
    lm.globalCompositeOperation = "destination-out";
    lm.globalAlpha = 1;
    const walls = this.wallMaskCanvas(viewportSize);
    if (walls) lm.drawImage(walls, 0, 0);

    // 4. Torchlight carves the darkness away where it falls...
    const glow = LIGHTING_CONFIG.glow;
    for (const t of torches) this.drawTorchLight(lm, t, now, reduceMotion, "destination-out", glow.carve);
    lm.globalCompositeOperation = "source-over";
    lm.globalAlpha = 1;

    lm.globalCompositeOperation = "source-over";
    lm.globalAlpha = 1;

    // 5. Composite the darkness onto the main canvas.
    mainCtx.drawImage(this.lightmapCanvas!, 0, 0);

    // 6. Warm haze and candle glow go on their own layer, blended as light:
    // soft-light warms and brightens while keeping dark grout dark, and a
    // little additive bloom adds glow near the flame. (Laying the glow over
    // the scene with normal alpha, as before, flattened contrast into fog.)
    this.torchGlowCanvas ??= document.createElement("canvas");
    const gcv = this.torchGlowCanvas;
    if (gcv.width !== viewportSize || gcv.height !== viewportSize) gcv.width = gcv.height = viewportSize;
    const gl = gcv.getContext("2d");
    if (!gl || !torches.length) return;
    gl.globalCompositeOperation = "source-over";
    gl.globalAlpha = 1;
    gl.clearRect(0, 0, viewportSize, viewportSize);
    if (atm.torchHazeStrength > 0) {
      for (const t of torches) this.drawTorchHaze(gl, t, now, reduceMotion);
    }
    // The warm glow eases off a little as the Brightness setting goes up.
    const glowScale = 1 - glow.brightDim * (1 - this.darkness);
    for (const t of torches) this.drawTorchLight(gl, t, now, reduceMotion, "lighter", glow.strength * glowScale * t.baseIntensity);
    // Cast shadows block the warm glow too, or it would light them back up.
    if (this.frameShadows && this.shadowCanvas) {
      gl.globalCompositeOperation = "destination-out";
      gl.globalAlpha = LIGHTING_CONFIG.shadow.blockLight;
      gl.drawImage(this.shadowCanvas, 0, 0);
    }
    gl.globalCompositeOperation = "source-over";
    gl.globalAlpha = 1;
    mainCtx.save();
    mainCtx.globalCompositeOperation = "soft-light";
    mainCtx.globalAlpha = glow.softLight;
    mainCtx.drawImage(gcv, 0, 0);
    mainCtx.globalCompositeOperation = "lighter";
    mainCtx.globalAlpha = glow.bloom;
    mainCtx.drawImage(gcv, 0, 0);
    mainCtx.restore();
  }

  /** 0 at the default brightness, 1 at the darkest setting (dungeon only). */
  get darkness() {
    if (this.game.run.outside) return 0;
    return Math.max(0, Math.min(1, (100 - (this.game.save.settings.brightness ?? 100)) / 80));
  }

  /** The "Brightness" setting's dark-delving layer: a cool, near-black
   * multiply tone that torchlight lifts back out as warm light, plus a
   * faint halo around the hero. The caller multiplies it over the ground,
   * and a softened version over doors, stairs, items, and enemies. One fill
   * and one blit per torch. Returns null at the default brightness. */
  buildDarkness(viewportSize: number, torches: Torch[], now: number) {
    const k = this.darkness;
    if (k <= 0 || typeof document === "undefined") return null;
    this.darkCanvas ??= document.createElement("canvas");
    const cv = this.darkCanvas;
    if (cv.width !== viewportSize || cv.height !== viewportSize) cv.width = cv.height = viewportSize;
    const dc = cv.getContext("2d");
    if (!dc) return null;
    const cfg = LIGHTING_CONFIG.darkness;
    const mix = (i: number) => Math.round(255 + (cfg.color[i] - 255) * k);
    dc.globalCompositeOperation = "source-over";
    dc.globalAlpha = 1;
    dc.fillStyle = `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
    dc.fillRect(0, 0, viewportSize, viewportSize);
    const reduceMotion = this.game.save.settings.reduceMotion;
    for (const t of torches) this.drawTorchLight(dc, t, now, reduceMotion, "lighter", cfg.torchLift * k * t.baseIntensity);
    // A shadow is where the torch's light doesn't reach: cast shadows take
    // the torchlight back out of the darkness layer, so they read clearly.
    if (this.frameShadows && this.shadowCanvas) {
      dc.globalCompositeOperation = "source-over";
      dc.globalAlpha = Math.min(1, LIGHTING_CONFIG.shadow.blockLight * k);
      dc.drawImage(this.shadowCanvas, 0, 0);
    }
    const s = this.size, n = this.density;
    const hx = (this.playerX - this.left + 0.5) * s, hy = (n - 0.5 - (this.playerY - this.bottom)) * s;
    const r = cfg.heroHaloRadius * s;
    const halo = dc.createRadialGradient(hx, hy, 0, hx, hy, r);
    halo.addColorStop(0, `rgba(150, 160, 200, ${cfg.heroHaloAlpha * k})`);
    halo.addColorStop(1, "rgba(150, 160, 200, 0)");
    dc.globalCompositeOperation = "lighter";
    dc.globalAlpha = 1;
    dc.fillStyle = halo;
    dc.fillRect(hx - r, hy - r, r * 2, r * 2);
    dc.globalCompositeOperation = "source-over";
    // Snapshot for darkening the sprites, before the object glows go in.
    this.spriteDarkCanvas ??= document.createElement("canvas");
    const sd = this.spriteDarkCanvas;
    if (sd.width !== viewportSize || sd.height !== viewportSize) sd.width = sd.height = viewportSize;
    const sdc = sd.getContext("2d");
    if (sdc) {
      sdc.globalCompositeOperation = "copy";
      sdc.drawImage(cv, 0, 0);
      sdc.globalCompositeOperation = "source-over";
    }
    // Object glows lift the darkness like light does, so they brighten and
    // color the stone while keeping its texture, instead of fogging over it.
    const glowLayer = this.objectGlowLayer(viewportSize);
    if (glowLayer) {
      dc.globalCompositeOperation = "lighter";
      dc.globalAlpha = Math.min(1, LIGHTING_CONFIG.objectGlow.darkStrength * k);
      dc.drawImage(glowLayer, 0, 0);
      dc.globalCompositeOperation = "source-over";
      dc.globalAlpha = 1;
    }
    return cv;
  }

  /** Object glows, laid on the already-darkened ground so the sprites drawn
   * next sit on top of them. They grow with darkness: none at the default
   * brightness, full strength at the darkest. */
  drawObjectBloom(viewportSize: number) {
    const layer = this.glowCanvas;
    if (!layer || !this.frameGlows.length) return;
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = Math.min(1, LIGHTING_CONFIG.objectGlow.bloom * this.darkness);
    c.drawImage(layer, 0, 0, viewportSize, viewportSize);
    c.restore();
  }

  /** A faint wash of each door's glow color over the door sprite itself. */
  drawDoorWash() {
    const k = this.darkness, og = LIGHTING_CONFIG.objectGlow;
    const doors = this.frameGlows.filter((o) => o.door);
    if (!doors.length || k <= 0) return;
    const c = this.ctx, s = this.size, n = this.density, r = 0.62 * s;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = Math.min(1, og.door.onTop * k);
    for (const o of doors) {
      const cx = (o.x - this.left + 0.5) * s, cy = (n - 0.5 - (o.y - this.bottom)) * s;
      c.drawImage(this.glowSprite(o.rgb), cx - r, cy - r, r * 2, r * 2);
    }
    c.restore();
  }

  /** Draws tile contents (doors, stairs, items, enemies) on their own layer,
   * multiplies a softened copy of the darkness over just their pixels, then
   * lays them on the scene: they stay a little brighter than the stone. */
  drawDarkened(dark: HTMLCanvasElement, viewportSize: number, dpr: number, amount: number, drawContents: () => void) {
    const main = this.ctx, w = main.canvas.width, h = main.canvas.height;
    const ensure = (cv: HTMLCanvasElement | null) => {
      const c = cv ?? document.createElement("canvas");
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      return c;
    };
    this.contentsCanvas = ensure(this.contentsCanvas);
    this.contentsMaskCanvas = ensure(this.contentsMaskCanvas);
    const cc = this.contentsCanvas.getContext("2d"), mc = this.contentsMaskCanvas.getContext("2d");
    if (!cc || !mc) return drawContents();
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalCompositeOperation = "source-over";
    cc.globalAlpha = 1;
    cc.clearRect(0, 0, w, h);
    cc.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx = cc;
    try {
      drawContents();
    } finally {
      this.ctx = main;
    }
    // Keep the sprites' shape: multiply paints into empty pixels too, so
    // the original coverage is restored afterwards.
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = "source-over";
    mc.clearRect(0, 0, w, h);
    mc.drawImage(this.contentsCanvas, 0, 0);
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalCompositeOperation = "multiply";
    cc.globalAlpha = amount;
    cc.drawImage(dark, 0, 0, viewportSize, viewportSize, 0, 0, w, h);
    cc.globalCompositeOperation = "destination-in";
    cc.globalAlpha = 1;
    cc.drawImage(this.contentsMaskCanvas, 0, 0);
    cc.globalCompositeOperation = "source-over";
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.drawImage(this.contentsCanvas, 0, 0);
    main.restore();
  }

  /** Doors, stairs, items, and enemies in view, with their glow settings. */
  visibleGlowSources(now: number): GlowSource[] {
    const g = this.game, n = this.density, og = LIGHTING_CONFIG.objectGlow, dk = LIGHTING_CONFIG.darkness;
    const reduceMotion = g.save.settings.reduceMotion;
    const out: GlowSource[] = [];
    for (let row = -1; row <= n; row++)
      for (let col = -1; col <= n; col++) {
        const x = col + Math.floor(this.left), y = Math.floor(this.bottom) + row;
        if (y < 0) continue;
        const t = g.world.tile(x, y);
        // Slow, per-object breathing so a room of glows doesn't pulse in unison.
        const breathe = reduceMotion ? 1 : 1 - og.pulse + og.pulse * Math.sin(now / 650 + x * 1.7 + y * 2.3);
        if (t.kind === "enemy") out.push({ x, y, rgb: og.enemy.color, radius: og.enemy.radius, strength: og.enemy.strength * breathe });
        else if (GLOW_ITEMS.has(t.kind)) out.push({ x, y, rgb: og.item.color, radius: og.item.radius, strength: og.item.strength * breathe });
        else if (t.kind === "door") {
          const id = doorId(t);
          const rgb = id === "heart" ? og.door.heart : id === "steel" ? og.door.steel : hexRgb(doorColor(t));
          out.push({ x, y, rgb, radius: og.door.radius, strength: og.door.strength, door: true });
        }
        else if (t.kind === "stairs" || t.kind === "stairsDown")
          out.push({ x, y, rgb: [150, 160, 200], radius: dk.heroHaloRadius * og.stairsRadiusScale, strength: dk.heroHaloAlpha * og.stairsAlphaScale });
      }
    return out;
  }

  /** A soft round glow (color at full strength in the middle, fading to
   * nothing at the rim), cached per color and drawn scaled. */
  glowSprite(rgb: readonly number[]) {
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
  objectGlowLayer(viewportSize: number) {
    const sources = this.frameGlows;
    if (!sources.length || typeof document === "undefined") return null;
    const ensure = (cv: HTMLCanvasElement | null) => {
      const c = cv ?? document.createElement("canvas");
      if (c.width !== viewportSize || c.height !== viewportSize) c.width = c.height = viewportSize;
      return c;
    };
    this.glowCanvas = ensure(this.glowCanvas);
    this.glowWallCanvas = ensure(this.glowWallCanvas);
    const floor = this.glowCanvas.getContext("2d"), wall = this.glowWallCanvas.getContext("2d");
    const mask = this.wallMaskCanvas(viewportSize);
    if (!floor || !wall || !mask) return null;
    const og = LIGHTING_CONFIG.objectGlow, s = this.size, n = this.density;
    for (const ctx of [floor, wall]) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, viewportSize, viewportSize);
      ctx.globalCompositeOperation = "lighter";
    }
    for (const o of sources) {
      const sprite = this.glowSprite(o.rgb);
      const cx = (o.x - this.left + 0.5) * s, cy = (n - 0.5 - (o.y - this.bottom)) * s;
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
  torchBake(t: Torch) {
    let bake = this.torchBakes.get(t);
    if (bake === undefined) {
      if (this.bakeBudget <= 0) return null;
      this.bakeBudget--;
      const world = this.game.world;
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
  drawTorchLight(c: CanvasRenderingContext2D, t: Torch, now: number, reduceMotion: boolean,
    op: GlobalCompositeOperation, alpha: number) {
    const bake = this.torchBake(t);
    if (!bake) return;
    const flicker = getTorchFlicker(t, now, reduceMotion);
    const sway = getTorchSway(t, now, reduceMotion);
    // Both bakes sit on the tile grid (never moved or scaled), so the light's
    // edges stay flush with the walls; the lean only cross-fades between them.
    const lean = Math.max(0, Math.min(1, 0.5 + sway.x / (2 * LIGHTING_CONFIG.flicker.swayX)));
    const f = bake.left.field;
    const x0 = this.toScreenX(f.left), y0 = this.toScreenY(f.top), size = f.tiles * this.size;
    c.globalCompositeOperation = op;
    c.imageSmoothingEnabled = true;
    for (const [b, share] of [[bake.left, 1 - lean], [bake.right, lean]] as const) {
      if (share < 0.02) continue;
      c.globalAlpha = Math.min(1, alpha * flicker * share);
      c.drawImage(b.canvas, x0, y0, size, size);
    }
  }

  /** Torch bump lighting on area-one floor sprites (see floor-relief.ts):
   * each torch's relief is baked once, then blitted with its flicker. */
  drawTorchRelief(now: number) {
    const g = this.game;
    if (!(g.mode === "tower" && g.run.height >= 0 && g.run.height < 10)) return;
    const c = this.ctx, reduceMotion = g.save.settings.reduceMotion;
    const cfg = LIGHTING_CONFIG.relief;
    const floorSprite = (x: number, y: number) =>
      g.world.tile(x, y)?.kind === "wall" ? null : area1FloorSprite(x, y, g.run.seed) ?? undefined;
    c.save();
    c.imageSmoothingEnabled = false;
    for (const t of this.frameTorches) {
      let bake = this.reliefBakes.get(t);
      if (bake === undefined) {
        if (this.bakeBudget <= 0) continue;
        const left = bakeTorchRelief(t, floorSprite, -cfg.swayOffset);
        if (left === undefined) continue; // sprites still loading; retry next frame (cheap early exit)
        const right = bakeTorchRelief(t, floorSprite, cfg.swayOffset);
        if (right === undefined) continue;
        this.bakeBudget--;
        bake = left && right ? { left, right } : null;
        this.reliefBakes.set(t, bake);
      }
      if (!bake) continue;
      // Brightness follows the flicker, amplified so it reads on the floor;
      // the two nudged bakes cross-fade with the flame's lean.
      const flicker = getTorchFlicker(t, now, reduceMotion);
      const sway = getTorchSway(t, now, reduceMotion);
      const alpha = Math.max(0, Math.min(1, cfg.flickerBase + (flicker - 1) * cfg.flickerGain));
      const lean = Math.max(0, Math.min(1, 0.5 + sway.x / (2 * LIGHTING_CONFIG.flicker.swayX)));
      for (const [b, share] of [[bake.left, 1 - lean], [bake.right, lean]] as const) {
        if (share < 0.02) continue;
        const x0 = this.toScreenX(b.left), y0 = this.toScreenY(b.top), size = b.tiles * this.size;
        c.globalAlpha = alpha * share;
        c.globalCompositeOperation = "source-over";
        c.drawImage(b.shadow, x0, y0, size, size);
        c.globalCompositeOperation = "lighter";
        c.drawImage(b.highlight, x0, y0, size, size);
      }
    }
    c.restore();
  }

  /** Torch-cast shadows for items, enemies, and the hero. Each caster's
   * sprite silhouette is sheared away from every torch that reaches it,
   * longer the farther it stands from the flame and fainter as the light
   * falls off. Drawn to one layer so walls can be masked out cheaply. */
  drawEntityShadows(viewportSize: number, now: number) {
    this.frameLit = [];
    this.frameShadows = false;
    const torches = this.frameTorches;
    if (!torches.length || typeof document === "undefined") return;
    const g = this.game, n = this.density, s = this.size;
    const cfg = LIGHTING_CONFIG.shadow;
    const reduceMotion = g.save.settings.reduceMotion;
    const area1 = g.mode === "tower" && g.run.height >= 0 && g.run.height < 10;
    type Caster = { x: number; y: number; key: string; draw: () => void; hero?: boolean };
    const casters: Caster[] = [];
    for (let row = -1; row <= n; row++)
      for (let col = -1; col <= n; col++) {
        const x = col + Math.floor(this.left), y = Math.floor(this.bottom) + row;
        if (y < 0) continue;
        const t = g.world.tile(x, y);
        if (!SHADOW_CASTERS.has(t.kind)) continue;
        casters.push({
          x, y,
          key: `${t.kind}|${t.color}|${t.tier}|${t.enemy?.name ?? ""}|${area1}`,
          draw: () => this.contents(t, x, y, now, area1),
        });
      }
    casters.push({
      x: this.playerX, y: this.playerY, key: "hero",
      draw: () => {
        if (!g.save.settings.spritesOff && drawGameSprite(this.ctx, "player")) return;
        Renderer.drawHero(this.ctx);
      },
      hero: true,
    });

    const darkness = this.darkness, sl = LIGHTING_CONFIG.spriteLight;
    let layer: CanvasRenderingContext2D | null = null;
    const casterSils: { x: number; y: number; sil: HTMLCanvasElement }[] = [];
    for (const caster of casters) {
      const light: Record<SpriteDir, number> = { e: 0, w: 0, n: 0, s: 0 };
      let lit = false;

      for (const t of torches) {
        // Shadows swing gently as the flame sways.
        const sway = getTorchSway(t, now, reduceMotion);
        const dx = caster.x - t.x - sway.x, dy = caster.y - t.y - sway.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.5 || d >= t.lightRadius) continue;
        if (!torchReaches(t, Math.round(caster.x), Math.round(caster.y))) continue;
        const flicker = getTorchFlicker(t, now, reduceMotion);
        const falloff = lightFalloff(d, t.lightRadius);
        // Light on the caster: split over the sides facing the torch (screen
        // space, y down; the torch lies opposite the shadow direction).
        const toX = -dx / d, toY = dy / d;
        const amount = sl.strength * Math.pow(falloff, sl.falloffPower) * flicker * (1 + sl.darkBoost * darkness);
        light.e += Math.max(0, toX) * amount;
        light.w += Math.max(0, -toX) * amount;
        light.s += Math.max(0, toY) * amount;
        light.n += Math.max(0, -toY) * amount;
        lit = true;
        // Shadows fade more gently than the light itself so they stay readable,
        // and deepen as the room gets darker.
        const alpha = Math.min(0.95, cfg.strength * Math.sqrt(falloff) * flicker * (1 + cfg.darkBoost * darkness));
        if (alpha < 0.02) continue;
        const sil = this.silhouette(caster.key, caster.draw, now);
        if (!sil) continue;
        layer ??= this.ensureShadowLayer(viewportSize);
        if (!layer) return;
        casterSils.push({ x: caster.x, y: caster.y, sil });
        // Screen-space direction away from the torch (world y is up).
        const ux = dx / d, uy = -dy / d;
        const k = Math.min(cfg.maxLength, cfg.minLength + d * cfg.lengthPerTile) * flicker;
        // The shadow lies on the floor: the sprite's base line (y = 22) stays
        // put and horizontal, and height above it maps to a vertical stretch
        // (up when the torch is below, down when above) plus a partial lean
        // for side light. No rotation, so nothing swings below the base.
        const lean = ux * cfg.lean;
        // Below minVertical, the true direction is unreliable noise (the torch
        // is ~level with the caster), so keep the last committed sign instead
        // of snapping on every sway-driven crossing of uy = 0 (which flickered
        // the shadow between two states every few seconds).
        const vertKey = `${caster.x},${caster.y},${t.x},${t.y}`;
        let vert: number;
        if (Math.abs(uy) >= cfg.minVertical) {
          vert = uy;
          this.shadowVertSign.set(vertKey, Math.sign(uy));
        } else {
          // Never seen a decisive uy yet for this pair (e.g. the caster sits
          // level with the torch, so sway alone keeps uy under the threshold
          // forever): pick a sign once and cache it, rather than recomputing
          // from the current (tiny, noisy) uy every frame.
          let sign = this.shadowVertSign.get(vertKey);
          if (sign === undefined) {
            sign = uy > 0 ? 1 : -1;
            this.shadowVertSign.set(vertKey, sign);
          }
          vert = sign * cfg.minVertical;
        }
        layer.setTransform(1, 0, 0, 1, (caster.x - this.left) * s, (n - 1 - (caster.y - this.bottom)) * s);
        layer.scale(s / 24, s / 24);
        // Sprite point (x, y), height h = 22 - y -> (x + h*k*lean, 22 + h*k*vert).
        layer.transform(1, 0, -k * lean, -k * vert, 22 * k * lean, 22 + 22 * k * vert);
        layer.globalAlpha = Math.min(1, alpha);
        layer.drawImage(sil, 0, 0);
      }
      if (lit) this.frameLit.push({ x: caster.x, y: caster.y, key: caster.key, draw: caster.draw, hero: !!caster.hero, light });
    }
    if (!layer) return;
    // Shadows fall on the floor only: never over any sprite (its own or a
    // neighbour's; this layer also dims the darkness and glow passes)...
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = "destination-out";
    for (const c of casterSils) {
      layer.setTransform(1, 0, 0, 1, (c.x - this.left) * s, (n - 1 - (c.y - this.bottom)) * s);
      layer.scale(s / 24, s / 24);
      layer.drawImage(c.sil, 0, 0);
    }
    // ...and never across wall tops.
    layer.setTransform(1, 0, 0, 1, 0, 0);
    const walls = this.wallMaskCanvas(viewportSize);
    if (walls) layer.drawImage(walls, 0, 0);
    layer.globalCompositeOperation = "source-over";
    this.ctx.drawImage(this.shadowCanvas!, 0, 0);
    this.frameShadows = true;
  }

  /** Four directional light masks for a sprite, from its silhouette: a fill
   * that ramps up across the sprite toward the lit side, plus a 1px sheen on
   * the edge pixels facing that way. Rebaked with its silhouette. */
  spriteLightFor(key: string, draw: () => void, now: number) {
    const sil = this.silhouette(key, draw, now);
    const silAt = this.silhouettes.get(key)?.at;
    if (!sil || silAt === undefined) return null;
    const cached = this.spriteLightMasks.get(key);
    if (cached && cached.at === silAt) return cached.masks;
    const src = sil.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, 24, 24).data;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < 24 && y < 24 && src[(y * 24 + x) * 4 + 3] > 0;
    let minX = 24, maxX = -1, minY = 24, maxY = -1;
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++)
        if (solid(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const cfg = LIGHTING_CONFIG.spriteLight, [r, g, b] = cfg.color;
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
    const masks = {} as Record<SpriteDir, HTMLCanvasElement>;
    for (const dir of SPRITE_DIRS) {
      const cv = cached?.masks[dir.key] ?? document.createElement("canvas");
      cv.width = cv.height = 24;
      const ctx = cv.getContext("2d")!;
      const img = ctx.createImageData(24, 24);
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++) {
          if (!solid(x, y)) continue;
          const t = dir.dx > 0 ? (x - minX) / spanX : dir.dx < 0 ? (maxX - x) / spanX : dir.dy < 0 ? (maxY - y) / spanY : (y - minY) / spanY;
          const fill = cfg.fill * Math.pow(Math.max(0, t), cfg.fillCurve);
          const rim = solid(x + dir.dx, y + dir.dy) ? 0 : 1;
          const i = (y * 24 + x) * 4;
          img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
          img.data[i + 3] = Math.round(Math.max(fill, rim) * 255);
        }
      ctx.putImageData(img, 0, 0);
      masks[dir.key] = cv;
    }
    this.spriteLightMasks.set(key, { at: silAt, masks });
    return masks;
  }

  /** Warm torchlight on items and enemies (or, with `hero`, on the hero in
   * the context's current tile transform), brightest on the torch side. */
  drawSpriteLighting(now: number, hero = false) {
    const c = this.ctx, s = this.size, n = this.density;
    for (const lit of this.frameLit) {
      if (lit.hero !== hero) continue;
      const masks = this.spriteLightFor(lit.key, lit.draw, now);
      if (!masks) continue;
      c.save();
      if (!hero) {
        c.translate((lit.x - this.left) * s, (n - 1 - (lit.y - this.bottom)) * s);
        c.scale(s / 24, s / 24);
      }
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
  wallMaskCanvas(viewportSize: number) {
    const key = `${this.left},${this.bottom},${this.size},${viewportSize}`;
    const world = this.game.world;
    if (this.wallMask?.key === key && this.wallMask.world === world) return this.wallMask.canvas;
    const canvas = this.wallMask?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = viewportSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.beginPath();
    for (const [wx, wy] of this.frameWalls) ctx.rect(this.toScreenX(wx), this.toScreenY(wy + 1), this.size, this.size);
    ctx.fill();
    this.wallMask = { canvas, key, world };
    return canvas;
  }
  ensureShadowLayer(viewportSize: number) {
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
  silhouette(key: string, draw: () => void, now: number) {
    const cached = this.silhouettes.get(key);
    if (cached && now - cached.at < 1500) return cached.canvas;
    const canvas = cached?.canvas ?? document.createElement("canvas");
    canvas.width = canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const main = this.ctx;
    this.ctx = ctx;
    try {
      draw();
    } finally {
      this.ctx = main;
    }
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

  /** Soft warm atmospheric haze that diffuses into ambient air around torches.
   * Uses gentle additive blending with wide radial feathering and blur. */
  drawTorchHaze(c: CanvasRenderingContext2D, t: Torch, now: number, reduceMotion: boolean) {
    const atm = this.atmosphere;
    const flicker = getTorchFlicker(t, now, reduceMotion);
    // The haze isn't occluded, so it stays put (a moving circle would slide
    // across the walls); it only breathes with the flicker.
    const cx = this.toScreenX(t.x + 0.5),
      cy = this.toScreenY(t.y + 0.5),
      hazeRadius = t.lightRadius * this.size * atm.torchHazeRadius,
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
  /** Faint radial vignette around the perimeter of the dungeon viewport
   * to subtly guide focus inward and add depth without obscuring readability. */
  drawVignette(viewportSize: number) {
    const atm = this.atmosphere;
    // Darker brightness settings close the edges in further.
    const strength = Math.min(1, atm.vignetteStrength + this.darkness * LIGHTING_CONFIG.darkness.vignette);
    if (strength <= 0) return;
    const c = this.ctx,
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
  /** Recompute the fixed path polyline whenever a new walk/preview starts,
   * and smoothly advance how much of it has been consumed. Called once per
   * frame before drawRoutePath. */
  updateRoutePath(dt: number) {
    const g = this.game,
      p = g.run.player,
      live = g.route.length > 0,
      source = live ? g.route : this.previewRoute;
    if (!source || source.length === 0) {
      this.pathPoints = null;
      this.pathProgress = 0;
      this.pathGoalKey = null;
      this.pathLastLen = 0;
      this.pathWasLive = live;
      return;
    }
    const goal = source[source.length - 1],
      goalKey = `${goal.x},${goal.y}`,
      // route only ever shrinks by one step at a time while walking, so a
      // length increase (or a flip from preview to live) means this is a
      // freshly (re)confirmed walk and the fixed polyline must be rebuilt.
      isNewWalk =
        !this.pathPoints ||
        this.pathGoalKey !== goalKey ||
        (live && source.length > this.pathLastLen) ||
        (live && !this.pathWasLive);
    if (isNewWalk) {
      this.pathPoints = [{ x: p.x, y: p.y }, ...source];
      this.pathProgress = 0;
      this.pathGoalKey = goalKey;
    }
    this.pathLastLen = source.length;
    this.pathWasLive = live;
    const consumed = Math.max(0, this.pathPoints!.length - 1 - source.length),
      rate = 1 - Math.exp(-dt * 18);
    this.pathProgress += (consumed - this.pathProgress) * rate;
    if (Math.abs(consumed - this.pathProgress) < 0.01) this.pathProgress = consumed;
  }
  drawRoutePath(now: number) {
    const route = this.pathPoints;
    if (!route || route.length === 0) return;
    const c = this.ctx,
      s = this.size,
      n = this.density;
    // Convert world coordinate to screen coordinate
    const toTileScreen = (wx: number, wy: number) => ({
      x: (wx - this.left + 0.5) * s,
      y: (n - 0.5 - (wy - this.bottom)) * s,
    });

    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";

    // Subtle pulsing gold glow
    const pulse = 0.85 + 0.15 * Math.sin(now / 200);

    // Trim the fixed polyline at the smoothed arclength progress: the shape
    // of every remaining point is untouched (no bending toward the sprite),
    // only the leading edge slides continuously along the segment it falls
    // within (no per-tile jumps).
    const trimmed: Array<{ x: number; y: number }> = [];
    let idx = Math.floor(this.pathProgress),
      frac = this.pathProgress - idx;
    if (idx >= route.length - 1) {
      idx = route.length - 1;
      frac = 0;
    }
    const from = route[idx],
      to = route[Math.min(idx + 1, route.length - 1)];
    trimmed.push({ x: from.x + (to.x - from.x) * frac, y: from.y + (to.y - from.y) * frac });
    for (let i = idx + 1; i < route.length; i++) trimmed.push(route[i]);

    const segments: Array<Array<{ x: number; y: number }>> = [];
    let currentSegment: Array<{ x: number; y: number }> = [toTileScreen(trimmed[0].x, trimmed[0].y)];
    let prevGrid = trimmed[0];

    for (let i = 1; i < trimmed.length; i++) {
      const step = trimmed[i];
      const pt = toTileScreen(step.x, step.y);
      const isWrap = Math.abs(step.x - prevGrid.x) > 1 || Math.abs(step.y - prevGrid.y) > 1;
      if (isWrap) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
        }
        currentSegment = [pt];
      } else {
        currentSegment.push(pt);
      }
      prevGrid = step;
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    const drawSegments = () => {
      c.beginPath();
      for (const seg of segments) {
        if (seg.length === 0) continue;
        c.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) {
          c.lineTo(seg[i].x, seg[i].y);
        }
      }
    };

    // Outer glow pass
    drawSegments();
    c.strokeStyle = `rgba(255, 215, 0, ${0.4 * pulse})`;
    c.lineWidth = Math.max(3, s * 0.22);
    c.shadowColor = "#ffd700";
    c.shadowBlur = 8;
    c.stroke();

    // Inner bright core line pass
    drawSegments();
    c.strokeStyle = `rgba(255, 240, 160, ${0.9 * pulse})`;
    c.lineWidth = Math.max(1.5, s * 0.1);
    c.shadowBlur = 0;
    c.stroke();

    // Draw a small golden dot at the final destination
    const lastStep = route[route.length - 1];
    const destPt = toTileScreen(lastStep.x, lastStep.y);
    c.fillStyle = `rgba(255, 225, 100, ${0.95 * pulse})`;
    c.beginPath();
    c.arc(destPt.x, destPt.y, Math.max(2, s * 0.12), 0, Math.PI * 2);
    c.fill();

    c.restore();
  }
  hero() {
    this.groundShadow(12, 22, 8, 2.6, 0.4);
    this.withOutline(DARK_BLUE, (c) => {
      if (!this.game.save.settings.spritesOff && drawGameSprite(c, "player")) return;
      Renderer.drawHero(c);
    });
  }
  static drawHero(c: CanvasRenderingContext2D) {
    // Extremely subtle local contrast disc (not a light source) so the hero
    // silhouette stays easy to spot against both lit and unlit floor tiles.
    c.fillStyle = "#7bacdf22";
    c.beginPath();
    c.arc(12, 14, 13, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#070c16";
    c.fillRect(5, 20, 16, 3);
    c.fillStyle = "#337bbb";
    c.fillRect(5, 10, 13, 12);
    c.fillStyle = "#74b5e9";
    c.fillRect(7, 10, 3, 11);
    c.fillStyle = "#c3ccd1";
    c.fillRect(9, 10, 9, 7);
    c.fillStyle = "#c99771";
    c.fillRect(9, 4, 8, 7);
    c.fillStyle = "#624531";
    c.fillRect(8, 2, 10, 5);
    c.fillRect(7, 4, 3, 5);
    c.fillStyle = "#dce4e5";
    c.fillRect(20, 5, 2, 13);
    c.fillStyle = "#e0ba72";
    c.fillRect(18, 17, 6, 2);
    c.fillStyle = "#8d7564";
    c.fillRect(8, 21, 4, 3);
    c.fillRect(15, 21, 4, 3);
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
