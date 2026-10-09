import { QUOTA_DOORS, doorKeys, owesDoor, quotaDoorsIn, towerDoorHundredths, towerWoodPercent, withoutQuotaDoors, yellowRun, type QuotaDoor } from "../key-schedule.ts";
import { forkFits, forksWorth, mayFork, stepValue } from "./forks.ts";
import { TOWER_PATTERNS, patternWeight, pick, type TowerPattern, type Weighted } from "./patterns.ts";
import { MAX_REGIONS } from "./resource-planner.ts";
import { openOptions, placePattern, type GraphBuilder } from "./strategic-graph.ts";
import type { Archetype, Fork, Gate, StrategicGraph, StrategicNode } from "./types.ts";

/** The door stage (docs/DOOR_AND_KEY_SCHEDULE.md): each floor rolls how many
 * blue, red and Heart Doors it holds from the schedule (`towerDoorHundredths`)
 * and places them, each by one of five ways, chosen at random among those
 * that fit, until what they count for meets it (in hundredths of a door; a
 * fraction left owed placed at its chance, `owesDoor`):
 *
 *   upgrade   an existing gate: a yellow door turns blue or red, any paid
 *             gate a Heart Door;
 *   combine   a door takes the colour as well: yellow becomes yellow + blue,
 *             blue becomes blue + red …, one tile dearer than either; for a
 *             Heart Door, a blue, red or combined door drains HP to 1 too;
 *   pattern   a branch pattern built round that door (blue door → yellow
 *             keys, key chain, temptation…);
 *   fork      a fork pattern holding it, in place of a single gate, whose
 *             fallback gate is the door itself, so it stands even when the
 *             fork doesn't fit the floor; on the way to the stairs a fork
 *             holding no other quota door, on a branch any (extra doors).
 *             It counts as the door it falls back to; a fork that fits
 *             counts 1/k of each door its lanes hold, as the hero opens one
 *             lane of k (`forkCredit`), and the embedder settles the
 *             difference with runs (`settleQuota`);
 *   lengthen  a single blue, red or Heart Door becomes a door run of two,
 *             or a run of two one of three, every door counting. A Heart
 *             Door run compounds its drain with Heart Door Resilience.
 *
 * No other table offers these doors (`withoutQuotaDoors`). A door that fits
 * nowhere is dropped and recorded. In the first tower (`bypass`) a blue or
 * red door goes only on a branch, so the way to the stairs never needs one. */

/** Doors by kind, in hundredths of a door. */
type Tally = Record<QuotaDoor, number>;

const DOOR: Record<QuotaDoor, Gate> = {
  blue: { kind: "door", color: "blue" },
  red: { kind: "door", color: "red" },
  heart: { kind: "heart" },
};


/** Places floor `b.depth`'s quota in tower `tower`: rarest first, each
 * door's placements spending the quota of every door they hold. Returns
 * what it rolled and dropped, or nothing when it rolled none. */
export function placeQuotaDoors(b: GraphBuilder, archetype: Archetype, tower: number): StrategicGraph["doorQuota"] {
  const left = {} as Tally;
  for (const door of QUOTA_DOORS) left[door] = towerDoorHundredths(door, b.depth, tower);
  if (QUOTA_DOORS.every((d) => !left[d])) return undefined;
  const wanted = { ...left };
  for (const door of QUOTA_DOORS)
    while (owesDoor(left[door], b.rng)) {
      const added = placeOne(b, door, archetype, left);
      if (!added) break;
      for (const d of QUOTA_DOORS) left[d] -= added[d];
    }
  // Doors, not hundredths: what the schedule wanted and what is still owed
  // (below 0 when the floor holds more).
  return Object.fromEntries(QUOTA_DOORS.filter((d) => wanted[d]).map((d) => [d, { rolled: wanted[d] / 100, dropped: left[d] / 100 }]));
}

/** Whether `added` (whole doors) holds `door` and no more of any door than
 * is left (hundredths), a fraction left counting as a door. */
const spends = (added: Tally, door: QuotaDoor, left: Tally) => added[door] > 0 && QUOTA_DOORS.every((d) => added[d] * 100 < left[d] + 100);
/** Whole doors as hundredths. */
const hundredths = (t: Tally): Tally => ({ blue: t.blue * 100, red: t.red * 100, heart: t.heart * 100 });

/** Whether a fork's lanes hold just one quota door, `door`: what its
 * fallback gate leaves standing when the fork doesn't fit, so the count
 * holds either way. */
const onlyOne = (added: Tally, door: QuotaDoor) => QUOTA_DOORS.every((d) => added[d] === (d === door ? 1 : 0));

/** Whether a blue or red door may stand at `n`'s way in. */
const routeAllows = (b: GraphBuilder, n: StrategicNode, door: QuotaDoor) => door === "heart" || !b.bypass || n.route !== "main";

/** One door of `door`, placed one of the ways that fit, tried in a random
 * order; what it counts for in hundredths, or null when none fit. */
function placeOne(b: GraphBuilder, door: QuotaDoor, archetype: Archetype, left: Tally): Tally | null {
  const ways = [
    () => upgrade(b, door),
    () => combine(b, door),
    () => addPattern(b, door, archetype, left),
    () => addFork(b, door, archetype, left),
    () => lengthenRun(b, door),
  ];
  while (ways.length) {
    const [way] = ways.splice(Math.floor(b.rng() * ways.length), 1);
    const added = way();
    if (added) return added;
  }
  return null;
}

/** A plain yellow door: one key, no other colour, no heart, no run. */
const plainYellow = (g: Gate) => g.kind === "door" && g.color === "yellow" && !g.also?.length && !g.heart && !g.run;
/** A gate that costs something to cross, and holds no quota door yet. */
const paidGate = (g: Gate) => g.kind === "enemy" || g.kind === "wood" || plainYellow(g);

function upgrade(b: GraphBuilder, door: QuotaDoor): Tally | null {
  const options = b.nodes.filter((n) => n.parent !== null && !n.forks && routeAllows(b, n, door) &&
    (door === "heart" ? paidGate(n.gate) : plainYellow(n.gate)));
  if (!options.length) return null;
  options[Math.floor(b.rng() * options.length)].gate = { ...DOOR[door] };
  return hundredths(quotaDoorsIn(DOOR[door]));
}

/** A gate `door` may lengthen into a run: a single door of its own kind
 * alone (no other colour, no heart on a keyed door), shorter than three. */
export const runsWith = (g: Gate, door: QuotaDoor) => (g.kind === "door" || g.kind === "heart") && (g.run ?? 1) < 3 &&
  (door === "heart" ? g.kind === "heart" : g.kind === "door" && g.color === door && !g.also?.length && !g.heart);

/** A single blue, red or Heart Door becomes a run of two, or a run of two
 * one of three. */
function lengthenRun(b: GraphBuilder, door: QuotaDoor): Tally | null {
  const options = b.nodes.filter((n) => n.parent !== null && !n.forks && routeAllows(b, n, door) && runsWith(n.gate, door));
  if (!options.length) return null;
  const node = options[Math.floor(b.rng() * options.length)];
  node.gate = { ...node.gate, run: (node.gate as { run?: number }).run === 2 ? 3 : 2 } as Gate;
  return hundredths(quotaDoorsIn(DOOR[door]));
}

/** A door that doesn't take `door`'s colour yet takes it as well; for a
 * Heart Door, a door taking a blue or red key drains HP to 1 too. */
function combine(b: GraphBuilder, door: QuotaDoor): Tally | null {
  const fits = (g: Gate) => g.kind === "door" && (door === "heart"
    ? !g.heart && doorKeys(g).some((c) => c !== "yellow")
    : !doorKeys(g).includes(door));
  const options = b.nodes.filter((n) => n.parent !== null && !n.forks && routeAllows(b, n, door) && fits(n.gate));
  if (!options.length) return null;
  const node = options[Math.floor(b.rng() * options.length)];
  if (node.gate.kind !== "door") return null;
  node.gate = door === "heart" ? { ...node.gate, heart: true } : { ...node.gate, also: [...(node.gate.also ?? []), door] };
  return hundredths(quotaDoorsIn(DOOR[door]));
}

/** Makes some plain yellow doors off the way to the stairs yellow door
 * runs (`yellowRun`): a key sink, since the key supply plans one key for a
 * whole yellow run. Before the wooden share, which a run rolls once. */
export function placeYellowRuns(b: GraphBuilder) {
  for (const n of b.nodes) {
    if (n.parent === null || n.forks || n.route === "main" || !plainYellow(n.gate)) continue;
    const run = yellowRun(b.depth, b.rng);
    if (run) n.gate = { ...n.gate, run } as Gate;
  }
}

/** Turns `towerWoodPercent` of the floor's yellow locks into Wooden Doors:
 * region gates, fork lanes, shortcuts and the stairs guard's door, each
 * rolled on its own (no roll when all or none are). A fork lane offering a
 * Wooden Door of its own rolls too, so the share decides every one. */
export function placeWoodenDoors(b: GraphBuilder, shortcuts: StrategicGraph["shortcuts"], tower: number) {
  const share = towerWoodPercent(b.depth, tower);
  const wooden = () => share >= 100 || (share > 0 && b.rng() * 100 < share);
  // A yellow run rolls once, so its doors are all Wooden or all yellow.
  const yellowLock = (g: Gate) => g.kind === "wood" || (g.kind === "door" && g.color === "yellow" && !g.also?.length && !g.heart);
  const run = (g: Gate) => ("run" in g && g.run ? { run: g.run } : {});
  const wood = (g: Gate): Gate => (yellowLock(g) ? (wooden() ? { kind: "wood", ...run(g) } : { kind: "door", color: "yellow", ...run(g) }) : g);
  for (const n of b.nodes) {
    n.gate = wood(n.gate);
    for (const fork of n.forks ?? []) fork.lanes = fork.lanes.map((lane) => lane.map((step) => (step.kind === "reward" ? step : wood(step))));
    if (n.stairsGuard === "door" && wooden()) n.stairsGuard = "wood";
  }
  for (const s of shortcuts) s.gate = wood(s.gate);
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
  return hundredths(quotaDoorsIn(b.nodes.slice(before).map((n) => n.gate)));
}

function addFork(b: GraphBuilder, door: QuotaDoor, archetype: Archetype, left: Tally): Tally | null {
  const options = b.nodes.filter((n) => !n.forks && paidGate(n.gate) && mayFork(b, n) && routeAllows(b, n, door));
  if (!options.length) return null;
  const node = options[Math.floor(b.rng() * options.length)];
  const fits = forkFits(b, node), branch = node.route !== "main";
  // On a branch, off the way to the stairs, a fork may hold more quota
  // doors than the one it places, extra doors for a hero ready for them;
  // only the one counts, as the fallback gate leaves only it standing.
  const [fork] = forksWorth(stepValue(node.gate), b.depth, archetype, b.rng,
    (f: Fork) => fits(f) && (branch ? quotaDoorsIn(f.lanes)[door] > 0 : onlyOne(quotaDoorsIn(f.lanes), door)));
  if (!fork) return null;
  node.forks = [fork];
  // The embedder falls back to the single gate: the door itself.
  node.gate = { ...DOOR[door] };
  node.quotaFork = door;
  return hundredths(quotaDoorsIn(DOOR[door]));
}
