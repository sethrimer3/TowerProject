import type { Enemy, EnemyProfile, EnemyStrength } from "../entities.ts";
import { LEGACY_ENEMY_NAMES } from "./legacy-roster.ts";

export const ROSTER_STRENGTHS = ["weak", "normal", "strong", "elite", "boss", "greaterBoss"] as const;
export const ROSTER_TRAITS = ["ordinary", "fast", "ranged", "shielded", "flying", "armored", "aggroed"] as const;
export const ROSTER_PROFILES = ["attackHeavy", "balanced", "defenseHeavy"] as const;
export type RosterTrait = typeof ROSTER_TRAITS[number];
export type RosterEnemy = Pick<Enemy, "name"> & Partial<Pick<Enemy, "strength" | "profile" | "fast" | "ranged" | "shielded" | "flying" | "armored" | "aggro">>;
const families: Record<EnemyProfile, readonly string[]> = {
  attackHeavy: ["Fangling", "Scythe Mantis", "Bone Archer", "Blood Acolyte", "Vampire Bat", "Iron Berserker", "Rage Wyvern"],
  balanced: ["Dungeon Ooze", "Ratfolk Scout", "Sporecap", "Kobold Warder", "Cave Moth", "Bone Guard", "Drake Hound"],
  defenseHeavy: ["Armadillo", "Tunnel Roller", "Crystalback", "Wardscarab", "Stone Gargoyle", "Iron Tortoise", "Hornbeetle"],
};
const stages: Record<EnemyProfile, readonly string[]> = {
  attackHeavy: ["Cave", "Ironfang", "Bloodclaw", "Dread", "Infernal", "Abyssal"],
  balanced: ["Cellar", "Tunnel", "Deepstone", "Runic", "Crowned", "Elder"],
  defenseHeavy: ["Pebble", "Slate", "Granite", "Runic", "Basalt", "Adamant"],
};
export type RosterEntry = { id: string; name: string; strength: EnemyStrength; profile: EnemyProfile; trait: RosterTrait };
/** Presentation only: no generation, statistics, RNG or save identities change. */
export const ENEMY_ROSTER: readonly RosterEntry[] = ROSTER_PROFILES.flatMap(profile =>
  ROSTER_STRENGTHS.flatMap((strength, row) => ROSTER_TRAITS.map((trait, column) => ({
    id: `delve-enemy-${profile}-${strength}-${trait}`,
    name: `${stages[profile][row]} ${families[profile][column]}`,
    strength, profile, trait,
  }))),
);
const entries = new Map(ENEMY_ROSTER.map(entry => [`${entry.profile}|${entry.strength}|${entry.trait}`, entry]));
/** Active pursuit overrides flight; flight overrides armor; visible warding
 * overrides armor, ranged and speed. All additional mechanics retain marks. */
export function rosterTrait(e: RosterEnemy): RosterTrait {
  return e.aggro ? "aggroed" : e.flying ? "flying" : e.shielded ? "shielded" : e.armored ? "armored" : e.ranged ? "ranged" : e.fast ? "fast" : "ordinary";
}
export function rosterEntry(e: RosterEnemy, legacy = false): RosterEntry | undefined {
  // Trial bosses and scripted actors retain their dedicated identities/art.
  if (legacy || !LEGACY_ENEMY_NAMES.has(e.name)) return undefined;
  return entries.get(`${e.profile ?? "balanced"}|${e.strength ?? "normal"}|${rosterTrait(e)}`);
}
