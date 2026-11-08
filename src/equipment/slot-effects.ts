// The substats an item's slots can hold: static data only (saves name a
// substat by id and keep its rarity). Each substat belongs to a family, and
// each category rolls from its families' substats, so a Sword rolls offense
// and a pair of Boots utility. A substat's value is its base times its own
// rarity's substat power (`SUBSTAT_POWER`), or its own value at that rarity
// where it lists one (`values`: Parry, the Free Upgrade and Level Skip
// chances, Dash and End Rush tiles, the whole counts); it never rolls above
// the item's rarity (`substatCap`), nor below its `from`. Leveling the item
// raises only its main effect (main-effect.ts), never a substat. Every value
// is a percent, a point or a whole count, never a flat stat. See
// docs/EQUIPMENT.md.
import type { Mode } from "../entities.ts";
import { snap } from "../exact.ts";
import { ARCANA_RAISES, EFFECTS, type CategoryId, type EffectKind } from "./catalog.ts";
import { rarityRank, SUBSTAT_POWER, type EquipRarity } from "./balance.ts";

export type FamilyId = "offense" | "defense" | "arcana" | "utility" | "efficiency";
export const FAMILIES: Record<FamilyId, { name: string; theme: string }> = {
  offense: { name: "Offense", theme: "ATK, crits and the Archer's shots" },
  defense: { name: "Defense", theme: "DEF, max HP, healing and the Aether Shield" },
  arcana: { name: "Arcana", theme: "Arcanum Damage and each arcanum's attributes" },
  utility: { name: "Utility", theme: "Gold, Silver, keys, Free Upgrades and Level Skips" },
  efficiency: { name: "Efficiency", theme: "XP, speed, trainers, research and drops" },
};

/** The families each category's slots roll from: each starting category its
 * own, and the future corners the two of their neighbours (until their own
 * synergy substats are written). */
export const CATEGORY_FAMILIES: Record<CategoryId, readonly FamilyId[]> = {
  weapon: ["offense"],
  shield: ["defense"],
  helmet: ["arcana"],
  boots: ["utility"],
  chestplate: ["efficiency"],
  gloves: ["offense", "utility"],
  belt: ["offense", "arcana"],
  cape: ["defense", "utility"],
  amulet: ["defense", "arcana"],
};

/** One substat: `base` at Uncommon, times its rarity's substat power, or
 * `values` by rarity where it has its own; it rolls only from rarity `from`
 * (Uncommon when absent). With `mode`, it counts only in that mode's loadout. */
export type SlotEffectDef = {
  id: string; name: string; family: FamilyId; kind: EffectKind; base: number;
  values?: Partial<Record<EquipRarity, number>>; from?: EquipRarity; mode?: Mode;
};
const fx = (id: string, name: string, family: FamilyId, kind: EffectKind, base: number, more: Pick<SlotEffectDef, "values" | "from" | "mode"> = {}): SlotEffectDef =>
  ({ id, name, family, kind, base, ...more });
/** Values by rarity, Uncommon first. */
const steps = (...v: number[]) => Object.fromEntries(v.map((n, i) => [["uncommon", "rare", "epic", "legendary", "mythic", "ancestral"][i], n])) as Partial<Record<EquipRarity, number>>;
/** Whole counts from rarity `from`: 1 there, and 1 more each rarity above. */
const countsFrom = (from: EquipRarity) => {
  const all: EquipRarity[] = ["uncommon", "rare", "epic", "legendary", "mythic", "ancestral"];
  return Object.fromEntries(all.filter((r) => rarityRank(r) >= rarityRank(from)).map((r, i) => [r, i + 1])) as Partial<Record<EquipRarity, number>>;
};

/** Each Helmet substat on an arcanum attribute: +5% of it, +5 points of
 * Slowdown, −2% of a cooldown, or a whole count from a rarity on. */
const ARCANA_COUNTS_FROM: Partial<Record<string, EquipRarity>> = {
  "arcanum:ricochetShot:1": "legendary", "arcanum:overseer:2": "mythic", "arcanum:thunderbolt:1": "epic",
  "arcanum:lifespring:1": "legendary", "arcanum:phantasm:1": "epic",
};
const arcanaEffects = ARCANA_RAISES.map(({ kind, raise, name }) => {
  const id = kind.replace(/^arcanum:/, "").replace(/:(\d)$/, (_, n) => `${n}`);
  if (raise === "count") {
    const from = ARCANA_COUNTS_FROM[kind]!;
    return fx(id, name, "arcana", kind, 1, { values: countsFrom(from), from });
  }
  return fx(id, name, "arcana", kind, raise === "cut" ? 2 : 5);
});

export const SLOT_EFFECTS: readonly SlotEffectDef[] = [
  // Offense (Swords)
  fx("ferocity", "Ferocity", "offense", "attackPct", 3),
  fx("piercing", "Piercing", "offense", "pierce", 3),
  fx("giantslayer", "Giantslayer", "offense", "bossAttack", 8),
  fx("keenEye", "Keen Eye", "offense", "critChance", 2),
  fx("brutality", "Brutality", "offense", "critFactor", 5),
  fx("deadeye", "Deadeye", "offense", "superCritChance", 1),
  fx("devastation", "Devastation", "offense", "superCritFactor", 5),
  fx("sunder", "Sunder", "offense", "armorBreakPct", 5),
  fx("momentum", "Momentum", "offense", "comboAttack", 5),
  fx("farReach", "Far Reach", "offense", "attackRange", 5),
  fx("quickdraw", "Quickdraw", "offense", "attackSpeed", 4),
  fx("longShot", "Long Shot", "offense", "attackPerTile", 5),
  fx("steadyAim", "Steady Aim", "offense", "chargedShot", 5),
  fx("scattershot", "Scattershot", "offense", "multishotChance", 1),
  fx("volley", "Volley", "offense", "multishotTargets", 1, { values: countsFrom("mythic"), from: "mythic" }),
  fx("hairTrigger", "Hair Trigger", "offense", "rapidFireChance", 1),
  fx("frenzy", "Frenzy", "offense", "rapidFireDuration", 5),
  // Defense (Shields)
  fx("fortitude", "Fortitude", "defense", "defensePct", 3),
  fx("warding", "Warding", "defense", "shroudPct", 5),
  fx("constitution", "Constitution", "defense", "maxHpPct", 3),
  fx("mending", "Mending", "defense", "regenPct", 3),
  fx("thorns", "Thorns", "defense", "thornsPct", 5),
  fx("deflection", "Deflection", "defense", "parry", 1, { values: steps(1, 2, 3, 4, 5, 8) }),
  fx("overflow", "Overflow", "defense", "overhealPct", 3),
  fx("bloodthirst", "Bloodthirst", "defense", "lifesteal", 0.2),
  fx("secondWind", "Second Wind", "defense", "victoryHeal", 3),
  fx("freshAir", "Fresh Air", "defense", "floorHeal", 5),
  fx("tonic", "Tonic", "defense", "potionHeal", 5),
  fx("aegis", "Aegis", "defense", "shieldHpPct", 5),
  fx("rebuild", "Rebuild", "defense", "regrowCut", 3),
  fx("shieldRegen", "Shield Regen", "defense", "shieldRegenPct", 10),
  fx("shieldThorns", "Shield Thorns", "defense", "shieldThornsPct", 5),
  // Arcana (Helmets)
  fx("sorcery", "Sorcery", "arcana", "arcanumDamage", 4),
  ...arcanaEffects,
  // Utility (Boots)
  fx("prospector", "Prospector", "utility", "goldFind", 3),
  fx("headhunter", "Bounty", "utility", "killGold", 3),
  fx("pickpocket", "Pickpocket", "utility", "pickupGold", 3),
  fx("silverTongue", "Silver Tongue", "utility", "silverFind", 3),
  fx("interest", "Interest", "utility", "interestPct", 3),
  fx("locksmith", "Locksmith", "utility", "yellowKeyCut", 2),
  fx("bluesmith", "Bluesmith", "utility", "blueKeyCut", 2),
  fx("redsmith", "Redsmith", "utility", "redKeyCut", 2, { from: "rare" }),
  fx("freeOffense", "Free Offense", "utility", "freeOffenseChance", 1, { values: steps(1, 2, 4, 6, 8, 10) }),
  fx("freeDefense", "Free Defense", "utility", "freeDefenseChance", 1, { values: steps(1, 2, 4, 6, 8, 10) }),
  fx("freeUtility", "Free Utility", "utility", "freeUtilityChance", 1, { values: steps(1, 2, 4, 6, 8, 10) }),
  fx("hpSkip", "HP Skip", "utility", "hpSkipChance", 1, { values: steps(1, 2, 3, 4, 6, 8) }),
  fx("combatSkip", "Combat Skip", "utility", "combatSkipChance", 1, { values: steps(1, 2, 3, 4, 6, 8) }),
  // Efficiency (Chestplates)
  fx("studious", "Studious", "efficiency", "xpGain", 3),
  fx("fleetness", "Fleetness", "efficiency", "moveSpeed", 3),
  fx("drillmaster", "Drillmaster", "efficiency", "trainerSpeed", 3),
  fx("scholarship", "Scholarship", "efficiency", "researchSpeed", 3),
  fx("fortunesEye", "Fortune's Eye", "efficiency", "dropChance", 2),
  fx("treasureSense", "Treasure Sense", "efficiency", "chestFind", 2),
  fx("scavenger", "Scavenger", "efficiency", "materialFind", 4),
  fx("idleHands", "Idle Hands", "efficiency", "offlineGold", 3),
  fx("windfall", "Windfall", "efficiency", "freeUpChance", 1),
  fx("automaton", "Automaton", "efficiency", "dashTiles", 1, { values: countsFrom("uncommon") }),
  fx("sprinter", "Sprinter", "efficiency", "endRushTiles", 1, { values: countsFrom("uncommon") }),
];

const BY_ID = new Map(SLOT_EFFECTS.map((d) => [d.id, d]));
export const slotEffectDef = (id: string) => BY_ID.get(id);
/** The substats `category`'s slots roll from, in catalogue order. */
export const effectPool = (category: CategoryId) => SLOT_EFFECTS.filter((d) => CATEGORY_FAMILIES[category].includes(d.family));
/** Whether `category`'s slots may hold substat `id`. */
export const inPool = (category: CategoryId, id: string) => {
  const d = slotEffectDef(id);
  return !!d && CATEGORY_FAMILIES[category].includes(d.family);
};
/** Whether `def` may come in `rarity`: from its `from` on. */
export const rollsAt = (def: SlotEffectDef, rarity: EquipRarity) => rarityRank(rarity) >= rarityRank(def.from ?? "uncommon");

/** A substat's value at its `rarity`, on the snap grid (whole kinds round
 * down); 0 below its `from`. */
export function slotValue(def: SlotEffectDef, rarity: EquipRarity) {
  if (!rollsAt(def, rarity)) return 0;
  const raw = def.values ? def.values[rarity] ?? 0 : snap(def.base * SUBSTAT_POWER[rarity]);
  return EFFECTS[def.kind].whole ? Math.floor(raw) : raw;
}
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
/** "Fleetness II": the substat's name and its rarity as a numeral, I for
 * Uncommon (the lowest a substat comes in). */
export const slotEffectName = (def: SlotEffectDef, rarity: EquipRarity) => `${def.name} ${NUMERALS[Math.max(0, rarityRank(rarity) - 1)]}`;
