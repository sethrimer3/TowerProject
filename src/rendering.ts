import { CHUNK, COLORS, TOWER_HEIGHT, VIEWPORT_TILES } from "./config.ts";
import { drawTerrain } from "./themes.ts";
import type { Game } from "./state.ts";
import type { Tile, Torch } from "./entities.ts";
import { drawForestTile, drawEntrance, OUTSIDE_SIZE } from "./outside.ts";
import { OutdoorWeather } from "./weather.ts";
import { LIGHTING_CONFIG, getTorchFlicker } from "./lighting.ts";

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
    for (let row = -1; row <= n; row++)
      for (let col = -1; col <= n; col++) {
        const x = col + Math.floor(this.left),
          y = Math.floor(this.bottom) + row;
        if (y < 0) continue;
        const sy = (n - 1 - (y - this.bottom)) * s;
        c.save();
        c.translate((x - this.left) * s, sy);
        c.scale(s / 24, s / 24);
        this.tile(g.world.tile(x, y), x, y, now);
        c.restore();
      }
    if (g.run.outside) {
      c.save();
      c.translate(-this.left * s, (n - OUTSIDE_SIZE + this.bottom) * s);
      c.scale(s / 24, s / 24);
      drawEntrance(c, g.mode, Math.floor(g.world.width / 2));
      c.restore();
    } else {
      const torches = this.visibleTorches();
      for (const t of torches) this.drawTorchSprite(t);
      // Render lighting overlay via offscreen lightmap
      this.drawDungeonLightmap(box.width, torches, now);
    }
    this.drawRoutePath(now);
    c.save();
    c.translate(
      (this.playerX - this.left) * s,
      (n - 1 - (this.playerY - this.bottom)) * s,
    );
    c.scale(s / 24, s / 24);
    this.hero();
    c.restore();
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
  tile(t: Tile, x: number, y: number, time: number) {
    const c = this.ctx;
    const g = this.game;
    if (g.run.outside) {
      drawForestTile(c, t, x, y, g.run.seed, Math.floor(g.world.width / 2));
      return;
    }
    const northWall = g.world.tile(x, y + 1)?.kind === "wall";
    const southWall = g.world.tile(x, y - 1)?.kind === "wall";
    const westWall = g.world.tile(x - 1, y)?.kind === "wall";
    const eastWall = g.world.tile(x + 1, y)?.kind === "wall";
    drawTerrain(c, t.kind === "wall", g.mode, g.run.height, x, y, g.run.seed, t.kind === "floor", {
      northWall,
      southWall,
      westWall,
      eastWall,
    });
    if (t.kind === "wall") return;
    if (t.kind === "floor") return;
    
    if (t.kind === "oneway") {
      c.fillStyle = "#8a7e93";
      c.fillRect(0, 10, 24, 5);
      c.fillStyle = "#a89fb3";
      c.beginPath(); c.moveTo(5, 10); c.lineTo(12, 19); c.lineTo(19, 10); c.fill();
      return;
    }
    if (t.kind === "stairs") {
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
      return;
    }
    if (t.kind === "door") {
      c.fillStyle = "#090d14";
      c.fillRect(4, 2, 16, 22);
      c.fillStyle = COLORS[t.color!];
      c.fillRect(5, 4, 14, 19);
      c.fillStyle = "#101b28bb";
      c.fillRect(7, 5, 10, 17);
      c.fillStyle = COLORS[t.color!];
      c.fillRect(11, 10, 3, 7);
      c.fillRect(10, 9, 5, 4);
      return;
    }
    if (t.kind === "potion") {
      this.groundShadow(12, 22, 6, 1.6, 0.3);
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
      return;
    }
    if (t.kind === "attack") {
      this.groundShadow(12, 22, 6, 1.6, 0.3);
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
      return;
    }
    if (t.kind === "defense") {
      this.groundShadow(12, 22, 6, 1.6, 0.3);
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
      return;
    }
    if (t.kind === "reward") {
      this.groundShadow(12, 22.5, 8, 1.8, 0.32);
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
      c.fillStyle = "#d0a34d";
      c.fillRect(3, 7, 18, 14);
      c.fillStyle = "#714829";
      c.fillRect(5, 9, 14, 10);
      c.fillStyle = "#ebbd58";
      c.fillRect(3, 12, 18, 2);
      c.fillRect(10, 11, 4, 6);
      return;
    }
    const tier = t.enemy!.tier;
    this.groundShadow(12, 21, 8, 2.6, 0.4);
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
  /** Stationary torch + flame sprite. No vertical bob — the sprite never
   * moves; only the light (see drawTorchLight) flickers. */
  drawTorchSprite(t: Torch) {
    const c = this.ctx,
      s = this.size,
      sx = (t.x - this.left) * s,
      sy = (this.density - 1 - (t.y - this.bottom)) * s;
    c.save();
    c.translate(sx, sy);
    c.scale(s / 24, s / 24);
    c.fillStyle = "#59412c";
    c.fillRect(10, 10, 4, 10);
    c.fillStyle = "#df7b32";
    c.fillRect(9, 4, 6, 9);
    c.fillStyle = "#ffe3a0";
    c.fillRect(11, 3, 3, 7);
    c.restore();
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

  /** Renders ambient darkness and soft occluded torch lights to an offscreen lightmap buffer,
   * then composites the result over the dungeon tiles. */
  drawDungeonLightmap(viewportSize: number, torches: Torch[], now: number) {
    const lm = this.ensureLightmap(viewportSize);
    const mainCtx = this.ctx;
    const atm = this.atmosphere;
    const reduceMotion = this.game.save.settings.reduceMotion;

    if (lm) {
      // 1. Clear offscreen lightmap
      lm.clearRect(0, 0, viewportSize, viewportSize);

      // 2. Base ambient darkness overlay (subtle dark purple)
      lm.fillStyle = LIGHTING_CONFIG.ambient.color;
      lm.globalAlpha = LIGHTING_CONFIG.ambient.opacity;
      lm.fillRect(0, 0, viewportSize, viewportSize);

      // 3. Optional cool atmospheric tint
      if (atm.ambientStrength > 0) {
        lm.save();
        lm.globalAlpha = atm.ambientStrength;
        lm.fillStyle = atm.ambientColor;
        lm.fillRect(0, 0, viewportSize, viewportSize);
        lm.restore();
      }

      // 4. Render soft torch haze (diffuse glow into surrounding air)
      if (atm.torchHazeStrength > 0) {
        for (const t of torches) {
          this.drawTorchHaze(lm, t, now, reduceMotion);
        }
      }

      // 5. Render direct occluded torch light with soft penumbras
      for (const t of torches) {
        this.drawTorchLight(lm, t, now, reduceMotion);
      }

      // 6. Composite the lightmap onto the main canvas
      mainCtx.save();
      mainCtx.globalCompositeOperation = "source-over";
      mainCtx.drawImage(this.lightmapCanvas!, 0, 0);
      mainCtx.restore();
    } else {
      // Fallback if offscreen canvas cannot be instantiated (e.g. headless tests without canvas DOM)
      mainCtx.save();
      mainCtx.fillStyle = LIGHTING_CONFIG.ambient.color;
      mainCtx.globalAlpha = LIGHTING_CONFIG.ambient.opacity;
      mainCtx.fillRect(0, 0, viewportSize, viewportSize);
      for (const t of torches) {
        this.drawTorchLight(mainCtx, t, now, reduceMotion);
      }
      mainCtx.restore();
    }
  }

  /** Warm radial light clipped to the torch's cached visibility polygon, so
   * walls occlude it gently. Falloff is soft and feathered with penumbra blur.
   * Brightness/radius flicker gently (+/-~3%) using coherent multi-harmonic waves. */
  drawTorchLight(c: CanvasRenderingContext2D, t: Torch, now: number, reduceMotion: boolean) {
    if (!t.visibilityPolygon || t.visibilityPolygon.length < 3) return;
    const flicker = getTorchFlicker(t, now, reduceMotion);
    const cx = this.toScreenX(t.x + 0.5),
      cy = this.toScreenY(t.y + 0.5),
      radius = t.lightRadius * this.size * flicker,
      intensity = t.baseIntensity * flicker;

    c.save();
    c.beginPath();
    // Expand the clip polygon slightly outward from the torch so occlusion
    // edges feather into the blur instead of reading as hard geometry.
    const penumbra = 1 + LIGHTING_CONFIG.shadow.penumbraOffset;
    const ox = t.x + 0.5, oy = t.y + 0.5;
    t.visibilityPolygon.forEach((p, i) => {
      const wx = ox + (p.x - ox) * penumbra,
        wy = oy + (p.y - oy) * penumbra;
      const px = this.toScreenX(wx),
        py = this.toScreenY(wy);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    c.closePath();
    c.clip();

    if (!reduceMotion && LIGHTING_CONFIG.shadow.blurPx > 0) {
      c.filter = `blur(${LIGHTING_CONFIG.shadow.blurPx}px)`;
    }
    c.globalCompositeOperation = "lighter";

    const gr = c.createRadialGradient(cx, cy, 0, cx, cy, radius);
    for (const stop of LIGHTING_CONFIG.stops) {
      // Extract RGBA stop and scale by intensity
      const match = stop.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const r = match[1], g = match[2], b = match[3];
        const baseA = match[4] !== undefined ? parseFloat(match[4]) : 1;
        gr.addColorStop(stop.offset, `rgba(${r},${g},${b},${(baseA * intensity).toFixed(3)})`);
      } else {
        gr.addColorStop(stop.offset, stop.color);
      }
    }

    c.fillStyle = gr;
    c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    c.restore();
  }

  /** Soft warm atmospheric haze that diffuses into ambient air around torches.
   * Uses gentle additive blending with wide radial feathering and blur. */
  drawTorchHaze(c: CanvasRenderingContext2D, t: Torch, now: number, reduceMotion: boolean) {
    const atm = this.atmosphere;
    const flicker = getTorchFlicker(t, now, reduceMotion);
    const cx = this.toScreenX(t.x + 0.5),
      cy = this.toScreenY(t.y + 0.5),
      hazeRadius = t.lightRadius * this.size * atm.torchHazeRadius * flicker,
      alpha = atm.torchHazeStrength * t.baseIntensity * flicker;
    if (alpha <= 0 || hazeRadius <= 0) return;

    c.save();
    c.globalCompositeOperation = "lighter";
    if (!reduceMotion && atm.torchHazeBlur > 0) {
      c.filter = `blur(${atm.torchHazeBlur}px)`;
    }
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
    if (atm.vignetteStrength <= 0) return;
    const c = this.ctx,
      half = viewportSize / 2,
      maxRadius = half * Math.SQRT2,
      innerRadius = Math.max(0, half * Math.min(1, Math.max(0, atm.vignetteSoftness)));
    c.save();
    const gr = c.createRadialGradient(half, half, innerRadius, half, half, maxRadius);
    gr.addColorStop(0, "rgba(5, 7, 14, 0)");
    gr.addColorStop(0.65, `rgba(5, 7, 14, ${atm.vignetteStrength * 0.35})`);
    gr.addColorStop(1, `rgba(5, 7, 14, ${atm.vignetteStrength})`);
    c.fillStyle = gr;
    c.fillRect(0, 0, viewportSize, viewportSize);
    c.restore();
  }
  drawRoutePath(now: number) {
    const route = this.game.route;
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

    const segments: Array<Array<{ x: number; y: number }>> = [];
    let currentSegment: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < route.length; i++) {
      const step = route[i];
      const pt = toTileScreen(step.x, step.y);
      if (i === 0) {
        currentSegment.push(pt);
      } else {
        const prevStep = route[i - 1];
        const isWrap = Math.abs(step.x - prevStep.x) > 1 || Math.abs(step.y - prevStep.y) > 1;
        if (isWrap) {
          if (currentSegment.length > 0) {
            segments.push(currentSegment);
          }
          currentSegment = [pt];
        } else {
          currentSegment.push(pt);
        }
      }
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
    Renderer.drawHero(this.ctx);
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
