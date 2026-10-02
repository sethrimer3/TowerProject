import type { Save } from "../entities.ts";
import type { Mode } from "../entities.ts";
import { tierNumeral } from "../tiers.ts";
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

export type CategoryId = "limited" | "special" | "gems";
export type Category = { name: string; requires?: Requirement[] };
export const CATEGORIES: Record<CategoryId, Category> = {
  limited: { name: "Limited Offers" },
  special: { name: "One-Time Offers" },
  gems: { name: "Gems" },
};

export type OfferId = "shardPack" | "adFree" | "coins2" | "coins3" | "dailyGems" | "gems250" | "gems550" | "gems1150" | "gems2500" | "gems7500";
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
  /** The limit counts afresh each day (the day turning at 00:00 GMT). */
  daily?: true;
  /** When it can first and last be bought (server time, ms). */
  startTime?: number;
  endTime?: number;
  requires?: Requirement[];
  /** What it does, guaranteed. Randomized items will list their possible
   * effects apart from these. */
  effects: string[];
  /** A highlight on its card ("10% bonus!"). */
  badge?: string;
  tags: string[];
};

const gemPack = (id: OfferId, gems: number, sku: string, label: string, rarity: RarityId, badge?: string): ShopOffer => ({
  id, name: `${gems.toLocaleString("en-US")} Gem Pack`, category: "gems", item: { kind: "currency", currency: "gems", amount: gems }, quantity: 1,
  price: { kind: "money", sku, label }, rarity, purchaseLimit: null, effects: [`+${gems.toLocaleString("en-US")} Gems`], badge, tags: [],
});

/** Every offer, in the order the page shows each category's. */
export const OFFERS: readonly ShopOffer[] = [
  {
    // TODO: limited offers will come from the server, with their end times.
    id: "shardPack", name: "Exclusive Shard Pack", category: "limited", quantity: 1, price: { kind: "store", url: "" },
    rarity: "mythic", purchaseLimit: null, effects: ["A bundle of rare shards, for a limited time"], tags: ["limited"],
  },
  {
    id: "adFree", name: "Permanent Ad-Disable", category: "special", item: { kind: "entitlement", id: "adFree" }, quantity: 1,
    price: { kind: "money", sku: "ad_free", label: "$9.95" }, rarity: "epic", purchaseLimit: 1,
    effects: ["No more ads", "Permanent ×2 training", "Permanent ×1.5 Gold"], tags: ["oneTime"],
  },
  {
    id: "coins2", name: "Special Coin Pack", category: "special", item: { kind: "entitlement", id: "coins2" }, quantity: 1,
    price: { kind: "money", sku: "coins_x2", label: "$9.95" }, rarity: "epic", purchaseLimit: 1,
    effects: ["Permanent ×2 Gold, on all Gold earned"], tags: ["oneTime"],
  },
  {
    id: "coins3", name: "Premium Coin Pack", category: "special", item: { kind: "entitlement", id: "coins3" }, quantity: 1,
    price: { kind: "money", sku: "coins_x3", label: "$29.95" }, rarity: "legendary", purchaseLimit: 1,
    effects: ["Permanent ×3 Gold", "Multiplies with ×2 and every other bonus"], tags: ["oneTime"],
  },
  {
    id: "dailyGems", name: "Daily Free Gems", category: "gems", item: { kind: "currency", currency: "gems", amount: 25 }, quantity: 1,
    price: { kind: "free" }, rarity: "common", purchaseLimit: 1, daily: true, effects: ["+25 Gems", "Once a day: resets at 00:00 GMT"], tags: ["free"],
  },
  gemPack("gems250", 250, "gems_250", "$4.99", "common"),
  gemPack("gems550", 550, "gems_550", "$9.99", "uncommon", "10% bonus!"),
  gemPack("gems1150", 1150, "gems_1150", "$19.99", "rare", "15% bonus!"),
  gemPack("gems2500", 2500, "gems_2500", "$39.99", "epic", "25% bonus!"),
  gemPack("gems7500", 7500, "gems_7500", "$99.99", "legendary", "50% bonus!"),
];

export const offer = (id: string) => OFFERS.find((o) => o.id === id);

/** Whether `save` meets `r`. */
export const requirementMet = (save: Save, r: Requirement) => save[r.mode].tiersOpen >= r.tier;
/** What meeting `r` takes, for a locked category. */
export const requirementText = (r: Requirement) => `Reach ${r.mode === "tower" ? "Tower" : "Delve"} ${tierNumeral(r.tier)} to unlock.`;
/** The first requirement of `list` not met, if any. */
export const unmet = (save: Save, list: Requirement[] = []) => list.find((r) => !requirementMet(save, r));
