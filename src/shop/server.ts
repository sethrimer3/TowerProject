// The game server and the app store, as the Shop sees them. Both are
// stubbed for now: the interface is what the Shop page calls, so connecting
// them later changes only this file.

export interface ShopServer {
  /** The server's time now (ms), or null when it can't be reached. A free
   * claim or a purchase counts only on a time this returns. */
  time(): Promise<number | null>;
  /** Each real-money offer's price, by sku, in the player's currency; a sku
   * left out keeps its default label. */
  prices(): Promise<Record<string, string>>;
  /** Takes the player through the store's own purchase of `sku`; true once
   * the store confirms it was paid. */
  purchase(sku: string): Promise<boolean>;
  /** Opens the store (at `url`, when an offer names a page in it). */
  openStore(url: string): void;
}

/** Whether the stub store confirms `sku` unpaid: for now, the Gem packs
 * and the Ascension Shard packs, so they can be tried out. */
export const stubConfirms = (sku: string) => sku.startsWith("gems_") || sku.startsWith("shards_");

/** The stand-in until the server exists.
 * TODO: ask the server for the time and prices, and the store to take
 * payment, once both are set up. Until then the device's clock stands in
 * for the server's (so the shard packs' two weeks count on it), the
 * default prices show, and the store confirms the Gem and shard packs
 * without payment (`stubConfirms`); nothing else can be bought with real
 * money except through Dev mode's free purchases. */
export const stubServer: ShopServer = {
  time: async () => Date.now(),
  prices: async () => ({}),
  purchase: async (sku) => stubConfirms(sku),
  openStore: () => {},
};
