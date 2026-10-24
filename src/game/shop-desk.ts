import { offer, type OfferId } from "../shop/offers.ts";
import { purchase, type Refusal } from "../shop/transactions.ts";
import { confirmServerTime } from "../shop/clock.ts";
import { adsOff } from "../shop/entitlements.ts";
import type { DeskHost } from "./desk.ts";
import type { TrainingDesk } from "./training-desk.ts";
import type { EventDesk } from "./event-desk.ts";

/** The Shop's command: buying an offer, which may speed up Training (a
 * pack's pace) and counts toward the Event's missions. */
export class ShopDesk {
  constructor(private readonly host: DeskHost, private readonly training: TrainingDesk, private readonly events: EventDesk) {}

  /** Buys the Shop's offer `id` at `serverNow`, a server time confirmed
   * for this purchase (the Shop's clock records it): with its price, or,
   * for a real-money offer, once the store confirms it was paid (`paid`);
   * Dev free purchases pay nothing. Returns why it was refused, or null
   * once bought. */
  buy(id: OfferId, serverNow: number, paid = false): Refusal | null {
    const o = offer(id), save = this.host.save;
    if (!o) return "locked";
    confirmServerTime(save.shop.clock, serverNow, this.host.clock());
    // The Event Booster is the running event's.
    if (o.item?.kind === "eventBoost") this.events.refresh();
    this.training.settle();
    const pace = this.training.pace;
    const t = purchase(save, o, serverNow, this.payment(paid));
    if (typeof t === "string") return t;
    // A pack's training speed starts from now.
    this.training.repace(pace);
    // Ad-Disable's ×1.5 Gold is for good: the Gold ad's stored time goes.
    if (adsOff(save)) save.goldBoostUntil = 0;
    if (id === "dailyGems") this.events.record("freeGems");
    this.host.message = o.item?.kind === "entitlement" ? `${t.item}: yours for good` : `+${t.item}`;
    return null;
  }
  /** How a Shop purchase is paid: for nothing (Dev), by the store, or with its price. */
  private payment(paid: boolean) {
    if (this.host.free) return "free";
    return paid ? "store" : "price";
  }
}
