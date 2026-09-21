import { predict } from "./combat.ts";
import { point, type Tile } from "./entities.ts";
import type { Game } from "./state.ts";
export function score(t: Tile, y: number, current: number, distance: number) {
  let benefit = 0;
  if (t.kind === "key") benefit = 38;
  if (t.kind === "potion") benefit = 30;
  if (t.kind === "attack" || t.kind === "defense" || t.kind === "treasure")
    benefit = 45;
  if (t.kind === "door") benefit = t.color === "yellow" ? 24 : 20;
  if (t.kind === "enemy") benefit = 20;
  // Score against the run high-water mark: backtracking must not create fake progress.
  return benefit + Math.max(0, y - current) * 1.8 - distance * 0.18;
}
export function chooseStep(game: Game) {
  const p = game.run.player;
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
      const dest=game.world.step(n.x,n.y,dx,dy);
      if(!dest)continue;
      const {x,y}=dest,k=point(x,y);
      if (
        seen.has(k) ||
        y < Math.max(game.world.floor, p.y - 40) ||
        y > p.y + 40
      )
        continue;
      seen.add(k);
      const t = game.world.tile(x, y);
      if (
        t.kind === "wall" ||
        (t.kind === "door" && !p.keys[t.color!]) ||
        (t.kind === "enemy" && !predict(p, t.enemy!).survivable)
      )
        continue;
      const next = { x, y, first: n.d ? n.first : [dx, dy], d: n.d + 1 };
      let value = score(t, y, game.run.height, next.d);
      if (t.kind === "potion" && p.hp === p.maxHp) value -= 10;
      if (t.kind === "enemy") value -= predict(p, t.enemy!).damage * 0.5;
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
