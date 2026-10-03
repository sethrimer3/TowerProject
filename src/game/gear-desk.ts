import type { GoldItemId } from "../config.ts";
import {
  craftConsumable,
  craftEquipment,
  equipItem,
  salvageEquipment,
  unequipSlot,
  type ConsumableId,
} from "../crafting.ts";
import type { EquipmentSlot } from "../equipment.ts";
import { provisionOpen, provisionPrice } from "../loadout.ts";
import type { MaterialStack, MetalId } from "../materials.ts";
import { changeLoadout } from "./hero-sync.ts";
import type { DeskHost } from "./desk.ts";

/** The Gear page's commands: provisions, crafting and equipment. Whatever
 * changes the loadout reaches the runs of both modes at once. */
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

  craftEquipment(slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]) {
    return craftEquipment(this.save, slot, metal, enhancements);
  }

  salvage(itemId: string) {
    return salvageEquipment(this.save, itemId);
  }

  equip(itemId: string) {
    return changeLoadout(this.save, () => equipItem(this.save, itemId));
  }

  unequip(slot: EquipmentSlot) {
    changeLoadout(this.save, () => unequipSlot(this.save, slot));
  }

  craftConsumable(id: ConsumableId) {
    return craftConsumable(this.save, id);
  }
}
