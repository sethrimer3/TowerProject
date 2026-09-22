import { CHUNK, COLORS } from "./config.ts";
import { drawTerrain, themeAt } from "./themes.ts";
import type { Game } from "./state.ts";
import type { Tile } from "./entities.ts";
import { drawForestTile, drawEntrance, OUTSIDE_SIZE } from "./outside.ts";
import { OutdoorWeather } from "./weather.ts";
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
  get density() { return this.game.run.outside ? OUTSIDE_SIZE : this.game.save.settings.density; }
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
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.weather.silence(); });
  }
  target(n: number) {
    const g = this.game,
      p = g.run.player;
    // A Tower room is one fixed, fully-enclosed challenge: the camera holds
    // still and shows the room rather than following the player around it.
    if (g.mode === "tower" || g.run.outside)
      return {
        bottom: Math.max(0, Math.floor((CHUNK - n) / 2)),
        left: Math.max(0, Math.floor((g.world.width - n) / 2)),
      };
    return {
      bottom: Math.max(0, p.y - Math.floor(n * 0.3)),
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
    }
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
    // A border renders whenever stepping past that edge is actually blocked
    // (no destination, or the destination is a wall) — the same rule the
    // game itself uses to allow or refuse the move. It only stays open when
    // that step is a genuine two-sided wrap, which draws the passage mark
    // instead; a merely-open tile with no valid step is still a wall.
    for (let row = 0; row < n; row++) {
      const y = Math.floor(this.bottom) + row,
        sy = (n - 1 - (y - this.bottom)) * s;
      for (const side of [0, 1]) {
        const dx = side ? 1 : -1,
          x = Math.floor(this.left + (side ? n - 0.000001 : 0)),
          dest = g.world.step(x, y, dx, 0);
        if (!dest || g.world.tile(dest.x, dest.y).kind === "wall") {
          c.fillStyle = "#606b79";
          c.fillRect(side ? box.width - 2 : 0, sy, 2, s);
        } else if (dest.x !== x + dx) {
          const edge = side ? box.width - 3 : 3;
          c.strokeStyle = "#d5bb7a";
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(edge + (side ? -4 : 4), sy + s * 0.3);
          c.lineTo(edge, sy + s * 0.5);
          c.lineTo(edge + (side ? -4 : 4), sy + s * 0.7);
          c.stroke();
        }
      }
    }
    // Top and bottom use the same rule; the game has no vertical wrap, so a
    // blocked step always draws as a plain wall segment.
    for (let col = 0; col < n; col++) {
      const x = Math.floor(this.left) + col,
        sx = (x - this.left) * s;
      for (const side of [0, 1]) {
        const dy = side ? 1 : -1,
          y = Math.floor(this.bottom) + (side ? n - 1 : 0),
          dest = g.world.step(x, y, 0, dy);
        if (!dest || g.world.tile(dest.x, dest.y).kind === "wall") {
          c.fillStyle = "#606b79";
          c.fillRect(sx, side ? 0 : box.width - 2, s, 2);
        }
      }
    }
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
  tile(t: Tile, x: number, y: number, time: number) {
    const c = this.ctx;
    const g = this.game;
    if (g.run.outside) {
      drawForestTile(c, t, x, y, g.run.seed, Math.floor(g.world.width / 2));
      return;
    }
    drawTerrain(c, t.kind === "wall", g.mode, g.run.height, x, y, g.run.seed, t.kind === "floor");
    if (t.kind === "wall") {
      if (themeAt(g.mode, g.run.height, x, y, g.run.seed).decor === 0 && x % 6 === 0 && y % 7 === 3) this.torch(time);
      return;
    }
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
    c.fillStyle = "#0006";
    c.fillRect(4, 20, 17, 3);
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
  torch(time: number) {
    const c = this.ctx;
    c.fillStyle = "#59412c";
    c.fillRect(10, 10, 4, 10);
    const a = this.game.save.settings.reduceMotion
      ? 0
      : Math.sin(time / 140) * 1.4;
    const gr = c.createRadialGradient(12, 8, 1, 12, 8, 22);
    gr.addColorStop(0, "#ffb64e66");
    gr.addColorStop(1, "#ff8c2000");
    c.fillStyle = gr;
    c.fillRect(-10, -14, 44, 44);
    c.fillStyle = "#df7b32";
    c.fillRect(9, 4 + a, 6, 9);
    c.fillStyle = "#ffe3a0";
    c.fillRect(11, 3 + a, 3, 7);
  }
  hero() {
    Renderer.drawHero(this.ctx);
  }
  static drawHero(c: CanvasRenderingContext2D) {
    c.fillStyle = "#7bacdf30";
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
