import type { GoldItemId } from "../economy/provisions.ts";
import { provisionOpen, provisionPrice } from "../progression/loadout.ts";
import type { DeskHost } from "./desk.ts";

/** The Gear page's commands: provisions (Equipment has its own
 * desk). */
export class GearDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Buys one more `id` provision, dearer than the last. Provisions last
   * for good: a run already inside carries the new one at once, as its
   * uses are those owned less those it spent. */
  buyProvision(id: GoldItemId) {
    const save = this.save, free = this.host.free;
    if (!provisionOpen(save, id)) return false;
    const price = provisionPrice(save, id);
    if (!free && save.gold < price) return false;
    if (!free) save.gold -= price;
    save.provisions[id]++;
    return true;
  }
}
