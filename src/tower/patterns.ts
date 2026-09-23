import type { KeyColor } from "../config.ts";
import type {
  Archetype,
  Footprint,
  Formation,
  Gate,
  GuardedReward,
  RegionPurpose,
  Reward,
  StrategicTag,
  Strength,
} from "./types.ts";

/** Declarative Magic-Tower micro-puzzles.
 *
 * Every pattern is a small strategic proposition — "pay this, see that" —
 * expressed as one or more regions. A single-step pattern is one side room
 * off a hub; a `chain` nests each step inside the previous one (enemy → key
 * → door → better key → …); `siblings` hang every step off the same hub so
 * the player compares two visible offers side by side. */

export type Weighted<T> = readonly { w: number; v: T }[];

export type PatternStep = {
  purpose: RegionPurpose;
  footprint: Footprint;
  formation?: Formation;
  gate: Weighted<Gate>;
  /** Open items behind the gate, one package picked by weight. */
  rewards?: Weighted<Reward[]>;
  /** Items in guarded niches inside the room. */
  guarded?: Weighted<GuardedReward[]>;
  /** Ring formation guard strength (first reward is the centrepiece). */
  ringGuard?: Strength;
};

export interface TowerPattern {
  id: string;
  weight: number;
  minimumDepth: number;
  maximumDepth?: number;
  /** Which main-route regions it may hang off. */
  attach: "start" | "main";
  layout: "single" | "chain" | "siblings";
  strategicTags: StrategicTag[];
  steps: PatternStep[];
}

// ---- small constructors so the table below reads like a design document --
const open: Gate = { kind: "open" };
const foe = (strength: Strength): Gate => ({ kind: "enemy", strength });
const door = (color: KeyColor): Gate => ({ kind: "door", color });
const key = (color: KeyColor): Reward => ({ kind: "key", color });
const Y = key("yellow"), B = key("blue"), R = key("red");
const P: Reward = { kind: "potion" };
const ATK: Reward = { kind: "attack" };
const DEF: Reward = { kind: "defense" };
const T: Reward = { kind: "treasure" };
function one<V>(v: V): Weighted<V> { return [{ w: 1, v }]; }
const times = (n: number, r: Reward) => Array.from({ length: n }, () => r);

export const TOWER_PATTERNS: TowerPattern[] = [
  // B. KEY BEHIND ENEMY — the bread-and-butter Magic Tower proposition.
  {
    id: "enemyGuardsKey", weight: 10, minimumDepth: 0, attach: "main", layout: "single",
    strategicTags: ["combatGate", "keyReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "keyRoom", footprint: "pocket", formation: "row",
      gate: [{ w: 4, v: foe("weak") }, { w: 1, v: foe("normal") }],
      rewards: [{ w: 5, v: [Y] }, { w: 2, v: [Y, P] }, { w: 1, v: [Y, Y] }],
    }],
  },
  // PATTERN 2 — ENEMY GUARDS POTION
  {
    id: "enemyGuardsPotion", weight: 7, minimumDepth: 0, attach: "main", layout: "single",
    strategicTags: ["combatGate", "branch", "optionalRoute"],
    steps: [{
      purpose: "potionRoom", footprint: "pocket", formation: "row",
      gate: [{ w: 3, v: foe("weak") }, { w: 2, v: foe("normal") }],
      rewards: [{ w: 3, v: [P] }, { w: 2, v: [P, P] }],
    }],
  },
  // E. STRONG ENEMY GUARDING BETTER KEY
  {
    id: "strongEnemyGuardsBlueKey", weight: 4, minimumDepth: 2, attach: "main", layout: "single",
    strategicTags: ["combatGate", "keyReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "keyRoom", footprint: "pocket", formation: "row",
      gate: one(foe("strong")),
      rewards: [{ w: 3, v: [B] }, { w: 1, v: [B, P] }],
    }],
  },
  // "That strong enemy protects a permanent attack upgrade."
  {
    id: "strongEnemyGuardsGem", weight: 4, minimumDepth: 0, attach: "main", layout: "single",
    strategicTags: ["combatGate", "statReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "statRoom", footprint: "pocket", formation: "row",
      gate: [{ w: 3, v: foe("strong") }, { w: 1, v: foe("normal") }],
      rewards: [{ w: 3, v: [ATK] }, { w: 2, v: [DEF] }, { w: 1, v: [ATK, DEF] }],
    }],
  },
  // PATTERN 3 — DOOR PROTECTS KEYS (pay one, get two or three).
  {
    id: "doorProtectsKeys", weight: 4, minimumDepth: 0, attach: "main", layout: "single",
    strategicTags: ["doorGate", "keyReward", "resourceExchange", "branch", "optionalRoute"],
    steps: [{
      purpose: "exchange", footprint: "pocket", formation: "row",
      gate: one(door("yellow")),
      rewards: [{ w: 3, v: [Y, Y] }, { w: 2, v: [Y, Y, Y] }],
    }],
  },
  // G / PATTERN 9 — LOCKED CACHE: door protects a resource package.
  {
    id: "lockedCache", weight: 6, minimumDepth: 0, attach: "main", layout: "single",
    strategicTags: ["doorGate", "keyReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "cache", footprint: "pocket", formation: "row",
      gate: one(door("yellow")),
      rewards: [{ w: 3, v: [P, Y] }, { w: 2, v: [P, P, Y] }, { w: 1, v: [T, P, Y] }, { w: 1, v: [ATK, P] }],
    }],
  },
  // PATTERN 4 / J / 12 — HIGHER DOOR → LOWER KEYS (key investment).
  {
    id: "blueDoorYellowKeys", weight: 4, minimumDepth: 2, attach: "main", layout: "single",
    strategicTags: ["doorGate", "keyReward", "resourceExchange", "branch", "optionalRoute"],
    steps: [{
      purpose: "exchange", footprint: "room", formation: "row",
      gate: one(door("blue")),
      rewards: [{ w: 3, v: times(3, Y) }, { w: 2, v: times(4, Y) }, { w: 1, v: [...times(4, Y), P, P] }],
    }],
  },
  {
    id: "redDoorBlueKeys", weight: 2.5, minimumDepth: 8, attach: "main", layout: "single",
    strategicTags: ["doorGate", "keyReward", "resourceExchange", "branch", "optionalRoute"],
    steps: [{
      purpose: "exchange", footprint: "room", formation: "row",
      gate: one(door("red")),
      rewards: [{ w: 2, v: [B, B, Y, Y] }, { w: 1, v: [B, B, B] }, { w: 1, v: [B, B, Y, Y, Y] }],
    }],
  },
  // G — BLUE DOOR → STAT PACKAGE
  {
    id: "blueDoorStatVault", weight: 2.5, minimumDepth: 3, attach: "main", layout: "single",
    strategicTags: ["doorGate", "statReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "majorReward", footprint: "room", formation: "row",
      gate: one(door("blue")),
      rewards: [{ w: 2, v: [ATK, DEF, Y] }, { w: 1, v: [ATK, DEF, Y, Y] }, { w: 1, v: [ATK, ATK, P] }],
    }],
  },
  // STAT ROOM: A   D / E   E — two gems, each behind its own guard.
  {
    id: "guardedStatRoom", weight: 4, minimumDepth: 1, attach: "main", layout: "single",
    strategicTags: ["combatGate", "statReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "statRoom", footprint: "room", formation: "row",
      gate: [{ w: 2, v: open }, { w: 1, v: foe("weak") }],
      guarded: [
        { w: 3, v: [{ reward: ATK, guard: "normal" }, { reward: DEF, guard: "normal" }] },
        { w: 1, v: [{ reward: ATK, guard: "strong" }, { reward: P, guard: "weak" }] },
      ],
    }],
  },
  // PATTERN 10 — TREASURE POCKET: several enemies surround one prize.
  {
    id: "treasurePocket", weight: 3, minimumDepth: 1, attach: "main", layout: "single",
    strategicTags: ["combatGate", "treasureRoom", "branch", "optionalRoute"],
    steps: [{
      purpose: "treasure", footprint: "room", formation: "ring",
      gate: [{ w: 2, v: open }, { w: 1, v: door("yellow") }],
      rewards: [{ w: 3, v: [T] }, { w: 1, v: [ATK] }, { w: 1, v: [T, P] }],
      ringGuard: "weak",
    }],
  },
  // PATTERN 14 — TEMPTATION: a valuable prize right next to the start,
  // behind an expensive door or a fight the player probably can't afford yet.
  {
    id: "temptation", weight: 2.5, minimumDepth: 1, attach: "start", layout: "single",
    strategicTags: ["statReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "temptation", footprint: "pocket", formation: "row",
      gate: [{ w: 2, v: foe("elite") }, { w: 2, v: door("blue") }, { w: 1, v: door("red") }],
      rewards: [{ w: 2, v: [ATK, DEF] }, { w: 1, v: [T, P, P] }, { w: 1, v: [ATK, ATK] }],
    }],
  },
  // F — OPEN KEY in a small open alcove.
  {
    id: "openAlcove", weight: 2, minimumDepth: 0, attach: "main", layout: "single",
    strategicTags: ["keyReward", "branch", "optionalRoute"],
    steps: [{
      purpose: "keyRoom", footprint: "pocket", formation: "row",
      gate: one(open),
      rewards: [{ w: 2, v: [Y] }, { w: 1, v: [Y, P] }],
    }],
  },
  // H / PATTERN 15 — MULTI-STAGE KEY CHAIN.
  {
    id: "keyChain", weight: 2.5, minimumDepth: 4, attach: "main", layout: "chain",
    strategicTags: ["combatGate", "doorGate", "keyReward", "branch", "optionalRoute"],
    steps: [
      { purpose: "keyRoom", footprint: "pocket", gate: one(foe("weak")), rewards: one([Y]) },
      {
        purpose: "keyRoom", footprint: "pocket", gate: one(door("yellow")),
        guarded: one([{ reward: B, guard: "normal" }]), rewards: [{ w: 1, v: [P] }, { w: 1, v: [] }],
      },
      {
        purpose: "majorReward", footprint: "pocket", gate: one(door("blue")),
        rewards: [{ w: 2, v: [T, ATK] }, { w: 1, v: [ATK, DEF, P] }],
      },
    ],
  },
  // PATTERN 13 — OPTIONAL DETOUR: enemy → potion → key.
  {
    id: "detour", weight: 3, minimumDepth: 0, attach: "main", layout: "chain",
    strategicTags: ["combatGate", "keyReward", "branch", "optionalRoute"],
    steps: [
      { purpose: "potionRoom", footprint: "pocket", gate: one(foe("normal")), rewards: one([P]) },
      { purpose: "keyRoom", footprint: "pocket", gate: one(foe("weak")), rewards: [{ w: 2, v: [Y] }, { w: 1, v: [Y, Y] }] },
    ],
  },
  // C + D — KEY BEHIND LOWER-TIER DOOR, then trade it for a pile of keys.
  {
    id: "blueKeyBehindYellowDoor", weight: 2, minimumDepth: 3, attach: "main", layout: "chain",
    strategicTags: ["doorGate", "keyReward", "resourceExchange", "branch", "optionalRoute"],
    steps: [
      { purpose: "keyRoom", footprint: "pocket", gate: one(door("yellow")), rewards: [{ w: 2, v: [B] }, { w: 1, v: [B, P] }] },
      { purpose: "exchange", footprint: "pocket", gate: one(door("blue")), rewards: [{ w: 1, v: times(3, Y) }, { w: 1, v: [Y, Y, Y, P] }] },
    ],
  },
  // PATTERN 6 — CHOICE ROOM: fight for ATK, or spend a key for potions.
  {
    id: "choice", weight: 3, minimumDepth: 0, attach: "main", layout: "siblings",
    strategicTags: ["combatGate", "doorGate", "statReward", "branch", "optionalRoute"],
    steps: [
      { purpose: "choice", footprint: "pocket", gate: one(foe("normal")), rewards: one([ATK]) },
      { purpose: "choice", footprint: "pocket", gate: one(door("yellow")), rewards: [{ w: 2, v: [P, P] }, { w: 1, v: [P, DEF] }] },
    ],
  },
  // PATTERN 7 — RISK/REWARD: cheap fight small prize, hard fight big prize.
  {
    id: "riskReward", weight: 3, minimumDepth: 0, attach: "main", layout: "siblings",
    strategicTags: ["combatGate", "branch", "optionalRoute"],
    steps: [
      { purpose: "potionRoom", footprint: "pocket", gate: one(foe("weak")), rewards: one([P]) },
      { purpose: "potionRoom", footprint: "pocket", gate: one(foe("strong")), rewards: [{ w: 2, v: [P, P, Y] }, { w: 1, v: [P, ATK] }] },
    ],
  },
  // PATTERN 8 — STAT CHOICE: ATK on one side, DEF on the other.
  {
    id: "statChoice", weight: 3, minimumDepth: 1, attach: "main", layout: "siblings",
    strategicTags: ["combatGate", "statReward", "branch", "optionalRoute"],
    steps: [
      { purpose: "statRoom", footprint: "pocket", gate: one(foe("normal")), rewards: one([ATK]) },
      { purpose: "statRoom", footprint: "pocket", gate: one(foe("normal")), rewards: one([DEF]) },
    ],
  },
  // "That route costs a key, while this route costs HP."
  {
    id: "keyFork", weight: 2, minimumDepth: 2, attach: "main", layout: "siblings",
    strategicTags: ["combatGate", "doorGate", "keyReward", "resourceExchange", "branch", "optionalRoute"],
    steps: [
      { purpose: "keyRoom", footprint: "pocket", gate: one(foe("strong")), rewards: one([B]) },
      { purpose: "exchange", footprint: "pocket", gate: one(door("yellow")), rewards: [{ w: 1, v: [Y, Y] }, { w: 1, v: [Y, Y, P] }] },
    ],
  },
];

/** Floor archetypes bias which patterns and main-route gates appear, so
 * consecutive floors feel different without any fixed layouts. */
export type ArchetypeProfile = {
  weight: (depth: number) => number;
  /** Multiplier per strategic tag applied to pattern weights. */
  tagBias: Partial<Record<StrategicTag, number>>;
  /** Main-route gate bias: >1 favours doors, <1 favours enemies. */
  doorBias: number;
  /** Extra main-route rooms (the "spine" towards the stairs). */
  mainRouteBonus: number;
  shortcutChance: number;
  extraBranches: number;
};

export const ARCHETYPES: Record<Archetype, ArchetypeProfile> = {
  mixed: { weight: () => 4, tagBias: {}, doorBias: 1, mainRouteBonus: 0, shortcutChance: 0.2, extraBranches: 0 },
  keyEconomy: {
    weight: (d) => (d >= 2 ? 2 : 0.8),
    tagBias: { resourceExchange: 2.2, keyReward: 1.5, doorGate: 1.6 },
    doorBias: 2, mainRouteBonus: 0, shortcutChance: 0.25, extraBranches: 0,
  },
  combatHeavy: {
    weight: () => 1.6,
    tagBias: { combatGate: 1.8, statReward: 1.6, doorGate: 0.6 },
    doorBias: 0.4, mainRouteBonus: 1, shortcutChance: 0.15, extraBranches: 0,
  },
  treasure: {
    weight: (d) => (d >= 1 ? 1.3 : 0),
    tagBias: { treasureRoom: 3, statReward: 1.3 },
    doorBias: 1, mainRouteBonus: 0, shortcutChance: 0.15, extraBranches: 0,
  },
  branching: {
    weight: () => 1.6,
    tagBias: { branch: 1.2 },
    doorBias: 1, mainRouteBonus: -1, shortcutChance: 0.1, extraBranches: 1,
  },
  riskyShortcut: {
    weight: (d) => (d >= 3 ? 1.2 : 0),
    tagBias: { combatGate: 1.3 },
    doorBias: 0.6, mainRouteBonus: 1, shortcutChance: 1, extraBranches: 0,
  },
};

export function pick<T>(options: Weighted<T>, rng: () => number): T {
  const total = options.reduce((s, o) => s + o.w, 0);
  let r = rng() * total;
  for (const o of options) if ((r -= o.w) < 0) return o.v;
  return options[options.length - 1].v;
}

export function patternWeight(p: TowerPattern, depth: number, archetype: Archetype) {
  if (depth < p.minimumDepth || (p.maximumDepth !== undefined && depth > p.maximumDepth)) return 0;
  const bias = ARCHETYPES[archetype].tagBias;
  let w = p.weight;
  for (const tag of p.strategicTags) w *= bias[tag] ?? 1;
  return w;
}
