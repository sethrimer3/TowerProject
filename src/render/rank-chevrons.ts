import type { EnemyStrength } from "../entities.ts";

/** How many rank chevrons an enemy of each strength wears, and whether they
 * point down (a weak enemy's one). Every Game theme draws them, Classic's
 * baked enemies and each themed board alike, so strength reads the same way
 * whichever look is worn. */
export const RANK_CHEVRONS: Record<EnemyStrength, { count: number; down?: true }> = {
  weak: { count: 1, down: true },
  normal: { count: 0 },
  strong: { count: 1 },
  elite: { count: 2 },
  boss: { count: 3 },
  greaterBoss: { count: 4 },
};

/** An enemy's rank chevrons stacked down from (x, y), 4 pixels apart: each a
 * 5x3 wedge in `fill` on a one-pixel `backing`, glowing by `glow` pixels in
 * `fill` when given one. */
export function rankChevrons(c: CanvasRenderingContext2D, strength: EnemyStrength, fill: string, backing: string, x = 1, y = 1, glow = 0) {
  const { count, down } = RANK_CHEVRONS[strength] ?? RANK_CHEVRONS.normal;
  for (let i = 0; i < count; i++) chevron(c, x, y + i * 4, fill, backing, down, glow);
}

function chevron(c: CanvasRenderingContext2D, x: number, y: number, fill: string, backing: string, down = false, glow = 0) {
  const up = [[2, 1], [1, 3], [0, 5]] as const;
  const rows = down ? [...up].reverse() : up;
  c.fillStyle = backing;
  rows.forEach(([dx, w], i) => c.fillRect(x + dx - 1, y + i - 1, w + 2, 3));
  if (glow > 0) {
    c.shadowColor = fill;
    c.shadowBlur = glow;
  }
  c.fillStyle = fill;
  rows.forEach(([dx, w], i) => c.fillRect(x + dx, y + i, w, 1));
  if (glow > 0) c.shadowBlur = 0;
}
