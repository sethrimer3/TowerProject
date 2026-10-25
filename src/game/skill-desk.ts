import { cost, UPGRADES, type UpgradeId } from "../progression/upgrades.ts";
import { skillAvailable } from "../progression/skill-trees.ts";
import type { DeskHost } from "./desk.ts";
import { readyForestRuns } from "./hero-sync.ts";
import { dealCard, dealsToHand, handSlots, upgradeCards } from "../cards/cards.ts";

/** The skill trees' commands: skills bought with Breakthrough or Inspiration. */
export class SkillDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether skill `id` can be bought now: open, below its last rank, and
   * paid for by the currency held (anything, with Dev free purchases). */
  canBuy(id: UpgradeId) {
    if (!skillAvailable(id, this.save.upgrades)) return false;
    const u = UPGRADES.find((u) => u.id === id)!, n = this.save.upgrades[id];
    const held = u.currency === "breakthrough" ? this.save.breakthrough : this.save.tower.inspiration;
    return n < u.max && (this.host.free || cost(id, n) <= held);
  }
  buy(id: UpgradeId) {
    if (!this.canBuy(id)) return false;
    const u = UPGRADES.find((u) => u.id === id)!, n = this.save.upgrades[id];
    if (!this.spend(u.currency === "breakthrough", cost(id, n))) return false;
    this.save.upgrades[id]++;
    // The first cards earned (Door & Key, Enemy) go into the hand as well.
    if (dealsToHand(id)) for (const card of upgradeCards(id)) this.save.hand = dealCard(this.save.hand, card, handSlots(this.save));
    readyForestRuns(this.save);
    return true;
  }
  /** Pays `price` in Breakthrough, or else Inspiration (nothing with Dev free
   * purchases); false when short. */
  private spend(breakthrough: boolean, price: number) {
    if (this.host.free) return true;
    const save = this.save;
    if (price > (breakthrough ? save.breakthrough : save.tower.inspiration)) return false;
    if (breakthrough) save.breakthrough -= price;
    else save.tower.inspiration -= price;
    return true;
  }
}
