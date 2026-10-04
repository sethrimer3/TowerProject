// The Equipment system's static data: the nine categories, their upgrade
// materials, the effect kinds an item can carry, and every item definition
// (Standard pieces from bosses, named Unique pieces from Gem pulls). Saves
// name items by definition id only, so this catalogue can change without
// touching saved equipment. Balance numbers (rarity caps, costs, drop and
// pull rates) live in `balance.ts`; see docs/EQUIPMENT.md.
import type { Mode } from "../entities.ts";
import type { EquipRarity } from "./balance.ts";

/** The nine equipment slots: the hero wears one piece of each. */
export type CategoryId = "weapon" | "chestplate" | "helmet" | "gloves" | "boots" | "cape" | "belt" | "ring" | "amulet";
export const CATEGORY_IDS: readonly CategoryId[] = ["weapon", "chestplate", "helmet", "gloves", "boots", "cape", "belt", "ring", "amulet"];

/** The upgrade material each category levels with, a currency apart from
 * the crafting materials (it takes no inventory space). */
export type EquipMaterialId = "whetstone" | "rivets" | "padding" | "leather" | "hobnails" | "silk" | "buckles" | "moonstone" | "amber";
export const EQUIP_MATERIAL_IDS: readonly EquipMaterialId[] = ["whetstone", "rivets", "padding", "leather", "hobnails", "silk", "buckles", "moonstone", "amber"];

export type CategoryDef = { name: string; plural: string; role: string; material: EquipMaterialId };
export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  weapon: { name: "Weapon", plural: "Weapons", role: "Offense: ATK, boss fights and what kills pay", material: "whetstone" },
  chestplate: { name: "Chestplate", plural: "Chestplates", role: "Defense: DEF, max HP and sustain", material: "rivets" },
  helmet: { name: "Helmet", plural: "Helmets", role: "The first blow: shroud, and what each fight teaches", material: "padding" },
  gloves: { name: "Gloves", plural: "Gloves", role: "Handling: ATK, keys and potions", material: "leather" },
  boots: { name: "Boots", plural: "Boots", role: "Movement: speed, Rush and fresh floors", material: "hobnails" },
  cape: { name: "Cape", plural: "Capes", role: "Fortune: Gold, Silver and materials", material: "silk" },
  belt: { name: "Belt", plural: "Belts", role: "Provisions: potions, max HP and Silver", material: "buckles" },
  ring: { name: "Ring", plural: "Rings", role: "Power: percentages of ATK, DEF and max HP", material: "moonstone" },
  amulet: { name: "Amulet", plural: "Amulets", role: "Life: max HP, regeneration and healing", material: "amber" },
};

export type EquipMaterialDef = { name: string; category: CategoryId; description: string };
export const EQUIP_MATERIALS: Record<EquipMaterialId, EquipMaterialDef> = {
  whetstone: { name: "Whetstone", category: "weapon", description: "A fine-grit stone that hones every edge." },
  rivets: { name: "Iron Rivets", category: "chestplate", description: "Rivets and plate scraps, hammered into armor." },
  padding: { name: "Quilted Padding", category: "helmet", description: "Thick lining that softens the first blow." },
  leather: { name: "Tanned Leather", category: "gloves", description: "Supple hide for a sure grip." },
  hobnails: { name: "Hobnails", category: "boots", description: "Iron studs for sure footing on worn stone." },
  silk: { name: "Spun Silk", category: "cape", description: "Fine thread that catches the light, and the luck." },
  buckles: { name: "Brass Buckles", category: "belt", description: "Clasps that keep provisions close at hand." },
  moonstone: { name: "Moonstone", category: "ring", description: "A pale stone that holds a quiet charge." },
  amber: { name: "Amber", category: "amulet", description: "Warm resin around a trapped spark of life." },
};
export const materialOf = (category: CategoryId) => CATEGORIES[category].material;

/** What an item can do, each read in one place: the loadout (stats, shroud,
 * Regen, starting keys), combat (`bossAttack`, `pierce`), the step rules (healing),
 * the run's purse (Gold, Silver, materials, boss drops), the hero's XP, and
 * movement. Percent kinds are in percent (5 is +5%). */
export type EffectKind =
  | "attack" | "defense" | "maxHp" | "attackPct" | "defensePct" | "maxHpPct"
  | "shroud" | "regen" | "yellowKeys" | "blueKeys" | "bossAttack" | "pierce"
  | "potionHeal" | "victoryHeal" | "floorHeal"
  | "goldFind" | "silverFind" | "xpGain" | "materialFind" | "bossDrops" | "startSilver"
  | "moveSpeed" | "rushTiles";

/** How an effect reads: its words after the number, whether the number is a
 * percent, whether it counts in whole units only (keys, Rush tiles) and
 * its words for more than one, and a sign other than + before it. */
type EffectText = { words: string; percent?: true; whole?: true; plural?: string; lead?: string };
export const EFFECTS: Record<EffectKind, EffectText> = {
  attack: { words: "ATK" },
  defense: { words: "DEF" },
  maxHp: { words: "max HP" },
  attackPct: { words: "ATK", percent: true },
  defensePct: { words: "DEF", percent: true },
  maxHpPct: { words: "max HP", percent: true },
  shroud: { words: "shroud (damage blocked each fight)" },
  regen: { words: "HP regained each step" },
  yellowKeys: { words: "yellow key each run", plural: "yellow keys each run", whole: true },
  blueKeys: { words: "blue key each run", plural: "blue keys each run", whole: true },
  bossAttack: { words: "ATK against bosses", percent: true },
  pierce: { words: "of enemy DEF ignored", percent: true, lead: "" },
  potionHeal: { words: "HP from potions", percent: true },
  victoryHeal: { words: "of max HP healed after each victory", percent: true, lead: "" },
  floorHeal: { words: "of max HP healed on each new floor", percent: true, lead: "" },
  goldFind: { words: "Gold found", percent: true },
  silverFind: { words: "Silver found", percent: true },
  xpGain: { words: "XP from kills", percent: true },
  materialFind: { words: "upgrade materials from kills", percent: true },
  bossDrops: { words: "boss equipment drop chance", percent: true },
  startSilver: { words: "Silver at the start of each run" },
  moveSpeed: { words: "movement speed", percent: true },
  rushTiles: { words: "tile a Rush crosses", plural: "tiles a Rush crosses", whole: true },
};

/** One line of an item's effects: `base` at level 1, `perLevel` more each
 * level after, both multiplied by the rarity's power, from rarity `from`
 * on (Common when absent). A `fixed` line (a drawback) ignores level and
 * rarity. With `mode`, it counts only in that mode's loadout. */
export type EffectLine = { kind: EffectKind; base: number; perLevel?: number; from?: EquipRarity; mode?: Mode; fixed?: true };

/** Standard pieces drop from bosses; Unique pieces come from Gem pulls and
 * each carries a specialised ability. Both level, merge and salvage alike. */
export type ItemClass = "standard" | "unique";
export type ItemDef = { id: string; name: string; category: CategoryId; class: ItemClass; identity: string; effects: EffectLine[] };

const line = (kind: EffectKind, base: number, perLevel = 0, more: Omit<EffectLine, "kind" | "base" | "perLevel"> = {}): EffectLine =>
  ({ kind, base, ...(perLevel ? { perLevel } : {}), ...more });
const U = { from: "uncommon" } as const, R = { from: "rare" } as const;
const TOWER = { mode: "tower" } as const, DELVE = { mode: "delve" } as const;

/** Every equipment definition, by category: the Standard piece first, then
 * the three Uniques. */
export const ITEMS: readonly ItemDef[] = [
  // Weapons
  { id: "knightsSword", name: "Knight's Sword", category: "weapon", class: "standard", identity: "Reliable raw ATK",
    effects: [line("attack", 3, 0.5), line("attackPct", 2, 0.1, U), line("defense", 1, 0.25, R)] },
  { id: "kingsbane", name: "Kingsbane", category: "weapon", class: "unique", identity: "Boss slayer: hits bosses harder and shakes loose more equipment",
    effects: [line("attack", 2, 0.3), line("bossAttack", 10, 0.25), line("attackPct", 1.5, 0.08, U), line("bossDrops", 5, 0.1, R)] },
  { id: "reapersScythe", name: "Reaper's Scythe", category: "weapon", class: "unique", identity: "Clears floors for profit: more XP and Silver from every kill",
    effects: [line("attack", 2, 0.3), line("xpGain", 5, 0.2), line("silverFind", 5, 0.2, U), line("victoryHeal", 0.5, 0.01, R)] },
  { id: "bloodpriceBlade", name: "Bloodprice Blade", category: "weapon", class: "unique", identity: "High risk: the most ATK of any weapon, paid for in max HP",
    effects: [line("attackPct", 8, 0.2), line("maxHpPct", -10, 0, { fixed: true }), line("attack", 3, 0.5, U), line("victoryHeal", 1.5, 0.03, R)] },
  // Chestplates
  { id: "steelCuirass", name: "Steel Cuirass", category: "chestplate", class: "standard", identity: "Reliable raw DEF",
    effects: [line("defense", 2, 0.4), line("defensePct", 2, 0.1, U), line("maxHp", 20, 4, R)] },
  { id: "bastionPlate", name: "Bastion Plate", category: "chestplate", class: "unique", identity: "Raw defense: DEF, more DEF, then a shroud for the first blows",
    effects: [line("defense", 3, 0.5), line("defensePct", 3, 0.12, U), line("shroud", 5, 1, R)] },
  { id: "giantsHauberk", name: "Giant's Hauberk", category: "chestplate", class: "unique", identity: "A deep pool of HP to outlast long fights",
    effects: [line("maxHp", 30, 6), line("maxHpPct", 4, 0.12, U), line("defense", 2, 0.3, R)] },
  { id: "verdantMail", name: "Verdant Mail", category: "chestplate", class: "unique", identity: "Sustain: regains HP as the hero walks and climbs",
    effects: [line("regen", 0.5, 0.05), line("defense", 1, 0.2), line("floorHeal", 2, 0.05, U), line("victoryHeal", 1, 0.02, R)] },
  // Helmets
  { id: "ironHelm", name: "Iron Helm", category: "helmet", class: "standard", identity: "Reliable max HP and DEF",
    effects: [line("maxHp", 15, 3), line("defense", 1, 0.25, U), line("shroud", 3, 0.5, R)] },
  { id: "sentinelVisor", name: "Sentinel's Visor", category: "helmet", class: "unique", identity: "Blocks the first blows of every fight",
    effects: [line("shroud", 6, 1.2), line("defensePct", 2, 0.08, U), line("maxHpPct", 3, 0.1, R)] },
  { id: "scholarsCirclet", name: "Scholar's Circlet", category: "helmet", class: "unique", identity: "Levels the hero faster, for more training points",
    effects: [line("xpGain", 8, 0.3), line("maxHp", 15, 3, U), line("silverFind", 5, 0.2, R)] },
  { id: "minersHelm", name: "Miner's Helm", category: "helmet", class: "unique", identity: "Made for the Delve: heals on new floors and digs up more there",
    effects: [line("maxHp", 10, 2), line("floorHeal", 3, 0.06, DELVE), line("xpGain", 10, 0.3, { ...U, ...DELVE }), line("materialFind", 10, 0.3, { ...R, ...DELVE })] },
  // Gloves
  { id: "leatherGauntlets", name: "Leather Gauntlets", category: "gloves", class: "standard", identity: "Reliable ATK and DEF",
    effects: [line("attack", 2, 0.3), line("defense", 1, 0.2, U), line("attackPct", 2, 0.08, R)] },
  { id: "brawlersWraps", name: "Brawler's Wraps", category: "gloves", class: "unique", identity: "More ATK, and a little life back from every win",
    effects: [line("attack", 3, 0.45), line("attackPct", 3, 0.1, U), line("victoryHeal", 0.5, 0.02, R)] },
  { id: "locksmithsGloves", name: "Locksmith's Gloves", category: "gloves", class: "unique", identity: "Keys: starts every run with spare yellow keys",
    effects: [line("yellowKeys", 1, 0.04), line("defense", 1, 0.2, U), line("blueKeys", 1, 0, { ...R, fixed: true })] },
  { id: "alchemistsGloves", name: "Alchemist's Gloves", category: "gloves", class: "unique", identity: "Potions: every potion heals more",
    effects: [line("potionHeal", 10, 0.4), line("maxHp", 10, 2, U), line("regen", 0.3, 0.03, R)] },
  // Boots
  { id: "travelersBoots", name: "Traveler's Boots", category: "boots", class: "standard", identity: "Reliable DEF and a little speed",
    effects: [line("defense", 1, 0.25), line("moveSpeed", 5, 0.15, U), line("maxHp", 15, 3, R)] },
  { id: "fleetstepBoots", name: "Fleetstep Boots", category: "boots", class: "unique", identity: "Raw speed: the hand walks faster everywhere",
    effects: [line("moveSpeed", 10, 0.4), line("defense", 1, 0.2, U), line("rushTiles", 1, 0, { ...R, fixed: true })] },
  { id: "pathfinderTreads", name: "Pathfinder's Treads", category: "boots", class: "unique", identity: "Automation: each Rush crosses more empty floor",
    effects: [line("rushTiles", 1, 0.05), line("moveSpeed", 5, 0.2, U), line("floorHeal", 1, 0.03, R)] },
  { id: "delversGreaves", name: "Delver's Greaves", category: "boots", class: "unique", identity: "Made for the Delve: faster, and healed by each new depth",
    effects: [line("moveSpeed", 15, 0.5, DELVE), line("floorHeal", 2, 0.05, DELVE), line("goldFind", 5, 0.2, { ...U, ...DELVE }), line("rushTiles", 1, 0.03, { ...R, ...DELVE })] },
  // Capes
  { id: "woolCloak", name: "Wool Cloak", category: "cape", class: "standard", identity: "Reliable max HP and a little DEF",
    effects: [line("maxHp", 10, 2), line("defense", 1, 0.2, U), line("goldFind", 3, 0.1, R)] },
  { id: "magpieMantle", name: "Magpie's Mantle", category: "cape", class: "unique", identity: "Wealth: more Gold, then Silver, from everything found",
    effects: [line("goldFind", 8, 0.3), line("silverFind", 5, 0.2, U), line("startSilver", 10, 1, R)] },
  { id: "gatherersShroud", name: "Gatherer's Shroud", category: "cape", class: "unique", identity: "Materials: more upgrade materials, and more boss drops",
    effects: [line("materialFind", 10, 0.4), line("bossDrops", 2, 0.05, U), line("goldFind", 4, 0.1, R)] },
  { id: "pilgrimsCape", name: "Pilgrim's Cape", category: "cape", class: "unique", identity: "A steady climb: heals on every new floor",
    effects: [line("floorHeal", 3, 0.08), line("potionHeal", 5, 0.2, U), line("maxHpPct", 3, 0.08, R)] },
  // Belts
  { id: "leatherBelt", name: "Leather Belt", category: "belt", class: "standard", identity: "Reliable max HP",
    effects: [line("maxHp", 20, 4), line("potionHeal", 5, 0.2, U), line("defense", 1, 0.25, R)] },
  { id: "provisionersBelt", name: "Provisioner's Belt", category: "belt", class: "unique", identity: "Potions: the strongest potion bonus",
    effects: [line("potionHeal", 15, 0.5), line("startSilver", 5, 0.5, U), line("regen", 0.3, 0.04, R)] },
  { id: "championsGirdle", name: "Champion's Girdle", category: "belt", class: "unique", identity: "Max HP that grows with everything else",
    effects: [line("maxHpPct", 4, 0.12), line("maxHp", 20, 4, U), line("shroud", 3, 0.6, R)] },
  { id: "merchantsSash", name: "Merchant's Sash", category: "belt", class: "unique", identity: "Silver: buys run training from the first floor",
    effects: [line("startSilver", 15, 1.5), line("silverFind", 5, 0.2, U), line("goldFind", 3, 0.1, R)] },
  // Rings
  { id: "silverBand", name: "Silver Band", category: "ring", class: "standard", identity: "A little of every percentage",
    effects: [line("attackPct", 1.5, 0.06), line("defensePct", 1.5, 0.06, U), line("maxHpPct", 1.5, 0.06, R)] },
  { id: "ringOfFury", name: "Ring of Fury", category: "ring", class: "unique", identity: "Offense in percent: scales with every point of ATK",
    effects: [line("attackPct", 3, 0.1), line("bossAttack", 4, 0.15, U), line("victoryHeal", 0.5, 0.01, R)] },
  { id: "ringOfWarding", name: "Ring of Warding", category: "ring", class: "unique", identity: "Defense in percent: scales with every point of DEF",
    effects: [line("defensePct", 3, 0.1), line("shroud", 3, 0.6, U), line("maxHpPct", 2, 0.06, R)] },
  { id: "spireSignet", name: "Spire Signet", category: "ring", class: "unique", identity: "Made for the Tower: ATK and DEF there, and more boss drops",
    effects: [line("attackPct", 2.5, 0.08, TOWER), line("defensePct", 2.5, 0.08, TOWER), line("goldFind", 5, 0.2, { ...U, ...TOWER }), line("bossDrops", 3, 0.05, { ...R, ...TOWER })] },
  // Amulets
  { id: "amberPendant", name: "Amber Pendant", category: "amulet", class: "standard", identity: "Max HP in percent, and a little Regen",
    effects: [line("maxHpPct", 1.5, 0.06), line("regen", 0.2, 0.02, U), line("xpGain", 3, 0.1, R)] },
  { id: "heartOfTheGrove", name: "Heart of the Grove", category: "amulet", class: "unique", identity: "Regeneration: the most HP back with every step",
    effects: [line("regen", 0.6, 0.06), line("maxHpPct", 3, 0.1, U), line("floorHeal", 2, 0.05, R)] },
  { id: "sagesLocket", name: "Sage's Locket", category: "amulet", class: "unique", identity: "Learning: more XP, then more materials and Silver",
    effects: [line("xpGain", 10, 0.35), line("materialFind", 5, 0.2, U), line("silverFind", 5, 0.2, R)] },
  { id: "phoenixTalisman", name: "Phoenix Talisman", category: "amulet", class: "unique", identity: "Rises from each fight: heals a share of max HP after every win",
    effects: [line("victoryHeal", 1.5, 0.03), line("maxHp", 20, 4, U), line("regen", 0.3, 0.03, R)] },
];

export type ItemId = string;
const BY_ID = new Map(ITEMS.map((d) => [d.id, d]));
/** The definition `id` names, or undefined for one the catalogue no longer has. */
export const itemDef = (id: string): ItemDef | undefined => BY_ID.get(id);
/** The Standard piece of each category, which bosses drop. */
export const standardOf = (category: CategoryId) => ITEMS.find((d) => d.category === category && d.class === "standard")!;
/** The Unique pieces of a category, which its Gem pulls choose among. */
export const uniquesOf = (category: CategoryId) => ITEMS.filter((d) => d.category === category && d.class === "unique");
