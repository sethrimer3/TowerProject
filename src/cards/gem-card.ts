/** The GEM card's powers where no run holds them: the ad button's bank,
 * its cooldown and its reward, which count while the card sits in either
 * of the player's hands (the Auto hand or the Manual hand), in the forest
 * or inside a run. Inside a run, the Gems on the floors read the run's own
 * copy of the hand's levels (`Game.powerBonus`) instead. */
import type { CardId } from "./cards.ts";
import { levelsOf, powerBonus, type PowerBonus } from "./powers.ts";
import type { CardLevelSave } from "./levels.ts";
import { AD_COOLDOWN_MS, AD_GEMS } from "../economy/gems.ts";

/** What the GEM card's bonuses read from the save. */
export type GemCardSave = CardLevelSave & { hand: readonly CardId[]; manualHand: readonly CardId[] };

/** Whether either of the player's hands holds the GEM card. */
export const holdsGemCard = (save: Pick<GemCardSave, "hand" | "manualHand">) => save.hand.includes("gem") || save.manualHand.includes("gem");

/** What the GEM card's powers give now: its level's while either hand
 * holds it, nothing otherwise. */
export const gemCardBonus = (save: GemCardSave): PowerBonus => powerBonus(holdsGemCard(save) ? levelsOf(save, ["gem"]) : undefined);

/** The shortest the ad button's cooldown gets, however many Gem Bank Speed levels. */
const MIN_COOLDOWN_MS = 60 * 1000;

/** What Champion Status adds to the ad button (shop/champion.ts
 * `championAd`): rewards banked, seconds off, Gems a reward. */
export type AdExtra = { cap: number; seconds: number; gems: number };
const NO_EXTRA: AdExtra = { cap: 0, seconds: 0, gems: 0 };

/** The ad button as the GEM card has it, with `extra` (Champion Status's)
 * added: the rewards its bank holds (`cap`: one, and Gem Bank's whole
 * rewards, half a reward a level; its fraction, `part`, is the chance a
 * refill banks one more, which `bonusSlot` says it rolled), the time it
 * takes to bank each (`cooldown`: Gem Bank Speed's seconds off), and the
 * Gems each pays (`gems`: More Gems' added). */
export function adTerms(bonus: PowerBonus, extra: AdExtra = NO_EXTRA, bonusSlot = false) {
  const whole = Math.floor(bonus.gemBank), part = bonus.gemBank - whole;
  return {
    cap: 1 + whole + (part > 0 && bonusSlot ? 1 : 0) + extra.cap,
    part,
    cooldown: Math.max(MIN_COOLDOWN_MS, AD_COOLDOWN_MS - (bonus.gemBankSpeed + extra.seconds) * 1000),
    gems: AD_GEMS + bonus.adGems + extra.gems,
  };
}
export type AdTerms = ReturnType<typeof adTerms>;
