import { tileTransform, type FrameContext } from "./render-frame.ts";

/** How long a Bomb's explosion lasts. */
export const EXPLOSION_MS = 700;
/** How many sparks fly out of it, and how many puffs of smoke it leaves. */
const SPARKS = 10;
const PUFFS = 7;

/** A Bomb going off on tile (x, y) `age` ms after it was thrown: a white
 * flash, a fireball swelling past the tile with a ring of shock round it
 * and sparks flying out, then grey smoke thinning away over EXPLOSION_MS;
 * with reduced motion, the fireball fades where it stands. */
export function drawExplosion(f: FrameContext, x: number, y: number, age: number) {
  if (age < 0 || age >= EXPLOSION_MS) return;
  const t = age / EXPLOSION_MS, out = f.look.reduceMotion ? 0.5 : 1 - (1 - t) * (1 - t), fade = 1 - t;
  const c = f.c;
  c.save();
  c.setTransform(tileTransform(f, x, y));
  // The smoke the fireball leaves, rising as it thins.
  for (let i = 0; i < PUFFS; i++) {
    // Fixed, uneven angles and sizes, so the smoke is ragged but the same every time.
    const angle = (i / PUFFS) * Math.PI * 2 + 0.5 * Math.sin(i * 3.1);
    const reach = (6 + 5 * (0.5 + 0.5 * Math.sin(i * 1.7))) * out, r = (4 + 3 * (0.5 + 0.5 * Math.cos(i * 2.9))) * (0.5 + out);
    const px = 12 + Math.cos(angle) * reach, py = 12 + Math.sin(angle) * reach - 6 * out;
    const puff = c.createRadialGradient(px, py, 0, px, py, r);
    puff.addColorStop(0, `rgba(120, 110, 104, ${0.7 * fade * Math.min(1, t * 4)})`);
    puff.addColorStop(1, "rgba(60, 54, 50, 0)");
    c.fillStyle = puff;
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.fill();
  }
  // The fireball: white at its heart, through yellow and orange to red, gone by two thirds of the way.
  const fire = Math.max(0, 1 - t * 1.5);
  if (fire > 0) {
    const r = 6 + 16 * out;
    const ball = c.createRadialGradient(12, 12, 0, 12, 12, r);
    ball.addColorStop(0, `rgba(255, 255, 230, ${fire})`);
    ball.addColorStop(0.3, `rgba(255, 214, 90, ${fire})`);
    ball.addColorStop(0.65, `rgba(255, 120, 40, ${0.85 * fire})`);
    ball.addColorStop(1, "rgba(200, 40, 20, 0)");
    c.fillStyle = ball;
    c.beginPath();
    c.arc(12, 12, r, 0, Math.PI * 2);
    c.fill();
  }
  if (!f.look.reduceMotion) {
    // The shock ring, racing out past the fireball.
    c.strokeStyle = `rgba(255, 236, 190, ${0.8 * fade * fade})`;
    c.lineWidth = 2.5 * fade + 0.5;
    c.beginPath();
    c.arc(12, 12, 4 + 26 * out, 0, Math.PI * 2);
    c.stroke();
    // Sparks, each a streak flying straight out and dimming.
    c.lineCap = "round";
    for (let i = 0; i < SPARKS; i++) {
      const angle = (i / SPARKS) * Math.PI * 2 + 0.3 * Math.cos(i * 4.3), speed = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(i * 2.1));
      const head = 6 + 24 * out * speed, tail = Math.max(4, head - 6);
      c.strokeStyle = `rgba(255, ${190 + (i % 3) * 25}, 80, ${fade})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(12 + Math.cos(angle) * tail, 12 + Math.sin(angle) * tail);
      c.lineTo(12 + Math.cos(angle) * head, 12 + Math.sin(angle) * head);
      c.stroke();
    }
  }
  c.restore();
}
