// The Equipment system's static data: the equipment categories, their shared upgrade
// materials, the effect kinds an item can carry, and every item definition
// (Standard pieces from chests/crafting, named Unique pieces from Gem pulls). Saves
// name items by definition id only, so this catalogue can change without
// touching saved equipment. Balance numbers (rarity caps, costs, drop and
// pull rates) live in `balance.ts`; see docs/EQUIPMENT.md.
import type { ArcanumId } from "../arcana/arcana.ts";
import { POWER_IDS, type PowerId } from "./powers.ts";

/** Slots retained by the catalogue, including future unlocks. */
export type CategoryId = "weapon" | "shield" | "chestplate" | "helmet" | "gloves" | "boots" | "cape" | "belt" | "amulet";
export const CATEGORY_IDS: readonly CategoryId[] = ["weapon", "shield", "chestplate", "helmet", "gloves", "boots", "cape", "belt", "amulet"];
export const STARTER_CATEGORIES: readonly CategoryId[] = ["helmet", "shield", "chestplate", "weapon", "boots"];

/** Four base resources; recipes refer to these instead of separate currencies. */
export type EquipMaterialId = "whetstone" | "rivets" | "padding" | "hobnails";
export const EQUIP_MATERIAL_IDS: readonly EquipMaterialId[] = ["padding", "rivets", "whetstone", "hobnails"];
export type CategoryDef = { name: string; plural: string; role: string; materials: readonly EquipMaterialId[] };
export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  weapon: { name: "Sword", plural: "Swords", role: "Offense: ATK, crits and the Archer's shots", materials: ["whetstone"] },
  shield: { name: "Shield", plural: "Shields", role: "Defense: DEF, max HP, healing and the Aether Shield", materials: ["rivets"] },
  chestplate: { name: "Chestplate", plural: "Chestplates", role: "Efficiency: max HP, the other pieces' main effects, speed and drops", materials: ["rivets", "padding", "whetstone", "hobnails"] },
  helmet: { name: "Helmet", plural: "Helmets", role: "Arcana: Arcanum Damage and every arcanum's attributes", materials: ["padding"] },
  boots: { name: "Boots", plural: "Boots", role: "Utility: Gold, Silver, keys, Free Upgrades and Level Skips", materials: ["hobnails"] },
  // The future corners: each between two starting pieces, levelled with both their materials.
  gloves: { name: "Gloves", plural: "Gloves", role: "Offense and Utility", materials: ["whetstone", "hobnails"] },
  belt: { name: "Belt", plural: "Belts", role: "Offense and Arcana", materials: ["whetstone", "padding"] },
  cape: { name: "Cape", plural: "Capes", role: "Defense and Utility", materials: ["rivets", "hobnails"] },
  amulet: { name: "Amulet", plural: "Amulets", role: "Defense and Arcana", materials: ["rivets", "padding"] },
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

/** An arcanum's attribute a Helmet substat raises: the arcanum and the
 * attribute's place (0 to 2, as `ARCANA` lists them). */
export type ArcanaKind = `arcanum:${ArcanumId}:${0 | 1 | 2}`;
/** What an item can do, each read in one place: the loadout (stats, shroud,
 * Regen, starting keys, Thorns, Parry, Lifesteal, Armor Break, Shield
 * Thorns), the Training rows equipment raises (`trainedAmount`'s `gear`:
 * crits, the Archer's rows, the Aether Shield, Overheal), the Arcana desk
 * (`arcanumDamage` and each `ArcanaKind`), combat (`bossAttack`, `pierce`,
 * `comboAttack`), the step rules (healing, Key Efficiency, Shield Regen),
 * the run's chests and drops, the run's purse (Gold, Silver, Interest,
 * materials), the hero's XP, movement and Dash, Free Upgrades and Enemy
 * Level Skips, and the trainers', the Archives' and Offline Gold's time and
 * pay. Percent kinds are in percent (5 is +5%). */
export type EffectKind =
  | "attack" | "defense" | "maxHp" | "attackPct" | "defensePct" | "maxHpPct"
  | "shroud" | "regen" | "yellowKeys" | "blueKeys" | "bossAttack" | "pierce"
  | "potionHeal" | "victoryHeal" | "floorHeal"
  | "goldFind" | "silverFind" | "xpGain" | "materialFind" | "chestFind" | "startSilver"
  | "moveSpeed" | "dashTiles" | "arcanumDamage"
  // Offense
  | "critChance" | "critFactor" | "superCritChance" | "superCritFactor" | "armorBreakPct" | "comboAttack"
  | "attackRange" | "attackSpeed" | "attackPerTile" | "chargedShot" | "multishotChance" | "multishotTargets" | "rapidFireChance" | "rapidFireDuration"
  // Defense
  | "shroudPct" | "regenPct" | "thornsPct" | "parry" | "overhealPct" | "lifesteal" | "shieldHpPct" | "regrowCut" | "shieldRegenPct" | "shieldThornsPct"
  // Utility
  | "killGold" | "pickupGold" | "interestPct" | "yellowKeyCut" | "blueKeyCut" | "redKeyCut"
  | "freeOffenseChance" | "freeDefenseChance" | "freeUtilityChance" | "hpSkipChance" | "combatSkipChance"
  // Efficiency
  | "trainerSpeed" | "researchSpeed" | "dropChance" | "offlineGold" | "freeUpChance" | "endRushTiles"
  | ArcanaKind
  // A worn Unique's power, its tier (1 at Epic to 4 at Ancestral; equipment/powers.ts)
  | PowerId;

/** Each arcanum's attributes' names, as `ARCANA` (arcana/arcana.ts) has them. */
const ARCANA_ATTRIBUTES: Record<ArcanumId, { name: string; attributes: readonly [string, string, string] }> = {
  ricochetShot: { name: "Ricochet Shot", attributes: ["ATK Mult", "Rebounds", "Chance"] },
  aurumBloom: { name: "Aurum Bloom", attributes: ["Bonus", "Golden Chance", "Stellar Chance"] },
  overseer: { name: "Overseer", attributes: ["Bonus", "Angle", "Quantity"] },
  thunderbolt: { name: "Thunderbolt", attributes: ["ATK Mult", "Quantity", "Cooldown"] },
  lifespring: { name: "Lifespring", attributes: ["HP", "Effect Waves", "Cooldown"] },
  timeDilation: { name: "Time Dilation", attributes: ["Duration", "Slowdown", "Cooldown"] },
  phantasm: { name: "Phantasm", attributes: ["ATK Mult", "Quantity", "Cooldown"] },
  necroticFrost: { name: "Necrotic Frost", attributes: ["ATK Mult", "Duration", "Cooldown"] },
  voidwell: { name: "Voidwell", attributes: ["Size", "Duration", "Cooldown"] },
};
/** How a Helmet substat raises an arcanum's attribute: by a percent of it,
 * by points (Slowdown), by whole counts (Rebounds, beams, bolts, Effect
 * Waves, ghosts), or by cutting it (a cooldown, in percent). */
export type ArcanaRaise = "percent" | "points" | "count" | "cut";
const raiseOf = (name: string): ArcanaRaise =>
  name === "Cooldown" ? "cut" : name === "Slowdown" ? "points" : name === "Rebounds" || name === "Quantity" || name === "Effect Waves" ? "count" : "percent";
/** Every arcanum attribute a Helmet substat raises, with its kind, words and how. */
export const ARCANA_RAISES = (Object.keys(ARCANA_ATTRIBUTES) as ArcanumId[]).flatMap((id) =>
  ARCANA_ATTRIBUTES[id].attributes.map((attribute, index) => ({
    id, index: index as 0 | 1 | 2, kind: `arcanum:${id}:${index}` as ArcanaKind, raise: raiseOf(attribute),
    name: `${ARCANA_ATTRIBUTES[id].name} ${attribute}`,
  })));
const arcanaText = (raise: ArcanaRaise, name: string): EffectText =>
  raise === "count" ? { words: name, whole: true } : raise === "points" ? { words: `${name} (points)`, percent: true }
    : raise === "cut" ? { words: name, percent: true, lead: "−" } : { words: name, percent: true };

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
  critChance: { words: "crit chance", percent: true },
  critFactor: { words: "crit factor", percent: true },
  superCritChance: { words: "Super Crit chance", percent: true },
  superCritFactor: { words: "Super Crit factor", percent: true },
  armorBreakPct: { words: "Armor Break", percent: true },
  comboAttack: { words: "Combo ATK", percent: true },
  attackRange: { words: "Attack Range", percent: true },
  attackSpeed: { words: "Attack Speed", percent: true },
  attackPerTile: { words: "ATK / m", percent: true },
  chargedShot: { words: "Charged Shot charge", percent: true },
  multishotChance: { words: "Multishot Chance", percent: true },
  multishotTargets: { words: "Multishot Target", plural: "Multishot Targets", whole: true },
  rapidFireChance: { words: "Rapid Fire Chance", percent: true },
  rapidFireDuration: { words: "Rapid Fire Duration", percent: true },
  shroudPct: { words: "shroud", percent: true },
  regenPct: { words: "Regen", percent: true },
  thornsPct: { words: "Thorn Damage", percent: true },
  parry: { words: "Parry", percent: true },
  overhealPct: { words: "Overheal ceiling", percent: true },
  lifesteal: { words: "Lifesteal", percent: true },
  shieldHpPct: { words: "Shield HP", percent: true },
  regrowCut: { words: "turns for the Aether Shield to regrow", percent: true, lead: "−" },
  shieldRegenPct: { words: "Shield Regen", percent: true },
  shieldThornsPct: { words: "Shield Thorns", percent: true },
  killGold: { words: "Gold from kills", percent: true },
  pickupGold: { words: "Gold from pickups", percent: true },
  interestPct: { words: "Interest", percent: true },
  yellowKeyCut: { words: "of each gold key a door takes", percent: true, lead: "−" },
  blueKeyCut: { words: "of each blue key a door takes", percent: true, lead: "−" },
  redKeyCut: { words: "of each red key a door takes", percent: true, lead: "−" },
  freeOffenseChance: { words: "Free Offense Up chance each floor", percent: true },
  freeDefenseChance: { words: "Free Defense Up chance each floor", percent: true },
  freeUtilityChance: { words: "Free Utility Up chance each floor", percent: true },
  hpSkipChance: { words: "Enemy HP Level Skip chance", percent: true },
  combatSkipChance: { words: "Enemy Combat Level Skip chance", percent: true },
  trainerSpeed: { words: "trainer speed", percent: true },
  researchSpeed: { words: "Archives research speed", percent: true },
  dropChance: { words: "enemy drop chance", percent: true },
  offlineGold: { words: "Offline Gold", percent: true },
  freeUpChance: { words: "chance of each free Training level", percent: true },
  endRushTiles: { words: "tile End Rush crosses", plural: "tiles End Rush crosses", whole: true },
  ...(Object.fromEntries(ARCANA_RAISES.map((r) => [r.kind, arcanaText(r.raise, r.name)])) as Record<ArcanaKind, EffectText>),
  // Powers read as their own words (POWER_TEXT), never as a number.
  ...(Object.fromEntries(POWER_IDS.map((id) => [id, { words: "power", whole: true }])) as Record<PowerId, EffectText>),
};
/** Whether `kind` is a Unique's power rather than an effect with a number. */
export const isPowerKind = (kind: EffectKind): kind is PowerId => (POWER_IDS as readonly string[]).includes(kind);

/** Standard pieces come from Equipment Chests; Unique pieces come from Gem pulls and
 * each carries a specialised ability. Both level, merge and salvage alike;
 * what leveling raises is the category's main effect (main-effect.ts). */
export type ItemClass = "standard" | "unique";
export type ItemDef = { id: string; name: string; category: CategoryId; class: ItemClass; identity: string };

/** Every equipment definition, by category: in each starting category three
 * Standard pieces (distinct for merging, none with an ability of its own)
 * and three Uniques, whose powers grow with their rarity; the future
 * corners keep one Standard and three Uniques until they are designed. */
export const ITEMS: readonly ItemDef[] = [
  // Swords
  { id: "knightsSword", name: "Knight's Sword", category: "weapon", class: "standard", identity: "A knight's trusted blade" },
  { id: "squiresBlade", name: "Squire's Blade", category: "weapon", class: "standard", identity: "A light blade for a first campaign" },
  { id: "steelBroadsword", name: "Steel Broadsword", category: "weapon", class: "standard", identity: "A broad, heavy edge" },
  { id: "raptorBlade", name: "Raptor Blade", category: "weapon", class: "unique", identity: "More Super Crits, and a Super Crit makes the next shots Super Crits" },
  { id: "kineticMallet", name: "Kinetic Mallet", category: "weapon", class: "unique", identity: "Keeps a Combo going longer between fights" },
  { id: "soulReaper", name: "Soul Reaper", category: "weapon", class: "unique", identity: "Marks enemies for death: the first hit destroys them" },
  // Shields
  { id: "ironShield", name: "Iron Shield", category: "shield", class: "standard", identity: "Plain iron, dependable" },
  { id: "oakenBuckler", name: "Oaken Buckler", category: "shield", class: "standard", identity: "A small round shield of banded oak" },
  { id: "kiteShield", name: "Kite Shield", category: "shield", class: "standard", identity: "A tall shield that covers from shoulder to shin" },
  { id: "zenithGuard", name: "Zenith Guard", category: "shield", class: "unique", identity: "Regen heals past max HP, into Overheal" },
  { id: "cradleOfLife", name: "Cradle of Life", category: "shield", class: "unique", identity: "A stronger Aether Shield that regains more" },
  { id: "amberPrison", name: "Amber Prison", category: "shield", class: "unique", identity: "Shots that don't kill slow their enemy and weaken its blows" },
  // Chestplates
  { id: "steelCuirass", name: "Steel Cuirass", category: "chestplate", class: "standard", identity: "Polished steel plate" },
  { id: "scaleMail", name: "Scale Mail", category: "chestplate", class: "standard", identity: "Overlapping bronze scales" },
  { id: "ringmailVest", name: "Ringmail Vest", category: "chestplate", class: "standard", identity: "Iron rings sewn to a padded vest" },
  { id: "equilibriumTether", name: "Equilibrium Tether", category: "chestplate", class: "unique", identity: "Balances ATK, DEF, max HP and Regen, and each rank bought in a climb counts for all four" },
  { id: "mobiusCipher", name: "Mobius Cipher", category: "chestplate", class: "unique", identity: "Every pickup makes the next of its kind yield more" },
  { id: "mirrorVault", name: "Mirror Vault", category: "chestplate", class: "unique", identity: "Damage taken is stored and struck back at enemies" },
  // Helmets
  { id: "ironHelm", name: "Iron Helm", category: "helmet", class: "standard", identity: "A sturdy iron cap" },
  { id: "acolytesHood", name: "Acolyte's Hood", category: "helmet", class: "standard", identity: "A hood worn by those who study the arcana" },
  { id: "greatHelm", name: "Great Helm", category: "helmet", class: "standard", identity: "A heavy helm that hides the whole face" },
  { id: "lichKingsCrown", name: "Lich King's Crown", category: "helmet", class: "unique", identity: "Ghosts rush every boss that comes in shot range" },
  { id: "psionicTempest", name: "Psionic Tempest", category: "helmet", class: "unique", identity: "Ricochet Shot may strike its first target too" },
  { id: "challengersDefiance", name: "Challenger's Defiance", category: "helmet", class: "unique", identity: "Overseer stays on a boss, and other enemies fall far faster while one stands" },
  // Boots
  { id: "travelersBoots", name: "Traveler's Boots", category: "boots", class: "standard", identity: "Worn leather for a long road" },
  { id: "rangersBoots", name: "Ranger's Boots", category: "boots", class: "standard", identity: "Soft boots for quiet steps" },
  { id: "ridingBoots", name: "Riding Boots", category: "boots", class: "standard", identity: "Tall boots made for the saddle" },
  { id: "chronoStrider", name: "Chrono Strider", category: "boots", class: "unique", identity: "Arcana cool down faster, and each potion speeds them more" },
  { id: "jackpotSpurs", name: "Jackpot Spurs", category: "boots", class: "unique", identity: "More Gold for every free upgrade on the floor" },
  { id: "hoarderGreaves", name: "Hoarder Greaves", category: "boots", class: "unique", identity: "More ATK the more keys are held" },
  // Gloves (between Sword and Boots)
  { id: "leatherGauntlets", name: "Leather Gauntlets", category: "gloves", class: "standard", identity: "Reliable ATK and DEF" },
  { id: "brawlersWraps", name: "Brawler's Wraps", category: "gloves", class: "unique", identity: "More ATK, and a little life back from every win" },
  { id: "locksmithsGloves", name: "Locksmith's Gloves", category: "gloves", class: "unique", identity: "Keys: starts every climb with spare gold keys" },
  { id: "alchemistsGloves", name: "Alchemist's Gloves", category: "gloves", class: "unique", identity: "Potions: every potion heals more" },
  // Capes (between Shield and Boots)
  { id: "woolCloak", name: "Wool Cloak", category: "cape", class: "standard", identity: "Reliable max HP and a little DEF" },
  { id: "magpieMantle", name: "Magpie's Mantle", category: "cape", class: "unique", identity: "Wealth: more Gold, then Silver, from everything found" },
  { id: "gatherersShroud", name: "Gatherer's Shroud", category: "cape", class: "unique", identity: "Materials: more upgrade materials, and more Supply and Equipment Chests" },
  { id: "pilgrimsCape", name: "Pilgrim's Cape", category: "cape", class: "unique", identity: "A steady climb: heals on every new floor" },
  // Belts (between Sword and Helmet)
  { id: "leatherBelt", name: "Leather Belt", category: "belt", class: "standard", identity: "Reliable max HP" },
  { id: "provisionersBelt", name: "Provisioner's Belt", category: "belt", class: "unique", identity: "Potions: the strongest potion bonus" },
  { id: "championsGirdle", name: "Champion's Girdle", category: "belt", class: "unique", identity: "Max HP that grows with everything else" },
  { id: "merchantsSash", name: "Merchant's Sash", category: "belt", class: "unique", identity: "Silver: buys climb training from the first floor" },
  // Amulets (between Shield and Helmet)
  { id: "amberPendant", name: "Amber Pendant", category: "amulet", class: "standard", identity: "Max HP in percent, and a little Regen" },
  { id: "heartOfTheGrove", name: "Heart of the Grove", category: "amulet", class: "unique", identity: "Regeneration: the most HP back with every step" },
  { id: "sagesLocket", name: "Sage's Locket", category: "amulet", class: "unique", identity: "Learning: more XP, then more materials and Silver" },
  { id: "phoenixTalisman", name: "Phoenix Talisman", category: "amulet", class: "unique", identity: "Rises from each fight: heals a share of max HP after every win" },
];

export type ItemId = string;
const BY_ID = new Map(ITEMS.map((d) => [d.id, d]));
/** The definition `id` names, or undefined for one the catalogue no longer has. */
export const itemDef = (id: string): ItemDef | undefined => BY_ID.get(id);
/** A category's Standard pieces, which Equipment Chests, crafting and a Gem
 * pull's Common to Rare hold, evenly. */
export const standardsOf = (category: CategoryId) => ITEMS.filter((d) => d.category === category && d.class === "standard");
/** The Unique pieces of a category, which a Gem pull's Epic and Legendary choose among. */
export const uniquesOf = (category: CategoryId) => ITEMS.filter((d) => d.category === category && d.class === "unique");
