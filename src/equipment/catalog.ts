// The Equipment system's static data: the equipment categories, their shared upgrade
// materials, the effect kinds an item can carry, and every item definition
// (Standard pieces from chests/crafting, named Unique pieces from Gem pulls). Saves
// name items by definition id only, so this catalogue can change without
// touching saved equipment. Balance numbers (rarity caps, costs, drop and
// pull rates) live in `balance.ts`; see docs/EQUIPMENT.md.
/** Slots retained by the catalogue, including future unlocks. */
export type CategoryId = "weapon" | "shield" | "chestplate" | "helmet" | "gloves" | "boots" | "cape" | "belt" | "ring" | "amulet";
export const CATEGORY_IDS: readonly CategoryId[] = ["weapon", "shield", "chestplate", "helmet", "gloves", "boots", "cape", "belt", "ring", "amulet"];
export const STARTER_CATEGORIES: readonly CategoryId[] = ["helmet", "shield", "chestplate", "weapon", "boots"];

/** Four base resources; recipes refer to these instead of separate currencies. */
export type EquipMaterialId = "whetstone" | "rivets" | "padding" | "hobnails";
export const EQUIP_MATERIAL_IDS: readonly EquipMaterialId[] = ["padding", "rivets", "whetstone", "hobnails"];
export type CategoryDef = { name: string; plural: string; role: string; materials: readonly EquipMaterialId[] };
export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  weapon: { name: "Sword", plural: "Swords", role: "Offense: ATK, boss fights and what kills pay", materials: ["whetstone"] },
  shield: { name: "Shield", plural: "Shields", role: "Guard: DEF and protection from the first blow", materials: ["rivets"] },
  chestplate: { name: "Chestplate", plural: "Chestplates", role: "Superior armor: stronger defense, vitality and sustain", materials: ["rivets", "padding", "whetstone", "hobnails"] },
  helmet: { name: "Helmet", plural: "Helmets", role: "The first blow: shroud, and what each fight teaches", materials: ["padding"] },
  gloves: { name: "Gloves", plural: "Gloves", role: "Handling: ATK, keys and potions", materials: ["padding", "whetstone"] },
  boots: { name: "Boots", plural: "Boots", role: "Movement: speed, Dash and fresh floors", materials: ["hobnails"] },
  cape: { name: "Cape", plural: "Capes", role: "Fortune: Gold, Silver and materials", materials: ["rivets", "padding"] },
  belt: { name: "Belt", plural: "Belts", role: "Provisions: potions, max HP and Silver", materials: ["rivets", "hobnails"] },
  ring: { name: "Ring", plural: "Rings", role: "Power: percentages of ATK, DEF and max HP", materials: ["whetstone", "padding"] },
  amulet: { name: "Amulet", plural: "Amulets", role: "Life: max HP, regeneration and healing", materials: ["whetstone", "hobnails"] },
};
export type EquipMaterialDef = { name: string; category: CategoryId; description: string };
export const EQUIP_MATERIALS: Record<EquipMaterialId, EquipMaterialDef> = {
  whetstone: { name: "Whetstone", category: "weapon", description: "Hones swords and forms part of combined recipes." },
  rivets: { name: "Iron Rivets", category: "shield", description: "Reinforces shields and forms part of combined recipes." },
  padding: { name: "Quilted Padding", category: "helmet", description: "Lines helmets and forms part of combined recipes." },
  hobnails: { name: "Hobnails", category: "boots", description: "Studs boots and forms part of combined recipes." },
};
export const materialsOf = (category: CategoryId) => CATEGORIES[category].materials;
/** Salvage returns the recipe's primary base resource. */
export const materialOf = (category: CategoryId) => materialsOf(category)[0];
/** Every input is charged in full, keeping four-resource armor more costly. */
export const hasMaterials = (held: Record<EquipMaterialId, number>, category: CategoryId, amount: number) =>
  materialsOf(category).every(m => held[m] >= amount);
export function spendMaterials(held: Record<EquipMaterialId, number>, category: CategoryId, amount: number) {
  for (const m of materialsOf(category)) held[m] -= amount;
}

/** Old mission rewards keep their amount, paying an equivalent base resource. */
export function baseMaterial(id: unknown): EquipMaterialId | undefined {
  if (EQUIP_MATERIAL_IDS.includes(id as EquipMaterialId)) return id as EquipMaterialId;
  const legacy: Record<string, EquipMaterialId> = { leather: "whetstone", silk: "padding", buckles: "hobnails", moonstone: "whetstone", amber: "hobnails" };
  return typeof id === "string" && Object.hasOwn(legacy, id) ? legacy[id] : undefined;
}

/** What an item can do, each read in one place: the loadout (stats, shroud,
 * Regen, starting keys), the Arcana desk (`arcanumDamage`), combat (`bossAttack`, `pierce`), the step rules (healing),
 * the run's chests (`chestFind`, as it goes inside), the run's purse (Gold, Silver, materials), the hero's XP, and
 * movement. Percent kinds are in percent (5 is +5%). */
export type EffectKind =
  | "attack" | "defense" | "maxHp" | "attackPct" | "defensePct" | "maxHpPct"
  | "shroud" | "regen" | "yellowKeys" | "blueKeys" | "bossAttack" | "pierce"
  | "potionHeal" | "victoryHeal" | "floorHeal"
  | "goldFind" | "silverFind" | "xpGain" | "materialFind" | "chestFind" | "startSilver"
  | "moveSpeed" | "dashTiles" | "arcanumDamage";

/** How an effect reads: its words after the number, whether the number is a
 * percent, whether it counts in whole units only (keys, Dash tiles) and
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
  yellowKeys: { words: "gold key each climb", plural: "gold keys each climb", whole: true },
  blueKeys: { words: "blue key each climb", plural: "blue keys each climb", whole: true },
  bossAttack: { words: "ATK against bosses", percent: true },
  pierce: { words: "of enemy DEF ignored", percent: true, lead: "" },
  potionHeal: { words: "HP from potions", percent: true },
  victoryHeal: { words: "of max HP healed after each victory", percent: true, lead: "" },
  floorHeal: { words: "of max HP healed on each new floor", percent: true, lead: "" },
  goldFind: { words: "Gold found", percent: true },
  silverFind: { words: "Silver found", percent: true },
  xpGain: { words: "XP from kills", percent: true },
  materialFind: { words: "upgrade materials from Supply Chests", percent: true },
  chestFind: { words: "Supply and Equipment Chest chance", percent: true },
  startSilver: { words: "Silver at the start of each climb" },
  moveSpeed: { words: "movement speed", percent: true },
  dashTiles: { words: "tile a Dash crosses", plural: "tiles a Dash crosses", whole: true },
  arcanumDamage: { words: "Arcanum Damage", percent: true },
};

/** Standard pieces come from Equipment Chests; Unique pieces come from Gem pulls and
 * each carries a specialised ability. Both level, merge and salvage alike;
 * what leveling raises is the category's main effect (main-effect.ts). */
export type ItemClass = "standard" | "unique";
export type ItemDef = { id: string; name: string; category: CategoryId; class: ItemClass; identity: string };

/** Every equipment definition, by category: the Standard piece first, then
 * the three Uniques. */
export const ITEMS: readonly ItemDef[] = [
  // Weapons
  { id: "knightsSword", name: "Knight's Sword", category: "weapon", class: "standard", identity: "Reliable raw ATK" },
  { id: "kingsbane", name: "Kingsbane", category: "weapon", class: "unique", identity: "Boss slayer: hits bosses harder, and finds more Supply and Equipment Chests" },
  { id: "reapersScythe", name: "Reaper's Scythe", category: "weapon", class: "unique", identity: "Clears floors for profit: more XP and Silver from every kill" },
  { id: "bloodpriceBlade", name: "Bloodprice Blade", category: "weapon", class: "unique", identity: "High risk: the most ATK of any weapon, paid for in max HP" },
  // Shields
  { id: "ironShield", name: "Iron Shield", category: "shield", class: "standard", identity: "Reliable DEF and protection" },
  { id: "wardensShield", name: "Warden's Shield", category: "shield", class: "unique", identity: "Blocks the first blows" },
  { id: "bulwarkShield", name: "Bulwark Shield", category: "shield", class: "unique", identity: "Steady defense and vitality" },
  { id: "dawnShield", name: "Dawn Shield", category: "shield", class: "unique", identity: "Regains health between battles" },
  // Chestplates
  { id: "steelCuirass", name: "Steel Cuirass", category: "chestplate", class: "standard", identity: "Superior DEF and vitality" },
  { id: "bastionPlate", name: "Bastion Plate", category: "chestplate", class: "unique", identity: "Raw defense: DEF, more DEF, then a shroud for the first blows" },
  { id: "giantsHauberk", name: "Giant's Hauberk", category: "chestplate", class: "unique", identity: "A deep pool of HP to outlast long fights" },
  { id: "verdantMail", name: "Verdant Mail", category: "chestplate", class: "unique", identity: "Sustain: regains HP as the hero walks and climbs" },
  // Helmets
  { id: "ironHelm", name: "Iron Helm", category: "helmet", class: "standard", identity: "Reliable max HP and DEF" },
  { id: "sentinelVisor", name: "Sentinel's Visor", category: "helmet", class: "unique", identity: "Blocks the first blows of every fight" },
  { id: "scholarsCirclet", name: "Scholar's Circlet", category: "helmet", class: "unique", identity: "Levels the hero faster, for more training points" },
  { id: "minersHelm", name: "Miner's Helm", category: "helmet", class: "unique", identity: "Made for the Delve: heals on new floors and digs up more there" },
  // Gloves
  { id: "leatherGauntlets", name: "Leather Gauntlets", category: "gloves", class: "standard", identity: "Reliable ATK and DEF" },
  { id: "brawlersWraps", name: "Brawler's Wraps", category: "gloves", class: "unique", identity: "More ATK, and a little life back from every win" },
  { id: "locksmithsGloves", name: "Locksmith's Gloves", category: "gloves", class: "unique", identity: "Keys: starts every climb with spare gold keys" },
  { id: "alchemistsGloves", name: "Alchemist's Gloves", category: "gloves", class: "unique", identity: "Potions: every potion heals more" },
  // Boots
  { id: "travelersBoots", name: "Traveler's Boots", category: "boots", class: "standard", identity: "Reliable DEF and a little speed" },
  { id: "fleetstepBoots", name: "Fleetstep Boots", category: "boots", class: "unique", identity: "Raw speed: the hand walks faster everywhere" },
  { id: "pathfinderTreads", name: "Pathfinder's Treads", category: "boots", class: "unique", identity: "Automation: each Dash crosses more empty floor" },
  { id: "delversGreaves", name: "Delver's Greaves", category: "boots", class: "unique", identity: "Made for the Delve: faster, and healed by each new depth" },
  // Capes
  { id: "woolCloak", name: "Wool Cloak", category: "cape", class: "standard", identity: "Reliable max HP and a little DEF" },
  { id: "magpieMantle", name: "Magpie's Mantle", category: "cape", class: "unique", identity: "Wealth: more Gold, then Silver, from everything found" },
  { id: "gatherersShroud", name: "Gatherer's Shroud", category: "cape", class: "unique", identity: "Materials: more upgrade materials, and more Supply and Equipment Chests" },
  { id: "pilgrimsCape", name: "Pilgrim's Cape", category: "cape", class: "unique", identity: "A steady climb: heals on every new floor" },
  // Belts
  { id: "leatherBelt", name: "Leather Belt", category: "belt", class: "standard", identity: "Reliable max HP" },
  { id: "provisionersBelt", name: "Provisioner's Belt", category: "belt", class: "unique", identity: "Potions: the strongest potion bonus" },
  { id: "championsGirdle", name: "Champion's Girdle", category: "belt", class: "unique", identity: "Max HP that grows with everything else" },
  { id: "merchantsSash", name: "Merchant's Sash", category: "belt", class: "unique", identity: "Silver: buys climb training from the first floor" },
  // Rings
  { id: "silverBand", name: "Silver Band", category: "ring", class: "standard", identity: "A little of every percentage" },
  { id: "ringOfFury", name: "Ring of Fury", category: "ring", class: "unique", identity: "Offense in percent: scales with every point of ATK" },
  { id: "ringOfWarding", name: "Ring of Warding", category: "ring", class: "unique", identity: "Defense in percent: scales with every point of DEF" },
  { id: "spireSignet", name: "Spire Signet", category: "ring", class: "unique", identity: "Made for the Tower: ATK and DEF there, and more Supply and Equipment Chests" },
  // Amulets
  { id: "amberPendant", name: "Amber Pendant", category: "amulet", class: "standard", identity: "Max HP in percent, and a little Regen" },
  { id: "heartOfTheGrove", name: "Heart of the Grove", category: "amulet", class: "unique", identity: "Regeneration: the most HP back with every step" },
  { id: "sagesLocket", name: "Sage's Locket", category: "amulet", class: "unique", identity: "Learning: more XP, then more materials and Silver" },
  { id: "phoenixTalisman", name: "Phoenix Talisman", category: "amulet", class: "unique", identity: "Rises from each fight: heals a share of max HP after every win" },
];

export type ItemId = string;
const BY_ID = new Map(ITEMS.map((d) => [d.id, d]));
/** The definition `id` names, or undefined for one the catalogue no longer has. */
export const itemDef = (id: string): ItemDef | undefined => BY_ID.get(id);
/** The Standard piece of each category, which Equipment Chests hold. */
export const standardOf = (category: CategoryId) => ITEMS.find((d) => d.category === category && d.class === "standard")!;
/** The Unique pieces of a category, which its Gem pulls choose among. */
export const uniquesOf = (category: CategoryId) => ITEMS.filter((d) => d.category === category && d.class === "unique");
