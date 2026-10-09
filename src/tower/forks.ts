import type { KeyColor } from "../config.ts";
import type { TowerEnemyProfile } from "../scaling.ts";
import { ARCHETYPES, keyedFloor, pick, type Weighted } from "./patterns.ts";
import type { GraphBuilder } from "./strategic-graph.ts";
import type { Archetype, Fork, Gate, Lane, LaneStep, Reward, StrategicNode, StrategicTag, Strength } from "./types.ts";
import { YELLOW_ONLY, doorKeys, onlyOpenKeys, withoutQuotaDoors } from "../key-schedule.ts";

/** Forks: two or three parallel lanes from one region into the next, each
 * paying a different resource, so entering asks *what* to spend.
 *
 *   hub ─┬─ [yellow door] ──────────┬─ room
 *        └─ [strong enemy] ─────────┘
 *
 * Every lane is priced on one scale (`GATE_VALUE`, roughly "yellow keys"),
 * the lanes of a fork cost about the same, and none is cheaper than
 * another in every way. The exception is a fallback fork: a door beside a
 * door of the next rarity up, for a player without the cheaper key. A lane can be one to three tiles deep; deeper
 * lanes need room the embedder carves from one of the two chambers. */

/** What paying each gate or taking each item is worth, in yellow keys. A
 * blue key is worth two yellow, a red about two and a half blue. */
export const GATE_VALUE = {
  door: { yellow: 1, blue: 2, red: 5 } as Record<KeyColor, number>,
  wood: 1,
  heart: 1,
  enemy: { weak: 0.75, normal: 1.5, strong: 2.5, elite: 4, boss: 6 } as Record<Strength, number>,
  reward: { potion: 1, attack: 2, defense: 2, treasure: 1 },
};

export const FORK_TUNING = {
  /** Chance each eligible edge gets a fork, rising with depth. */
  chance: (depth: number) => Math.min(0.6, 0.35 + depth * 0.005),
  maxPerFloor: 3,
  /** A fork may replace a gate whose value is within this factor of its own. */
  valueBand: 1.8,
  /** Forks to try for one edge (the chosen one, then fallbacks). */
  fallbacks: 4,
};

export function stepValue(step: LaneStep): number {
  switch (step.kind) {
    case "open": return 0;
    case "door": return doorKeys(step).reduce((s, c) => s + GATE_VALUE.door[c], 0) + (step.heart ? GATE_VALUE.heart : 0);
    case "wood": return GATE_VALUE.wood;
    case "heart": return GATE_VALUE.heart;
    case "potion": return -GATE_VALUE.reward.potion;
    case "enemy": return GATE_VALUE.enemy[step.strength];
    case "reward": return -rewardValue(step.reward);
  }
}

function rewardValue(r: Reward) {
  return r.kind === "key" ? GATE_VALUE.door[r.color] : GATE_VALUE.reward[r.kind];
}

/** What walking a lane costs overall. Items inside it pay some back. */
export const laneValue = (lane: Lane) => lane.reduce((s, step) => s + stepValue(step), 0);

type Keys = Record<KeyColor, number>;
const noKeys = (): Keys => ({ yellow: 0, blue: 0, red: 0 });

/** The keys a lane needs held on the way in (the deepest it runs short at
 * any point, since a key found inside pays only for doors after it) and
 * what it costs overall. A wooden lock is counted as the yellow key it eats
 * first. */
export function laneKeys(lane: Lane): { upfront: Keys; net: Keys } {
  const held = noKeys(), upfront = noKeys();
  for (const step of lane) {
    const color = step.kind === "door" ? step.color : step.kind === "wood" ? "yellow" : null;
    if (color) upfront[color] = Math.max(upfront[color], -(--held[color]));
    if (step.kind === "reward" && step.reward.kind === "key") held[step.reward.color]++;
  }
  const net = noKeys();
  for (const c of Object.keys(held) as KeyColor[]) net[c] = 0 - held[c];
  return { upfront, net };
}

/** The resources a lane spends, so the planner can tell lanes apart: keys
 * by colour, a fight against a profile, or HP (a Heart Door). */
export function laneSpends(lane: Lane): Set<string> {
  const out = new Set<string>();
  for (const step of lane) {
    if (step.kind === "door") out.add(`key:${step.color}`);
    if (step.kind === "wood") out.add("key:any");
    if (step.kind === "heart") out.add("fullHp");
    if (step.kind === "enemy") out.add(`fight:${step.profile ?? "any"}`);
  }
  return out;
}

/** The keys entering through a fork asks the player to hold: none when a
 * lane needs no key, else the cheapest keyed lane's up-front keys. */
export function forkKeyDemand(fork: Fork): KeyColor[] {
  const keyed = fork.lanes.map((lane) => ({ lane, need: laneKeys(lane).upfront }));
  const total = (k: Keys) => k.yellow + k.blue + k.red;
  if (keyed.some(({ need }) => total(need) === 0)) return [];
  const cheapest = keyed.sort((a, b) => laneValue(a.lane) - laneValue(b.lane))[0].need;
  return (["red", "blue", "yellow"] as KeyColor[]).flatMap((c) => Array.from({ length: cheapest[c] }, () => c));
}

// ---------------------------------------------------------------- patterns

export type ForkPattern = {
  id: string;
  weight: number;
  minimumDepth: number;
  tags: StrategicTag[];
  /** One weighted choice per lane. */
  lanes: Weighted<Lane>[];
  /** A door with a dearer door beside it for a player who lacks the
   * cheaper key: priced by its cheapest lane, not by all of them. */
  fallback?: boolean;
  /** Only the Tower builds it (the Delve keeps its forks until it adopts
   * the Tower's door schedule). */
  towerOnly?: true;
};

const Y: Gate = { kind: "door", color: "yellow" };
const B: Gate = { kind: "door", color: "blue" };
const R: Gate = { kind: "door", color: "red" };
const WOOD: Gate = { kind: "wood" };
const HEART: Gate = { kind: "heart" };
const foe = (strength: Strength, profile?: TowerEnemyProfile): Gate => ({ kind: "enemy", strength, profile });
const item = (reward: Reward): LaneStep => ({ kind: "reward", reward });
const T = item({ kind: "treasure" });
const P = item({ kind: "potion" });
const yKey = item({ kind: "key", color: "yellow" });
function one(lane: Lane): Weighted<Lane> { return [{ w: 1, v: lane }]; }

export const FORK_PATTERNS: ForkPattern[] = [
  // A fight against one build's weakness or the other's.
  {
    id: "monsterTypes", weight: 4, minimumDepth: 0, tags: ["combatGate"],
    lanes: [one([foe("normal", "attackHeavy")]), one([foe("normal", "defenseHeavy")])],
  },
  {
    id: "strongMonsterTypes", weight: 2, minimumDepth: 3, tags: ["combatGate"],
    lanes: [one([foe("strong", "attackHeavy")]), one([foe("strong", "defenseHeavy")])],
  },
  // A key, or wait until HP is full.
  {
    id: "doorTypes", weight: 2, minimumDepth: 2, tags: ["doorGate"],
    lanes: [[{ w: 2, v: [Y] }, { w: 1, v: [WOOD] }], one([HEART])],
  },
  // Keys or HP, at about the same price.
  {
    id: "doorOrMonster", weight: 5, minimumDepth: 0, tags: ["doorGate", "combatGate"],
    lanes: [one([Y]), [{ w: 2, v: [foe("normal")] }, { w: 1, v: [foe("weak")] }]],
  },
  {
    id: "blueDoorOrStrongMonster", weight: 2, minimumDepth: 3, tags: ["doorGate", "combatGate"],
    lanes: [one([B]), one([foe("strong")])],
  },
  {
    id: "doorAndWeakOrStrong", weight: 3, minimumDepth: 1, tags: ["doorGate", "combatGate"],
    lanes: [one([Y, foe("weak")]), one([foe("strong")])],
  },
  // One key, or two keys with a treasure between them.
  {
    id: "doorOrTreasureDoors", weight: 3, minimumDepth: 0, tags: ["doorGate", "treasureRoom"],
    lanes: [[{ w: 3, v: [Y] }, { w: 1, v: [foe("normal")] }], one([Y, T, Y])],
  },
  {
    id: "twoDoorsOrTwoMonsters", weight: 3, minimumDepth: 1, tags: ["doorGate", "combatGate"],
    lanes: [one([Y, Y]), [{ w: 2, v: [foe("weak"), foe("weak")] }, { w: 1, v: [foe("normal", "attackHeavy"), foe("weak")] }]],
  },
  {
    id: "twoDoorsOrStrongMonster", weight: 3, minimumDepth: 2, tags: ["doorGate", "combatGate"],
    lanes: [one([Y, Y]), one([foe("strong")])],
  },
  {
    id: "twoLowerDoorsOrHigherDoor", weight: 2, minimumDepth: 3, tags: ["doorGate", "resourceExchange"],
    lanes: [one([Y, Y]), one([B])],
  },
  {
    id: "twoBlueDoorsOrRedDoor", weight: 1, minimumDepth: 10, tags: ["doorGate", "resourceExchange"],
    lanes: [one([B, B]), one([R])],
  },
  // A fight that heals you after, or a key.
  {
    id: "fightThenHeal", weight: 2, minimumDepth: 2, tags: ["combatGate"],
    lanes: [one([foe("strong"), P]), one([Y])],
  },
  // Pay a blue key and get a yellow back on the way through.
  {
    id: "blueForYellow", weight: 1.5, minimumDepth: 3, tags: ["doorGate", "resourceExchange"],
    lanes: [one([B, yKey]), one([foe("normal")])],
  },
  // The same door, or a dearer one for a player without that key.
  {
    id: "yellowOrBlueDoor", weight: 2, minimumDepth: 3, tags: ["doorGate"], fallback: true,
    lanes: [one([Y]), one([B])],
  },
  {
    id: "blueOrRedDoor", weight: 1, minimumDepth: 10, tags: ["doorGate"], fallback: true,
    lanes: [one([B]), one([R])],
  },
  // Three ways in.
  {
    id: "doorOrEitherMonster", weight: 3, minimumDepth: 1, tags: ["doorGate", "combatGate"],
    lanes: [one([Y]), one([foe("normal", "attackHeavy")]), one([foe("normal", "defenseHeavy")])],
  },
  {
    id: "doorMonsterOrHeart", weight: 2, minimumDepth: 2, tags: ["doorGate", "combatGate"],
    lanes: [one([Y]), one([foe("normal")]), one([HEART])],
  },
  {
    id: "keysBlueOrStrong", weight: 2, minimumDepth: 3, tags: ["doorGate", "combatGate", "resourceExchange"],
    lanes: [one([Y, Y]), one([B]), one([foe("strong")])],
  },
  // A red key, or the hardest fight on the floor.
  {
    id: "redDoorOrElite", weight: 1.5, minimumDepth: 10, tags: ["doorGate", "combatGate"], towerOnly: true,
    lanes: [one([R]), one([foe("elite")])],
  },
];

/** The deepest lane decides how deep a fork's crossing must be. */
export const forkDepth = (fork: Fork) => Math.max(...fork.lanes.map((l) => l.length));

const FALLBACKS = new Set(FORK_PATTERNS.filter((p) => p.fallback).map((p) => p.id));
/** What a fork costs to go through: its lanes' average, or a fallback
 * fork's cheapest lane. */
export function forkValue(fork: Fork) {
  const values = fork.lanes.map(laneValue);
  return FALLBACKS.has(fork.patternId) ? Math.min(...values) : values.reduce((s, v) => s + v, 0) / values.length;
}

function forkWeight(p: ForkPattern, depth: number, archetype: Archetype) {
  if (depth < p.minimumDepth) return 0;
  const bias = ARCHETYPES[archetype].tagBias;
  return p.tags.reduce((w, tag) => w * (bias[tag] ?? 1), p.weight);
}

function build(p: ForkPattern, rng: () => number): Fork {
  return { patternId: p.id, lanes: p.lanes.map((options) => structuredClone(pick(options, rng))) };
}

/** Whether entering this region is worth paying for: the main route leads
 * on to the stairs, and a branch must hold something. */
function worthReaching(nodes: StrategicNode[], id: number): boolean {
  const n = nodes[id];
  if (n.route === "main") return true;
  const holds = n.rewards.length + n.guarded.length > 0 || !!n.ringGuard;
  return holds || n.children.some((c) => worthReaching(nodes, c));
}

/** Rolls forks for the floor's gated edges: a pattern priced near the gate
 * it replaces, plus fallbacks the embedder tries (shallower and narrower
 * first) before it settles for the single gate. */
export function planForks(b: GraphBuilder, archetype: Archetype) {
  const { depth, rng } = b;
  let placed = 0;
  for (const node of b.nodes) {
    if (placed >= FORK_TUNING.maxPerFloor) break;
    if (!mayFork(b, node) || rng() >= FORK_TUNING.chance(depth)) continue;
    const fits = forkFits(b, node);
    const forks = forksWorth(stepValue(node.gate), depth, archetype, rng, (f) => fits(f) && withoutQuotaDoors(f));
    if (!forks.length) continue;
    node.forks = forks;
    placed++;
  }
}

/** Whether crossing `gate` costs anything: an open doorway or a potion in
 * it costs nothing, so there's no cost for a fork to offer a choice of. */
const paid = (gate: Gate) => gate.kind !== "open" && gate.kind !== "potion";

/** Whether `node`'s gate may become a fork: a gate into a region worth
 * reaching. Floors 2 to 5 lay a key behind every door, planned from its
 * gate: a fork there never replaces a lock (the embedder may fall back to
 * it). */
export function mayFork(b: GraphBuilder, node: StrategicNode) {
  if (node.parent === null || !paid(node.gate) || !worthReaching(b.nodes, node.id)) return false;
  return !keyedFloor(b.depth) || !isLock(node.gate);
}

/** The forks `node` may take: only keys open on this floor, no lock on
 * floors 2 to 5, and in the first tower a lane past blue and red on the main
 * route. Ordinary fork planning also leaves out every fork holding a quota
 * door, which only the door stage places (door-quota.ts). */
export function forkFits(b: GraphBuilder, node: StrategicNode) {
  const colors = b.colors, keyed = keyedFloor(b.depth), bypass = b.bypass && node.route === "main";
  return (f: Fork) => onlyOpenKeys(f, colors) && (!keyed || withoutLocks(f)) && (!bypass || bypassesRareKeys(f));
}

/** A door that takes keys. */
const isLock = (s: { kind: string }) => s.kind === "door" || s.kind === "wood";

/** Whether some lane of the fork needs no blue or red key, so a hero
 * without one still gets through. */
const bypassesRareKeys = (f: Fork) => f.lanes.some((lane) => onlyOpenKeys(lane, YELLOW_ONLY));

/** A fork with no lane through a door that takes keys. */
const withoutLocks = (f: Fork) => !f.lanes.some((lane) => lane.some(isLock));

/** Forks priced near `v` for a floor `depth` deep (Delve passes its
 * equivalent floor), best first, the rest shallower and narrower first.
 * `fits` limits them to what the caller has room for and allows there,
 * Heart Doors included. */
export function forksWorth(v: number, depth: number, archetype: Archetype, rng: () => number, fits: (f: Fork) => boolean = () => true, tower = true): Fork[] {
  let options = FORK_PATTERNS.filter((p) => tower || !p.towerOnly).map((p) => ({ p, w: forkWeight(p, depth, archetype) }))
    .filter(({ w }) => w > 0)
    .map(({ p, w }) => ({ w, v: build(p, rng) }))
    .filter(({ v: fork }) => fits(fork) && forkValue(fork) <= v * FORK_TUNING.valueBand && forkValue(fork) * FORK_TUNING.valueBand >= v);
  const chosen: Fork[] = [];
  while (options.length && chosen.length < FORK_TUNING.fallbacks) {
    const fork = pick(options, rng);
    chosen.push(fork);
    options = options.filter((o) => o.v !== fork);
  }
  const [first, ...rest] = chosen;
  const footprint = (f: Fork) => forkDepth(f) * 10 + f.lanes.length;
  return first ? [first, ...rest.sort((a, b) => footprint(a) - footprint(b))] : [];
}
