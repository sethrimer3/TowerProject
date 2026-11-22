import { snap } from "../exact.ts";
import { GIFTS, type GiftSave, type GiftStat } from "./gifts.ts";

// What gifts do (docs/agents/economy-and-online.md). The gifts that raise
// one stat add their percents into one total; that total is a factor of
// its own, which multiplies the relics' factor and everything else on the
// stat (relics +10% and gifts +10% make ×1.21), so gifts never dilute the
// relics. A chance (Critical Chance, Golden Floor and Golden Gem chance,
// the ×3 and ×5 drop chances) takes the total as points instead. Every
// gift counts whether or not what it raises is open yet.

/** Each stat's bonus as the player reads it, for a percent. */
export const GIFT_TEXT: Readonly<Record<GiftStat, (a: number) => string>> = {
  maxHp: (a) => `+${a}% Max HP`,
  attack: (a) => `+${a}% ATK`,
  defense: (a) => `+${a}% DEF`,
  silver: (a) => `+${a}% Silver`,
  xp: (a) => `+${a}% XP`,
  regen: (a) => `+${a}% Regen`,
  shroud: (a) => `+${a}% Shroud`,
  potions: (a) => `Potions heal ${a}% more`,
  shards: (a) => `ATK and DEF shards give ${a}% more`,
  provisions: (a) => `Provisions give ${a}% more`,
  drop3: (a) => `${a}% chance a kill drops ×3`,
  critChance: (a) => `Critical Chance +${a}%`,
  gold: (a) => `+${a}% Gold`,
  keys: (a) => `Keys give ${a}% more`,
  drop5: (a) => `${a}% chance a kill drops ×5`,
  goldenFloor: (a) => `Golden Floor chance +${a}%`,
  goldenGem: (a) => `Golden Gem chance +${a}%`,
};
/** Each stat's short name, for a gift's label. */
export const GIFT_STAT_NAMES: Readonly<Record<GiftStat, string>> = {
  maxHp: "Max HP", attack: "ATK", defense: "DEF", silver: "Silver", xp: "XP", regen: "Regen", shroud: "Shroud", potions: "Potions",
  shards: "Shards", provisions: "Provisions", drop3: "×3 Drop Chance", critChance: "Critical Chance", gold: "Gold", keys: "Keys",
  drop5: "×5 Drop Chance", goldenFloor: "Golden Floor Chance", goldenGem: "Golden Gem Chance",
};

/** What owns gifts: a save, or the ranks a run reads (which carry them). */
export type GiftHolder = { gifts?: Pick<GiftSave, "owned"> };

/** Each owned list's totals by stat, recounted when `owned` is replaced
 * (gifts are only ever added, through a new `owned`). */
const cache = new WeakMap<object, Partial<Record<GiftStat, number>>>();
function totals(owned: GiftSave["owned"]) {
  const hit = cache.get(owned);
  if (hit) return hit;
  const t: Partial<Record<GiftStat, number>> = {};
  for (const [id, n] of Object.entries(owned)) {
    const def = GIFTS[id];
    if (def && n) t[def.stat] = snap((t[def.stat] ?? 0) + def.percent * n);
  }
  cache.set(owned, t);
  return t;
}

/** The percent (or, for a chance, the points) the gifts owned add to `stat`: 0 without. */
export const giftAmount = (holder: GiftHolder, stat: GiftStat) => (holder.gifts ? totals(holder.gifts.owned)[stat] ?? 0 : 0);
/** `stat`'s gifts as a factor: 1 + amount%. */
export const giftFactor = (holder: GiftHolder, stat: GiftStat) => (100 + giftAmount(holder, stat)) / 100;
/** `value` multiplied by `stat`'s gift factor (unchanged without). */
export function giftRaised(holder: GiftHolder, stat: GiftStat, value: number) {
  const a = giftAmount(holder, stat);
  return a ? snap((value * (100 + a)) / 100) : value;
}
