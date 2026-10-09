import { QUOTA_DOORS, quotaDoorsIn, towerDoorHundredths, withoutQuotaDoors, type QuotaDoor } from "../key-schedule.ts";
import { forkFits, forksWorth, mayFork, stepValue } from "./forks.ts";
import { TOWER_PATTERNS, patternWeight, pick, type TowerPattern, type Weighted } from "./patterns.ts";
import { MAX_REGIONS } from "./resource-planner.ts";
import { openOptions, placePattern, type GraphBuilder } from "./strategic-graph.ts";
import type { Archetype, Fork, Gate, StrategicGraph, StrategicNode } from "./types.ts";

/** The door stage (docs/DOOR_AND_KEY_SCHEDULE.md): each floor rolls how many
 * blue, red and Heart Doors it holds from the schedule (`towerDoorHundredths`)
 * and places each one by one of three ways, chosen at random among those
 * that fit:
 *
 *   upgrade   an existing gate: a yellow door turns blue or red, any paid
 *             gate a Heart Door;
 *   pattern   a branch pattern built round that door (blue door → yellow
 *             keys, key chain, temptation…);
 *   fork      a fork pattern holding it and no other quota door, in place
 *             of a single gate, whose fallback gate is the door itself, so
 *             it stands even when the fork doesn't fit the floor.
 *
 * No other table offers these doors (`withoutQuotaDoors`). A door that fits
 * nowhere is dropped and recorded. In the first tower (`bypass`) a blue or
 * red door goes only on a branch, so the way to the stairs never needs one. */

type Tally = Record<QuotaDoor, number>;

const DOOR: Record<QuotaDoor, Gate> = {
  blue: { kind: "door", color: "blue" },
  red: { kind: "door", color: "red" },
  heart: { kind: "heart" },
};

/** The whole doors of `hundredths`, and one more with the rest as its
 * chance (drawn only when there is a rest). */
export function rollQuota(hundredths: number, rng: () => number) {
  const whole = Math.floor(hundredths / 100), rest = hundredths % 100;
  return whole + (rest && rng() * 100 < rest ? 1 : 0);
}

/** Places floor `b.depth`'s quota in tower `tower`: rarest first, each
 * door's placements spending the quota of every door they hold. Returns
 * what it rolled and dropped, or nothing when it rolled none. */
export function placeQuotaDoors(b: GraphBuilder, archetype: Archetype, tower: number): StrategicGraph["doorQuota"] {
  const left = {} as Tally;
  for (const door of QUOTA_DOORS) left[door] = rollQuota(towerDoorHundredths(door, b.depth, tower), b.rng);
  if (QUOTA_DOORS.every((d) => !left[d])) return undefined;
  const rolled = { ...left };
  for (const door of QUOTA_DOORS)
    while (left[door] > 0) {
      const added = placeOne(b, door, archetype, left);
      if (!added) break;
      for (const d of QUOTA_DOORS) left[d] -= added[d];
    }
  return Object.fromEntries(QUOTA_DOORS.filter((d) => rolled[d]).map((d) => [d, { rolled: rolled[d], dropped: left[d] }]));
}

/** Whether `added` holds `door` and no more of any door than is left. */
const spends = (added: Tally, door: QuotaDoor, left: Tally) => added[door] > 0 && QUOTA_DOORS.every((d) => added[d] <= left[d]);

/** Whether a fork's lanes hold just one quota door, `door`: what its
 * fallback gate leaves standing when the fork doesn't fit, so the count
 * holds either way. */
const onlyOne = (added: Tally, door: QuotaDoor) => QUOTA_DOORS.every((d) => added[d] === (d === door ? 1 : 0));

/** Whether a blue or red door may stand at `n`'s way in. */
const routeAllows = (b: GraphBuilder, n: StrategicNode, door: QuotaDoor) => door === "heart" || !b.bypass || n.route !== "main";

/** One door of `door`, placed one of the ways that fit, tried in a random
 * order; what it added, or null when none fit. */
function placeOne(b: GraphBuilder, door: QuotaDoor, archetype: Archetype, left: Tally): Tally | null {
  const ways = [
    () => upgrade(b, door),
    () => addPattern(b, door, archetype, left),
    () => addFork(b, door, archetype, left),
  ];
  while (ways.length) {
    const [way] = ways.splice(Math.floor(b.rng() * ways.length), 1);
    const added = way();
    if (added) return added;
  }
  return null;
}

/** A gate that costs something to cross, and holds no quota door yet. */
const paidGate = (g: Gate) => g.kind === "enemy" || g.kind === "steel" || (g.kind === "door" && g.color === "yellow");

function upgrade(b: GraphBuilder, door: QuotaDoor): Tally | null {
  const options = b.nodes.filter((n) => n.parent !== null && !n.forks && routeAllows(b, n, door) &&
    (door === "heart" ? paidGate(n.gate) : n.gate.kind === "door" && n.gate.color === "yellow"));
  if (!options.length) return null;
  options[Math.floor(b.rng() * options.length)].gate = { ...DOOR[door] };
  return quotaDoorsIn(DOOR[door]);
}

/** The most of each door `pattern` can hold, whichever options it takes. */
function mostDoors(pattern: TowerPattern): Tally {
  const most: Tally = { blue: 0, red: 0, heart: 0 };
  for (const step of pattern.steps)
    for (const d of QUOTA_DOORS) most[d] += Math.max(0, ...step.gate.map((o) => quotaDoorsIn(o.v)[d]));
  return most;
}

/** `pattern` as the stage places it for `door`: each step that can hold
 * the door holds it, and every other step only ordinary gates; null when
 * the pattern can't hold it or would spend more than is left. */
function quotaPattern(pattern: TowerPattern, door: QuotaDoor, left: Tally, b: GraphBuilder): TowerPattern | null {
  const steps = pattern.steps.map((s) => {
    const open = openOptions(s.gate, b.colors);
    const holding = open.filter((o) => quotaDoorsIn(o.v)[door] > 0);
    return { ...s, gate: holding.length ? holding : open.filter((o) => withoutQuotaDoors(o.v)) };
  });
  const placed: TowerPattern = { ...pattern, steps };
  const tables = steps.flatMap((s) => [s.gate, s.rewards, s.guarded] as (Weighted<unknown> | undefined)[]);
  if (steps.some((s) => !s.gate.length) || tables.some((t) => t && !openOptions(t, b.colors).length)) return null;
  return spends(mostDoors(placed), door, left) ? placed : null;
}

function addPattern(b: GraphBuilder, door: QuotaDoor, archetype: Archetype, left: Tally): Tally | null {
  const options = TOWER_PATTERNS
    .map((p) => ({ w: patternWeight(p, b.depth, archetype), v: quotaPattern(p, door, left, b) }))
    .filter((o): o is { w: number; v: TowerPattern } => o.w > 0 && o.v !== null);
  if (!options.length) return null;
  const before = b.nodes.length;
  const mainIds = b.nodes.filter((n) => n.route === "main").map((n) => n.id);
  if (!placePattern(b, pick(options, b.rng), mainIds, MAX_REGIONS)) return null;
  return quotaDoorsIn(b.nodes.slice(before).map((n) => n.gate));
}

function addFork(b: GraphBuilder, door: QuotaDoor, archetype: Archetype, left: Tally): Tally | null {
  const options = b.nodes.filter((n) => !n.forks && paidGate(n.gate) && mayFork(b, n) && routeAllows(b, n, door));
  if (!options.length) return null;
  const node = options[Math.floor(b.rng() * options.length)];
  const fits = forkFits(b, node);
  const [fork] = forksWorth(stepValue(node.gate), b.depth, archetype, b.rng,
    (f: Fork) => fits(f) && onlyOne(quotaDoorsIn(f.lanes), door));
  if (!fork) return null;
  node.forks = [fork];
  // The embedder falls back to the single gate: the door itself.
  node.gate = { ...DOOR[door] };
  return quotaDoorsIn(fork.lanes);
}
