import { bubbleRadius, type Shield } from "./enemies/shielded.ts";
import { tileCenter, type FrameContext } from "./render-frame.ts";
import { drawKit } from "./sprite-kit.ts";
import { shieldSprite } from "./sprite-combat.ts";

/** A Shielded enemy's bubble (enemies/shielded.ts): a hollow green ring of its
 * radius, glowing, centred on the enemy's tile. */
const BUBBLE_LINE = "rgba(110, 255, 150, 0.85)";
const BUBBLE_GLOW = "#2bff6a";
const BUBBLE_FILL = "rgba(80, 255, 130, 0.06)";

/** Every standing Shielded enemy's bubble, over every board and above the
 * darkness. `wrap`, the board's width where it wraps (the Delve), draws a
 * bubble by either edge on the other side too. */
export function drawShields(f: FrameContext, shields: readonly Shield[], wrap = 0) {
  if (!shields.length) return;
  const c = f.c;
  c.save();
  c.lineWidth = Math.max(1.5, f.s * 0.06);
  c.strokeStyle = BUBBLE_LINE;
  c.fillStyle = BUBBLE_FILL;
  c.shadowColor = BUBBLE_GLOW;
  c.shadowBlur = Math.max(4, f.s * 0.35);
  for (const s of shields) {
    const r = bubbleRadius(s.floor) * f.s;
    for (const shift of wrap ? [-wrap, 0, wrap] : [0]) {
      const at = tileCenter(f, s.x + shift, s.y);
      // The original radius still defines the boundary at every floor.
      // Clear the fallback glow before drawing the hard-edged PNG.
      if (f.look.styledSprites) {
        c.shadowBlur = 0;
        if (drawKit(c, shieldSprite(bubbleRadius(s.floor) * 48), at.x - r, at.y - r, r * 2)) continue;
        c.shadowBlur = Math.max(4, f.s * 0.35);
      }
      c.beginPath();
      c.arc(at.x, at.y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
  c.restore();
}
