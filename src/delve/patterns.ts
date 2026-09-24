import type { Gate, Reward } from '../tower/types.ts';
import { pick } from '../tower/patterns.ts';

/** Strategic situations placed on labyrinth pockets. Quality is the
 * generator's own label for tuning/diagnostics only; Automove never reads
 * it and must infer value from what it can observe on the board. */
export type Pattern = { id: string; quality: 'good' | 'poor' | 'contextual'; gates: Gate[]; rewards: (Reward & { amount?: number })[]; minBranch?: number };
const enemy: Gate = { kind: 'enemy', strength: 'normal' };
const strong: Gate = { kind: 'enemy', strength: 'strong' };
const yellow: Gate = { kind: 'door', color: 'yellow' };
const blue: Gate = { kind: 'door', color: 'blue' };
const key: Reward = { kind: 'key', color: 'yellow' };
export const DELVE_PATTERNS: Pattern[] = [
  // Good: Tower's resource grammar, embedded in side pockets.
  { id: 'EnemyGuardsKey', quality: 'good', gates: [enemy], rewards: [key, key] },
  { id: 'EnemyGuardsStat', quality: 'good', gates: [enemy], rewards: [{ kind: 'attack' }] },
  { id: 'DoorGuardsPackage', quality: 'good', gates: [yellow], rewards: [{ kind: 'key', color: 'blue' }, { kind: 'defense' }] },
  { id: 'PotionAfterCombat', quality: 'good', gates: [enemy], rewards: [{ kind: 'potion', amount: 60 }, key] },
  { id: 'DeepDetourCache', quality: 'good', gates: [], rewards: [{ kind: 'attack' }, { kind: 'defense' }], minBranch: 3 },
  // Poor: intentional traps a naive evaluator walks into.
  { id: 'TwoKeysForOne', quality: 'poor', gates: [yellow, yellow], rewards: [key] },
  { id: 'RareKeyCommonReward', quality: 'poor', gates: [blue], rewards: [key] },
  { id: 'StrongEnemyTinyPotion', quality: 'poor', gates: [strong], rewards: [{ kind: 'potion', amount: 10 }] },
  { id: 'DeadEndEnemyTax', quality: 'poor', gates: [enemy], rewards: [] },
  { id: 'LockedEmptyRoom', quality: 'poor', gates: [yellow], rewards: [] },
  { id: 'EmptyDeadEnd', quality: 'poor', gates: [], rewards: [] },
  { id: 'LongDetourWeakReward', quality: 'poor', gates: [], rewards: [{ kind: 'potion', amount: 10 }], minBranch: 3 },
  { id: 'OverpricedTreasureRoom', quality: 'poor', gates: [enemy, yellow], rewards: [{ kind: 'treasure' }] },
  // Contextual: value depends on HP, inventory and what lies ahead.
  { id: 'RareKeyCommonBundle', quality: 'contextual', gates: [blue], rewards: [key, key, key] },
  { id: 'PotionBranch', quality: 'contextual', gates: [yellow], rewards: [{ kind: 'potion', amount: 70 }] },
  { id: 'StrongEnemyPermanentStat', quality: 'contextual', gates: [strong], rewards: [{ kind: 'attack' }, { kind: 'defense' }] },
  { id: 'LongDetourUnknownReward', quality: 'contextual', gates: [enemy], rewards: [{ kind: 'key', color: 'blue' }], minBranch: 3 },
];
/** Placed on the top of the old area's tongue, which always climbs above
 * the next milestone gate and always dead-ends. */
export const FALSE_ASCENTS: Pattern[] = [
  { id: 'FalseAscendingDeadEnd', quality: 'poor', gates: [enemy], rewards: [] },
  { id: 'FalseAscendingMinorReward', quality: 'poor', gates: [enemy], rewards: [{ kind: 'potion', amount: 20 }] },
];
/** Trap frequency rises with depth; long detours only go on long branches. */
export function choosePattern(rng: () => number, area: number, branch = 1, maxGates = Infinity): Pattern {
  const options = DELVE_PATTERNS.filter(p => (p.minBranch ?? 0) <= branch && p.gates.length <= maxGates);
  return pick(options.map(v => ({ v, w: v.quality === 'good' ? 3 : v.quality === 'poor' ? 0.7 + Math.min(1, area / 8) : 2 })), rng);
}
