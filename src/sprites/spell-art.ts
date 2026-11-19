import { drawKit, kitImage } from "./kit.ts";

export const SPELL_FRAMES = 6;
/** Presentation clocks never consume gameplay randomness or saved state. */
export const spellFrame = (time: number, animate: boolean, period = 1200) => animate ? Math.floor(((Math.max(0, time) % period) / period) * SPELL_FRAMES) : 2;

export function paintSpellFrame(c: CanvasRenderingContext2D, id: string, frame: number, x = 0, y = 0, size = 24) {
  const image = kitImage(id); if (!image) return false;
  c.save(); c.imageSmoothingEnabled = false;
  c.drawImage(image, Math.max(0, Math.min(5, frame)) * 24, 0, 24, 24, x, y, size, size);
  c.restore(); return true;
}
/** Persistent shocked state plus a brief, restrained recurring crackle. */
export function paintShockStatus(c: CanvasRenderingContext2D, now: number, animate: boolean) {
  drawKit(c, "status-shock", 0, 0, 8);
  if (animate && now % 3000 < 600) paintSpellFrame(c, "ambient-ricochet-shock", spellFrame(now, true, 600));
}
/** Damage reduction feedback only while the researched field is protecting the hero. */
export function paintDilationGuard(c: CanvasRenderingContext2D, now: number, animate: boolean) {
  paintSpellFrame(c, "ambient-dilation-guard", spellFrame(now, animate), 4, -14, 16);
}
