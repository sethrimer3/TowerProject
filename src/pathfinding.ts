import { CHUNK } from "./config.ts";
import { point } from "./entities.ts";
import type { Game } from "./state.ts";
export type Step = { dx: number; dy: number; x: number; y: number };
/** Find a structural route. Missing-key doors are expensive rather than
 * impassable, so a player can approach the first necessary locked door. */
export function routeTo(game: Game, x: number, y: number): Step[] | null {
  const p = game.run.player,
    w = game.world;
  if (w.tile(x, y).kind === "wall") return null;
  const start = point(p.x, p.y),
    goal = point(x, y),
    cost = new Map([[start, 0]]);
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
      const next = point(dest.x, dest.y),
        value =
          n.cost +
          1 +
          (tile.kind === "door" && !p.keys[tile.color!] ? 10000 : 0);
      if (value >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, value);
      previous.set(next, { from: k, step: { ...dest, dx, dy } });
      queue.push({ ...dest, cost: value });
    }
  }
  return null;
}
