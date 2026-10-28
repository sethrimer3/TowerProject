import { researched } from "../progression/archives.ts";
import { ENEMY_GOLD, FAST_GOLD, PICKUP_GOLD, RANGED_GOLD, SHIELDED_GOLD, silverForKill } from "../economy/kill-pay.ts";
import { trainedAmount } from "../progression/training.ts";
import type { RoomWorld } from "../tower/room-world.ts";
import { snap } from "../exact.ts";
import { averageGold, rollGold } from "../economy/loot.ts";
import { pickupGold } from "../doors.ts";
import { litTorches } from "../board.ts";
import { point, type ChestKind, type Enemy, type Mode, type Tile } from "../entities.ts";
import { heldCards, type Run } from "../runs.ts";
import type { Save } from "../save/shape.ts";
import { MODES, type ModeProfile } from "../modes.ts";
import { ranksInRun } from "../progression/run-training.ts";
import { goldBanked, silverFound, type GoldContext } from "../economy/gold-multipliers.ts";
import { wornEffects } from "../equipment/effects.ts";
import { keepDrop, rollChestPiece, rollSupplies } from "../equipment/acquire.ts";
import type { EquipItem } from "../equipment/inventory.ts";
import { CATEGORIES, type EquipMaterialId } from "../equipment/catalog.ts";
import { EQUIP_RARITIES, type EquipRarity } from "../equipment/balance.ts";
import { runBoons } from "../shrines.ts";
import { earn } from "../save/profile.ts";
import { notesOf, tallyIn } from "../run-notes.ts";
import { foeGold } from "../cards/foe-cards.ts";
import { foeStat, treeBonus, treeFactor } from "../cards/trees.ts";
import { hasEnvironment } from "../environments.ts";

/** The tiles whose Pickup Gold a skipped floor counts, beside its lit torches. */
const ITEMS: ReadonlySet<Tile["kind"]> = new Set(["key", "potion", "attack", "defense", "door"]);

/** What a Supply or Equipment Chest gave toward Equipment: upgrade
 * materials, or a Standard piece (or, the inventory full, its salvage). */
export type EquipmentLoot = {
  materials: { id: EquipMaterialId; quantity: number } | null;
  item: EquipItem | null;
  /** A drop salvaged at once: by Auto-salvage (`auto`), or for want of room. */
  salvaged: { id: EquipMaterialId; quantity: number; auto: boolean } | null;
};

/** What a treasure chest's own rolls add (`RunPurse.treasure`): how many
 * times over it pays (CHEST's Double and Triple), and whether it holds a
 * Greater Boss's Cells (TORCH's Chest Cells). */
export type ChestRoll = { multiplier: number; cells: boolean };
export const PLAIN_ROLL: ChestRoll = { multiplier: 1, cells: false };
/** The Equipment rarity a tier above `r` (a Rare stays Rare). */
const rarityAbove = (r: EquipRarity): EquipRarity => EQUIP_RARITIES[Math.min(EQUIP_RARITIES.length - 1, EQUIP_RARITIES.indexOf(r) + 1)];

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
    /** What Equipment's finds (a Supply Chest's materials, an Equipment Chest's piece) draw from: `rng`,
     * unless a tournament run gives them a stream of their own. */
    private readonly equipmentRng: () => number = rng,
    /** The equivalent floor (from 1) of the tile at (x, y), the one its
     * environments roll on (`Game.floorOf`); without it, no floor is golden. */
    private readonly floorOf?: (x: number, y: number) => number,
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

  /** What the card trees of the run's hand give (`treeBonus`): none in
   * the forest. */
  private get tree() {
    return treeBonus(this.run.outside ? undefined : this.run.cardTrees);
  }

  /** What the run's boons change (a Tower run's only), or null. */
  private get boons() {
    return this.mode === "tower" ? runBoons(this.run, this.save) : null;
  }

  /** The upgrades owned and the Training ranks that count now. */
  private get trainingNow() {
    return { upgrades: this.save.upgrades, training: ranksInRun(this.save, this.run) };
  }

  /** `base` raised by the research `target`'s percent. */
  private researched(base: number, target: "floorGold" | "floorSilver") {
    return snap((base * researched(this.save.archives, target)) / 100);
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

  /** What gates a kill's loot at (x, y): the tile's loot key, an enemy
   * spawned during the run's with its spawn number after it, since it may
   * stand where an enemy already fell and paid. */
  killKey(enemy: Enemy, x: number, y: number) {
    // An enemy that has moved keeps the loot key of the tile it was made on.
    const [hx, hy] = enemy.home ? enemy.home.split(",").map(Number) as [number, number] : [x, y];
    const key = this.lootKey(hx, hy);
    return enemy.spawn === undefined ? key : `${key}:s${enemy.spawn}`;
  }

  /** What the equipment this mode's hero wears does. */
  private get worn() {
    return wornEffects(this.save, this.mode);
  }

  /** What the Gold multipliers read for this run (`economy/gold-multipliers.ts`),
   * for Gold found where Golden Floor Multiplier's factor is `golden`. */
  private goldContext(golden = 1): GoldContext {
    return { save: this.save, mode: this.mode, tier: this.tier, now: this.now, shrine: this.boons?.gold, golden };
  }

  /** Golden Floor Multiplier's factor on Gold found on equivalent floor
   * `floor` (from 1) when the run makes it a Golden Floor, read now so a
   * level researched mid-run counts at once; 1 on any other floor. */
  golden(floor: number) {
    return hasEnvironment(this.run, "golden", floor) ? researched(this.save.archives, "goldenFloorMultiplier") / 10 : 1;
  }

  /** `golden` for the floor of the tile at (x, y). */
  private goldenAt(x: number, y: number) {
    return this.floorOf && this.run.goldenFloor ? this.golden(this.floorOf(x, y)) : 1;
  }

  /** `goldenAt` the hero's tile. */
  private get goldenHere() {
    return this.goldenAt(this.run.player.x, this.run.player.y);
  }

  /** Banks Gold found in the run, fractions and all (`snap`), times every
   * Gold multiplier (`goldBanked`: the tower's, the ads', the Shop's coin
   * packs, the themes owned, equipment's Gold found, the run's Gold boons
   * and, found on a Golden Floor, `golden`, its multiplier, once for the
   * find; what it found while the Gold ad's boost ran kept in
   * `runBoostGold`); returns what it banked. */
  gold(found: number, golden = 1) {
    const { gold, unboosted } = goldBanked(found, this.goldContext(golden));
    if (unboosted !== null) this.slice.runBoostGold = snap((this.slice.runBoostGold ?? 0) + unboosted);
    this.save.gold = snap(this.save.gold + gold);
    earn(this.save, "gold", gold);
    this.slice.runGold = snap(this.slice.runGold + gold);
    return gold;
  }

  /** The Gold a kill of `enemy` at (x, y) would bank, as `enemyLoot` pays
   * it (Goldback's combo counted, a card's Effective or Dampen not): none
   * once its tile is looted. Changes nothing. */
  killGoldPreview(enemy: Enemy, x: number, y: number, instakill = false) {
    if (this.slice.lootedTiles[this.killKey(enemy, x, y)]) return 0;
    return goldBanked(snap(this.killGold(enemy, instakill) * (this.run.goldCombo ?? 1)), this.goldContext(this.goldenAt(x, y))).gold;
  }

  /** The Gold a kill of `enemy` on the hero's floor banks now, wherever it
   * stands and whether or not its tile is looted, without Goldback's combo
   * (the enemy stats box's). Changes nothing. */
  killGoldOf(enemy: Enemy) {
    return goldBanked(this.killGold(enemy), this.goldContext(this.goldenHere)).gold;
  }

  /** Adds Silver found in the run, times Silver found's multiplier
   * (`silverFound`: Silver Bonus training and research, the run's Silver
   * Bonus boons and equipment's Silver found), times the card trees'
   * Silver Bonus, fractions and all; returns what it added. */
  silver(base: number) {
    const silver = snap(base * silverFound(this.save, this.mode, this.trainingNow.training.silverBonus, this.boons?.silverFound) * treeFactor(this.tree, "silverBonus"));
    this.run.silver = snap((this.run.silver ?? 0) + silver);
    this.noteSilver(silver);
    return silver;
  }

  /** Silver found counts toward the profile's lifetime Silver and the
   * run's notes, both taken back by undo. */
  private noteSilver(silver: number) {
    earn(this.save, "silver", silver);
    const notes = notesOf(this.run);
    if (notes && silver > 0) notes.silver = snap(notes.silver + silver);
  }

  /** A kill's Silver, by the enemy's strength and the equivalent floor, and
   * the enemy cards' trees' Silver covering it added (none under the boon
   * that trades it for Silver / Floor). */
  killSilver(enemy: Enemy, floor: number, scale = 1) {
    // ENEMY's tree raises it, its own factor beside the boons'.
    const tree = this.tree, found = snap(silverForKill(enemy.strength, floor) + foeStat(tree, enemy, "Silver"));
    const base = snap(found * (this.boons?.killSilver ?? 1) * treeFactor(tree, "foeSilver"));
    return this.silver(scale === 1 ? base : snap(base * scale));
  }

  /** Gold Bonus training's and research's multiplier, times the card
   * trees' Gold Bonus, in hundredths of a percent (×1 is 10,000). */
  private get goldBonus() {
    return trainedAmount(this.trainingNow, "goldBonus") * researched(this.save.archives, "goldBonus") * treeFactor(this.tree, "goldBonus");
  }

  /** `base` Gold raised by Gold Bonus. */
  private bonused(base: number) {
    return snap((base * this.goldBonus) / 10_000);
  }

  /** A kill's Gold before the tier's bonus: by the enemy's strength, raised
   * by Gold Bonus training and research, multiplied (a Fast enemy paying
   * `FAST_GOLD` more first, a Ranged or Flying one `RANGED_GOLD`, a Shielded one
   * `SHIELDED_GOLD`), and for an
   * `instakill` (the hero's first strike ended it) by Mug research too; then
   * by 5% more for each enemy card the run's hand holds that covers it,
   * added into one factor with the card trees' (ENEMY's for every enemy,
   * TORCH's for a Greater Boss, and the enemy cards' own covering it, their
   * Instakill Bounty too for an `instakill`: `foeGold`). */
  private killGold(enemy: Enemy, instakill = false) {
    const raw = snap(((ENEMY_GOLD[enemy.strength] + (enemy.fast ? FAST_GOLD : 0) + (enemy.ranged || enemy.flying ? RANGED_GOLD : 0) + (enemy.shielded ? SHIELDED_GOLD : 0)) * this.goldBonus) / 10_000);
    const gold = instakill ? snap((raw * researched(this.save.archives, "instakillGold")) / 100) : raw;
    const tree = this.tree, own = foeStat(tree, enemy, "Gold") + (instakill ? foeStat(tree, enemy, "InstakillGold") : 0);
    const more = snap(tree.foeGold + (enemy.strength === "greaterBoss" ? tree.bossGold : 0) + own);
    const foe = this.run.outside ? 1 : foeGold(heldCards(this.run), enemy, more);
    return foe === 1 ? gold : snap(gold * foe);
  }

  /** An enemy's Gold (by its strength), a Greater Boss's Cells and those the
   * enemy cards' trees add, and what those trees' drops find toward
   * Equipment, once per physical kill: a Supply Chest's upgrade materials
   * by their Salvage chance (Instakill Salvage's too for an `instakill`),
   * and an Equipment Chest's piece by their Equipment Drop chance, once
   * Equipment is open. */
  enemyLoot(enemy: Enemy, x: number, y: number, scale = 1, instakill = false): { gold: number; cells: number; equipment: EquipmentLoot[] } {
    if (!this.loot(this.killKey(enemy, x, y))) return { gold: 0, cells: 0, equipment: [] };
    // Effective or Dampen on the card that took the fight scales it; `gold`
    // then adds the tier's bonus and the other Gold multipliers.
    const base = this.withCombo(this.killGold(enemy, instakill)), raised = scale === 1 ? base : snap(base * scale);
    const gold = this.gold(raised, this.goldenAt(x, y)), more = foeStat(this.tree, enemy, "Cells");
    const cells = enemy.strength === "greaterBoss" ? this.cells(scale, more) : more ? this.bankCells(snap(more * scale)) : 0;
    return { gold, cells, equipment: this.killDrops(enemy, instakill) };
  }

  /** What the enemy cards' trees' drops find from a kill of `enemy`: each
   * chance rolled on Equipment's stream, only when there is one. */
  private killDrops(enemy: Enemy, instakill: boolean): EquipmentLoot[] {
    if (!this.save.equipment.unlocked) return [];
    const tree = this.tree, found: EquipmentLoot[] = [];
    const material = snap(foeStat(tree, enemy, "Material") + (instakill ? foeStat(tree, enemy, "InstakillMaterial") : 0)), piece = foeStat(tree, enemy, "Equipment");
    if (material && this.equipmentRng() * 100 < material) found.push(this.chestEquipment("supply"));
    if (piece && this.equipmentRng() * 100 < piece) found.push(this.chestEquipment("equipment"));
    return found;
  }

  /** A Greater Boss's Cells, banked in the save: a whole number from 1 to
   * the tower's number, evenly (tower I's always 1, drawing nothing), and
   * TORCH's tree's Cells more and `more` (BOSS ENEMY's), then the scale of
   * Effective or Dampen on the card that took the fight. */
  private cells(scale: number, more = 0) {
    const found = (this.tier > 1 ? 1 + Math.floor(this.rng() * this.tier) : 1) + this.tree.bossCells + more;
    return this.bankCells(scale === 1 ? found : snap(found * scale));
  }

  /** Banks `cells` Cells in the save, counted toward the run's finds. */
  private bankCells(cells: number) {
    this.save.cells = snap(this.save.cells + cells);
    earn(this.save, "cells", cells);
    this.slice.runFinds.cells = snap(this.slice.runFinds.cells + cells);
    return cells;
  }

  /** Gold for an item taken off the floor at (x, y), or a door opened
   * there: `base` (`pickupGold`) raised by Gold Bonus and by `more` percent
   * (a card tree's, for keys or doors), then the tier's bonus, once per tile
   * (gated like a kill's Gold, so undo can't pay it twice). Returns what it
   * paid. */
  pickupGold(x: number, y: number, base: number, more = 0) {
    if (!base || !this.loot(this.pickupKey(x, y))) return 0;
    const gold = this.bonused(base);
    return this.gold(more ? snap((gold * (100 + more)) / 100) : gold, this.goldenAt(x, y));
  }

  /** What gates an item's Gold at (x, y), apart from a kill's or chest's
   * on the same tile. */
  private pickupKey(x: number, y: number) {
    return `${this.lootKey(x, y)}:pickup`;
  }

  /** A treasure chest's Gold, once per physical chest, or null when it was
   * already paid; its Gold, the chest's own `PICKUP_GOLD` counted, is raised
   * by Gold Bonus and CHEST's tree. A Supply Chest (`kind`, fixed as its
   * floor was generated) adds upgrade materials, and an Equipment Chest a
   * Standard piece, once Equipment is open. CHEST's Double and Triple
   * (`roll.multiplier`) multiply its Gold and materials, and give that many
   * pieces (the first in `equipment`, the rest in `more`); TORCH's Chest
   * Cells (`roll.cells`) add a Greater Boss's Cells. */
  treasure(x: number, y: number, kind: ChestKind = "plain", roll: ChestRoll = PLAIN_ROLL): { gold: number; kind: ChestKind; equipment: EquipmentLoot | null; more: EquipmentLoot[]; cells: number } | null {
    if (!this.loot(this.lootKey(x, y))) return null;
    const rules = this.rules, floor = rules.equivalentFloor(rules.progressAt(this.run, y)), times = roll.multiplier;
    const gold = this.gold(this.withCombo(snap(this.chestGold(snap(rollGold(floor, this.rng) + PICKUP_GOLD)) * times)), this.goldenAt(x, y));
    if (!this.save.equipment.unlocked) kind = "plain";
    const pieces = kind === "plain" ? [] : kind === "supply" ? [this.chestEquipment(kind, times)] : Array.from({ length: times }, () => this.chestEquipment(kind));
    return { gold, kind, equipment: pieces[0] ?? null, more: pieces.slice(1), cells: roll.cells ? this.cells(1) : 0 };
  }

  /** What a Supply or Equipment Chest adds: upgrade materials, more in
   * each tower after the first (`times` as many), or a Standard piece kept
   * (or salvaged), a rarity higher by CHEST's Rarity Up chance. */
  private chestEquipment(kind: "supply" | "equipment", times = 1): EquipmentLoot {
    const e = this.save.equipment;
    if (kind === "supply") {
      const rolled = rollSupplies(this.tier, this.worn.materialFind, this.equipmentRng);
      const materials = times === 1 ? rolled : { ...rolled, quantity: rolled.quantity * times };
      e.materials[materials.id] += materials.quantity;
      tallyIn(this.slice.runFinds.materials, materials.id, materials.quantity);
      return { materials, item: null, salvaged: null };
    }
    const rolled = rollChestPiece(this.equipmentRng, e.categories), up = this.tree.rarityUp;
    const drop = up && this.equipmentRng() * 100 < up ? { ...rolled, rarity: rarityAbove(rolled.rarity) } : rolled;
    const kept = keepDrop(e, drop), material = CATEGORIES[drop.category].materials[0];
    if (!kept.item) tallyIn(this.slice.runFinds.materials, material, kept.salvaged);
    return { materials: null, item: kept.item, salvaged: kept.item ? null : { id: material, quantity: kept.salvaged, auto: kept.auto } };
  }

  /** The Gold opening the chest at (x, y) would bank, as `treasure` pays
   * it on average (`averageGold`, its roll unknown until it opens;
   * Goldback's combo counted): none once its tile is looted. Changes nothing. */
  treasureGoldPreview(x: number, y: number) {
    if (this.slice.lootedTiles[this.lootKey(x, y)]) return 0;
    const rules = this.rules, floor = rules.equivalentFloor(rules.progressAt(this.run, y));
    return goldBanked(snap(this.chestGold(snap(averageGold(floor) + PICKUP_GOLD)) * (this.run.goldCombo ?? 1)), this.goldContext(this.goldenAt(x, y))).gold;
  }

  /** A treasure chest's Gold `base` raised by Gold Bonus, then by CHEST's
   * tree's percent. */
  private chestGold(base: number) {
    const gold = this.bonused(base), more = this.tree.chestGold;
    return more ? snap((gold * (100 + more)) / 100) : gold;
  }

  /** Spare Change: Gold for a floor climbed for the first time in the run,
   * its Gold / Floor raised by research and the tier's bonus, and by
   * Golden Floor Multiplier when `reached`, the equivalent floor (from 1)
   * it climbed to, is a Golden Floor. Gated by `key` in lootedTiles, like a
   * kill's Gold; returns what it paid. */
  floorGold(key: string, reached: number) {
    const base = trainedAmount(this.trainingNow, "floorGold");
    if (!base || !this.loot(key)) return 0;
    return this.gold(snap(this.researched(base, "floorGold") * treeFactor(this.tree, "floorGold")), this.golden(reached));
  }

  /** Floor Skip Reward: when Skip climbs past the floor the run stands on
   * (`board`), its research percent of the Gold that floor's battles,
   * chests and items still hold: each enemy's kill Gold, each closed
   * treasure chest's average Gold (`averageGold`) and each item's, door's
   * and lit torch's Pickup Gold (the chests' and items' raised by Gold
   * Bonus), with the tier's bonus and, on a Golden Floor, its multiplier. Each one counted is marked looted, so one
   * fought, opened or picked up later pays no Gold again, and the floor
   * pays once a run. Returns what it paid. */
  skippedFloorGold(board: RoomWorld) {
    const percent = researched(this.save.archives, "floorSkipGold");
    if (!percent || !this.loot(`${this.lootKey(-1, -1)}:skipped`)) return 0;
    const chest = this.bonused(snap(averageGold(this.rules.equivalentFloor(this.rules.progressAt(this.run, 0))) + PICKUP_GOLD));
    const torches = litTorches(board);
    let found = 0;
    for (let y = 0; y < board.height; y++)
      for (let x = 0; x < board.width; x++) {
        const t = board.tile(x, y);
        let gold = 0;
        if (t.kind === "enemy" || t.kind === "treasure") {
          if (this.loot(this.lootKey(x, y))) gold = t.kind === "enemy" ? this.killGold(t.enemy!) : chest;
        } else if (ITEMS.has(t.kind) || (t.kind === "floor" && torches.has(point(x, y)))) {
          if (this.loot(this.pickupKey(x, y))) gold = this.bonused(pickupGold(t.kind === "floor" ? null : t));
        }
        found = snap(found + gold);
      }
    return found ? this.gold(snap((found * percent) / 100), this.golden(board.room + 1)) : 0;
  }

  /** Goldback's combo: `amount` times the multiplier its activations
   * tallied since the last Gold the run found, which is then used up. Only
   * a kill's or a chest's Gold, once paid (undo can't pay it again),
   * spends it. */
  private withCombo(amount: number) {
    const combo = this.run.goldCombo;
    if (!combo) return amount;
    delete this.run.goldCombo;
    return snap(amount * combo);
  }

  /** A card badge's Gold (Gold Touch) for a card reaching its
   * target, with the tier's bonus and the hero's floor's Golden Floor
   * Multiplier: once per target (`key`, in lootedTiles), since undo can't
   * take Gold back. Returns what it paid. */
  badgeGold(key: string, amount: number) {
    if (!this.loot(key)) return 0;
    return this.gold(amount, this.goldenHere);
  }

  /** A smelt's Gold (Smelt GK's, BK's and RK's trees): `base` raised by
   * Gold Bonus, `times` over (Key Smelter, Master Smelter), with the tier's
   * bonus and the hero's floor's Golden Floor Multiplier, once per smelt (`key`, in lootedTiles), since undo can't take
   * Gold back. Returns what it paid. */
  smeltGold(key: string, base: number, times: number) {
    if (!base || !this.loot(key)) return 0;
    return this.gold(snap(this.bonused(base) * times), this.goldenHere);
  }

  /** The key that gates a floor's Spare Change: the Tower's stairs tile at
   * (x, y), or the Delve's equivalent floor `y` on its `x = -1` column. */
  floorKey(x: number, y: number) {
    return this.lootKey(x, y);
  }

  /** Wishing Well: Silver for a floor climbed for the first time in the
   * run, its Silver / Floor raised by research and the run's boons, then by
   * Silver Bonus. Returns what it paid. */
  floorSilver() {
    const base = trainedAmount(this.trainingNow, "floorSilver");
    return base ? this.silver(snap(this.researched(base, "floorSilver") * (this.boons?.floorSilver ?? 1) * treeFactor(this.tree, "floorSilver"))) : 0;
  }

  /** Interest: for a floor climbed for the first time in the run, after
   * its Wishing Well Silver, Interest % research's share of the Silver
   * held (the run's Interest boons raising the share), up to Max
   * Interest. Silver Bonus doesn't raise it. Returns what it added. */
  interest() {
    const rate = researched(this.save.archives, "interestRate") * (this.boons?.interest ?? 1);
    if (!rate) return 0;
    const held = this.run.silver ?? 0;
    const paid = Math.min(this.interestCap, snap((held * rate) / 1000));
    if (paid > 0) this.run.silver = snap(held + paid);
    this.noteSilver(paid);
    return paid > 0 ? paid : 0;
  }

  /** The most Interest a floor pays (Max Interest research). */
  get interestCap() {
    return researched(this.save.archives, "interestCap");
  }
}
