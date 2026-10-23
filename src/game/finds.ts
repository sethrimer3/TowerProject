import { doorName, doorRule, drainsHp, pickupGold } from "../doors.ts";
import type { HandBonus } from "../cards.ts";
import { compounded, keyStat, type TreeBonus } from "../card-trees.ts";
import type { ChestKind, Enemy, Mode, Tile, KeyColor } from "../entities.ts";
import { RARITY_TIERS } from "../equipment/balance.ts";
import { EQUIP_MATERIALS, itemDef } from "../equipment/catalog.ts";
import { snap } from "../exact.ts";
import type { EventMissionType } from "../events/catalog.ts";
import type { MissionType } from "../missions/catalog.ts";
import { MODES, type ModeProfile } from "../modes.ts";
import { noteKey, notesOf, tallyIn } from "../run-notes.ts";
import type { Drop, GainArt } from "../shown.ts";
import { HEART_DOOR_HP, shardStat, type StepEffect, type StepRules } from "../step-effects.ts";
import { enemyStat, keyCount, wholeChange } from "../whole.ts";
import type { DeskHost } from "./desk.ts";
import type { ChestRoll, EquipmentLoot, RunPurse } from "./run-purse.ts";

/** What the run's finds read from the game and report back to it: the
 * purse they are paid through, the step rules a shard's stat is read by,
 * the missions and Event they count toward, and the gains, XP and heals
 * the board and HUD show. */
export interface FindsHost extends DeskHost {
  readonly mode: Mode;
  readonly purse: RunPurse;
  readonly stepRules: StepRules;
  /** What the cards of the run's hand give while held: a key's Gold, a
   * chest's chances of Supplies or Equipment. */
  readonly handBonus: HandBonus;
  /** What the card trees of the run's hand give: a key's, door's or
   * shard's Gold. */
  readonly treeBonus: TreeBonus;
  /** A treasure chest's own rolls at (x, y): CHEST's Double and Triple, TORCH's Chest Cells. */
  chestRoll(x: number, y: number): ChestRoll;
  readonly missions: { record(type: MissionType, amount?: number, key?: string): void };
  readonly events: { record(type: EventMissionType, amount?: number, key?: string): void };
  gain(x: number, y: number, text: string, art?: GainArt | null, drop?: Drop, kind?: "door"): void;
  gainXp(enemy: Enemy, floor: number, scale?: number): void;
  recordHeal(n: number): void;
}

/** What the run finds as it plays: a kill, an item taken, a chest or a door
 * opened. Each is paid through the purse (`RunPurse`, which gates Gold so
 * undo can't pay it twice), rises off the board as gains, counts toward the
 * missions, the Event and the run's notes, and is named on the status line.
 * The game decides when (a fight won, an arrow's kill, a step landed). */
export class Finds {
  constructor(private readonly host: FindsHost) {}

  /** Pays a kill at `at` (a fight won, or an arrow's): counted, its XP,
   * Silver, Gold and a Greater Boss's Cells. Returns what it found, as the
   * status line names it. */
  kill(enemy: Enemy, at: { x: number; y: number }, scale: number, instakill: boolean, crits?: number) {
    const { run, mode } = this.host, rules: ModeProfile = MODES[mode];
    run.kills++;
    const purse = this.host.purse, key = `${mode}:${purse.killKey(enemy, at.x, at.y)}`;
    this.countKill(enemy, key);
    const floor = rules.equivalentFloor(rules.progressAt(run, at.y));
    this.host.gainXp(enemy, floor, scale);
    // Silver belongs to the run, so it isn't gated like Gold: undo takes it back.
    const silver = purse.killSilver(enemy, floor, scale);
    const { gold, cells } = purse.enemyLoot(enemy, at.x, at.y, scale, instakill);
    const cellsFound = cells ? [cellsText(cells)] : [];
    // Gold over Silver at the tile, the rest below.
    this.drops(at, [
      ...(gold ? [{ text: `+${wholeChange(gold)} Gold`, art: { coin: "gold" as const } }] : []),
      { text: `+${wholeChange(silver)} Silver`, art: { coin: "silver" } },
      ...cellsFound.map((text) => ({ text, art: { cell: true as const } })),
    ], gold ? 1 : 0);
    if (crits) this.host.events.record("crits", crits, key);
    return [...coinsText(gold, silver), ...cellsFound];
  }
  /** A kill counts toward the missions and the Event for its strength, once
   * a `key` (the mode and the kill's loot key). */
  private countKill(enemy: Enemy, key: string) {
    const s = enemy.strength;
    const type: MissionType & EventMissionType = s === "boss" || s === "greaterBoss" ? "bosses" : s === "strong" ? "strong" : s === "elite" ? "elite" : "basic";
    this.host.missions.record(type, 1, key);
    this.host.events.record(type, 1, key);
  }
  /** Pickup rewards and treasure payouts; stats were already applied. */
  pickup(t: Tile, x: number, y: number, outcome: StepEffect) {
    const { missions, events } = this.host, text = pickupText(t, outcome, this.host.stepRules);
    this.notePickup(t, outcome);
    if (text) {
      this.host.gain(x, y, text, { tile: { ...t } });
      // A key card held pays its Gold on top of the key's own, and KEY's
      // tree raises it; ATK UP's and DEF UP's trees raise a shard's.
      const tree = this.host.treeBonus;
      if (t.kind === "key") this.pickupGold(t, { x, y }, this.host.handBonus.keys[t.color!]?.gold, compounded(tree.keyGold, keyStat(tree, t.color!, "KeyGold")));
      else this.pickupGold(t, { x, y }, 0, t.kind === "attack" ? tree.attackShardGold : t.kind === "defense" ? tree.defenseShardGold : 0);
      if (t.kind === "potion") this.host.recordHeal(outcome.healed);
      // KEY's Key Heal and Key Overheal rise below the key.
      if (t.kind === "key" && outcome.healed) {
        this.host.gain(x, y, `+${wholeChange(outcome.healed)} HP`, { heart: true }, { row: 2, with: true });
        this.host.recordHeal(outcome.healed);
      }
      // HEAL's tree finds Silver with each potion, KEY's with each key, and ATK UP's and DEF UP's with each shard.
      const silverFound = t.kind === "potion" ? tree.potionSilver : t.kind === "key" ? snap(tree.keySilver + keyStat(tree, t.color!, "KeySilver"))
        : t.kind === "attack" ? tree.attackShardSilver : t.kind === "defense" ? tree.defenseShardSilver : 0;
      if (silverFound) {
        const silver = this.host.purse.silver(silverFound);
        if (silver) this.host.gain(x, y, `+${wholeChange(silver)} Silver`, { coin: "silver" }, { row: outcome.healed && t.kind === "key" ? 3 : 2, with: true });
      }
      if (t.kind === "potion") missions.record("potions", 1, this.missionKey({ x, y }));
      if (t.kind === "potion") events.record("potions", 1, this.missionKey({ x, y }));
      if (t.kind === "key" && t.color !== "yellow") missions.record(t.color === "blue" ? "blueKeys" : "redKeys", 1, this.missionKey({ x, y }));
      this.host.message = text;
    }
    if (t.kind === "treasure") this.treasure(x, y, t.chest ?? "plain");
  }
  /** Gold Bonus's Gold for taking `t` (a torch when null) off the floor at
   * `at`, or opening it (a door), `more` added to its Pickup Gold and the
   * whole raised by `percent` (a card tree's), rising a row up at the same
   * time as the item's own gain (a door's last key or HP) where it has one. */
  pickupGold(t: Tile | null, at: { x: number; y: number }, more = 0, percent = 0) {
    const gold = this.host.purse.pickupGold(at.x, at.y, snap(pickupGold(t) + (more ?? 0)), percent);
    if (gold) this.host.gain(at.x, at.y, `+${wholeChange(gold)} Gold`, { coin: "gold" }, { row: 1, with: !!t });
  }
  /** A pickup counted in the run's notes: a key (by colour, under a
   * badge's scale), a potion, or an ATK or DEF shard. */
  private notePickup(t: Tile, outcome: StepEffect) {
    const run = this.host.run, notes = notesOf(run);
    if (!notes) return;
    if (t.kind === "key") noteKey(run, t.color!, outcome.keyAmount ?? 1);
    else if (t.kind === "potion") notes.potions++;
    else if (t.kind === "attack") notes.attackShards++;
    else if (t.kind === "defense") notes.defenseShards++;
  }
  /** A treasure chest: counted, and paid once per physical chest (undo and
   * reopening can't pay it again). It may be a Supply or Equipment Chest
   * (`kind`, fixed as its floor was generated under the run's `chestOdds`). */
  treasure(x: number, y: number, kind: ChestKind) {
    const host = this.host, roll = host.chestRoll(x, y);
    host.run.treasures++;
    host.events.record("chests", 1, this.missionKey({ x, y }));
    // CHEST's tree finds Silver with each chest, as HEAL's does with each potion (undo takes it back with the run).
    const silverFound = host.treeBonus.chestSilver, silver = silverFound ? host.purse.silver(snap(silverFound * roll.multiplier)) : 0;
    const loot = host.purse.treasure(x, y, kind, roll);
    if (!loot) {
      if (silver) host.gain(x, y, `+${wholeChange(silver)} Silver`, { coin: "silver" });
      return;
    }
    const pieces = [loot.equipment, ...loot.more], found = pieces.flatMap(equipmentGains);
    for (const piece of pieces) {
      if (piece?.item || piece?.salvaged) host.events.record("equipment", 1, this.missionKey({ x, y }));
      if (piece?.item) host.save[host.mode].runFinds.equipment++;
    }
    const cells = loot.cells ? [{ text: cellsText(loot.cells), art: { cell: true as const } }] : [];
    // The Gold at the tile, its Silver, Cells and what a Supply or Equipment Chest holds below it, rising together.
    this.drops({ x, y }, [{ text: `+${wholeChange(loot.gold)} Gold`, art: { coin: "gold" } }, ...(silver ? [{ text: `+${wholeChange(silver)} Silver`, art: { coin: "silver" as const } }] : []), ...cells, ...found]);
    // Double and Triple flash their multiplier over the chest.
    if (roll.multiplier > 1) host.gain(x, y, `×${roll.multiplier}`, { multiplier: roll.multiplier }, { row: 0, with: true });
    const named = loot.kind === "supply" ? ["Supply Chest"] : loot.kind === "equipment" ? ["Equipment Chest"] : [];
    host.message = [...named, ...(roll.multiplier > 1 ? [`×${roll.multiplier}`] : []), `+${wholeChange(loot.gold)} Gold`, ...(silver ? [`+${wholeChange(silver)} Silver`] : []), ...cells.map((c) => c.text), ...found.map((g) => g.text)].join(" · ");
  }
  /** Each key the door took rises from it with a minus sign; a door that
   * takes HP (a Heart Door, down to 1, or a Wooden Door broken without a
   * key) raises a heart with the HP it took (a toll, not damage: it never
   * costs an area's mastery), `drained` before DOOR's Door Heal, which
   * rises after it. A door DOOR's Secret Knock opened takes nothing. */
  door(t: Tile, outcome: StepEffect, drained: number, at: { x: number; y: number }) {
    const host = this.host, keysSpent = outcome.keysSpent, amount = outcome.keyAmount ?? 1, n = keysSpent.length, rule = doorRule(t), notes = notesOf(host.run);
    if (notes) tallyIn(notes.doors, doorName(t));
    for (const color of keysSpent) host.gain(at.x, at.y, `−${keyCount(amount)} ${color} key`, { tile: { kind: "key", color }, spent: true }, undefined, "door");
    if (!outcome.free && (!n || (drainsHp(rule) && drained > 0))) host.gain(at.x, at.y, `−${wholeChange(drained)} HP`, { heart: true }, undefined, "door");
    if (outcome.healed) {
      host.gain(at.x, at.y, `+${wholeChange(outcome.healed)} HP`, { heart: true }, { row: 2, with: true });
      host.recordHeal(outcome.healed);
    }
    // DOOR's tree raises a door's Gold, and finds Silver with it.
    const tree = host.treeBonus;
    this.pickupGold(t, at, 0, tree.doorGold);
    if (tree.doorSilver) {
      const silver = host.purse.silver(tree.doorSilver);
      if (silver) host.gain(at.x, at.y, `+${wholeChange(silver)} Silver`, { coin: "silver" }, { row: 2, with: true });
    }
    const spent = amount === 1 ? `${n} key${n === 1 ? "" : "s"} spent` : `${keyCount(snap(n * amount))} keys spent`;
    if (outcome.free) host.message = `${doorName(t)} opened · Secret Knock`;
    else if (rule.type === "wood" && !n) host.message = `${doorName(t)} broken down · −${wholeChange(drained)} HP`;
    else host.message = `${doorName(t)} opened${n ? ` · ${spent}` : ""}${drainsHp(rule) ? (host.run.player.hp > HEART_DOOR_HP ? " · HP drained" : " · HP drained to 1") : ""}`;
  }
  /** Raises the Gold and Silver just found from `at`, each only when some
   * was; a kill always shows its Silver. */
  coins(at: { x: number; y: number }, gold: number, silver: number, alwaysSilver = true) {
    if (gold) this.host.gain(at.x, at.y, `+${wholeChange(gold)} Gold`, { coin: "gold" });
    if (silver || alwaysSilver) this.host.gain(at.x, at.y, `+${wholeChange(silver)} Silver`, { coin: "silver" });
  }
  /** Queues `drops` (a kill's or a chest's) to rise from `at` together,
   * stacked a row apart from row `top` down. */
  private drops(at: { x: number; y: number }, drops: { text: string; art: GainArt }[], top = 0) {
    drops.forEach(({ text, art }, i) => this.host.gain(at.x, at.y, text, art, { row: top - i, with: i > 0 }));
  }
  /** What a kill or pickup at `at` counts as for the missions: the mode
   * and its loot key, so undo bringing the tile back can't count it again. */
  private missionKey(at: { x: number; y: number }) {
    const { mode, run } = this.host;
    const rules: ModeProfile = MODES[mode];
    return `${mode}:${rules.lootKey(run, at.x, at.y)}`;
  }
}

/** Cells found, as "+3 Cells" (to two decimals when a badge's scale left
 * a fraction). */
const cellsText = (cells: number) => `+${keyCount(cells)} ${keyCount(cells) === "1" ? "Cell" : "Cells"}`;
/** What a chest gave toward Equipment: the status line's words for each, and
 * the icon that rises off the board for it (a material with its count, or
 * the piece itself). */
function equipmentGains(loot: EquipmentLoot | null): { text: string; art: GainArt }[] {
  if (!loot) return [];
  const gains: { text: string; art: GainArt }[] = [];
  if (loot.materials) gains.push({ text: `+${loot.materials.quantity} ${EQUIP_MATERIALS[loot.materials.id].name}`, art: { equipMaterial: loot.materials.id, quantity: loot.materials.quantity } });
  if (loot.item) gains.push({ text: `${RARITY_TIERS[loot.item.rarity].name} ${itemDef(loot.item.def)!.name}!`, art: { equipPiece: loot.item.def, rarity: loot.item.rarity } });
  if (loot.salvaged) gains.push({ text: `${loot.salvaged.auto ? "Auto-salvaged" : "Inventory full"} · +${loot.salvaged.quantity} ${EQUIP_MATERIALS[loot.salvaged.id].name}`, art: { equipMaterial: loot.salvaged.id, quantity: loot.salvaged.quantity } });
  return gains;
}
/** A kill's Gold (when it paid any) and Silver, as the status line names them. */
const coinsText = (gold: number, silver: number) => [...(gold ? [`+${wholeChange(gold)} Gold`] : []), `+${wholeChange(silver)} Silver`];
/** What picking up `t` shows: the key, the HP a potion healed, or the
 * shard's stat under `rules`; null for anything else. */
function pickupText(t: Tile, outcome: StepEffect, rules: StepRules) {
  switch (t.kind) {
    case "key": return `+${keyCount(outcome.keyAmount ?? 1)} ${t.color} key`;
    case "potion": return `+${wholeChange(outcome.healed)} HP`;
    case "attack": return `+${enemyStat(shardStat(t, rules))} attack`;
    case "defense": return `+${enemyStat(shardStat(t, rules))} defense`;
    default: return null;
  }
}
