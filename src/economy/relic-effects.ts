import { trainingDef, type TrainingDef, type TrainingId } from "../progression/training.ts";
import { snap } from "../exact.ts";
import { RELICS } from "./relics.ts";
import type { RelicBonus } from "./relic-catalog.ts";

// What relics do (docs/EVENTS.md). A free relic multiplies one Training
// row's value: the relics on a row add their percents into one factor,
// which multiplies everything else on it (+1% on a 50% stat makes 50.5%);
// on a row read as a multiplier (Gold Bonus' ×1.5) it is the bonus over
// ×1 that grows (×1.505). A premium relic's `amount` is what its effect's
// text says, the relics with one effect adding.

/** The premium relics' effects, each with its text for an amount. */
export const RELIC_SPECIALS = {
  trainerSpeed: (a: number) => `Trainers work ${a}% faster`,
  freeDouble: (a: number) => `${a}% chance a free upgrade gives 2 levels`,
  shieldRegrow: (a: number) => `Aether Shield regrows ${a}% faster`,
  frostDuration: (a: number) => `Necrotic Frost lasts ${a}% longer`,
  goldenFloor: (a: number) => `Golden Floor chance +${a}%`,
  chestDouble: (a: number) => `Treasure chests' Double chance +${a}%`,
  chestTriple: (a: number) => `Treasure chests' Triple chance +${a}%`,
  chestGold: (a: number) => `Treasure chests pay ${a}% more Gold`,
  heartDoor: (a: number) => `Heart Doors drain ${a}% less HP`,
  woodenDoor: (a: number) => `Wooden Doors take ${a}% less HP to break down`,
  lifestealOverheal: (a: number) => `Lifesteal heals up to ${a}% above Max HP`,
  torchGold: (a: number) => `Torches pay ${a}% more Gold`,
  lifespring: (a: number) => `Lifespring heals ${a}% more`,
  potionDouble: (a: number) => `${a}% chance a potion heals twice`,
  overheal: (a: number) => `Overheal ceiling +${a}%`,
  superCritChance: (a: number) => `Super Critical Chance +${a}%`,
  superCritFactor: (a: number) => `Super Critical Factor +${a}%`,
  critChance: (a: number) => `Critical Chance +${a}%`,
  parry: (a: number) => `Parry +${a}%`,
  lifesteal: (a: number) => `Lifesteal +${a}%`,
  treasureFloor: (a: number) => `Treasure Floor chance +${a}%`,
  stellarFloor: (a: number) => `Stellar Floor chance +${a}%`,
  bossAttack: (a: number) => `+${a}% ATK against bosses`,
  bossCrit: (a: number) => `Critical hits on bosses deal ${a}% more damage`,
  bossAttackCut: (a: number) => `Reduce boss ATK by ${a}%`,
  cardXp: (a: number) => `Cards gain ${a}% more XP`,
  reviveHp: (a: number) => `Revive returns with ${a}% more HP`,
  ricochet: (a: number) => `Ricochet Shot +${a} bounce${a === 1 ? "" : "s"}`,
  multishotTargets: (a: number) => `Multishot Targets +${a}`,
  rapidFireDuration: (a: number) => `Rapid Fire lasts ${a}% longer`,
  attackSpeed: (a: number) => `Attack Speed +${a}%`,
  phantasm: (a: number) => `Phantasm returns ${a}% sooner`,
  timeDilation: (a: number) => `Time Dilation lasts ${a}% longer`,
  voidwell: (a: number) => `Voidwell reaches ${a}% farther`,
  thunderbolt: (a: number) => `Thunderbolt deals ${a}% more damage`,
  arcanumDamage: (a: number) => `Arcanum Damage +${a}%`,
  shrineBoons: (a: number) => `Shrine boons' benefits +${a}%`,
  pierce: (a: number) => `Ignore ${a}% of enemy DEF`,
  shieldHp: (a: number) => `Shield HP +${a}% of Max HP`,
  shroudGuard: (a: number) => `${a}% of shroud applied to later strikes`,
  materials: (a: number) => `Equipment materials found +${a}%`,
  equipmentDrops: (a: number) => `Equipment from kills +${a}%`,
  rarePull: (a: number) => `Gem pulls' Rare chance +${a}%`,
  floorGems: (a: number) => `Floating Gems appear ${a}% more often`,
  arcanite: (a: number) => `Arcanite earned +${a}%`,
  xp: (a: number) => `XP earned +${a}%`,
  maxInterest: (a: number) => `Max Interest +${a}%`,
  offlineGold: (a: number) => `Offline Gold +${a}%`,
  spareChange: (a: number) => `Spare Change and Wishing Well pay ${a}% more`,
  eliteGold: (a: number) => `Strong and elite enemies pay ${a}% more Gold`,
  aurumBloom: (a: number) => `Aurum Bloom pays ${a}% more Gold`,
  researchSpeed: (a: number) => `Archives research ${a}% faster`,
  trainingCost: (a: number) => `Training costs ${a}% less`,
} as const satisfies Record<string, (amount: number) => string>;
export type RelicSpecial = keyof typeof RELIC_SPECIALS;

/** A relic's bonus as the player reads it: "+4% Regen", "Trainers work 3% faster". */
export const bonusText = (b: RelicBonus) => b.kind === "boost" ? `+${b.percent}% ${trainingDef(b.stat).name}` : RELIC_SPECIALS[b.effect](b.amount);

type Totals = { boosts: Partial<Record<TrainingId, number>>; specials: Partial<Record<RelicSpecial, number>> };
/** Each relics list's totals, recounted when it changes length (relics are
 * only ever added). */
const cache = new WeakMap<readonly string[], { length: number; totals: Totals }>();
function totals(relics: readonly string[]): Totals {
  const hit = cache.get(relics);
  if (hit && hit.length === relics.length) return hit.totals;
  const t: Totals = { boosts: {}, specials: {} };
  for (const id of relics) {
    const b = RELICS[id]?.bonus;
    if (b?.kind === "boost") t.boosts[b.stat] = (t.boosts[b.stat] ?? 0) + b.percent;
    else if (b) t.specials[b.effect] = (t.specials[b.effect] ?? 0) + b.amount;
  }
  cache.set(relics, { length: relics.length, totals: t });
  return t;
}

/** The bonuses of `relics` summed, one for each stat or effect, in the
 * order first owned, with how many relics give each. */
export function relicTotals(relics: readonly string[]): { bonus: RelicBonus; count: number }[] {
  const byKey = new Map<string, { bonus: RelicBonus; count: number }>();
  for (const id of relics) {
    const b = RELICS[id]?.bonus;
    if (!b) continue;
    const key = b.kind === "boost" ? `boost:${b.stat}` : `special:${b.effect}`, t = byKey.get(key);
    if (!t) byKey.set(key, { bonus: { ...b }, count: 1 });
    else {
      t.count++;
      if (t.bonus.kind === "boost" && b.kind === "boost") t.bonus.percent = snap(t.bonus.percent + b.percent);
      else if (t.bonus.kind === "special" && b.kind === "special") t.bonus.amount = snap(t.bonus.amount + b.amount);
    }
  }
  return [...byKey.values()];
}

/** What owns relics: a save, or the ranks a run reads (which carry them). */
export type RelicHolder = { relics?: readonly string[] };

/** The percent the relics owned add to Training row `stat` (0 without). */
export const relicBoost = (holder: RelicHolder, stat: TrainingId) => (holder.relics ? totals(holder.relics).boosts[stat] ?? 0 : 0);
/** The amount the relics owned give `effect` (0 without). */
export const relicAmount = (holder: RelicHolder, effect: RelicSpecial) => (holder.relics ? totals(holder.relics).specials[effect] ?? 0 : 0);
/** `effect`'s amount as a factor: 1 + amount%. */
export const relicFactor = (holder: RelicHolder, effect: RelicSpecial) => (100 + relicAmount(holder, effect)) / 100;
/** The premium effects that add to a Training row's value: each amount's
 * worth in the row's own units (`add`), or as a percent on it (`factor`). */
const ROW_SPECIALS: Partial<Record<TrainingId, { effect: RelicSpecial; add?: number }>> = {
  critChance: { effect: "critChance", add: 100 },
  superCritChance: { effect: "superCritChance", add: 100 },
  superCritFactor: { effect: "superCritFactor", add: 1 },
  multishotTargets: { effect: "multishotTargets", add: 1 },
  shieldHp: { effect: "shieldHp", add: 10 },
  rapidFireDuration: { effect: "rapidFireDuration" },
  attackSpeed: { effect: "attackSpeed" },
  floorGold: { effect: "spareChange" },
  floorSilver: { effect: "spareChange" },
};

/** Training row `row`'s `value` raised by the relics owned: its free
 * relics' percents on the value (on the bonus over its `off` for a row read
 * as a multiplier), then the premium relics that add to it. The hero's
 * stats (`stat` rows) are raised in the loadout instead. */
export function relicRowValue(holder: RelicHolder, row: TrainingDef, value: number) {
  if (!holder.relics?.length || "stat" in row) return value;
  const pct = relicBoost(holder, row.id as TrainingId), off = row.unit === "×" ? row.off ?? 0 : 0;
  let v = pct ? snap(off + ((value - off) * (100 + pct)) / 100) : value;
  const special = ROW_SPECIALS[row.id as TrainingId];
  const amount = special ? relicAmount(holder, special.effect) : 0;
  if (amount) v = special!.add === undefined ? snap((v * (100 + amount)) / 100) : snap(v + amount * special!.add);
  return v;
}

/** The Arcanite `amount` earned pays with relics' Arcanite earned: whole
 * Arcanite, the part left over kept toward the next (`arcaniteCarry`). */
export function relicArcanite(save: RelicHolder & { arcaniteCarry: number }, amount: number) {
  const more = relicAmount(save, "arcanite");
  if (!more || amount <= 0) return amount;
  const total = snap(amount + save.arcaniteCarry + (amount * more) / 100), paid = Math.floor(total);
  save.arcaniteCarry = snap(total - paid);
  return paid;
}

/** `effect`'s amount as a cut: 1 − amount%, never below 0. */
export const relicCut = (holder: RelicHolder, effect: RelicSpecial) => Math.max(0, 100 - relicAmount(holder, effect)) / 100;
