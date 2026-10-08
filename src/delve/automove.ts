import { point, type AutomoveMemory, type Player, type Run, type Save, type Tile } from '../entities.ts';
import type { Board, Position } from '../board.ts';
import type { KeyColor } from '../config.ts';
import { BASE_RULES, isLethal, resolveStep, type StepEffect, type StepRules } from '../step-effects.ts';

export type Capabilities = { memory: boolean; deadEnds: boolean; combat: boolean; keys: boolean; contextual: boolean; scarcity: boolean; lookahead: number; interactions: number };
/** What Automove's upgrades let it do. */
export function capabilities(u: Save['upgrades']): Capabilities {
  return { memory: u.aiMemory > 0, deadEnds: u.aiMemory > 1, combat: u.aiEvaluation > 0, keys: u.aiEvaluation > 1, contextual: u.aiEvaluation > 2, scarcity: u.aiEvaluation > 3, lookahead: 8 + u.aiLookahead * 4, interactions: 1 + u.aiLookahead * 2 };
}
const dirs = [[0, 1], [-1, 0], [1, 0], [0, -1]];
export type Decision = { x: number; y: number; utility: number; travel: number; damage: number; keys: number; reward: number; frontier: boolean; deadEnd: boolean };
type Commitment = { run: Run; from: string; route: string[]; target: string };
/** What Automove carries between steps and never saves: the route it
 * committed to (dropped once the run is replaced, as undo does) and the
 * decision points it weighed last. A Game holds one. */
export class DelvePlan {
  commitment?: Commitment;
  decisions?: Decision[];
}
/** Tiles walked through without any interaction. */
const TRAVERSAL = ['floor', 'openedChest', 'oneway'];
/** Search limits: nodes expanded and route length. */
const MAX_EXPANSIONS = 2400, MAX_TRAVEL = 180;
/** What each HP lost (or healed) is worth: a share of the HP the player has,
 * so a fight costing a fifth of it weighs the same at 400 HP as at 4000, and
 * HP grows dearer as it runs low. At 400 HP one HP is worth 0.15: most
 * corridors have a guard, so fights are routine and pricing them higher only
 * makes Automove circle instead of climbing. */
const HP_WORTH = 60;
const hpPrice = (p: Player) => HP_WORTH / Math.max(1, p.hp);

/** What Automove plans with besides the board: what it has seen, what it
 * planned last step, what its upgrades let it do, and the step rules
 * research has changed (the game's own when left out). */
export type DelveMind = { memory: AutomoveMemory; plan: DelvePlan; capabilities: Capabilities; rules?: StepRules };

/** Automove's next step from `at`. Marks what it can see in `memory` and
 * updates `plan`. Deliberately uses observed tiles, never generation nodes,
 * pattern IDs, hidden route ownership, or the generator's true-continuation
 * labels. */
export function chooseDelveStep(at: Position, { memory, plan, capabilities: c, rules = BASE_RULES }: DelveMind) {
  const { canKnow, discovered } = observe(at, memory, c);
  const current = plan.commitment?.run === at.run ? plan.commitment : undefined;
  // A committed route is followed until it ends, an interaction happens, or
  // newly observed corridors warrant a fresh look (with a continuity bonus
  // for the old target, so small visibility changes cannot flip-flop it).
  const followed = current && !discovered ? follow(at, plan, current, c, rules) : undefined;
  if (followed) return followed;
  plan.commitment = undefined;
  const scan: Scan = { at: { ...at, world: remembering(at.world) }, c, rules, canKnow: rememberingKnown(canKnow), hpPrice: hpPrice(at.run.player), visits: memory.visited, previousTarget: current?.target ?? '', bestAt: new Map(), report: [], best: null, bestValue: -Infinity };
  explore(scan);
  plan.decisions = scan.report.sort((a, b) => b.utility - a.utility).slice(0, 12);
  const { best } = scan, p = at.run.player;
  if (!best) return null;
  plan.commitment = { run: at.run, from: point(p.x, p.y), route: routeOf(best).slice(1), target: point(best.x, best.y) };
  return { dx: best.first[0], dy: best.first[1], label: `Exploring Delve · ${c.lookahead}-tile scouting` };
}

/** A tile's number in the memos below: the search never strays 512 tiles
 * sideways (the Delve is 30 wide). */
const memoKey = (x: number, y: number) => y * 1024 + x + 512;
/** `world` with each tile read from it once: the search reads the same tiles
 * many times over, and nothing changes while it runs. Its own `step` (and
 * whatever else it reads tiles through) reads them from here too. */
function remembering(world: Board): Board {
  const tiles = new Map<number, Tile>();
  const tile = (x: number, y: number) => {
    const k = memoKey(x, y);
    let t = tiles.get(k);
    if (!t) tiles.set(k, (t = world.tile(x, y)));
    return t;
  };
  return Object.assign(Object.create(world) as Board, { tile });
}
/** `canKnow`, each tile asked once. */
function rememberingKnown(canKnow: (x: number, y: number) => boolean) {
  const known = new Map<number, boolean>();
  return (x: number, y: number) => {
    const k = memoKey(x, y);
    let v = known.get(k);
    if (v === undefined) known.set(k, (v = !!canKnow(x, y)));
    return v;
  };
}

/** Marks what Automove can see now as known. Scouting upgrades expand
 * observation explicitly; the default radius is the same 17x17 neighbourhood
 * available to the human player. `discovered` counts newly seen open tiles. */
function observe({ run, world }: Position, { known, visited: visits }: AutomoveMemory, c: Capabilities) {
  const p = run.player, r = c.lookahead;
  const visible = new Set<string>();
  let discovered = 0;
  for (let y = Math.max(world.floor, p.y - r); y <= p.y + r; y++) for (let x = Math.max(0, p.x - r); x <= Math.min(world.width - 1, p.x + r); x++) {
    const k = point(x, y); visible.add(k);
    if (known[k]) continue;
    known[k] = true;
    if (world.tile(x, y).kind !== 'wall') discovered++;
  }
  // Basic movement has short-term anti-oscillation but no retained map
  // routing. Memory upgrades use every previously observed corridor.
  const canKnow = (x: number, y: number) => c.memory ? known[point(x, y)] : visible.has(point(x, y)) || !!visits[point(x, y)];
  return { canKnow, discovered };
}

/** The next step of the committed route, if it is still one step away and
 * still safe to take. */
function follow({ run, world }: Position, plan: DelvePlan, route: Commitment, c: Capabilities, rules: StepRules) {
  const p = run.player;
  const next = nextOnRoute(route, point(p.x, p.y));
  if (!next) return undefined;
  const [x, y] = next.split(',').map(Number);
  const dx = x - p.x, dy = y - p.y, tile = world.tile(x, y);
  const trial = { player: { ...p, keys: { ...p.keys } }, damage: 0, keyCost: 0, reward: 0 };
  const walkable = Math.abs(dx) + Math.abs(dy) === 1 && world.step(p.x, p.y, dx, dy) && tile.kind !== 'wall';
  if (!walkable || !apply(tile, trial, c, hpPrice(p), rules)) return undefined;
  if (!['floor', 'openedChest'].includes(tile.kind)) plan.commitment = undefined;
  return { dx, dy, label: 'Following the chosen Delve route' };
}

/** Drops the route's first tile once the player stands on it; the tile to
 * step to next, unless the player has left the route. */
function nextOnRoute(route: Commitment, here: string): string | undefined {
  if (route.route[0] === here) { route.route.shift(); route.from = here; }
  return route.from === here ? route.route[0] : undefined;
}

/** One partial route in the search, with what walking it would cost and earn. */
type Search = { x: number; y: number; first: number[]; d: number; player: Player; damage: number; keyCost: number; reward: number; interactions: number;
  /** The route one tile shorter: walking back through it gives every tile this route steps on. */
  prev: Search | null;
  /** A 128-bit summary of the tiles it steps on (`bitOf`), in four words:
   * a tile whose bit is clear is surely not among them. */
  m0: number; m1: number; m2: number; m3: number };
/** A tile's bit in a route's summary (`Search.m0` to `m3`). */
const bitOf = (x: number, y: number) => (y * 31 + x) & 127;
/** `n`'s summary with (x, y)'s bit set too. */
function withBit(n: Search, x: number, y: number) {
  const b = bitOf(x, y), bit = 1 << (b & 31), m = { m0: n.m0, m1: n.m1, m2: n.m2, m3: n.m3 };
  if (b < 32) m.m0 |= bit; else if (b < 64) m.m1 |= bit; else if (b < 96) m.m2 |= bit; else m.m3 |= bit;
  return m;
}
/** Whether route `n` steps on (x, y) (its start included). */
function steppedOn(n: Search, x: number, y: number) {
  const b = bitOf(x, y), word = b < 32 ? n.m0 : b < 64 ? n.m1 : b < 96 ? n.m2 : n.m3;
  if (!(word & (1 << (b & 31)))) return false;
  for (let at: Search | null = n; at; at = at.prev) if (at.x === x && at.y === y) return true;
  return false;
}
/** Every tile route `n` steps on, from its start. */
function routeOf(n: Search) {
  const out: string[] = [];
  for (let at: Search | null = n; at; at = at.prev) out.push(point(at.x, at.y));
  return out.reverse();
}
/** The search's inputs and its running results. */
type Scan = {
  at: Position; c: Capabilities; rules: StepRules;
  canKnow: (x: number, y: number) => boolean;
  /** What one HP is worth this step (`hpPrice`). */
  hpPrice: number;
  visits: Record<string, number>;
  previousTarget: string;
  /** Best merit seen per tile and resource state, to prune repeats. */
  bestAt: Map<string, number>;
  report: Decision[];
  best: Search | null; bestValue: number;
};

/** Breadth-first search over observed tiles from the player, scoring every
 * decision point it reaches. */
function explore(scan: Scan) {
  const p = scan.at.run.player;
  const q: Search[] = [{ x: p.x, y: p.y, first: [0, 0], d: 0, player: { ...p, keys: { ...p.keys } }, damage: 0, keyCost: 0, reward: 0, interactions: 0, prev: null, m0: 0, m1: 0, m2: 0, m3: 0 }];
  Object.assign(q[0], withBit(q[0], p.x, p.y));
  for (let i = 0; i < q.length && i < MAX_EXPANSIONS; i++) q.push(...successors(scan, q[i]));
}

function successors(scan: Scan, n: Search) {
  if (n.d >= MAX_TRAVEL) return [];
  return dirs.map(dir => advance(scan, n, dir)).filter((next): next is Search => !!next);
}

/** Extends route `n` one tile in `dir`: scores the new tile, and returns the
 * extended route when it is worth searching on from. */
function advance(scan: Scan, n: Search, [dx, dy]: number[]): Search | undefined {
  const { at: { world }, c, hpPrice, rules } = scan;
  const dest = world.step(n.x, n.y, dx, dy); if (!dest || !scan.canKnow(dest.x, dest.y)) return undefined;
  if (steppedOn(n, dest.x, dest.y)) return undefined;
  const k = point(dest.x, dest.y);
  const tile = world.tile(dest.x, dest.y); if (tile.kind === 'wall') return undefined;
  const next: Search = { ...n, ...dest, d: n.d + 1, first: n.d ? n.first : [dx, dy], player: { ...n.player, keys: { ...n.player.keys } }, prev: n, ...withBit(n, dest.x, dest.y) };
  const interaction = !TRAVERSAL.includes(tile.kind);
  if (interaction && next.interactions++ >= c.interactions) return undefined;
  if (!apply(tile, next, c, hpPrice, rules)) return undefined;
  consider(scan, next, dest, { tile, interaction });
  return improves(scan, next, k) ? next : undefined;
}

/** Scores the tile route `next` ends on. Interactions, junctions, pockets and
 * frontiers form the observed decision graph and are reported and ranked;
 * corridor interiors remain traversal edges. */
function consider(scan: Scan, next: Search, dest: { x: number; y: number }, { tile, interaction }: { tile: Tile; interaction: boolean }) {
  const { at: { world }, canKnow } = scan;
  const exits = dirs.map(([xx, yy]) => world.step(dest.x, dest.y, xx, yy)).filter((v): v is { x: number; y: number } => !!v);
  const frontier = exits.some(v => !canKnow(v.x, v.y));
  const open = exits.filter(v => canKnow(v.x, v.y) && world.tile(v.x, v.y).kind !== 'wall').length;
  const deadEnd = !frontier && open <= 1;
  const k = point(dest.x, dest.y), unvisited = !scan.visits[k];
  const utility = utilityOf(scan, next, { tile, frontier, deadEnd, unvisited });
  const corridorInterior = open === 2 && !(interaction || frontier || unvisited);
  if (corridorInterior) return;
  scan.report.push({ ...dest, utility, travel: next.d, damage: next.damage, keys: next.keyCost, reward: next.reward, frontier, deadEnd });
  if (utility > scan.bestValue) { scan.bestValue = utility; scan.best = next; }
}

type Place = { tile: Tile; frontier: boolean; deadEnd: boolean; unvisited: boolean };

/** How much Automove wants to end route `next` here. */
function utilityOf(scan: Scan, next: Search, place: Place) {
  // Summed in this exact order: reordering the float additions would shift
  // reported utilities and could flip near-ties.
  const [travel, combat, keys, deadEnd] = routeCosts(scan, next, place.deadEnd);
  const continuity = point(next.x, next.y) === scan.previousTarget ? 6 : 0;
  return appeal(scan, next, place) - travel - combat - keys - deadEnd + continuity;
}

/** What draws Automove to a place: novelty, height, the unknown, pickups and
 * the milestone gate. */
function appeal({ c, at, visits }: Scan, next: Search, { tile, frontier, unvisited }: Place) {
  const exploration = unvisited ? 14 : -visits[point(next.x, next.y)] * 3;
  const upward = (next.y - at.run.player.y) * (c.deadEnds ? 0.12 : 0.65);
  return exploration + upward + (frontier ? 8 : 0) + next.reward + (tile.kind === 'oneway' ? 90 : 0);
}

/** What the route there costs, as far as Automove's upgrades let it judge:
 * travel, damage taken, keys spent, and walking into a dead end. */
function routeCosts({ c, hpPrice }: Scan, next: Search, deadEnd: boolean) {
  return [
    next.d * (c.deadEnds ? 0.25 : 0.12),
    c.combat ? next.damage * hpPrice : 0,
    c.keys ? next.keyCost : 0,
    c.deadEnds && deadEnd ? 18 + next.d * 0.2 : 0,
  ];
}

/** Retains resource-distinct alternatives at junctions: a route is searched
 * on only if it beats every earlier route to the same tile with the same
 * keys, interactions and stats. A consumed item can never be credited twice
 * along a route (path membership above). */
function improves({ bestAt, hpPrice }: Scan, next: Search, k: string) {
  const { keys, attack, defense } = next.player;
  const label = `${k}:${keys.yellow},${keys.blue},${keys.red}:${next.interactions}:${attack}:${defense}`;
  const merit = next.reward - next.damage * hpPrice - next.keyCost - next.d * 0.25;
  if (merit <= (bestAt.get(label) ?? -Infinity)) return false;
  bestAt.set(label, merit);
  return true;
}
type Planned = { player: Player; damage: number; keyCost: number; reward: number };
/** Advances a planned route by one tile using the game's own step rules;
 * false when the step is blocked or the fight would be lethal. */
function apply(tile: Tile, n: Planned, c: Capabilities, hpPrice: number, rules: StepRules) {
  const before = n.player, outcome = resolveStep(before, tile, rules);
  if (outcome.blocked || isLethal(outcome)) return false;
  n.player = outcome.player;
  n.damage += outcome.combat?.damage ?? 0;
  n.keyCost += keyCost(outcome.keysSpent, before, c);
  n.reward += reward(tile, before, outcome, c, hpPrice);
  return true;
}
const KEY_SPEND_COST: Record<KeyColor, number> = { yellow: 12, blue: 25, red: 45 };
const KEY_FIND_VALUE: Partial<Record<KeyColor, number>> = { blue: 24, red: 42 };
/** Rarer keys cost more to spend; with scarcity, spending one of the last
 * keys of a color costs more still. */
function keyCost(spent: KeyColor[], before: Player, c: Capabilities) {
  const keys = { ...before.keys };
  let total = 0;
  for (const color of spent) {
    total += KEY_SPEND_COST[color] * (c.scarcity && keys[color] <= 1 ? 1.7 : 1);
    keys[color]--;
  }
  return total;
}
/** What a pickup is worth: a flat value, or with contextual evaluation one
 * weighed against what the player holds and would heal. */
function reward(tile: Tile, before: Player, outcome: StepEffect, c: Capabilities, hpPrice: number) {
  return c.contextual ? contextualReward(tile, before, outcome, hpPrice) : PLAIN_REWARD[tile.kind] ?? 0;
}
const PLAIN_REWARD: Partial<Record<Tile['kind'], number>> = { key: 10, potion: 12, attack: 15, defense: 15, treasure: 16 };
function contextualReward(tile: Tile, before: Player, outcome: StepEffect, hpPrice: number) {
  switch (tile.kind) {
    case 'key': return (KEY_FIND_VALUE[tile.color!] ?? 10) / (1 + before.keys[tile.color!] * 0.2);
    case 'potion': return outcome.healed * hpPrice;
    case 'attack': case 'defense': return 32;
    case 'treasure': return 16;
    default: return 0;
  }
}
