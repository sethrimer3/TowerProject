import { giftAmount } from "./gift-effects.ts";
import { championValue, isChampion } from "../shop/champion.ts";
import { researched } from "../progression/archives.ts";
import { trainedAmount } from "../progression/training.ts";
import type { Mode } from "../entities.ts";
import type { Save } from "../save/shape.ts";
import { wornEffects } from "../equipment/effects.ts";
import { snap } from "../exact.ts";
import { GOLD_BOOST_FACTOR, goldBoostFactor } from "./gold-boost.ts";
import { LEVEL_BOOST_FACTOR } from "./level-boost.ts";
import { ENTITLEMENT_IDS, ENTITLEMENTS, owns, type EntitlementId } from "../shop/entitlements.ts";
import { TIER_BONUS_TENTHS } from "../tiers.ts";
import { adGoldFactor } from "../ads/series.ts";
import { collectionGoldFactor } from "../theme-collection.ts";
import { relicAmount, relicFactor } from "./relic-effects.ts";
import { boostFactor } from "../boosts/boosts.ts";

/** One Gold multiplier: a factor on every Gold banked, its name as the
 * player sees it, and its factor, or null while it isn't applied (the
 * player sees "Inactive"). `id` names it for the code. */
export type GoldMultiplier = { id: "tower" | "ads" | "adPrize" | "levelUp" | "scarab" | EntitlementId | "champion" | "collection" | "relics" | "gifts" | "gear" | "jackpot" | "boons" | "golden" | "stellar"; name: string; factor: number | null };

/** What the Gold multipliers read: the save, the mode whose hero's
 * equipment counts, the tier, the wall clock (ms, for the Gold ad's boost),
 * in a Tower run once Shrines are open, the run's Gold boons' factor
 * (`shrine`, 1 with none; undefined shows no Shrine Boons line), once
 * Golden Floors or Aurum Bloom is owned, Golden Floor Multiplier's factor on
 * the Gold found (`golden`: 1 off a Golden Floor; undefined shows no Golden
 * Floor line), and with Aurum Bloom, a Stellar Floor's (`stellar`, the same). */
export type GoldContext = {
  save: Pick<Save, "goldBoostUntil" | "ads" | "entitlements" | "themes" | "music" | "equipment" | "relics" | "gifts" | "vip"> & Partial<Pick<Save, "boosts" | "archives">>;
  mode: Mode;
  tier: number;
  now: number;
  shrine?: number;
  golden?: number;
  stellar?: number;
  /** When the run's Level-up Boost ends (wall clock ms); none, or past, shows no line. */
  levelBoostUntil?: number;
  /** Jackpot Spurs' factor on the Gold found (equipment/powers.ts), while worn; none shows no line. */
  jackpot?: number;
};

/** Every Gold multiplier, in the order the All Gold Bonuses box lists
 * them: the tower's, the ads' one line (the Gold ad's boost while it runs,
 * else Ad-Disable), the ad series' Gold prize while it runs (its own
 * factor, kept when a permanent offer is bought), the run's Level-up Boost while it lasts, a Golden Scarab's Gold boost while it runs, each Gold bundle (the Shop's `goldFactor`s), the Event
 * Collection (the themes and bonus tracks owned), the relics' Gold Bonus (their percents
 * added), the mode's equipment's Gold found, the run's
 * Gold boons, a Golden Floor's multiplier and a Stellar Floor's. Paying (`goldBanked`) and the box read this one list, so
 * what is shown is what is banked. */
export function goldMultipliers({ save, mode, tier, now, shrine, golden, stellar, jackpot, levelBoostUntil }: GoldContext): GoldMultiplier[] {
  const packs = ENTITLEMENT_IDS.filter((id) => id !== "adFree" && ENTITLEMENTS[id].goldFactor !== 1)
    .map((id): GoldMultiplier => ({ id, name: ENTITLEMENTS[id].name, factor: owns(save, id) ? ENTITLEMENTS[id].goldFactor : null }));
  // The ad's boost and Ad-Disable are one ×1.5 slot, temporary or for good:
  // only one counts at a time, the boost first.
  const ads: GoldMultiplier = goldBoostFactor(save, now) > 1 ? { id: "ads", name: "Ad Boost", factor: GOLD_BOOST_FACTOR }
    : { id: "ads", name: "Disable ads", factor: owns(save, "adFree") ? ENTITLEMENTS.adFree.goldFactor : null };
  const prize = adGoldFactor(save.ads.gold, now);
  const adPrize: GoldMultiplier[] = prize > 1 ? [{ id: "adPrize", name: "Ad Reward", factor: prize }] : [];
  // A level reached inside the run, listed only while its boost lasts.
  const levelUp: GoldMultiplier[] = levelBoostUntil !== undefined && now < levelBoostUntil ? [{ id: "levelUp", name: "Level-up Boost", factor: LEVEL_BOOST_FACTOR }] : [];
  // A Golden Scarab's Gold boost, listed only while it runs: a factor of its
  // own, so it multiplies the Level-up Boost too.
  const scarabFactor = save.boosts && save.archives ? boostFactor({ boosts: save.boosts, archives: save.archives }, "gold", now) : 1;
  const scarab: GoldMultiplier[] = scarabFactor > 1 ? [{ id: "scarab", name: "Golden Scarab", factor: scarabFactor }] : [];
  // Champion Status's Club tier, listed only for a Champion.
  const club = championValue(save, "gold");
  const champion: GoldMultiplier[] = isChampion(save) ? [{ id: "champion", name: "Champion's Club", factor: club ? (100 + club) / 100 : null }] : [];
  const owned = save.themes.length + save.music.length;
  const collection: GoldMultiplier = { id: "collection", name: "Event Collection", factor: owned ? collectionGoldFactor(save) : null };
  const relics: GoldMultiplier = { id: "relics", name: "Relics", factor: relicAmount(save, "gold") ? relicFactor(save, "gold") : null };
  // Gifts' Gold is a factor of its own beside the relics'.
  const gift = giftAmount(save, "gold");
  const gifts: GoldMultiplier = { id: "gifts", name: "Gifts", factor: gift ? (100 + gift) / 100 : null };
  const found = wornEffects(save, mode).goldFind;
  const gear: GoldMultiplier = { id: "gear", name: "Gold Found", factor: found ? (100 + found) / 100 : null };
  // Jackpot Spurs is its own factor, apart from Gold found.
  const spurs: GoldMultiplier[] = jackpot === undefined ? [] : [{ id: "jackpot", name: "Jackpot Spurs", factor: jackpot === 1 ? null : jackpot }];
  const boons: GoldMultiplier[] = shrine === undefined ? [] : [{ id: "boons", name: "Shrine Boons", factor: shrine === 1 ? null : shrine }];
  const floor: GoldMultiplier[] = [
    ...(golden === undefined ? [] : [{ id: "golden" as const, name: "Golden Floor", factor: golden === 1 ? null : golden }]),
    ...(stellar === undefined ? [] : [{ id: "stellar" as const, name: "Stellar Floor", factor: stellar === 1 ? null : stellar }]),
  ];
  return [{ id: "tower", name: "Tower Multiplier", factor: TIER_BONUS_TENTHS[tier - 1]! / 10 }, ads, ...adPrize, ...levelUp, ...scarab, ...packs, ...champion, collection, relics, gifts, gear, ...spurs, ...boons, ...floor];
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
export function silverFound(save: Pick<Save, "upgrades" | "archives" | "equipment"> & Partial<Pick<Save, "entitlements" | "vip">>, mode: Mode, ranks: number, boon = 1) {
  const bonus = trainedAmount(save, "silverBonus", ranks);
  // Champion Status's Club tier is a factor of its own.
  const club = save.entitlements && save.vip !== undefined ? championValue({ entitlements: save.entitlements, vip: save.vip }, "silver") : 0;
  const found = (((bonus * researched(save.archives, "silverBonus")) / 10_000) * boon * (100 + wornEffects(save, mode).silverFind)) / 100;
  return club ? (found * (100 + club)) / 100 : found;
}
