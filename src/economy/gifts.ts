import { random, stream } from "../random.ts";
import { snap } from "../exact.ts";
import { count, isRecord, wholeIn } from "../save/decode.ts";
import type { RarityId } from "../shop/rarity.ts";

// Gifts (docs/agents/economy-and-online.md): memories of the gifts the
// player has received, each a small permanent bonus. Unlike relics they
// are not unique: the same gift may be owned many times over, each copy
// adding its bonus. What their bonuses do lives in gift-effects.ts.

/** The rarities a gift may have, least first, as the Relics screen groups them. */
export const GIFT_RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const satisfies readonly RarityId[];
export type GiftRarity = (typeof GIFT_RARITIES)[number];

/** How often a roll gives each rarity, out of 100. Mythic is never rolled:
 * it is kept for gifts given another way (a set reward, a Shop offer). */
export const GIFT_WEIGHTS: Readonly<Record<GiftRarity, number>> = { common: 48, uncommon: 30, rare: 14, epic: 7, legendary: 1, mythic: 0 };

/** What a gift raises. */
export type GiftStat =
  | "maxHp" | "attack" | "defense" | "silver" | "xp" | "regen" | "shroud" | "potions" | "shards" | "provisions"
  | "drop3" | "critChance" | "gold" | "keys" | "drop5" | "goldenFloor" | "goldenGem";

/** Every stat a gift can raise, in the order the Relics screen's ? lists their totals. */
export const GIFT_STATS: readonly GiftStat[] = [
  "maxHp", "attack", "defense", "regen", "shroud", "critChance", "silver", "gold", "xp",
  "potions", "shards", "keys", "provisions", "drop3", "drop5", "goldenFloor", "goldenGem",
];

/** A gift: its rarity, the stat it raises and by how many percent. */
export type GiftDef = { rarity: GiftRarity; stat: GiftStat; percent: number };

/** The gifts of each rarity, the one place to tune them. A roll picks a
 * rarity by `GIFT_WEIGHTS`, then one of its gifts evenly. */
const GIFT_TABLE: Readonly<Record<GiftRarity, readonly (readonly [GiftStat, number])[]>> = {
  common: [["maxHp", 1], ["attack", 1], ["defense", 1], ["silver", 1], ["xp", 1]],
  uncommon: [["regen", 1], ["shroud", 1], ["potions", 1], ["shards", 1], ["provisions", 1], ["drop3", 1], ["critChance", 1], ["xp", 3]],
  rare: [["maxHp", 3], ["attack", 3], ["defense", 3], ["silver", 3], ["gold", 1], ["keys", 1]],
  epic: [["drop5", 1], ["goldenFloor", 1]],
  legendary: [["xp", 10], ["silver", 10], ["gold", 3], ["critChance", 1], ["goldenGem", 1]],
  mythic: [],
};

/** A gift's id: its rarity and stat, `rare.attack`. */
export const giftId = (rarity: GiftRarity, stat: GiftStat) => `${rarity}.${stat}`;

/** Every gift there is, by id, in the catalog's order. */
export const GIFTS: Readonly<Record<string, GiftDef>> = Object.fromEntries(
  GIFT_RARITIES.flatMap((rarity) => GIFT_TABLE[rarity].map(([stat, percent]) => [giftId(rarity, stat), { rarity, stat, percent }] as const)));
export const GIFT_IDS = Object.keys(GIFTS);

/** What the save keeps of gifts. */
export type GiftSave = {
  /** How many of each gift are owned, by id; a gift none of is owned is absent. */
  owned: Partial<Record<string, number>>;
  /** The saved stream gifts are rolled from, seeded once, on the first roll,
   * from `stream("gifts")`, so reloading can't reroll them; null before. */
  rng: number | null;
  /** Whether the Relics screen's Gifts section is open. */
  expanded: boolean;
  /** The one-time grants already paid (the Shop offers that give gifts), each once. */
  perks: string[];
};
export const defaultGifts = (): GiftSave => ({ owned: {}, rng: null, expanded: false, perks: [] });

export function decodeGifts(raw: unknown): GiftSave {
  const d = defaultGifts();
  if (!isRecord(raw)) return d;
  if (isRecord(raw.owned)) for (const id of GIFT_IDS) {
    const n = count(raw.owned[id], 0);
    if (n > 0) d.owned[id] = n;
  }
  d.rng = wholeIn(raw.rng, 0, 4294967295) ? raw.rng : null;
  d.expanded = raw.expanded === true;
  if (Array.isArray(raw.perks)) d.perks = [...new Set(raw.perks.filter((p): p is string => typeof p === "string"))];
  return d;
}

/** The gifts received in all, counting each copy. */
export const giftCount = (gifts: Pick<GiftSave, "owned">) => Object.values(gifts.owned).reduce((n: number, k) => n + (k ?? 0), 0);

/** Gifts received at once, by id, with how many of each, in the catalog's order. */
export type GiftsGranted = { id: string; count: number }[];

const STEP = 0x6d2b79f5;
/** One gift rolled from `rng`: a rarity by its weight, then one of its gifts evenly. */
export function rollGift(rng: () => number): string {
  const total = GIFT_RARITIES.reduce((n, r) => n + GIFT_WEIGHTS[r], 0);
  let pick = rng() * total, rarity: GiftRarity = "common";
  for (const r of GIFT_RARITIES) {
    if (!GIFT_WEIGHTS[r]) continue;
    rarity = r;
    if (pick < GIFT_WEIGHTS[r]) break;
    pick -= GIFT_WEIGHTS[r];
  }
  const table = GIFT_TABLE[rarity], [stat] = table[Math.min(table.length - 1, Math.floor(rng() * table.length))]!;
  return giftId(rarity, stat);
}

/** Rolls `n` gifts on the saved stream and adds them to those owned
 * (a new `owned`, so totals read from the old one recount); returns them. */
export function grantGifts(save: { gifts: GiftSave }, n: number): GiftsGranted {
  const g = save.gifts;
  if (n <= 0) return [];
  const state = g.rng ?? Math.floor(stream("gifts")() * 4294967296), rng = random(state);
  let used = 0;
  const draw = () => (used++, rng());
  const rolled: string[] = Array.from({ length: n }, () => rollGift(draw));
  g.rng = (state + Math.imul(used, STEP)) >>> 0;
  return addGifts(save, rolled);
}

/** Adds the gifts `ids` (each once a time it is listed) to those owned;
 * returns them, counted by id in the catalog's order. */
export function addGifts(save: { gifts: GiftSave }, ids: readonly string[]): GiftsGranted {
  const owned = { ...save.gifts.owned }, counts = new Map<string, number>();
  for (const id of ids) if (GIFTS[id]) {
    owned[id] = (owned[id] ?? 0) + 1;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  save.gifts.owned = owned;
  return GIFT_IDS.filter((id) => counts.has(id)).map((id) => ({ id, count: counts.get(id)! }));
}

/** The gifts `after` holds beyond `before` (two `owned` lists), by id in the catalog's order. */
export function giftsSince(before: GiftSave["owned"], after: GiftSave["owned"]): GiftsGranted {
  return GIFT_IDS.flatMap((id) => {
    const n = (after[id] ?? 0) - (before[id] ?? 0);
    return n > 0 ? [{ id, count: n }] : [];
  });
}

/** The percent the gifts owned add up to for each stat, in `GIFT_STATS` order, leaving out those at 0. */
export function giftTotals(gifts: Pick<GiftSave, "owned">): { stat: GiftStat; percent: number; count: number }[] {
  return GIFT_STATS.flatMap((stat) => {
    let percent = 0, n = 0;
    for (const [id, k] of Object.entries(gifts.owned)) {
      const def = GIFTS[id];
      if (def?.stat === stat && k) {
        percent = snap(percent + def.percent * k);
        n += k;
      }
    }
    return n ? [{ stat, percent, count: n }] : [];
  });
}
