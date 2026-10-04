import { CHUNK } from "./config.ts";
import { point } from "./entities.ts";
import { litTorches, takesSomething, type Position } from "./board.ts";
import type { KeyColor } from "./config.ts";
import { doorCost } from "./doors.ts";
export type Step = { dx: number; dy: number; x: number; y: number };
/** A sliver of route cost per key a door eats, by rarity: never enough to
 * lengthen a route, only to pick the cheaper of two equally long ones (a
 * yellow door beside a blue one). */
const KEY_TIE_BREAK: Record<KeyColor, number> = { yellow: 1e-4, blue: 3e-4, red: 8e-4 };
/** Route cost for crossing a tile that holds something (`takesSomething`):
 * below one step, so a route never lengthens to go round it, but above the
 * key tie-breaks, so of two equally long routes it takes the one crossing
 * fewer items and lit torches. */
const ITEM_TIE_BREAK = 1e-2;
/** Find a structural route. Missing-key doors are expensive rather than
 * impassable, so a player can approach the first necessary locked door. */
export function routeTo(at: Position, x: number, y: number): Step[] | null {
  const p = at.run.player,
    w = at.world;
  if (w.tile(x, y).kind === "wall") return null;
  const start = point(p.x, p.y),
    goal = point(x, y),
    cost = new Map([[start, 0]]),
    lit = litTorches(w);
  const previous = new Map<string, { from: string; step: Step }>();
  const queue = [{ x: p.x, y: p.y, cost: 0 }];
  const minY = Math.max(w.floor, Math.min(y, p.y) - CHUNK),
    maxY = Math.max(y, p.y) + CHUNK;
  while (queue.length) {
    queue.sort((a, b) => b.cost - a.cost);
    const n = queue.pop()!,
      k = point(n.x, n.y);
    if (n.cost !== cost.get(k)) continue;
    if (k === goal) {
      const result: Step[] = [];
      let at = k;
      while (at !== start) {
        const edge = previous.get(at)!;
        result.push(edge.step);
        at = edge.from;
      }
      return result.reverse();
    }
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const dest = w.step(n.x, n.y, dx, dy);
      if (!dest || dest.y < minY || dest.y > maxY) continue;
      const tile = w.tile(dest.x, dest.y);
      if (tile.kind === "wall") continue;
      const keys = tile.kind === "door" ? doorCost(tile, p) : [];
      const next = point(dest.x, dest.y),
        value =
          n.cost +
          1 +
          (takesSomething(tile, dest.x, dest.y, lit) ? ITEM_TIE_BREAK : 0) +
          (keys === null ? 10000 : keys.reduce((s, c) => s + KEY_TIE_BREAK[c], 0));
      if (value >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, value);
      previous.set(next, { from: k, step: { ...dest, dx, dy } });
      queue.push({ ...dest, cost: value });
    }
  }
  return null;
}
