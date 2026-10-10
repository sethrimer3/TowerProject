import { snap } from "../exact.ts";
import type { Save } from "../entities.ts";

// The currencies the Shop prices offers in. Each is held in the save by its
// own system (Gems in gems.ts, Gold banked by Game); this table only reads,
// spends and credits them, so an offer never knows where a currency lives.

export type CurrencyId = "gems" | "shards" | "gold" | "medals";
export type Currency = {
  name: string;
  /** What the currency is, for its information panel. */
  info: string;
  balance(save: Save): number;
  spend(save: Save, amount: number): void;
  credit(save: Save, amount: number): void;
};

export const CURRENCIES: Record<CurrencyId, Currency> = {
  gems: {
    name: "Gems",
    info: "The premium currency, kept between runs. Found on floors now and then, claimed free each day in the Shop, or bought in packs.",
    balance: (save) => save.gems,
    spend: (save, n) => void (save.gems -= n),
    credit: (save, n) => void (save.gems += n),
  },
  shards: {
    name: "Ascension Shards",
    info: "A limited currency, kept between runs. Bought in the Shop's limited packs, one of each every two weeks.",
    balance: (save) => save.ascensionShards,
    spend: (save, n) => void (save.ascensionShards -= n),
    credit: (save, n) => void (save.ascensionShards += n),
  },
  gold: {
    name: "Gold",
    info: "Kept between runs: found on floors, paid for kills, and spent on training, provisions and research.",
    balance: (save) => save.gold,
    spend: (save, n) => void (save.gold = snap(save.gold - n)),
    credit: (save, n) => void (save.gold = snap(save.gold + n)),
  },
  medals: {
    name: "Medals",
    info: "A limited currency, kept between runs. Earned from the weekly mission rewards.",
    balance: (save) => save.medals,
    spend: (save, n) => void (save.medals -= n),
    credit: (save, n) => void (save.medals += n),
  },
};
