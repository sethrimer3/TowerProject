import { researched } from "../archives.ts";
import { ENEMY_GOLD, silverForKill } from "../config.ts";
import type { RoomWorld } from "../tower/room-world.ts";
import type { Enemy, Mode, Run, Save } from "../entities.ts";
import { snap } from "../exact.ts";
import { floorGold, floorSilver, killGold, silverBonus } from "../loadout.ts";
import { averageGold, rollTreasureLoot } from "../loot.ts";
import type { MaterialStack } from "../materials.ts";
import { MODES, type ModeProfile } from "../modes.ts";
import { ranksInRun } from "../run-training.ts";
import { goldFactor } from "../shop/entitlements.ts";
import { goldBoostFactor } from "../gold-boost.ts";
import { tierGold } from "../tiers.ts";
import { raised, wornEffects } from "../equipment/effects.ts";
import { keepDrop, rollBossDrop, rollMaterials } from "../equipment/acquire.ts";
import type { EquipItem } from "../equipment/inventory.ts";
import { CATEGORIES, type EquipMaterialId } from "../equipment/catalog.ts";

/** What a kill gave toward Equipment, once it is open: upgrade materials,
 * and a boss's Standard piece (or, the inventory full, its salvage). */
export type EquipmentLoot = {
  materials: { id: EquipMaterialId; quantity: number } | null;
  item: EquipItem | null;
  /** A drop salvaged at once: by Auto-salvage (`auto`), or for want of room. */
  salvaged: { id: EquipMaterialId; quantity: number; auto: boolean } | null;
};

/** What a run finds: Gold, banked in the save as it is found, and Silver,
 * which belongs to the run. Gold paid for a physical kill, chest or floor
 * is gated by the mode's `lootedTiles` (outside the run), so undo can bring
 * the enemy or chest back but never pays for it twice; Silver isn't, since
 * undo takes it back with the run. */
export class RunPurse {
  constructor(
    private readonly save: Save,
    private readonly mode: Mode,
    private readonly run: Run,
    private readonly rng: () => number,
    /** The wall clock now (ms), for the Gold ad's boost. */
    private readonly now = 0,
    /** What Equipment's drops (materials, boss pieces) draw from: `rng`,
     * unless a tournament run gives them a stream of their own. */
    private readonly equipmentRng: () => number = rng,
  ) {}

  private get rules(): ModeProfile {
    return MODES[this.mode];
  }

  private get slice() {
    return this.save[this.mode];
  }

  private get tier() {
    return this.run.tier ?? 1;
  }

  /** The upgrades owned and the Training ranks that count now. */
  private get trainingNow() {
    return { upgrades: this.save.upgrades, training: ranksInRun(this.save, this.run) };
  }

  /** `base` raised by the research `target`'s percent. */
  private researched(base: number, target: "floorGold" | "floorSilver") {
    return snap((base * researched(this.save.archives, target, 100)) / 100);
  }

  /** Marks `key` looted; false when it already was. */
  private loot(key: string) {
    const looted = this.slice.lootedTiles;
    if (looted[key]) return false;
    looted[key] = true;
    return true;
  }

  private lootKey(x: number, y: number) {
    return this.rules.lootKey(this.run, x, y);
  }

  /** What the equipment this mode's hero wears does. */
  private get worn() {
    return wornEffects(this.save, this.mode);
  }

  /** Banks Gold found in the run, fractions and all (`snap`), times the
   * Shop's coin packs owned and the Gold ad's boost while it lasts (what
   * it found while boosted kept in `runBoostGold`), and raised by
   * equipment's Gold found; returns what it banked. */
  gold(found: number) {
    const before = raised(found, this.worn.goldFind) * goldFactor(this.save), boost = goldBoostFactor(this.save, this.now);
    const gold = snap(before * boost);
    if (boost !== 1) this.slice.runBoostGold = snap((this.slice.runBoostGold ?? 0) + before);
    this.save.gold = snap(this.save.gold + gold);
    this.slice.runGold = snap(this.slice.runGold + gold);
    return gold;
  }

  /** Adds Silver found in the run, raised by Silver Bonus training and
   * research (the two multiplied), fractions and all; returns what it
   * added. */
  silver(base: number) {
    const bonus = snap((base * silverBonus(this.trainingNow) * researched(this.save.archives, "silverBonus", 100)) / 10_000);
    const silver = raised(bonus, this.worn.silverFind);
    this.run.silver = snap((this.run.silver ?? 0) + silver);
    return silver;
  }

  /** A kill's Silver, by the enemy's strength and the equivalent floor. */
  killSilver(enemy: Enemy, floor: number, scale = 1) {
    const base = silverForKill(enemy.strength, floor);
    return this.silver(scale === 1 ? base : snap(base * scale));
  }

  /** A kill's Gold before the tier's bonus: by the enemy's strength, raised
   * by Gold / Kill training and research, multiplied, and for an
   * `instakill` (the hero's first strike ended it) by Mug research too. */
  private killGold(enemy: Enemy, instakill = false) {
    const gold = snap((ENEMY_GOLD[enemy.strength] * killGold(this.trainingNow) * researched(this.save.archives, "killGold", 100)) / 10_000);
    return instakill ? snap((gold * researched(this.save.archives, "instakillGold", 100)) / 100) : gold;
  }

  /** An enemy's Gold (by its strength) and, once Equipment is open, its
   * upgrade materials and a boss's equipment, once per physical kill. */
  enemyLoot(enemy: Enemy, x: number, y: number, scale = 1, instakill = false): { gold: number; equipment: EquipmentLoot | null } {
    if (!this.loot(this.lootKey(x, y))) return { gold: 0, equipment: null };
    // Then the tier's bonus; Effective or Dampen on the card that took the
    // fight scales it too.
    const base = this.killGold(enemy, instakill), raised = scale === 1 ? base : snap(base * scale);
    const gold = this.gold(tierGold(this.tier, raised));
    return { gold, equipment: this.equipmentLoot(enemy, y) };
  }

  /** A kill's upgrade materials and a boss's equipment, on the equivalent
   * floor at row `y`; nothing before Equipment opens. */
  private equipmentLoot(enemy: Enemy, y: number): EquipmentLoot | null {
    const e = this.save.equipment;
    if (!e.unlocked) return null;
    const floor = this.rules.equivalentFloor(this.rules.progressAt(this.run, y)), worn = this.worn;
    const materials = rollMaterials(enemy.strength, floor, worn.materialFind, this.equipmentRng);
    if (materials) e.materials[materials.id] += materials.quantity;
    const drop = rollBossDrop(enemy.strength, worn.bossDrops, this.equipmentRng);
    const kept = drop && keepDrop(e, drop);
    return {
      materials,
      item: kept?.item ?? null,
      salvaged: kept && !kept.item ? { id: CATEGORIES[drop!.category].material, quantity: kept.salvaged, auto: kept.auto } : null,
    };
  }

  /** A treasure chest's Gold and metal bars, once per physical chest, or
   * null when it was already paid. */
  treasure(x: number, y: number): { gold: number; materials: MaterialStack[] } | null {
    if (!this.loot(this.lootKey(x, y))) return null;
    const rules = this.rules;
    const loot = rollTreasureLoot(rules.equivalentFloor(rules.progressAt(this.run, y)), this.rng);
    const gold = this.gold(tierGold(this.tier, loot.gold));
    for (const m of loot.materials) this.save.materials[m.id] += m.quantity;
    return { gold, materials: loot.materials };
  }

  /** Spare Change: Gold for a floor climbed for the first time in the run,
   * its Gold / Floor raised by research and the tier's bonus. Gated by
   * `key` in lootedTiles, like a kill's Gold; returns what it paid. */
  floorGold(key: string) {
    const base = floorGold(this.trainingNow);
    if (!base || !this.loot(key)) return 0;
    return this.gold(tierGold(this.tier, this.researched(base, "floorGold")));
  }

  /** Floor Skip Reward: when Skip climbs past the floor the run stands on
   * (`board`), its research percent of the Gold that floor's battles and
   * chests still hold: each enemy's kill Gold and each closed treasure
   * chest's average Gold (`averageGold`), with the tier's bonus. Each enemy
   * and chest counted is marked looted, so one fought or opened later pays
   * no Gold again, and the floor pays once a run. Returns what it paid. */
  skippedFloorGold(board: RoomWorld) {
    const percent = researched(this.save.archives, "floorSkipGold", 0);
    if (!percent || !this.loot(`${this.lootKey(-1, -1)}:skipped`)) return 0;
    const chest = averageGold(this.rules.equivalentFloor(this.rules.progressAt(this.run, 0)));
    let found = 0;
    for (let y = 0; y < board.height; y++)
      for (let x = 0; x < board.width; x++) {
        const t = board.tile(x, y);
        if (t.kind !== "enemy" && t.kind !== "treasure") continue;
        if (!this.loot(this.lootKey(x, y))) continue;
        found = snap(found + (t.kind === "enemy" ? this.killGold(t.enemy!) : chest));
      }
    return found ? this.gold(tierGold(this.tier, snap((found * percent) / 100))) : 0;
  }

  /** A card badge's Gold (Gold Touch, Goldback) for a card reaching its
   * target, with the tier's bonus: once per target (`key`, in lootedTiles),
   * since undo can't take Gold back. Returns what it paid. */
  badgeGold(key: string, amount: number) {
    if (!this.loot(key)) return 0;
    return this.gold(tierGold(this.tier, amount));
  }

  /** The key that gates a floor's Spare Change: the Tower's stairs tile at
   * (x, y), or the Delve's equivalent floor `y` on its `x = -1` column. */
  floorKey(x: number, y: number) {
    return this.lootKey(x, y);
  }

  /** Wishing Well: Silver for a floor climbed for the first time in the
   * run, its Silver / Floor raised by research, then by Silver Bonus.
   * Returns what it paid. */
  floorSilver() {
    const base = floorSilver(this.trainingNow);
    return base ? this.silver(this.researched(base, "floorSilver")) : 0;
  }

  /** Interest: for a floor climbed for the first time in the run, after
   * its Wishing Well Silver, Interest % research's share of the Silver
   * held, up to Max Interest. Silver Bonus doesn't raise it. Returns what
   * it added. */
  interest() {
    const rate = researched(this.save.archives, "interestRate", 0);
    if (!rate) return 0;
    const held = this.run.silver ?? 0;
    const paid = Math.min(researched(this.save.archives, "interestCap", 50), snap((held * rate) / 1000));
    if (paid > 0) this.run.silver = snap(held + paid);
    return paid > 0 ? paid : 0;
  }
}
