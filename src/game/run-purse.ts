import { researched } from "../archives.ts";
import { ENEMY_GOLD, silverForKill } from "../config.ts";
import { creditMaterials } from "../crafting.ts";
import type { Enemy, Mode, Run, Save } from "../entities.ts";
import { snap } from "../exact.ts";
import { floorGold, floorSilver, killGold, silverBonus } from "../loadout.ts";
import { rollTreasureLoot } from "../loot.ts";
import type { MaterialStack } from "../materials.ts";
import { MODES, type ModeProfile } from "../modes.ts";
import { ranksInRun } from "../run-training.ts";
import { goldFactor } from "../shop/entitlements.ts";
import { tierGold } from "../tiers.ts";

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

  /** Banks Gold found in the run, fractions and all (`snap`), times the
   * Shop's coin packs owned; returns what it banked. */
  gold(found: number) {
    const gold = snap(found * goldFactor(this.save));
    this.save.gold = snap(this.save.gold + gold);
    this.slice.runGold = snap(this.slice.runGold + gold);
    return gold;
  }

  /** Adds Silver found in the run, raised by Silver Bonus training and
   * research (the two multiplied), fractions and all; returns what it
   * added. */
  silver(base: number) {
    const silver = snap((base * silverBonus(this.trainingNow) * researched(this.save.archives, "silverBonus", 100)) / 10_000);
    this.run.silver = snap((this.run.silver ?? 0) + silver);
    return silver;
  }

  /** A kill's Silver, by the enemy's strength and the equivalent floor. */
  killSilver(enemy: Enemy, floor: number) {
    return this.silver(silverForKill(enemy.strength, floor));
  }

  /** An enemy's Gold (by its strength) and material drops, once per
   * physical kill. */
  enemyLoot(enemy: Enemy, x: number, y: number): { gold: number; drops: MaterialStack[] } {
    if (!this.loot(this.lootKey(x, y))) return { gold: 0, drops: [] };
    // Gold / Kill training and research, multiplied, then the tier's bonus.
    const raised = snap((ENEMY_GOLD[enemy.strength] * killGold(this.trainingNow) * researched(this.save.archives, "killGold", 100)) / 10_000);
    const gold = this.gold(tierGold(this.tier, raised));
    const drops = this.rules.enemyDrops(enemy.name, this.rng);
    creditMaterials(this.save, drops);
    return { gold, drops };
  }

  /** A treasure chest's Gold and materials, once per physical chest, or
   * null when it was already paid. Generated treasure never upgrades gear
   * directly: it always grants Gold, plus independent chances at metal, an
   * Empty Vial, and gems. */
  treasure(x: number, y: number): { gold: number; materials: MaterialStack[] } | null {
    if (!this.loot(this.lootKey(x, y))) return null;
    const rules = this.rules;
    const loot = rollTreasureLoot(rules.equivalentFloor(rules.progressAt(this.run, y)), this.rng);
    const gold = this.gold(tierGold(this.tier, loot.gold));
    creditMaterials(this.save, loot.materials);
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

  /** A card modifier's Gold (Gold Touch, Goldback) for a card reaching its
   * target, with the tier's bonus: once per target (`key`, in lootedTiles),
   * since undo can't take Gold back. Returns what it paid. */
  modifierGold(key: string, amount: number) {
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
}
