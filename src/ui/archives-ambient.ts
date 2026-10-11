import { stream } from "../random.ts";

/** How far the sunrays lean from straight down: x shifts by this per pixel of depth. */
const SLANT = 0.42;
const MOTES = 34;
const RAYS = 4;
/** Seconds the sunlight takes to fade in or out as archivists start or stop. */
const FADE_SECONDS = 2.5;

interface Mote { x: number; y: number; dx: number; dy: number; size: number; alpha: number; phase: number; rate: number }
interface Ray { x: number; width: number; phase: number; rate: number; strength: number }

const prefersReduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** One ray's brightness at time `t`, 0 to 1: two slow waves, as clouds
 * drifting behind the window the light comes through. */
const cloud = (r: Ray, t: number) => {
  const wave = 0.5 + 0.5 * Math.sin(t * r.rate + r.phase) * Math.sin(t * r.rate * 0.37 + r.phase * 2.1 + 1);
  return Math.max(0, Math.min(1, wave * 1.25 - 0.1)) * r.strength;
};

let stop: (() => void) | undefined;

/** Paints the Archives pane's backdrop on `canvas`: dim dust motes drifting
 * slowly, and, while `lit()` says archivists are working, parallel slanted
 * sunrays from the top that fade toward the bottom and swell and dim like
 * clouds passing; the motes twinkle as they cross a ray. It draws until the
 * canvas leaves the page, and only one backdrop runs at a time. */
export function startArchivesAmbient(canvas: HTMLCanvasElement, lit: () => boolean) {
  stop?.();
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rng = stream("effects");
  const motes: Mote[] = Array.from({ length: MOTES }, () => ({
    x: rng(), y: rng(), dx: (rng() - 0.5) * 0.012, dy: (rng() - 0.35) * 0.008,
    size: 0.7 + rng() * 1.1, alpha: 0.12 + rng() * 0.16, phase: rng() * 6.28, rate: 2 + rng() * 4,
  }));
  const rays: Ray[] = Array.from({ length: RAYS }, (_, i) => ({
    x: (i + 0.2 + rng() * 0.6) / RAYS * 1.3 - 0.1, width: 0.07 + rng() * 0.1, phase: rng() * 6.28, rate: 0.12 + rng() * 0.12, strength: 0.6 + rng() * 0.4,
  }));
  const reduced = prefersReduced();
  let light = lit() ? 1 : 0, time = rng() * 100, last = 0, frame = 0, alive = true;

  const draw = () => {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // The rays are drawn upright then sheared, so all lean the same way.
    const level = rays.map((r) => cloud(r, time) * light);
    if (light > 0.01) {
      ctx.save();
      ctx.transform(1, 0, -SLANT, 1, h * SLANT * 0.5, 0);
      rays.forEach((r, i) => {
        if (level[i] < 0.01) return;
        const fill = ctx.createLinearGradient(0, 0, 0, h);
        fill.addColorStop(0, `rgba(255, 233, 170, ${0.2 * level[i]})`);
        fill.addColorStop(0.55, `rgba(255, 225, 150, ${0.07 * level[i]})`);
        fill.addColorStop(1, "rgba(255, 220, 140, 0)");
        ctx.fillStyle = fill;
        ctx.fillRect(r.x * w, 0, r.width * w, h);
      });
      ctx.restore();
    }
    motes.forEach((m) => {
      // Where the mote sits across the sheared ray, at its depth.
      const across = m.x + (m.y - 0.5) * SLANT * h / w;
      let boost = 0;
      rays.forEach((r, i) => {
        if (across >= r.x && across <= r.x + r.width) boost = Math.max(boost, level[i] * (1 - m.y * 0.8));
      });
      const twinkle = boost > 0 ? Math.pow(0.5 + 0.5 * Math.sin(time * m.rate + m.phase), 3) * boost : 0;
      ctx.fillStyle = `rgba(235, 222, 185, ${Math.min(1, m.alpha + twinkle * 0.8)})`;
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.size * (1 + twinkle * 0.5), 0, 6.2832);
      ctx.fill();
    });
  };

  const step = (now: number) => {
    if (!alive) return;
    if (!canvas.isConnected) return stop?.();
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    if (!document.hidden) {
      time += dt;
      const target = lit() ? 1 : 0;
      light += Math.max(-dt / FADE_SECONDS, Math.min(dt / FADE_SECONDS, target - light));
      motes.forEach((m) => {
        m.x = (m.x + m.dx * dt + 1) % 1;
        m.y = (m.y + m.dy * dt + 1) % 1;
      });
      draw();
    }
    frame = requestAnimationFrame(step);
  };

  stop = () => {
    alive = false;
    cancelAnimationFrame(frame);
    stop = undefined;
  };
  // Reduced motion keeps one still frame.
  if (reduced) draw();
  else frame = requestAnimationFrame(step);
}
