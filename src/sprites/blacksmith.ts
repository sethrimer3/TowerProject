import { kitImage } from "./kit.ts";

export const BLACKSMITH_FIRE_MS = 170;
export const BLACKSMITH_WIND_MS = 7200;
export const BLACKSMITH_SMOKE_MS = 7800;

/** Draw only native texels: the sign's top stays hung while lower rows sway. */
export function drawBlacksmithMotion(c: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const base = kitImage("blacksmith-base"), sign = kitImage("blacksmith-sign");
  const fire = kitImage("blacksmith-fire"), smoke = kitImage("blacksmith-smoke");
  if (!base || !sign || !fire || !smoke) return false;
  c.save();
  c.translate(x, y);
  c.scale(1.5, 1.5);
  c.imageSmoothingEnabled = false;
  const alpha = c.globalAlpha;
  // Three staggered puffs rise from the chimney and disappear into the air.
  for (let i = 0; i < 3; i++) {
    const t = ((now + i * BLACKSMITH_SMOKE_MS / 3) % BLACKSMITH_SMOKE_MS) / BLACKSMITH_SMOKE_MS;
    const frame = Math.min(3, Math.floor(t * 4));
    c.globalAlpha = alpha * .065 * Math.sin(t * Math.PI);
    c.drawImage(smoke, frame * 16, 0, 16, 12,
      24 + Math.round(t * 7 + Math.sin(t * Math.PI) * 2), 1 - Math.round(t * 18), 16, 12);
  }
  c.globalAlpha = alpha;
  c.drawImage(base, 0, 0, 48, 48);
  const frame = Math.floor(now / BLACKSMITH_FIRE_MS) % 4;
  c.drawImage(fire, frame * 6, 0, 6, 6, 24, 29, 6, 6);
  const wind = Math.sin(now / BLACKSMITH_WIND_MS * Math.PI * 2) * 1.5;
  for (let row = 0; row < 13; row++) {
    const offset = Math.round(wind * row / 12);
    c.drawImage(sign, 1, row + 1, 11, 1, 33 + offset, 20 + row, 11, 1);
  }
  c.restore();
  return true;
}
