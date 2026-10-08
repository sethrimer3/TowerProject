import type { Save } from "../entities.ts";
import type { Mode } from "../entities.ts";
import { tierNumeral } from "../tiers.ts";
import { PASSES } from "../goals.ts";
import type { CurrencyId } from "./currency.ts";
import type { ShopItem } from "./items.ts";
import type { RarityId } from "./rarity.ts";

// Every thing the Shop sells is an Offer: data naming the item it grants,
// its price and its limits. The page draws offers, never hard-coded buttons.

/** What an offer costs: a currency, nothing, real money (the store prices
 * it by `sku`; `label` until the server answers), or nothing here at all:
 * the offer only opens the store. */
export type Price =
  | { kind: "currency"; currency: CurrencyId; amount: number }
  | { kind: "free" }
  | { kind: "money"; sku: string; label: string }
  | { kind: "store"; url: string };

/** A progression gate on a category or offer. */
export type Requirement = { kind: "tier"; mode: Mode; tier: number };

export type CategoryId = "limited" | "special" | "gems" | "passes";
export type Category = { name: string; requires?: Requirement[] };
export const CATEGORIES: Record<CategoryId, Category> = {
  limited: { name: "Limited Offers" },
  special: { name: "One-Time Offers" },
  gems: { name: "Gems" },
  // Sold from the Goals screen, not the Shop page.
  passes: { name: "Premium Passes" },
};

export type OfferId = "shards300" | "shards750" | "adFree" | "coins2" | "coins3" | "dailyGems" | "gems250" | "gems550" | "gems1150" | "gems2500" | "gems7500" | "pass1" | "pass2" | "pass3";
export type ShopOffer = {
  id: OfferId;
  name: string;
  category: CategoryId;
  /** What buying it grants; none for an offer that only opens the store. */
  item?: ShopItem;
  quantity: number;
  price: Price;
  rarity: RarityId;
  /** How many times it can be bought; null for no limit. */
  purchaseLimit: number | null;
  /** The limit counts afresh this many Shop days after the last purchase
   * (each day turning at 00:00 GMT): 1 for a daily offer. */
  period?: number;
  /** When it can first and last be bought (server time, ms). */
  startTime?: number;
  endTime?: number;
  requires?: Requirement[];
  /** What it does, guaranteed, in a few words each, beyond the currencies
   * its item grants and its Gold multiplier (the page shows those as icons). Randomized items will
   * list their possible effects apart from these. */
  effects: string[];
  /** A highlight on its card ("10% bonus!"). */
  badge?: string;
  tags: string[];
};

/** A limited pack of Ascension Shards with Gems beside them, once a fortnight. */
const shardPack = (id: OfferId, shards: number, gems: number, sku: string, label: string, rarity: RarityId): ShopOffer => ({
  id, name: `${shards} Ascension Shard Pack`, category: "limited", item: { kind: "bundle", amounts: { shards, gems } }, quantity: 1,
  price: { kind: "money", sku, label }, rarity, purchaseLimit: 1, period: SHARD_PACK_DAYS,
  effects: ["Every two weeks"], tags: ["limited"],
});
/** Shop days between purchases of each Ascension Shard pack. */
export const SHARD_PACK_DAYS = 14;

const gemPack = (id: OfferId, gems: number, sku: string, label: string, rarity: RarityId, badge?: string): ShopOffer => ({
  id, name: `${gems.toLocaleString("en-US")} Gem Pack`, category: "gems", item: { kind: "currency", currency: "gems", amount: gems }, quantity: 1,
  price: { kind: "money", sku, label }, rarity, purchaseLimit: null, effects: [], badge, tags: [],
});

/** Every offer, in the order the page shows each category's. */
export const OFFERS: readonly ShopOffer[] = [
  shardPack("shards300", 300, 250, "shards_300", "$29.99", "legendary"),
  shardPack("shards750", 750, 600, "shards_750", "$59.99", "mythic"),
  {
    id: "adFree", name: "Permanent Ad-Disable", category: "special", item: { kind: "entitlement", id: "adFree" }, quantity: 1,
    price: { kind: "money", sku: "ad_free", label: "$9.95" }, rarity: "epic", purchaseLimit: 1,
    effects: ["No ads"], tags: ["oneTime"],
  },
  {
    id: "coins2", name: "Special Coin Pack", category: "special", item: { kind: "entitlement", id: "coins2", amounts: { gems: 150 } }, quantity: 1,
    price: { kind: "money", sku: "coins_x2", label: "$9.95" }, rarity: "epic", purchaseLimit: 1,
    effects: ["×2 training speed forever"], tags: ["oneTime"],
  },
  {
    id: "coins3", name: "Premium Coin Pack", category: "special", item: { kind: "entitlement", id: "coins3", amounts: { gems: 750 } }, quantity: 1,
    price: { kind: "money", sku: "coins_x3", label: "$29.95" }, rarity: "legendary", purchaseLimit: 1,
    effects: ["×3 training speed forever", "Stacks with ×2"], tags: ["oneTime"],
  },
  {
    id: "dailyGems", name: "Daily Free Gems", category: "gems", item: { kind: "currency", currency: "gems", amount: 25 }, quantity: 1,
    price: { kind: "free" }, rarity: "common", purchaseLimit: 1, period: 1, effects: ["Free daily, 00:00 GMT"], tags: ["free"],
  },
  gemPack("gems250", 250, "gems_250", "$4.99", "common"),
  gemPack("gems550", 550, "gems_550", "$9.99", "uncommon", "10% bonus!"),
  gemPack("gems1150", 1150, "gems_1150", "$19.99", "rare", "15% bonus!"),
  gemPack("gems2500", 2500, "gems_2500", "$39.99", "epic", "25% bonus!"),
  gemPack("gems7500", 7500, "gems_7500", "$99.99", "legendary", "50% bonus!"),
  ...PASSES.map((p): ShopOffer => ({
    id: p.id as OfferId, name: `Premium Pass ${p.n}`, category: "passes", item: { kind: "entitlement", id: p.id }, quantity: 1,
    price: { kind: "money", sku: p.sku, label: p.label }, rarity: "legendary", purchaseLimit: 1,
    effects: [`Premium rewards in Towers ${p.towers.map(tierNumeral).join(", ")}`], tags: ["oneTime"],
  })),
];

export const offer = (id: string) => OFFERS.find((o) => o.id === id);

/** Whether `save` meets `r`. */
export const requirementMet = (save: Save, r: Requirement) => save[r.mode].tiersOpen >= r.tier;
/** What meeting `r` takes, for a locked category. */
export const requirementText = (r: Requirement) => `Reach ${r.mode === "tower" ? "Tower" : "Delve"} ${tierNumeral(r.tier)} to unlock.`;
/** The first requirement of `list` not met, if any. */
export const unmet = (save: Save, list: Requirement[] = []) => list.find((r) => !requirementMet(save, r));
