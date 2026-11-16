import type { Save } from "../save/shape.ts";
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
 * the offer only opens the store. A real-money price pays its `vip`
 * VIP Points with the purchase, whatever currency the store charges in. */
export type Price =
  | { kind: "currency"; currency: CurrencyId; amount: number }
  | { kind: "free" }
  | { kind: "money"; sku: string; label: string; vip: number }
  | { kind: "store"; url: string };

/** VIP Points a real-money price pays for each dollar of its base price
 * (US dollars, rounded to the whole dollar): $9.99 pays 160. */
export const VIP_PER_DOLLAR = 16;
/** A real-money price of `dollars` (its base price, as sold in US
 * dollars), with the VIP Points it pays. */
export const money = (sku: string, dollars: number): Price & { kind: "money" } =>
  ({ kind: "money", sku, label: `$${dollars.toFixed(2)}`, vip: Math.round(dollars) * VIP_PER_DOLLAR });

/** A progression gate on a category or offer. */
export type Requirement = { kind: "tier"; mode: Mode; tier: number };

export type CategoryId = "limited" | "premium" | "special" | "gems" | "passes";
/** A category: its heading, what opens it, and a line under its offers. */
export type Category = { name: string; requires?: Requirement[]; note?: string };
export const CATEGORIES: Record<CategoryId, Category> = {
  limited: { name: "Limited Offers" },
  // Shown one at a time, in order: the next once one is bought.
  premium: { name: "Premium Offers" },
  special: { name: "One-Time Offers", note: "All Gold bonuses are multiplicative and apply forever." },
  gems: { name: "Gems" },
  // Sold from the Goals and Events screens, not the Shop page.
  passes: { name: "Premium Passes" },
};

export type OfferId = "shards300" | "shards750" | "researcher" | "trainer" | "stellar" | "adFree" | "coins2" | "coins3" | "dailyGems" | "gems250" | "gems550" | "gems1150" | "gems2500" | "gems7500" | "pass1" | "pass2" | "pass3" | "eventBoost";
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
  /** Offers that must be bought first: until then its button waits. */
  after?: OfferId[];
  /** What it does, guaranteed, in a few words each, beyond the currencies
   * its item grants and its Gold multiplier (the page shows those as icons). Randomized items will
   * list their possible effects apart from these. */
  effects: string[];
  /** A highlight on its card ("10% bonus!"). */
  badge?: string;
  tags: string[];
};

/** A limited pack of Arcanite with Gems beside them, once a fortnight. */
const arcanitePack = (id: OfferId, arcanite: number, gems: number, sku: string, dollars: number, rarity: RarityId): ShopOffer => ({
  id, name: `${arcanite} Arcanite Pack`, category: "limited", item: { kind: "bundle", amounts: { arcanite, gems } }, quantity: 1,
  price: money(sku, dollars), rarity, purchaseLimit: 1, period: SHARD_PACK_DAYS,
  effects: ["Every two weeks"], tags: ["limited"],
});
/** Shop days between purchases of each Arcanite pack. */
export const SHARD_PACK_DAYS = 14;

const gemPack = (id: OfferId, gems: number, sku: string, dollars: number, rarity: RarityId, badge?: string): ShopOffer => ({
  id, name: `${gems.toLocaleString("en-US")} Gem Pack`, category: "gems", item: { kind: "currency", currency: "gems", amount: gems }, quantity: 1,
  price: money(sku, dollars), rarity, purchaseLimit: null, effects: [], badge, tags: [],
});

/** Every offer, in the order the page shows each category's. */
export const OFFERS: readonly ShopOffer[] = [
  arcanitePack("shards300", 300, 250, "shards_300", 29.99, "legendary"),
  arcanitePack("shards750", 750, 600, "shards_750", 59.99, "mythic"),
  // The Premium Offers, shown one at a time in this order (`premiumOffer`).
  {
    id: "researcher", name: "Extra Researcher", category: "premium", item: { kind: "entitlement", id: "researcher" }, quantity: 1,
    price: money("extra_researcher", 9.99), rarity: "legendary", purchaseLimit: 1,
    effects: ["+1 archivist slot", "Unique legendary relic: Archivist Badge, +5% research speed"], tags: ["oneTime"],
  },
  {
    id: "trainer", name: "Extra Trainer", category: "premium", item: { kind: "entitlement", id: "trainer" }, quantity: 1,
    price: money("extra_trainer", 9.99), rarity: "legendary", purchaseLimit: 1,
    effects: ["+1 trainer", "Unique legendary relic: Training Accolade, +5% training speed and +10% XP gain"], tags: ["oneTime"],
  },
  {
    id: "stellar", name: "Stellar Bundle", category: "premium", item: { kind: "entitlement", id: "stellar", amounts: { gems: 500 } }, quantity: 1,
    price: money("stellar_bundle", 9.99), rarity: "legendary", purchaseLimit: 1,
    effects: ["Unique legendary relic: Astral Ribbon, +1% Stellar Floors and +1% Stellar Gems"], tags: ["oneTime"],
  },
  {
    id: "adFree", name: "Permanent Ad-Disable", category: "special", item: { kind: "entitlement", id: "adFree" }, quantity: 1,
    price: money("ad_free", 9.95), rarity: "epic", purchaseLimit: 1,
    effects: ["No ads", "×2 training speed forever"], tags: ["oneTime"],
  },
  {
    id: "coins2", name: "Special Gold Bundle", category: "special", item: { kind: "entitlement", id: "coins2", amounts: { gems: 150 } }, quantity: 1,
    price: money("coins_x2", 9.95), rarity: "epic", purchaseLimit: 1,
    effects: ["×2 training speed forever"], tags: ["oneTime"],
  },
  {
    id: "coins3", name: "Champion's Bundle", category: "special", item: { kind: "entitlement", id: "coins3", amounts: { gems: 750 } }, quantity: 1,
    price: money("coins_x3", 29.95), rarity: "legendary", purchaseLimit: 1, after: ["adFree", "coins2"],
    effects: [
      "×3 training speed forever", "Champion Status and the Champion's Club", "VIP Points raise permanent bonuses",
      "+5% Offline Gold rate and Offline Gems", "×2 Offline time max", "+25% XP gain",
      "Unique legendary relic: Founder's Cape, +5% ATK and +5% DEF", "−20s Gem button cooldown",
      "Daily Training Points", "See the next two Premium Offers",
    ],
    tags: ["oneTime"],
  },
  {
    id: "dailyGems", name: "Daily Free Gems", category: "gems", item: { kind: "currency", currency: "gems", amount: 25 }, quantity: 1,
    price: { kind: "free" }, rarity: "common", purchaseLimit: 1, period: 1, effects: ["Free daily, 00:00 GMT"], tags: ["free"],
  },
  gemPack("gems250", 250, "gems_250", 4.99, "common"),
  gemPack("gems550", 550, "gems_550", 9.99, "uncommon", "10% bonus!"),
  gemPack("gems1150", 1150, "gems_1150", 19.99, "rare", "15% bonus!"),
  gemPack("gems2500", 2500, "gems_2500", 39.99, "epic", "25% bonus!"),
  gemPack("gems7500", 7500, "gems_7500", 99.99, "legendary", "50% bonus!"),
  ...PASSES.map((p): ShopOffer => ({
    id: p.id as OfferId, name: `Premium Pass ${p.n}`, category: "passes", item: { kind: "entitlement", id: p.id }, quantity: 1,
    price: money(p.sku, p.dollars), rarity: "legendary", purchaseLimit: 1,
    effects: [`Premium rewards in Towers ${p.towers.map(tierNumeral).join(", ")}`], tags: ["oneTime"],
  })),
  // Once each event, sold on the Events page.
  {
    id: "eventBoost", name: "Event Booster", category: "passes", item: { kind: "eventBoost" }, quantity: 1,
    price: money("event_booster", 9.99), rarity: "epic", purchaseLimit: null,
    effects: ["Double this event's Medals", "Opens its premium relics"], tags: ["event"],
  },
];

export const offer = (id: string) => OFFERS.find((o) => o.id === id);

/** Whether offer `id` has ever been bought. */
export const bought = (save: Pick<Save, "shop">, id: OfferId) => !!save.shop.counts[id]?.n;

/** The Premium Offers the Shop shows now: the first not yet bought, or
 * the first `shown` (two for a Champion), none once all are. */
export const premiumOffers = (save: Pick<Save, "shop">, shown = 1) =>
  OFFERS.filter((o) => o.category === "premium" && !bought(save, o.id)).slice(0, shown);
/** The first Premium Offer not yet bought, if any. */
export const premiumOffer = (save: Pick<Save, "shop">) => premiumOffers(save)[0];

/** Whether `save` meets `r`. */
export const requirementMet = (save: Save, r: Requirement) => save[r.mode].tiersOpen >= r.tier;
/** What meeting `r` takes, for a locked category. */
export const requirementText = (r: Requirement) => `Reach ${r.mode === "tower" ? "Tower" : "Delve"} ${tierNumeral(r.tier)} to unlock.`;
/** The first requirement of `list` not met, if any. */
export const unmet = (save: Save, list: Requirement[] = []) => list.find((r) => !requirementMet(save, r));
