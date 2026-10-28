import { researched } from "../progression/archives.ts";
import { trainedAmount } from "../progression/training.ts";
import type { Mode } from "../entities.ts";
import type { Save } from "../save/shape.ts";
import { wornEffects } from "../equipment/effects.ts";
import { snap } from "../exact.ts";
import { GOLD_BOOST_FACTOR, goldBoostFactor } from "./gold-boost.ts";
import { ENTITLEMENT_IDS, ENTITLEMENTS, owns, type EntitlementId } from "../shop/entitlements.ts";
import { TIER_BONUS_TENTHS } from "../tiers.ts";
import { themeGoldFactor } from "../theme-collection.ts";

/** One Gold multiplier: a factor on every Gold banked, its name as the
 * player sees it, and its factor, or null while it isn't applied (the
 * player sees "Inactive"). `id` names it for the code. */
export type GoldMultiplier = { id: "tower" | "ads" | EntitlementId | "themes" | "gear" | "boons" | "golden"; name: string; factor: number | null };

/** What the Gold multipliers read: the save, the mode whose hero's
 * equipment counts, the tier, the wall clock (ms, for the Gold ad's boost),
 * in a Tower run once Shrines are open, the run's Gold boons' factor
 * (`shrine`, 1 with none; undefined shows no Shrine Boons line), and, once
 * Golden Floors is owned, Golden Floor Multiplier's factor on the Gold
 * found (`golden`: 1 off a Golden Floor; undefined shows no Golden Floor
 * line). */
export type GoldContext = {
  save: Pick<Save, "goldBoostUntil" | "entitlements" | "themes" | "equipment">;
  mode: Mode;
  tier: number;
  now: number;
  shrine?: number;
  golden?: number;
};

/** Every Gold multiplier, in the order the All Gold Bonuses box lists
 * them: the tower's, the ads' one line (the Gold ad's boost while it runs,
 * else Ad-Disable), each Coin Pack (the Shop's `goldFactor`s), the themes
 * owned (each +2.5%), the mode's equipment's Gold found, the run's
 * Gold boons, and a Golden Floor's multiplier. Paying (`goldBanked`) and the box read this one list, so
 * what is shown is what is banked. */
export function goldMultipliers({ save, mode, tier, now, shrine, golden }: GoldContext): GoldMultiplier[] {
  const packs = ENTITLEMENT_IDS.filter((id) => id !== "adFree" && ENTITLEMENTS[id].goldFactor !== 1)
    .map((id): GoldMultiplier => ({ id, name: ENTITLEMENTS[id].name, factor: owns(save, id) ? ENTITLEMENTS[id].goldFactor : null }));
  // The ad's boost and Ad-Disable are one ×1.5 slot, temporary or for good:
  // only one counts at a time, the boost first.
  const ads: GoldMultiplier = goldBoostFactor(save, now) > 1 ? { id: "ads", name: "Ad Boost", factor: GOLD_BOOST_FACTOR }
    : { id: "ads", name: "Disable ads", factor: owns(save, "adFree") ? ENTITLEMENTS.adFree.goldFactor : null };
  const themes: GoldMultiplier = { id: "themes", name: `Themes owned (${save.themes.length})`, factor: save.themes.length ? themeGoldFactor(save) : null };
  const found = wornEffects(save, mode).goldFind;
  const gear: GoldMultiplier = { id: "gear", name: "Gold Found", factor: found ? (100 + found) / 100 : null };
  const boons: GoldMultiplier[] = shrine === undefined ? [] : [{ id: "boons", name: "Shrine Boons", factor: shrine === 1 ? null : shrine }];
  const floor: GoldMultiplier[] = golden === undefined ? [] : [{ id: "golden", name: "Golden Floor", factor: golden === 1 ? null : golden }];
  return [{ id: "tower", name: "Tower Multiplier", factor: TIER_BONUS_TENTHS[tier - 1]! / 10 }, ads, ...packs, themes, gear, ...boons, ...floor];
}

/** The multipliers applied, multiplied together (unrounded: `factorText`
 * rounds it for the player). */
export const goldMultiplierTotal = (multipliers: GoldMultiplier[]) => multipliers.reduce((f, m) => f * (m.factor ?? 1), 1);

/** What Gold `found` in a run (before any multiplier, the tower's too)
 * banks: `found` times every Gold multiplier, on the snap grid; and, while
 * the Gold ad's boost runs, what it would have banked without it
 * (`unboosted`, which the run's end shows), else null. */
export function goldBanked(found: number, context: GoldContext): { gold: number; unboosted: number | null } {
  const multipliers = goldMultipliers(context);
  const gold = snap(found * goldMultiplierTotal(multipliers));
  const boosted = goldBoostFactor(context.save, context.now) > 1;
  return { gold, unboosted: boosted ? snap(found * goldMultiplierTotal(multipliers.filter((m) => m.id !== "ads"))) : null };
}

/** A factor as the player sees it: "×1.5", "×9.3", "×1.025". */
export const factorText = (factor: number) => `×${Number(factor.toFixed(3))}`;

/** Silver found's multiplier on all Silver a run finds: Silver Bonus
 * training's `ranks` (counted once Wealthy is owned), times its research,
 * times the run's Silver Bonus boons (`boon`), raised by the Silver found
 * of the equipment `mode`'s hero wears. Paying (`RunPurse.silver`) and
 * the Training rows read it. */
export function silverFound(save: Pick<Save, "upgrades" | "archives" | "equipment">, mode: Mode, ranks: number, boon = 1) {
  const bonus = trainedAmount(save, "silverBonus", ranks);
  return (((bonus * researched(save.archives, "silverBonus")) / 10_000) * boon * (100 + wornEffects(save, mode).silverFind)) / 100;
}
