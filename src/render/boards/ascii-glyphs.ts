/** What the ASCII Game themes (Glyph, Ember) share: glowing characters in
 * the bundled VT323 face, and a fixed number per tile for their fields of
 * dim letters. Drawing only: nothing here is saved or played by. */

export const ASCII_FONT = "VT323";
let fontAsked = false;
/** Asks the browser for the face once, so the board isn't drawn in the
 * fallback face for long (no `document.fonts` under tests). */
export function askAsciiFont() {
  if (fontAsked) return;
  fontAsked = true;
  if (typeof document !== "undefined") void document.fonts?.load(`24px ${ASCII_FONT}`).catch(() => {});
}

/** One character (or a few), centred on (x, y) in tile space, glowing in
 * `glowColor` (its own colour by default) by `glow` pixels. */
export function asciiGlyph(c: CanvasRenderingContext2D, ch: string, color: string, size = 24, x = 12, y = 12.5, glow = 6, glowColor = color) {
  c.font = `${size}px ${ASCII_FONT}, monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.shadowColor = glowColor;
  c.shadowBlur = glow;
  c.fillStyle = color;
  c.fillText(ch, x, y);
  c.shadowBlur = 0;
}

/** A fixed whole number for a tile, the same every frame. */
export function tileHash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A tile of the background's field of dim letters: four small characters
 * from `letters`, some left out, picked by the tile's number. */
export function letterField(c: CanvasRenderingContext2D, x: number, y: number, letters: string, color: string) {
  const h = tileHash(x, y);
  c.font = `11px ${ASCII_FONT}, monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const bits = (h >>> (i * 7)) & 127;
    if (bits % 5 === 0) continue;
    c.fillText(letters[bits % letters.length], 6 + (i % 2) * 12, 6.5 + Math.floor(i / 2) * 12);
  }
}
