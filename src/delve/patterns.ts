import type { Gate, Reward } from '../tower/types.ts';
import { pick } from '../tower/patterns.ts';

export type Pattern = { id: string; quality: 'good' | 'poor' | 'contextual'; gates: Gate[]; rewards: (Reward & { amount?: number })[] };
const enemy: Gate = { kind: 'enemy', strength: 'normal' };
const strong: Gate = { kind: 'enemy', strength: 'strong' };
const yellow: Gate = { kind: 'door', color: 'yellow' };
const blue: Gate = { kind: 'door', color: 'blue' };
const key: Reward = { kind: 'key', color: 'yellow' };
export const DELVE_PATTERNS: Pattern[] = [
  { id: 'EnemyGuardsKey', quality: 'good', gates: [enemy], rewards: [key, key] },
  { id: 'EnemyGuardsStat', quality: 'good', gates: [enemy], rewards: [{ kind: 'attack' }] },
  { id: 'DoorGuardsPackage', quality: 'good', gates: [yellow], rewards: [{ kind: 'key', color: 'blue' }, { kind: 'defense' }] },
  { id: 'TwoKeysForOne', quality: 'poor', gates: [yellow, yellow], rewards: [key] },
  { id: 'RareKeyCommonReward', quality: 'poor', gates: [blue], rewards: [key] },
  { id: 'StrongEnemyTinyPotion', quality: 'poor', gates: [strong], rewards: [{ kind: 'potion', amount: 10 }] },
  { id: 'DeadEndEnemyTax', quality: 'poor', gates: [enemy], rewards: [] },
  { id: 'LockedEmptyRoom', quality: 'poor', gates: [yellow], rewards: [] },
  { id: 'FalseAscendingDeadEnd', quality: 'poor', gates: [], rewards: [] },
  { id: 'LongDetourWeakReward', quality: 'poor', gates: [], rewards: [key] },
  { id: 'RareKeyCommonBundle', quality: 'contextual', gates: [blue], rewards: [key, key, key] },
  { id: 'PotionBranch', quality: 'contextual', gates: [yellow], rewards: [{ kind: 'potion', amount: 70 }] },
  { id: 'StrongEnemyPermanentStat', quality: 'contextual', gates: [strong], rewards: [{ kind: 'attack' }, { kind: 'defense' }] },
];
export function choosePattern(rng: () => number, area: number): Pattern {
  return pick(DELVE_PATTERNS.map(v => ({ v, w: v.quality === 'good' ? 3 : v.quality === 'poor' ? 0.7 + Math.min(1, area / 8) : 2 })), rng);
}
