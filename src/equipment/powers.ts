// The Unique pieces' powers (docs/EQUIPMENT.md, "Unique powers"): what each
// does at each rarity a Unique can have, Epic to Ancestral. A worn Unique puts
// its power's tier (1 at Epic to 4 at Ancestral) into the worn effects under
// its own id (`equipmentEffects`), and each power is read in one place, named
// in its entry here. Stars raise a piece's main effect, not its power.
import type { EquipRarity } from "./balance.ts";
import { log10 } from "../exact.ts";

/** Each power's numbers at Epic, Legendary, Mythic and Ancestral. */
type Tiers = readonly [number, number, number, number];
export const POWERS = {
  /** Super Crit chance points (with the Super Critical skill), and the strikes
   * a Super Crit makes Super Crits after it (`superChain`). */
  raptorBlade: { superCrit: [5, 7, 10, 14], chain: [5, 5, 5, 5] },
  /** Turns more the Dash Combo keeps going without a fight (`Game.comboTurn`). */
  kineticMallet: { turns: [1, 2, 3, 4] },
  /** The percent chance each enemy but a boss is marked for death (`Game.doomedAt`). */
  soulReaper: { chance: [5, 8, 11, 15] },
  /** The percent of the room between max HP and the Overheal ceiling Regen may heal into (`regenerate`). */
  zenithGuard: { share: [25, 50, 75, 100] },
  /** What the Aether Shield's HP and its Shield Regen are multiplied by (hero-shield.ts, `stepRules`). */
  cradleOfLife: { factor: [1.25, 1.5, 2, 2.5] },
  /** The percent each hit that doesn't kill weakens and slows its enemy by, up to `AMBER_MOST` (`bout`, `woundMore`). */
  amberPrison: { perHit: [1, 1.5, 2, 2.5] },
  /** Ranks the four tethered rows' pool gains for each rank a run trains (progression/tether.ts). */
  equilibriumTether: { perRank: [1, 2, 3, 4] },
  /** What each pickup adds to its kind's yield for the run (`yieldFactor`). */
  mobiusCipher: { perPickup: [0.005, 0.01, 0.015, 0.02] },
  /** What damage taken is multiplied by into the Retribution pool (`Game.retribution`). */
  mirrorVault: { factor: [1, 2, 3, 4] },
  /** Ghosts rushing each boss that comes in shot range (`Game.crownGhosts`). */
  lichKingsCrown: { ghosts: [1, 2, 3, 4] },
  /** The percent chance a ricochet strikes the enemy its arrow struck too (`ricochet` in volley.ts). */
  psionicTempest: { chance: [15, 30, 45, 60] },
  /** What ATK is multiplied by against other enemies while a boss stands on the floor (`Game.defianceAt`). */
  challengersDefiance: { factor: [2, 4, 7, 15] },
  /** Turns a potion takes off the arcana's cooldowns (all but Necrotic Frost),
   * Golden Chance points for Aurum Bloom, and the percent Haste cuts every
   * arcanum's cooldown by (`arcanaWithGear`, `Game.chronoPotion`). */
  chronoStrider: { potionCut: [10, 13, 17, 20], golden: [5, 10, 15, 20], haste: [5, 8, 11, 15] },
  /** The percent more Gold each Free Upgrade roll won on the floor gives (`jackpotFactor`). */
  jackpotSpurs: { perFree: [3, 5, 7, 10] },
  /** ATK's factor `k` in k × (1 + log₁₀ keys held) (`hoardFactor`). */
  hoarderGreaves: { factor: [1.25, 1.5, 2, 2.5] },
} as const satisfies Record<string, Record<string, Tiers>>;
export type PowerId = keyof typeof POWERS;
export const POWER_IDS = Object.keys(POWERS) as PowerId[];
export const isPower = (id: string): id is PowerId => Object.hasOwn(POWERS, id);

/** The most Amber Prison weakens and slows an enemy by, in percent. */
export const AMBER_MOST = 50;

const TIER_OF: Partial<Record<EquipRarity, number>> = { epic: 1, legendary: 2, mythic: 3, ancestral: 4 };
/** A Unique's power tier at `rarity`: 1 at Epic up to 4 at Ancestral. */
export const powerTier = (rarity: EquipRarity) => TIER_OF[rarity] ?? 1;

/** Power `id`'s `field` as the worn effects hold it (its tier there), 0 unless worn. */
export function powerOf<P extends PowerId>(worn: Partial<Record<PowerId, number>> | undefined, id: P, field: keyof (typeof POWERS)[P]): number {
  const tier = worn?.[id];
  return tier ? ((POWERS[id] as Record<string, Tiers>)[field as string]![tier - 1] ?? 0) : 0;
}

const pct = (n: number) => `${n}%`;
/** Each power in words at `tier`, for the Equipment screen. */
export const POWER_TEXT: Record<PowerId, (t: number) => string> = {
  raptorBlade: (t) => `+${POWERS.raptorBlade.superCrit[t - 1]} Super Crit chance; a Super Crit makes the next ${POWERS.raptorBlade.chain[t - 1]} strikes Super Crits`,
  kineticMallet: (t) => `the Dash Combo lasts ${POWERS.kineticMallet.turns[t - 1]} more turns without a fight`,
  soulReaper: (t) => `${pct(POWERS.soulReaper.chance[t - 1])} of enemies but bosses are marked for death: the hero's first hit destroys them`,
  zenithGuard: (t) => `Regen heals into Overheal, up to ${pct(POWERS.zenithGuard.share[t - 1])} of the way to its ceiling`,
  cradleOfLife: (t) => `Aether Shield HP and Shield Regen ×${POWERS.cradleOfLife.factor[t - 1]}`,
  amberPrison: (t) => `each hit that doesn't kill cuts its enemy's damage and speed by ${pct(POWERS.amberPrison.perHit[t - 1])}, up to ${pct(AMBER_MOST)}`,
  equilibriumTether: (t) => `ATK, DEF, max HP and Regen each count a quarter of their ranks together; each rank trained in a run adds ${POWERS.equilibriumTether.perRank[t - 1]} to them`,
  mobiusCipher: (t) => `each pickup adds ${POWERS.mobiusCipher.perPickup[t - 1]} to what its kind yields for the rest of the run`,
  mirrorVault: (t) => `damage taken is stored ×${POWERS.mirrorVault.factor[t - 1]} as Retribution, struck back after the next first strike or arrow`,
  lichKingsCrown: (t) => `${POWERS.lichKingsCrown.ghosts[t - 1]} ghost${t > 1 ? "s rush" : " rushes"} each boss that comes in shot range`,
  psionicTempest: (t) => `${pct(POWERS.psionicTempest.chance[t - 1])} of Ricochet Shots strike their first target too`,
  challengersDefiance: (t) => `Overseer stays on a boss; while one stands on the floor, ATK ×${POWERS.challengersDefiance.factor[t - 1]} against the other enemies`,
  chronoStrider: (t) => `each potion takes ${POWERS.chronoStrider.potionCut[t - 1]} turns off the arcana's cooldowns (not Necrotic Frost's); +${POWERS.chronoStrider.golden[t - 1]} Golden Chance; Haste −${pct(POWERS.chronoStrider.haste[t - 1])} cooldowns`,
  jackpotSpurs: (t) => `+${pct(POWERS.jackpotSpurs.perFree[t - 1])} Gold for each Free Upgrade roll won on the floor`,
  hoarderGreaves: (t) => `ATK ×${POWERS.hoarderGreaves.factor[t - 1]} × (1 + log₁₀ of the keys held), with any key`,
};

/** What a run keeps for the Uniques' powers, in the run so undo takes it back:
 * Raptor Blade's Super Crits still owed (`chain`), Mirror Vault's Retribution
 * pool, Jackpot Spurs' Free Upgrade rolls won on the last floor new to the
 * run (`frees`), Mobius Cipher's pickups of each kind (`yields`), and the bosses
 * Lich King's Crown's ghosts have rushed (`rushed`, points). Absent with none. */
export type GearRun = {
  chain?: number;
  retribution?: number;
  frees?: number;
  yields?: Partial<Record<YieldKind, number>>;
  rushed?: string[];
};
/** What Mobius Cipher counts apart: potions, a chest's Gold, ATK and DEF shards, each key colour. */
export type YieldKind = "potion" | "chestGold" | "attack" | "defense" | "yellow" | "blue" | "red";
export const YIELD_KINDS: readonly YieldKind[] = ["potion", "chestGold", "attack", "defense", "yellow", "blue", "red"];
/** The yield of `kind` with Mobius Cipher worn at `per`, after `picked` pickups of it: 1 + picked × per. */
export const yieldFactor = (per: number, picked: number | undefined) => (per && picked ? 1 + picked * per : 1);

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const whole = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
/** Whether a saved `GearRun` holds only what one can. */
export function validGearRun(v: any): v is GearRun {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.entries(v).every(([k, x]: [string, any]) =>
    k === "chain" ? whole(x, 1, 1e6)
      : k === "retribution" ? finite(x) && x > 0
      : k === "frees" ? whole(x, 1, 1e6)
      : k === "yields" ? !!x && typeof x === "object" && Object.entries(x).every(([y, n]) => (YIELD_KINDS as readonly string[]).includes(y) && whole(n, 1, 1e9))
      : k === "rushed" ? Array.isArray(x) && x.every((p) => typeof p === "string" && /^-?\d+,-?\d+$/.test(p))
      : false);
}

/** Jackpot Spurs' factor on Gold found: 1 + the Free Upgrade rolls won on the
 * floor × its percent, its own factor; undefined unless it is worn. */
export function jackpotFactor(worn: Partial<Record<PowerId, number>>, gear: GearRun | undefined) {
  const per = powerOf(worn, "jackpotSpurs", "perFree");
  return per ? 1 + ((gear?.frees ?? 0) * per) / 100 : undefined;
}

/** Hoarder Greaves' factor on ATK with `keys` held (all colours together) at
 * `k`: k × (1 + log₁₀ keys) with a key or more (at least k with less than one),
 * 1 with none or unworn. The exact `log10`, so it is the same in every engine. */
export const hoardFactor = (k: number, keys: number) => (k && keys > 0 ? k * (1 + log10(Math.max(1, keys))) : 1);

/** The training rows Equilibrium Tether ties together. */
export const TETHER_ROWS = ["attack", "defense", "hp", "regen"] as const;
/** The rank each tethered row counts as: a quarter of the four rows' `ranks`
 * together and `more` (what the run's training has added), rounded up. */
export const tetherRank = (ranks: Partial<Record<string, number>>, more = 0) =>
  Math.ceil((TETHER_ROWS.reduce((n, id) => n + (ranks[id] ?? 0), 0) + more) / 4);
