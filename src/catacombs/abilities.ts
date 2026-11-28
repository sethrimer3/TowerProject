// The Catacombs' abilities (docs/CATACOMBS.md): three limited-use spells,
// unlocked one at a time by the Spirit upgrade Unlock Ability, each with a
// charge that comes back a cooldown of turns after it is spent, and a buff
// lasting the Magician's next few attacks (rounds of combat).
import { snap } from "../exact.ts";
import { magician } from "./magic.ts";
import type { CatacombSave } from "./state.ts";

/** The abilities, in the order Unlock Ability opens them. */
export const ABILITY_IDS = ["surge", "rush", "barrage"] as const;
export type AbilityId = (typeof ABILITY_IDS)[number];
/** Each ability: its name, its cooldown in turns (a turn a second), how
 * many attacks its buff lasts, and its tooltip. */
export const ABILITIES: Record<AbilityId, { name: string; cooldown: number; attacks: number; brief: string }> = {
  surge: { name: "Spell Surge", cooldown: 60, attacks: 5, brief: "Next 5 attacks: +20% MAtk and +100% MCrit damage." },
  rush: { name: "Renewing Rush", cooldown: 120, attacks: 5, brief: "Next 5 attacks: +100% attack speed. Restores 50 MHP on cast." },
  barrage: { name: "Arcane Barrage", cooldown: 90, attacks: 5, brief: "Next 5 attacks: every undead in the hall also takes 20% of a hit." },
};
/** The charges each ability holds (upgrades to raise it: Later). */
export const MAX_CHARGES = 1;
/** Spell Surge's MAtk factor and what it adds to the MCrit factor. */
export const SURGE_MATK = 1.2, SURGE_CRIT = 1;
/** Renewing Rush's MHP on cast. */
export const RUSH_MHP = 50;
/** Arcane Barrage's hit, as a share of MAtk. */
export const BARRAGE_SHARE = 0.2;

/** An ability's charges, the turns until its next one, and whether it is cast by itself once ready. */
export type AbilityState = { charges: number; cooldown: number; auto: boolean };
export const defaultAbilities = (): Record<AbilityId, AbilityState> =>
  Object.fromEntries(ABILITY_IDS.map((id) => [id, { charges: MAX_CHARGES, cooldown: 0, auto: false }])) as Record<AbilityId, AbilityState>;
export const noBuffs = (): Record<AbilityId, number> => ({ surge: 0, rush: 0, barrage: 0 });

/** Whether Unlock Ability has opened ability `id`. */
export const abilityUnlocked = (c: CatacombSave, id: AbilityId) => ABILITY_IDS.indexOf(id) < c.upgrades.unlock;

/** Whether ability `id` can be cast now: unlocked, a charge held, and a run under way. */
export const canCast = (c: CatacombSave, id: AbilityId) => abilityUnlocked(c, id) && c.abilities[id].charges > 0 && !!c.run && !c.run.fell;

/** Casts ability `id`, spending a charge (its cooldown starts if none was
 * running) and adding its attacks to its buff. Whether it was cast. */
export function castAbility(c: CatacombSave, id: AbilityId) {
  if (!canCast(c, id)) return false;
  const a = c.abilities[id];
  a.charges--;
  if (a.cooldown === 0) a.cooldown = ABILITIES[id].cooldown;
  c.buffs[id] += ABILITIES[id].attacks;
  if (id === "rush") c.run!.hero.mhp = Math.min(magician(c).mhp, snap(c.run!.hero.mhp + RUSH_MHP));
  return true;
}

/** A turn passes: each unlocked ability short of charges cools a turn,
 * gaining a charge when its cooldown ends. */
export function coolAbilities(c: CatacombSave) {
  for (const id of ABILITY_IDS) {
    const a = c.abilities[id];
    if (!abilityUnlocked(c, id) || a.charges >= MAX_CHARGES) continue;
    a.cooldown = Math.max(0, a.cooldown - 1);
    if (a.cooldown === 0) {
      a.charges++;
      if (a.charges < MAX_CHARGES) a.cooldown = ABILITIES[id].cooldown;
    }
  }
}

/** Casts every ability set to Auto that is ready. */
export function autoCast(c: CatacombSave) {
  for (const id of ABILITY_IDS) if (c.abilities[id].auto) castAbility(c, id);
}
