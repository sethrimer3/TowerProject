import type { Mode } from "../entities.ts";
import { stream } from "../random.ts";
import { EQUIP_RARITIES, PULL_GEMS, type PullCount } from "../equipment/balance.ts";
import type { CategoryId } from "../equipment/catalog.ts";
import { pull } from "../equipment/acquire.ts";
import {
  dismantle, equip, findItem, levelUp, merge, roomLeft, setLocked, unequip,
  type EquipItem,
} from "../equipment/inventory.ts";
import { firstRoll, improve, keepCurrent, refine, spendChoice, takeCandidate } from "../equipment/slots.ts";
import { changeLoadout } from "./hero-sync.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** Why a Gem pull was refused. */
export type PullRefusal = "locked" | "gems" | "room";

/** The Equipment screen's commands (the Gear page's Equipment tab, and the
 * forest's Blacksmith): leveling, merging, dismantling, locking, the two
 * loadouts and Gem pulls. Whatever changes what a hero wears or how strong
 * it is goes through `changeLoadout`, so a run inside gains or loses just
 * that, and a run in the forest takes it at once. */
export class EquipmentDesk {
  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }
  private get e() {
    return this.save.equipment;
  }
  /** Whether Equipment is open (floor 60 reached). */
  get open() {
    return this.e.unlocked;
  }

  /** Raises item `id` by up to `levels` levels for Gold and its material
   * (`levelUp`): the levels gained, or why none were. */
  levelUp(id: string, levels = 1) {
    if (!this.open) return "missing" as const;
    let result: ReturnType<typeof levelUp> = "missing";
    changeLoadout(this.save, () => {
      result = levelUp(this.e, this.save, id, levels, this.host.free);
      return typeof result === "number";
    });
    return result;
  }

  /** Merges `fodder` into `targetId`, raising its rarity (`merge`). */
  merge(targetId: string, fodder: string[]) {
    if (!this.open) return "missing" as const;
    let result: ReturnType<typeof merge> = "missing";
    changeLoadout(this.save, () => {
      result = merge(this.e, targetId, fodder);
      return typeof result !== "string";
    });
    return result;
  }

  /** Breaks down `ids` (none locked or worn) into their materials. */
  dismantle(ids: string[]) {
    return this.open ? dismantle(this.e, ids) : ("missing" as const);
  }

  setLocked(id: string, locked: boolean) {
    return this.open && setLocked(this.e, id, locked);
  }

  /** Wears item `id` in `mode`'s loadout, replacing its category's piece. */
  equip(mode: Mode, id: string) {
    return this.open && changeLoadout(this.save, () => equip(this.e, mode, id));
  }
  unequip(mode: Mode, category: CategoryId) {
    return this.open && changeLoadout(this.save, () => unequip(this.e, mode, category));
  }
  /** Makes `to`'s loadout the same as `from`'s. */
  copyLoadout(from: Mode, to: Mode) {
    return this.open && from !== to && changeLoadout(this.save, () => {
      this.e.equipped[to] = { ...this.e.equipped[from] };
    });
  }

  // --- Effect slots ---

  /** A newly opened slot's free first roll (`firstRoll`). */
  firstRoll(id: string, index: number) {
    if (!this.open) return "missing" as const;
    return firstRoll(this.e, id, index, stream("equipment"));
  }
  /** A paid Refine of a slot (`refine`): its candidates, or why not. */
  refine(id: string, index: number) {
    if (!this.open) return "missing" as const;
    return refine(this.e, this.save, id, index, this.host.free, stream("equipment"));
  }
  /** Takes candidate `pick` into the slot. */
  takeCandidate(id: string, index: number, pick: number) {
    if (!this.open) return "missing" as const;
    let result: ReturnType<typeof takeCandidate> = "missing";
    changeLoadout(this.save, () => {
      result = takeCandidate(this.e, id, index, pick);
      return typeof result !== "string";
    });
    return result;
  }
  /** Keeps the slot's effect and lets its candidates go. */
  keepCurrent(id: string, index: number) {
    return this.open ? keepCurrent(this.e, id, index) : ("missing" as const);
  }
  /** Spends a Choice on `effect` (`spendChoice`). */
  spendChoice(id: string, index: number, effect: string) {
    if (!this.open) return "missing" as const;
    let result: ReturnType<typeof spendChoice> = "missing";
    changeLoadout(this.save, () => {
      result = spendChoice(this.e, id, index, effect);
      return typeof result !== "string";
    });
    return result;
  }
  /** Raises the slot's effect one rarity (`improve`). */
  improve(id: string, index: number) {
    if (!this.open) return "missing" as const;
    let result: ReturnType<typeof improve> = "missing";
    changeLoadout(this.save, () => {
      result = improve(this.e, this.save, id, index, this.host.free);
      // It returns the new rarity, or a refusal: both are strings.
      return (EQUIP_RARITIES as readonly string[]).includes(result);
    });
    return result;
  }

  /** Whether `count` pulls in a category can be made now, or why not. */
  pullRefusal(count: PullCount): PullRefusal | null {
    if (!this.open) return "locked";
    if (roomLeft(this.e) < count) return "room";
    return affordsGems(this.host, PULL_GEMS[count]) ? null : "gems";
  }
  /** `count` Gem pulls of `category`'s Unique pieces, paid in Gems and
   * resolved one by one (pity counting through them). */
  pull(category: CategoryId, count: PullCount): { item: EquipItem; pity: boolean }[] | PullRefusal {
    const refusal = this.pullRefusal(count);
    if (refusal) return refusal;
    if (!this.host.free) this.save.gems -= PULL_GEMS[count];
    return pull(this.e, category, count, stream("equipment"));
  }

  item(id: string) {
    return findItem(this.e, id);
  }
}
