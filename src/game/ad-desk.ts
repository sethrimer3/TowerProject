import { addAdGold, adGoldNow, claimPrize, recordWatch, refreshAds, type AdPrize } from "../ads/series.ts";
import { earn } from "../save/profile.ts";
import { estimatedServerTime } from "../shop/clock.ts";
import { adsOff } from "../shop/entitlements.ts";
import type { DeskHost } from "./desk.ts";

const HOUR_MS = 3_600_000;

/** A prize claimed: the prize, and the Gems it gave. */
export type AdPrizeClaimed = { prize: AdPrize; gems: number };

/** The ad series' commands (ads/series.ts): counting each ad watched
 * toward the bar's prizes, and claiming them. The bar's week turns on
 * the Shop's estimated server time; the Gold boost runs on the wall clock,
 * as the Gold ad's does. */
export class AdDesk {
  constructor(private readonly host: DeskHost) {}

  /** The Shop's server time as estimated now. */
  get now() {
    return estimatedServerTime(this.host.save.shop.clock, this.host.clock());
  }

  /** The series, its bar started again once its week is over. */
  get series() {
    refreshAds(this.host.save.ads, this.now);
    return this.host.save.ads;
  }

  /** Whether ads still play: an ad button opens the Ads Watch dialog
   * until Permanent Ad-Disable is owned. */
  get on() {
    return !adsOff(this.host.save);
  }

  /** The prizes' Gold boost running now, and its time left; null with none. */
  get gold() {
    return adGoldNow(this.host.save.ads.gold, this.host.clock());
  }

  /** Counts an ad just watched: the prize it reached, if it reached one. */
  watched(): number | null {
    return recordWatch(this.series, this.now);
  }

  /** Claims prize `i`: what it gave, or null when it isn't waiting. */
  claim(i: number): AdPrizeClaimed | null {
    const save = this.host.save, prize = claimPrize(this.series, i, this.now);
    if (!prize) return null;
    let gems = 0;
    switch (prize.kind) {
      case "gold":
        save.ads.gold = addAdGold(save.ads.gold, prize.factor, prize.hours * HOUR_MS, this.host.clock());
        this.host.message = `Gold ×${prize.factor} for ${prize.hours}h`;
        break;
      case "gems":
        gems = prize.amount;
        break;
      case "rubies":
        save.rubies += prize.amount;
        earn(save, "rubies", prize.amount);
        this.host.message = `+${prize.amount} Rubies`;
        break;
      case "discount":
        save.ads.discountUntil = Math.max(save.ads.discountUntil, this.now) + prize.hours * HOUR_MS;
        this.host.message = `Permanent Ad-Disable: ${prize.percent}% off for ${prize.hours}h`;
        break;
    }
    if (gems) {
      save.gems += gems;
      earn(save, "gems", gems);
      this.host.message = `+${gems} Gems`;
    }
    return { prize, gems };
  }
}
