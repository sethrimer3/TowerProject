/** The GEM card's upgrades where no run holds them: the ad button's bank,
 * its cooldown and its reward, which count while the card sits in either
 * of the player's hands (the Auto hand or the Manual hand), in the forest
 * or inside a run. Inside a run, the Gems on the floors read the run's own
 * copy of the hand's trees (`Game.treeBonus`) instead. */
import type { CardId } from "./cards.ts";
import { treeBonus, type CardTreeLevels, type TreeBonus } from "./trees.ts";
import { AD_COOLDOWN_MS, AD_GEMS } from "../economy/gems.ts";

/** What the GEM card's bonuses read from the save. */
export type GemCardSave = { hand: readonly CardId[]; manualHand: readonly CardId[]; cardTrees: CardTreeLevels };

/** Whether either of the player's hands holds the GEM card. */
export const holdsGemCard = (save: Pick<GemCardSave, "hand" | "manualHand">) => save.hand.includes("gem") || save.manualHand.includes("gem");

/** What the GEM card's tree gives now: its levels while either hand holds
 * it, nothing otherwise. */
export const gemCardBonus = (save: GemCardSave): TreeBonus => treeBonus(holdsGemCard(save) && save.cardTrees.gem ? { gem: save.cardTrees.gem } : undefined);

/** The shortest the ad button's cooldown gets, however many Gem Bank Speed levels. */
const MIN_COOLDOWN_MS = 60 * 1000;

/** The ad button as the GEM card has it: the rewards its bank holds
 * (`cap`: one, and one more a Gem Bank level), the time it takes to bank
 * each (`cooldown`: Gem Bank Speed's seconds off), and the Gems each pays
 * (`gems`: More Gems' added). */
export function adTerms(bonus: TreeBonus) {
  return {
    cap: 1 + bonus.gemBank,
    cooldown: Math.max(MIN_COOLDOWN_MS, AD_COOLDOWN_MS - bonus.gemBankSpeed * 1000),
    gems: AD_GEMS + bonus.adGems,
  };
}
export type AdTerms = ReturnType<typeof adTerms>;
