import type { GoldItemId } from "../config.ts";
import type { BuyQuantity } from "../buy-quantity.ts";
import { provisionBulk, provisionOpen } from "../loadout.ts";
import { changeLoadout } from "./hero-sync.ts";
import type { DeskHost } from "./desk.ts";

/** The Gear page's commands: provisions (Equipment has its own
 * desk). Whatever changes the loadout reaches the runs of both modes at
 * once. */
export class GearDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Buys `quantity` more `id` provisions (one at a time, each dearer),
   * all or none. Provisions last for good, so like training they reach a
   * run already inside at once. */
  buyProvision(id: GoldItemId, quantity: BuyQuantity = 1) {
    const save = this.save, free = this.host.free;
    if (!provisionOpen(save, id)) return false;
    const bulk = provisionBulk(save, id, quantity, free ? Infinity : save.gold);
    if (!bulk.affordable) return false;
    return changeLoadout(save, () => {
      if (!free) save.gold -= bulk.cost;
      save.provisions[id] += bulk.count;
    });
  }
}
