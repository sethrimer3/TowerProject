import { predict } from "./combat.ts";
import { point, type Tile } from "./entities.ts";
import type { Game } from "./state.ts";
import { doorCost } from "./doors.ts";
export function score(t: Tile, y: number, current: number, distance: number) {
  let benefit = 0;
  if (t.kind === "reward") benefit = 10000;
  if (t.kind === "key") benefit = 38;
  if (t.kind === "potion") benefit = 30;
  if (t.kind === "attack" || t.kind === "defense" || t.kind === "treasure")
    benefit = 45;
  if (t.kind === "door") benefit = 24;
  if (t.kind === "enemy") benefit = 20;
  // Score against the run high-water mark: backtracking must not create fake progress.
  return benefit + Math.max(0, y - current) * 1.8 - distance * 0.18;
}
export function chooseStep(game: Game) {
  const p = game.run.player;
  const progress = game.mode === "tower" ? p.y : game.run.height;
  const q = [{ x: p.x, y: p.y, first: [0, 0], d: 0 }];
  const seen = new Set([point(p.x, p.y)]);
  let best: (typeof q)[number] | null = null,
    bestScore = 0.1;
  for (let i = 0; i < q.length && i < 2200; i++) {
    const n = q[i];
    if (n.d >= 140) continue;
    for (const [dx, dy] of [
      [0, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
    ]) {
      const dest = game.world.step(n.x, n.y, dx, dy);
      if (!dest) continue;
      const { x, y } = dest,
        k = point(x, y);
      if (
        seen.has(k) ||
        y < Math.max(game.world.floor, p.y - 40) ||
        y > p.y + 40
      )
        continue;
      seen.add(k);
      const t = game.world.tile(x, y);
      // Cache the one prediction per enemy tile instead of re-running combat
      // math for every check below.
      const combat = t.kind === "enemy" ? predict(p, t.enemy!) : null;
      if (
        t.kind === "wall" || (t.kind === "oneway" && dy !== 1) ||
        (t.kind === "door" && doorCost(t, p) === null) ||
        // Automove avoids known-lethal enemies outright; an impervious enemy
        // is still a candidate step (see below) so execution can bump it
        // harmlessly and replan, rather than treating it as a hard wall here.
        (t.kind === "enemy" && !combat!.survivable && !combat!.impervious)
      )
        continue;
      if (t.kind === "stairs" && game.mode === "tower" && game.run.rewards?.length) continue;
      // Backtracking down floors is a future automove upgrade; for now automove
      // only climbs, never steps onto the stairs back down on its own.
      if (t.kind === "stairsDown") continue;
      const next = { x, y, first: n.d ? n.first : [dx, dy], d: n.d + 1 };
      let value = game.run.outside
        ? (t.kind === "stairs" ? 100 : 0) - next.d * 0.18
        : score(t, y, progress, next.d);
      if (t.kind === "potion" && p.hp === p.maxHp) value -= 10;
      // Impervious enemies cost nothing in expected damage (they are never
      // actually fought — game.move() rejects the bump); a real fight's
      // predicted damage still discourages picking a costly-but-survivable one.
      if (t.kind === "enemy" && !combat!.impervious) value -= combat!.damage * 0.5;
      if (value > bestScore) {
        best = next;
        bestScore = value;
      }
      // Replan after each interaction: never assume future keys or cumulative combat HP.
      if (t.kind === "floor" || t.kind === "stairs") q.push(next);
    }
  }
  return best
    ? {
        dx: best.first[0],
        dy: best.first[1],
        label: `Seeking ${game.world.tile(best.x, best.y).kind === "floor" ? "height " + best.y : game.world.tile(best.x, best.y).kind}`,
      }
    : null;
}
