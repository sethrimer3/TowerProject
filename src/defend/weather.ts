/** Per-run weather for DEFEND battles. Every battle is under cloud, so the
 * city's lanterns and tower fires are always lit; 30% of runs are also
 * rainy for the whole run. Night isn't rolled: it falls over every 10th
 * wave — the boss wave — fading in as it starts and out once it's beaten. */

export type Weather = { rain: boolean };

export function rollWeather(rand = Math.random): Weather {
  return { rain: rand() < 0.3 };
}

/** Every 10th wave is a boss wave, fought at night. */
export const isBossWave = (wave: number) => wave > 0 && wave % 10 === 0;

/** Seconds for night to fall (or lift). */
export const NIGHT_FADE_SECONDS = 2.5;

type Ambient = { rgb: [number, number, number]; alpha: number; glow: number };
const CLOUDY: Ambient = { rgb: [28, 35, 48], alpha: 0.3, glow: 0.55 };
const RAIN: Ambient = { rgb: [28, 35, 48], alpha: 0.36, glow: 0.62 };
const NIGHT: Ambient = { rgb: [8, 12, 34], alpha: 0.66, glow: 0.9 };
const NIGHT_RAIN: Ambient = { rgb: [7, 10, 24], alpha: 0.72, glow: 0.95 };

/** Darkness overlay for the lighting pass — colour, opacity, and how strong
 * the warm glow is against it — blended by how far night has fallen (0–1). */
export function ambientFor(w: Weather, night: number) {
  const a = w.rain ? RAIN : CLOUDY,
    b = w.rain ? NIGHT_RAIN : NIGHT;
  const t = Math.max(0, Math.min(1, night));
  const mix = (x: number, y: number) => x + (y - x) * t;
  const [r, g, bl] = a.rgb.map((v, i) => Math.round(mix(v, b.rgb[i])));
  return { color: `rgb(${r},${g},${bl})`, alpha: mix(a.alpha, b.alpha), glow: mix(a.glow, b.glow) };
}

/** Name for the HUD. */
export function skyLabel(w: Weather, night: number) {
  return night > 0.5 ? (w.rain ? "Storm" : "Night") : w.rain ? "Rain" : "Cloudy";
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

  /** The grey, washed-out look of an overcast sky (stronger in rain). */
  static overcast(c: CanvasRenderingContext2D, strength: number) {
    const W = c.canvas.width,
      H = c.canvas.height;
    c.save();
    c.globalCompositeOperation = "saturation";
    c.fillStyle = `rgba(128,128,128,${strength})`;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
}
