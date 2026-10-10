import type { Save } from "./entities.ts";
import { snap } from "./exact.ts";
import { GOLD_BOOST_FACTOR, goldBoostFactor } from "./gold-boost.ts";
import { ENTITLEMENT_IDS, ENTITLEMENTS, owns } from "./shop/entitlements.ts";
import { TIER_BONUS_TENTHS } from "./tiers.ts";

/** One multiplier on all Gold banked: its name and factor, or a null factor
 * while it isn't applied (the player sees "Inactive"). */
export type GoldBonus = { name: string; factor: number | null };

/** Every Gold bonus there is, in the order the breakdown lists them: the
 * tower's, the ads' one line (the Gold ad's boost while it runs, else
 * Ad-Disable), then each Coin Pack (the Shop's `goldFactor`s). */
export function goldBonuses(save: Pick<Save, "goldBoostUntil" | "entitlements">, tier: number, now: number): GoldBonus[] {
  const packs = ENTITLEMENT_IDS.filter((id) => id !== "adFree" && ENTITLEMENTS[id].goldFactor !== 1)
    .map((id) => ({ name: ENTITLEMENTS[id].name, factor: owns(save, id) ? ENTITLEMENTS[id].goldFactor : null }));
  // The ad's boost and Ad-Disable are one ×1.5 slot, temporary or for good:
  // only one counts at a time, the boost first.
  const boosted = goldBoostFactor(save, now) > 1;
  const ads = boosted ? { name: "Ad Boost", factor: GOLD_BOOST_FACTOR }
    : { name: "Disable ads", factor: owns(save, "adFree") ? ENTITLEMENTS.adFree.goldFactor : null };
  return [{ name: "Tower Multiplier", factor: TIER_BONUS_TENTHS[tier - 1]! / 10 }, ads, ...packs];
}

/** All the bonuses applied, multiplied together. */
export const goldBonusTotal = (bonuses: GoldBonus[]) => snap(bonuses.reduce((f, b) => f * (b.factor ?? 1), 1));

/** A factor as the player sees it: "×1.5", "×9.3". */
export const factorText = (factor: number) => `×${Number(factor.toFixed(2))}`;
