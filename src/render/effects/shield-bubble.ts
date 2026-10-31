import { tileTransform, type FrameContext } from "../render-frame.ts";

/** How long a broken shield's pop takes. */
export const SHIELD_POP_MS = 300;
/** How long a reforming shield takes to grow to full size. */
const SHIELD_GROW_MS = 600;
/** How long its sparkles then flash. */
const SHIELD_SPARKLE_MS = 350;
/** How long a reforming shield keeps frames coming. */
export const SHIELD_FORM_MS = SHIELD_GROW_MS + SHIELD_SPARKLE_MS;
/** The bubble's radius round the hero, in tile space (a tile is 24 across). */
const RADIUS = 15;
const BLUE = "90, 170, 255";
/** Where the sparkles flash round the bubble: fixed, so none draws from a stream. */
const SPARKLES = Array.from({ length: 10 }, (_, i) => (i * Math.PI * 2) / 10);

/** What the board shows of the shield: whether one stands (`up`), and when it
 * last broke and reformed (performance time). */
export type ShownShield = { up: boolean; brokeAt: number; formedAt: number };

/** One bubble: a faint fill under a brighter rim, `alpha` of its full strength. */
function bubble(c: CanvasRenderingContext2D, radius: number, alpha: number) {
  const fill = c.createRadialGradient(12, 12, radius * 0.45, 12, 12, radius);
  fill.addColorStop(0, `rgba(${BLUE}, 0)`);
  fill.addColorStop(1, `rgba(${BLUE}, ${0.34 * alpha})`);
  c.fillStyle = fill;
  c.beginPath();
  c.arc(12, 12, radius, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = `rgba(170, 215, 255, ${0.8 * alpha})`;
  c.lineWidth = 1;
  c.stroke();
}

/** The Aether Shield round the hero, in its tile space: a blue bubble while it
 * stands, which rapidly swells and fades as it breaks, and grows out from the
 * hero's center as it reforms, some blue sparkles flashing once round it at
 * full size. With reduced motion, the pop only fades, and the reform fades in
 * with no sparkles. */
export function drawShieldBubble(f: FrameContext, { up, brokeAt, formedAt }: ShownShield) {
  const now = f.now, popped = now - brokeAt, formed = now - formedAt, reduced = f.look.reduceMotion;
  const popping = popped >= 0 && popped < SHIELD_POP_MS, forming = formed >= 0 && formed < SHIELD_FORM_MS;
  // A strike about to land still finds the bubble standing.
  const standing = up || now < brokeAt;
  if (!standing && !popping) return;
  const c = f.c;
  c.save();
  c.setTransform(tileTransform(f, f.playerX, f.playerY));
  c.globalCompositeOperation = "lighter";
  if (popping) {
    const t = popped / SHIELD_POP_MS;
    bubble(c, RADIUS * (reduced ? 1 : 1 + t), 1 - t);
  }
  if (standing && forming && formed < SHIELD_GROW_MS) {
    const t = formed / SHIELD_GROW_MS;
    if (reduced) bubble(c, RADIUS, t);
    else bubble(c, Math.max(1, RADIUS * t * (2 - t)), 1);
  } else if (standing) bubble(c, RADIUS, 1);
  if (standing && forming && formed >= SHIELD_GROW_MS && !reduced) {
    const t = (formed - SHIELD_GROW_MS) / SHIELD_SPARKLE_MS, flash = 1 - Math.abs(2 * t - 1);
    c.fillStyle = `rgba(190, 228, 255, ${flash})`;
    for (const angle of SPARKLES) {
      const x = 12 + (RADIUS + 1) * Math.cos(angle), y = 12 + (RADIUS + 1) * Math.sin(angle), size = 0.8 + flash;
      c.fillRect(x - size, y - 0.4, size * 2, 0.8);
      c.fillRect(x - 0.4, y - size, 0.8, size * 2);
    }
  }
  c.restore();
}
