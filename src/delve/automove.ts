import { point, type Player, type Tile } from '../entities.ts';
import type { Game } from '../state.ts';
import { predict } from '../combat.ts';
import { doorCost } from '../doors.ts';

export type Capabilities = { memory: boolean; deadEnds: boolean; combat: boolean; keys: boolean; contextual: boolean; scarcity: boolean; lookahead: number; interactions: number };
export function capabilities(game: Game): Capabilities {
  const u = game.save.upgrades;
  return { memory: u.aiMemory > 0, deadEnds: u.aiMemory > 1, combat: u.aiEvaluation > 0, keys: u.aiEvaluation > 1, contextual: u.aiEvaluation > 2, scarcity: u.aiEvaluation > 3, lookahead: 8 + u.aiLookahead * 4, interactions: 1 + u.aiLookahead * 2 };
}
const dirs = [[0, 1], [-1, 0], [1, 0], [0, -1]];
export type Decision = { x: number; y: number; utility: number; travel: number; damage: number; keys: number; reward: number; frontier: boolean; deadEnd: boolean };
const commitments = new WeakMap<Game, { run: Game['run']; from: string; route: string[]; target: string }>();
export const decisions = new WeakMap<Game, Decision[]>();
/** Deliberately uses observed tiles, never generation nodes, pattern IDs,
 * hidden route ownership, or the generator's true-continuation labels. */
export function chooseDelveStep(game: Game, override?: Capabilities) {
  const c = override ?? capabilities(game), p = game.run.player, world = game.world;
  const known = game.run.delveKnown ??= {};
  // Scouting upgrades expand observation explicitly. The default radius is
  // the same 17x17 neighbourhood available to the human player.
  const visible = new Set<string>();
  let discovered = 0;
  for (let y = Math.max(world.floor, p.y - c.lookahead); y <= p.y + c.lookahead; y++) for (let x = Math.max(0, p.x - c.lookahead); x <= Math.min(world.width - 1, p.x + c.lookahead); x++) {
    const k = point(x, y); visible.add(k);
    if (!known[k]) { known[k] = true; if (world.tile(x, y).kind !== 'wall') discovered++; }
  }
  const visits = game.run.delveVisited ?? {};
  const canKnow = (x: number, y: number) => c.memory ? known[point(x, y)] : visible.has(point(x, y)) || !!visits[point(x, y)];
  type Search = { x: number; y: number; first: number[]; d: number; player: Player; damage: number; keyCost: number; reward: number; interactions: number; path: Set<string> };
  const q: Search[] = [{ x: p.x, y: p.y, first: [0, 0], d: 0, player: { ...p, keys: { ...p.keys } }, damage: 0, keyCost: 0, reward: 0, interactions: 0, path: new Set([point(p.x, p.y)]) }];
  const committed = commitments.get(game);
  const here = point(p.x, p.y);
  // A committed route is followed until it ends, an interaction happens, or
  // newly observed corridors warrant a fresh look (with a continuity bonus
  // for the old target, so small visibility changes cannot flip-flop it).
  const keep = committed?.run === game.run && !discovered ? committed : undefined;
  if (keep) {
    if (keep.route[0] === here) { keep.route.shift(); keep.from = here; }
    if (keep.from === here && keep.route.length) {
      const [x, y] = keep.route[0].split(',').map(Number);
      const dx = x - p.x, dy = y - p.y, tile = world.tile(x, y);
      const trial = { player: { ...p, keys: { ...p.keys } }, damage: 0, keyCost: 0, reward: 0 };
      if (Math.abs(dx) + Math.abs(dy) === 1 && world.step(p.x, p.y, dx, dy) && tile.kind !== 'wall' && apply(tile, trial, c)) {
        if (!['floor', 'openedChest'].includes(tile.kind)) commitments.delete(game);
        return { dx, dy, label: 'Following the chosen Delve route' };
      }
    }
  }
  const previousTarget = committed?.run === game.run ? committed.target : '';
  commitments.delete(game);
  const bestAt = new Map<string, number>();
  let best: Search | null = null, bestValue = -Infinity;
  const report: Decision[] = [];
  for (let i = 0; i < q.length && i < 2400; i++) {
    const n = q[i]; if (n.d >= 180) continue;
    for (const [dx, dy] of dirs) {
      const dest = world.step(n.x, n.y, dx, dy); if (!dest || !canKnow(dest.x, dest.y)) continue;
      const k = point(dest.x, dest.y); if (n.path.has(k)) continue;
      const tile = world.tile(dest.x, dest.y); if (tile.kind === 'wall') continue;
      const next: Search = { ...n, ...dest, d: n.d + 1, first: n.d ? n.first : [dx, dy], player: { ...n.player, keys: { ...n.player.keys } }, path: new Set(n.path) };
      next.path.add(k);
      const interaction = !['floor', 'openedChest', 'oneway'].includes(tile.kind);
      if (interaction && next.interactions++ >= c.interactions) continue;
      if (!apply(tile, next, c)) continue;
      const exits = dirs.map(([xx, yy]) => world.step(dest.x, dest.y, xx, yy)).filter((v): v is { x: number; y: number } => !!v);
      const frontier = exits.some(v => !canKnow(v.x, v.y));
      const open = exits.filter(v => canKnow(v.x, v.y) && world.tile(v.x, v.y).kind !== 'wall');
      const deadEnd = !frontier && open.length <= 1;
      // Basic movement has short-term anti-oscillation but no retained map
      // routing. Memory upgrades use every previously observed corridor.
      const unvisited = !visits[k];
      const exploration = unvisited ? 14 : -visits[k] * 3;
      const upward = (dest.y - p.y) * (c.deadEnds ? 0.12 : 0.65);
      const utility = exploration + upward + (frontier ? 8 : 0) + next.reward
        + (tile.kind === 'oneway' ? 90 : 0)
        - next.d * (c.deadEnds ? 0.25 : 0.12)
        - (c.combat ? next.damage * 0.55 : 0)
        - (c.keys ? next.keyCost : 0)
        - (c.deadEnds && deadEnd ? 18 + next.d * 0.2 : 0)
        + (k === previousTarget ? 6 : 0);
      // Interactions, junctions, pockets and frontiers form the observed
      // decision graph. Corridor interiors remain traversal edges.
      if (interaction || open.length !== 2 || frontier || unvisited) {
        report.push({ ...dest, utility, travel: next.d, damage: next.damage, keys: next.keyCost, reward: next.reward, frontier, deadEnd });
        if (utility > bestValue) { bestValue = utility; best = next; }
      }
      // Retain resource-distinct alternatives at junctions. A consumed item
      // can never be credited twice along a route (path membership above).
      const label = `${k}:${next.player.keys.yellow},${next.player.keys.blue},${next.player.keys.red}:${next.interactions}:${next.player.attack}:${next.player.defense}`;
      const merit = next.reward - next.damage * 0.55 - next.keyCost - next.d * 0.25;
      if (merit <= (bestAt.get(label) ?? -Infinity)) continue;
      bestAt.set(label, merit);
      q.push(next);
    }
  }
  decisions.set(game, report.sort((a, b) => b.utility - a.utility).slice(0, 12));
  if (best) commitments.set(game, { run: game.run, from: here, route: [...best.path].slice(1), target: point(best.x, best.y) });
  return best ? { dx: best.first[0], dy: best.first[1], label: `Exploring Delve · ${c.lookahead}-tile scouting` } : null;
}
function apply(tile: Tile, n: { player: Player; damage: number; keyCost: number; reward: number }, c: Capabilities) {
  const p = n.player;
  if (tile.kind === 'enemy') {
    const result = predict(p, tile.enemy!);
    if (!result.survivable || result.impervious) return false;
    p.hp -= result.damage; n.damage += result.damage;
  } else if (tile.kind === 'door') {
    const cost = doorCost(tile, p); if (!cost) return false;
    for (const color of cost) {
      n.keyCost += (color === 'red' ? 45 : color === 'blue' ? 25 : 12) * (c.scarcity && p.keys[color] <= 1 ? 1.7 : 1);
      p.keys[color]--;
    }
  } else if (tile.kind === 'key') {
    n.reward += c.contextual ? (tile.color === 'blue' ? 24 : tile.color === 'red' ? 42 : 10) / (1 + p.keys[tile.color!] * 0.2) : 10;
    p.keys[tile.color!]++;
  } else if (tile.kind === 'potion') {
    const heal = Math.min(tile.amount ?? 35, p.maxHp - p.hp); p.hp += heal;
    n.reward += c.contextual ? heal * 0.55 : 12;
  } else if (tile.kind === 'attack' || tile.kind === 'defense') {
    p[tile.kind] += tile.kind === 'attack' ? 2 : 1; n.reward += c.contextual ? 32 : 15;
  } else if (tile.kind === 'treasure') n.reward += 16;
  return true;
}
