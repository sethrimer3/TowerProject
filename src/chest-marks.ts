import type { ChestKind } from "./entities.ts";
import { forEachViewTile, tileCenter, tileOrigin, type FrameContext } from "./render-frame.ts";
import { drawKit } from "./sprite-kit.ts";

/** How a Supply or Equipment Chest shows on the board, opened or not: a
 * glow of its colour (the CHEST card's bonus lines' light blue and purple)
 * and one star (Supply) or two (Equipment) in the tile's upper-left corner. */
export const CHEST_LOOK: Record<Exclude<ChestKind, "plain">, { color: string; rgb: readonly number[]; stars: number }> = {
  supply: { color: "#8fd0ff", rgb: [143, 208, 255], stars: 1 },
  equipment: { color: "#c495ff", rgb: [196, 149, 255], stars: 2 },
};

/** A five-pointed star of outer radius `r` centred on (x, y). */
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.closePath();
}

/** Each Supply and Equipment Chest in view, and the floor each left once
 * opened (`Tile.chest`): its glow and stars, over every board and above
 * the darkness. */
export function drawChestMarks(f: FrameContext) {
  const c = f.c, s = f.s, r = Math.max(3, s * 0.16);
  let started = false;
  forEachViewTile(f, (x, y) => {
    const kind = f.world.tile(x, y).chest;
    if (!kind) return;
    if (f.look.styledSprites) {
      const o = tileOrigin(f, x, y), width = kind === "supply" ? 10 : 20;
      if (drawKit(c, `combat-chest-${kind}`, o.x, o.y, s * width / 24, s * 10 / 24)) return;
    }
    if (!started) {
      c.save();
      c.lineJoin = "round";
      c.lineWidth = Math.max(1, s * 0.04);
      c.strokeStyle = "#000c";
      started = true;
    }
    const look = CHEST_LOOK[kind], at = tileCenter(f, x, y), reach = s * 0.75;
    const glow = c.createRadialGradient(at.x, at.y, 0, at.x, at.y, reach);
    glow.addColorStop(0, `rgba(${look.rgb.join(", ")}, 0.6)`);
    glow.addColorStop(1, `rgba(${look.rgb.join(", ")}, 0)`);
    c.fillStyle = glow;
    c.fillRect(at.x - reach, at.y - reach, reach * 2, reach * 2);
    const o = tileOrigin(f, x, y);
    c.fillStyle = look.color;
    for (let i = 0; i < look.stars; i++) {
      star(c, o.x + s * 0.17 + i * r * 1.9, o.y + s * 0.17, r);
      c.stroke();
      c.fill();
    }
  });
  if (started) c.restore();
}
