import type { GoldItemId } from "../config.ts";
import { craftConsumable, type ConsumableId } from "../crafting.ts";
import { provisionOpen, provisionPrice } from "../loadout.ts";
import { changeLoadout } from "./hero-sync.ts";
import type { DeskHost } from "./desk.ts";

/** The Gear page's commands: provisions and crafting (Equipment has its own
 * desk). Whatever changes the loadout reaches the runs of both modes at
 * once. */
export class GearDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Buys one more `id` provision. Provisions last for good, so like
   * training it reaches a run already inside at once. */
  buyProvision(id: GoldItemId) {
    const save = this.save, free = this.host.free, price = provisionPrice(save, id);
    if (!provisionOpen(save, id) || (!free && save.gold < price)) return false;
    return changeLoadout(save, () => {
      if (!free) save.gold -= price;
      save.provisions[id]++;
    });
  }

  craftConsumable(id: ConsumableId) {
    return craftConsumable(this.save, id);
  }
}
