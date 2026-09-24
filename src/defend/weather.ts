/** Per-run weather for DEFEND battles: rain (with an overcast dimming) and
 * night. Both bring the city's lanterns and tower fires out. */

export type Weather = { rain: boolean; night: boolean };

export const CLEAR: Weather = { rain: false, night: false };

/** 30% rain, 10% night — rolled independently, so a rainy night can happen. */
export function rollWeather(rand = Math.random): Weather {
  return { rain: rand() < 0.3, night: rand() < 0.1 };
}

export const lightsOn = (w: Weather) => w.rain || w.night;

/** Darkness overlay for the lighting pass: colour, opacity, and how strong
 * the warm glow is against it. */
export function ambientFor(w: Weather) {
  if (w.night && w.rain) return { color: "#070a18", alpha: 0.72, glow: 0.95 };
  if (w.night) return { color: "#080c22", alpha: 0.66, glow: 0.9 };
  return { color: "#1c2330", alpha: 0.34, glow: 0.6 };
}

type Drop = { x: number; y: number; v: number; len: number };
type Splash = { x: number; y: number; t: number };

/** Falling streaks and little splash rings, in canvas pixels. */
export class Rain {
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  private w = 0;
  private h = 0;

  update(dt: number, w: number, h: number) {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      const n = Math.round((w * h) / 5200);
      this.drops = Array.from({ length: n }, () => this.drop(true));
    }
    dt = Math.min(dt, 0.1);
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * 0.18 * dt;
      if (d.y > this.h + d.len) {
        if (Math.random() < 0.35) this.splashes.push({ x: d.x, y: Math.random() * this.h, t: 0 });
        Object.assign(d, this.drop(false));
      }
    }
    for (const s of this.splashes) s.t += dt;
    this.splashes = this.splashes.filter((s) => s.t < 0.3);
  }

  private drop(anywhere: boolean): Drop {
    const v = this.h * (0.9 + Math.random() * 0.5);
    return { x: Math.random() * (this.w * 1.2), y: anywhere ? Math.random() * this.h : -Math.random() * this.h * 0.2, v, len: this.h * (0.012 + Math.random() * 0.012) };
  }

  draw(c: CanvasRenderingContext2D, px: number) {
    c.save();
    c.strokeStyle = "rgba(190,210,235,0.32)";
    c.lineWidth = Math.max(1, px * 0.06);
    c.beginPath();
    for (const d of this.drops) {
      c.moveTo(d.x, d.y);
      c.lineTo(d.x + d.len * 0.18, d.y - d.len);
    }
    c.stroke();
    c.strokeStyle = "rgba(200,220,240,0.35)";
    for (const s of this.splashes) {
      const k = s.t / 0.3;
      c.globalAlpha = 1 - k;
      c.beginPath();
      c.ellipse(s.x, s.y, px * (0.1 + k * 0.35), px * (0.05 + k * 0.17), 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  /** The grey, slightly washed-out look of an overcast day. */
  static overcast(c: CanvasRenderingContext2D) {
    const W = c.canvas.width,
      H = c.canvas.height;
    c.save();
    c.globalCompositeOperation = "saturation";
    c.fillStyle = "rgba(128,128,128,0.3)";
    c.fillRect(0, 0, W, H);
    c.restore();
  }
}
