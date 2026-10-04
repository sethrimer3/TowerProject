/** The numbered towers (and delves) a run can climb: beating the boss on
 * floor 100 of one opens the next, up to `TIERS`. Each tier's enemies have
 * `TIER_STAT_FACTOR` times the stats of the tier below, so a hero needs
 * about that many times its ATK, DEF and HP to go as far; each pays more
 * Gold (`tierGold`), and XP by the same factor as the stats (`tierXp`);
 * Silver stays the same. The layouts are
 * the same in every tier: only the enemies differ. */
import type { Enemy, ModeSave, Save, Tile } from "./entities.ts";
import { intPow, snap } from "./exact.ts";

export const TIERS = 9;
export const TIER_STAT_FACTOR = 3;
/** The equivalent floor (0 is the first) whose boss opens the next tier. */
export const TIER_BOSS_FLOOR = 99;

/** How many times tier 1's stats an enemy of `tier` has: 1, 3, 9, … */
export const tierStats = (tier: number) => intPow(TIER_STAT_FACTOR, tier - 1);

/** Each tier's Gold bonus in tenths: ×1, then each tier adds one
 * more than the last added, plus a tenth more every tier after the second
 * (×2, ×3.1, ×4.3, ×5.6, … ×11.8). */
export const TIER_BONUS_TENTHS: readonly number[] = Array.from({ length: TIERS }, (_, i) => 10 + 10 * i + (i * (i - 1)) / 2);

/** `amount` of XP paid in `tier`: times its enemies' stat factor (×3 in
 * tier 2, ×9 in tier 3, …), so the hero levels as much faster as they
 * are stronger. */
export const tierXp = (tier: number, amount: number) => amount * tierStats(tier);
/** `amount` of Gold paid in `tier`, its fraction kept (1 Gold is 3.1 in
 * tier 3). */
export const tierGold = (tier: number, amount: number) => snap((amount * TIER_BONUS_TENTHS[tier - 1]!) / 10);

/** The Gold bonus as the player sees it: "×3.1". */
export const tierBonusText = (tier: number) => `×${TIER_BONUS_TENTHS[tier - 1]! / 10}`;
/** Both bonuses as the player sees them: "×3.1 Gold · ×9 XP". */
export const tierRewardText = (tier: number) => `${tierBonusText(tier)} Gold · ×${tierStats(tier)} XP`;

/** A tier's number as the tower shows it: I, II, … IX. */
export const tierNumeral = (tier: number) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"][tier - 1]!;

/** How many times tier 1's ATK or DEF a shard in `tier` raises: ×2.75
 * compounding each tier (1, 2.75, 7.5625, …), its fraction kept. */
export const tierShard = (tier: number) => snap(intPow(11, tier - 1) / intPow(4, tier - 1));

/** `tile` as it stands in `tier`: an enemy with its stats multiplied, or
 * an ATK or DEF shard raising its stat by `tierShard`. */
export function tierTile(tile: Tile, tier: number): Tile {
  if (tier <= 1) return tile;
  if (tile.kind === "attack" || tile.kind === "defense") return { ...tile, amount: tierShard(tier) };
  if (tile.kind !== "enemy" || !tile.enemy) return tile;
  const f = tierStats(tier), e: Enemy = tile.enemy;
  return { ...tile, enemy: { ...e, hp: e.hp * f, attack: e.attack * f, defense: e.defense * f } };
}

/** Every tile of `cells` as it stands in `tier` (the same map in tier 1). */
export function tierCells(cells: Map<string, Tile>, tier: number) {
  if (tier <= 1) return cells;
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) out.set(k, tierTile(t, tier));
  return out;
}

/** What a mode keeps for each tier on its own: its records. The selected
 * tier's live in the mode's save slice; the others wait in `tierRecords`. */
export type TierRecord = {
  best: number;
  reached: number;
};

/** The selected tier's records, taken out of the slice. */
function recordOf({ best, reached }: ModeSave): TierRecord {
  return { best, reached };
}

/** Moves the slice's records aside and brings `tier`'s in (fresh ones for
 * a tier never climbed). The caller starts a new run for it. */
export function switchTier(slice: ModeSave, tier: number) {
  slice.tierRecords[slice.tier] = recordOf(slice);
  const next = slice.tierRecords[tier] ?? { best: 0, reached: 0 };
  delete slice.tierRecords[tier];
  slice.best = next.best;
  slice.reached = next.reached;
  slice.tier = tier;
}
