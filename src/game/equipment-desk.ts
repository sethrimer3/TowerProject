import { relicAmount } from "../economy/relic-effects.ts";
import type { Mode } from "../entities.ts";
import { stream } from "../random.ts";
import { CRAFT_MATERIAL, EQUIP_RARITIES, pullPrice, type PullCount } from "../equipment/balance.ts";
import { itemDef, materialOf, hasMaterials, spendMaterials, type CategoryId, type EquipMaterialId } from "../equipment/catalog.ts";
import { canPull, drawTogglesOpen, pull } from "../equipment/acquire.ts";
import {
  addItem, categoryOpen, categoryOf, dismantle, equip, findItem, levelUp, merge, roomLeft, salvageOf, setLocked, unequip,
  type EquipItem, type PullKey,
} from "../equipment/inventory.ts";
import { firstRoll, improve, keepCurrent, refine, spendChoice, takeCandidate } from "../equipment/slots.ts";
import { changeLoadout } from "./hero-sync.ts";
import { affordsGems, type DeskHost } from "./desk.ts";

/** Why a Gem pull was refused: `excluded` when every Unique it could bring
 * is left out of draws. */
export type PullRefusal = "locked" | "gems" | "room" | "excluded";
/** One piece a Gem pull brought: whether pity made it, whether it was the
 * welcome's sure Epic Unique (`sure`), and, when Auto-salvage dismantled it
 * once pulled, the material it returned. */
export type Pulled = { item: EquipItem; pity: boolean; sure?: true; salvaged?: { id: EquipMaterialId; quantity: number } };

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
  /** Whether Equipment is open (Tower II's floor 60 Goal claimed). */
  get open() {
    return this.e.unlocked;
  }

  /** Crafts a Common of the Standard piece `def`, using every base resource
   * in its category's recipe. */
  craft(def: string): EquipItem | "locked" | "room" | "material" {
    const piece = itemDef(def);
    if (!piece || piece.class !== "standard") return "locked";
    const category = piece.category;
    if (!this.open || !categoryOpen(this.e, category)) return "locked";
    if (roomLeft(this.e) <= 0) return "room";
    if (!this.host.free && !hasMaterials(this.e.materials, category, CRAFT_MATERIAL)) return "material";
    if (!this.host.free) spendMaterials(this.e.materials, category, CRAFT_MATERIAL);
    const item = addItem(this.e, def, "common")!;
    this.host.eventDone("equipment", 1);
    return item;
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
    if (typeof result !== "string") this.host.eventDone("merges", 1);
    return result;
  }

  /** Breaks down `ids` (none locked or worn) into their materials. */
  dismantle(ids: string[]) {
    return this.open ? dismantle(this.e, ids) : ("missing" as const);
  }

  /** Turns Auto-salvage of Common chest pieces on or off (`keepDrop`). */
  setAutoSalvage(on: boolean) {
    if (!this.open) return false;
    this.e.autoSalvage = on;
    return true;
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

  /** What `count` pulls of `key` take now: Equipment Tickets first, as far
   * as they go, then Gems for the rest (nothing with Dev free purchases). */
  pullPrice(count: PullCount, key: PullKey) {
    return this.host.free ? { tickets: 0, gems: 0 } : pullPrice(count, key === "all", this.e.tickets);
  }
  /** Whether `count` pulls of `key` (a category, or all) can be made now,
   * or why not. */
  pullRefusal(count: PullCount, key: PullKey): PullRefusal | null {
    if (!this.open) return "locked";
    if (roomLeft(this.e) < count) return "room";
    if (!canPull(this.e, key)) return "excluded";
    return affordsGems(this.host, this.pullPrice(count, key).gems) ? null : "gems";
  }
  /** Leaves Unique `def` out of future Gem pulls, or puts it back: only
   * once the draw toggles show (a five-Star piece owned). */
  setDrawn(def: string, drawn: boolean) {
    if (!this.open || !drawTogglesOpen(this.e) || itemDef(def)?.class !== "unique") return false;
    const e = this.e;
    e.drawOff = drawn ? e.drawOff.filter((id) => id !== def) : [...new Set([...e.drawOff, def])];
    return true;
  }
  /** `count` Gem pulls in `category`, or of every category at a discount
   * (`"all"`), paid with Equipment Tickets as far as they go and Gems for
   * the rest (`pullPrice`), and resolved one by one (pity counting through
   * them): Standard pieces at Common to Rare, Uniques at Epic and Legendary;
   * one of the welcome's ticket pulls a sure Epic Unique. With Auto-salvage
   * on, each Common piece pulled is then dismantled into its material. */
  pull(category: CategoryId | "all", count: PullCount): Pulled[] | PullRefusal {
    if (category !== "all" && !categoryOpen(this.e, category)) return "locked";
    const refusal = this.pullRefusal(count, category);
    if (refusal) return refusal;
    const price = this.pullPrice(count, category);
    this.e.tickets -= price.tickets;
    this.save.gems -= price.gems;
    const pulled: Pulled[] = pull(this.e, category, count, stream("equipment"), relicAmount(this.host.save, "rarePull"), price.tickets);
    this.host.eventDone("equipment", pulled.length);
    if (!this.e.autoSalvage) return pulled;
    const commons = pulled.filter((p) => p.item.rarity === "common");
    for (const p of commons) p.salvaged = { id: materialOf(categoryOf(p.item)), quantity: salvageOf(p.item) };
    if (commons.length) dismantle(this.e, commons.map((p) => p.item.id));
    return pulled;
  }

  item(id: string) {
    return findItem(this.e, id);
  }
}
