# The Shop

The Shop is a meta-game page, opened from the cart button in the HUD's top-right panel (also from inside a run, like Settings, with a Back button to the board). It sells **offers**; what an offer grants belongs to its owner (a currency's balance, the save's entitlements), never to the Shop.

This document is the reference for the Shop's design: what Version 1 does, how it is built, and what is planned. The code is in `src/shop/` and `src/ui/shop-page.ts`.

## Version 1

### The page, top to bottom

1. **Currencies**: Gems, Ascension Shards and Gold held. Tapping one opens its information.
2. **Limited Offers**, in two columns: the Ascension Shard packs, each bought at most once every two weeks (14 Shop days from the day of its last purchase; until then its button reads *Purchased* with *Next in 13d hh:mm:ss* under it):

   | Offer | Grants | Default price |
   |---|---|---|
   | 300 Ascension Shard Pack | 300 Ascension Shards + 250 Gems | $29.99 |
   | 750 Ascension Shard Pack | 750 Ascension Shards + 600 Gems | $59.99 |

   **Ascension Shards** are a limited currency, kept between runs (`save.ascensionShards`), with a green crystal icon wherever they are shown: after Gems in the currencies bar of the Upgrades, Research, Deck and Gear pages, in the Shop's currencies, and in the forest's purse under Gems (the purse's lines close up there to make room). Nothing spends them yet. An offer can also be a banner that only opens the store (*Go to store*), and an offer with an end time shows *Expires in hh:mm:ss*, and it can't be bought once that time has passed, whatever the page still shows.
3. **One-Time Offers** not yet owned. Each can be bought once, with real money; prices come from the server, with these defaults until it answers:

   | Offer | Does | Default price |
   |---|---|---|
   | Permanent Ad-Disable | No ads (the ad Gem button just pays, and the in-run Gold ad goes, with any boost time it stored, the Gem button taking its place); ×1.5 Gold | $9.95 |
   | Special Coin Pack | ×2 Gold, on all Gold earned; the trainers' ×2 boost runs for good (a glowing "x2" stands in place of its ad button) | $9.95 |
   | Premium Coin Pack | ×3 Gold, multiplying with ×2 and every other bonus; training ×3 for good, multiplying with the boost (×6 with both) | $29.95 |

   The Gold bonuses multiply each other: all three make ×9. They apply to every Gold the hero banks in the Tower and the Delve (kills, treasure, Spare Change, the end of a run), but not to Defend.
4. **Gems**, in two columns:

   | Column 1 | Column 2 |
   |---|---|
   | Daily Free Gems: 25, once per Shop day | 1,150 Gem Pack: $19.99 (15% bonus!) |
   | 250 Gem Pack: $4.99 | 2,500 Gem Pack: $39.99 (25% bonus!) |
   | 550 Gem Pack: $9.99 (10% bonus!) | 7,500 Gem Pack: $99.99 (50% bonus!) |

5. **Owned**: the one-time offers already bought move to the bottom, marked *Owned*.
6. **Purchase history**: every transaction, shown only in Dev mode.

Each card shows the currencies its offer grants as large icons, each over its amount (`rewards` in `ui/shop-page.ts`, read from the offer's item), never written out, and its other effects in a few words (*×2 Gold forever*). Tapping a card shows its details without buying: its rarity, its guaranteed effects, the quantity, the price, the balance left after a currency price, and its purchase limit. A card's own button buys it. A Gem price of 200 or more asks for confirmation first. When an offer can't be afforded, what the player has is written under its button (*You have 312 Gems*). A Gem price stays pressable and prominent, as every Gem purchase in the game does: pressing it short of Gems says so and scrolls to the Gem packs. Any other currency's button is disabled. A category can be gated by progress; a locked one shows *🔒 Name* and what unlocks it (*Reach Tower VIII to unlock.*) instead of disappearing.

The Shop button shows a dot while the Daily Free Gems can be claimed.

### The Shop day and server time

The Shop's day runs from 00:00 to 00:00 GMT on the **server's** clock. A claim or purchase asks the server for the time at that moment, and only that answer counts: moving the device clock forward never earns another day's Gems. If the server can't be reached, the claim is refused. The last confirmed server time is saved (it never moves back), and between confirmations the page estimates the time for its countdowns and the Shop button's dot, never for a purchase. A real-money purchase the store has confirmed is granted even if the server's time can't be reached.

### The server and the store (stubbed)

`ShopServer` (`src/shop/server.ts`) is everything the Shop asks of the outside world: the time, real-money prices by sku, taking payment for a sku, and opening the store. Until they are set up, `stubServer` stands in: the device clock serves as the server's (so the shard packs' two weeks count on it for now), the default prices show, the store confirms the Gem packs and the Ascension Shard packs without payment (`stubConfirms`, so they can be tried out) and nothing else, and *Go to store* does nothing. Dev mode's free purchases grant real-money offers without the store, for testing.

## How it is built

Offers, items, currencies, entitlements, the ledger and the Shop's clock are separate systems, so the Shop never owns items or works out game stats.

| Module | Holds |
|---|---|
| `currency.ts` | The currencies offers can be priced in or grant (`CURRENCIES`: Gems, Ascension Shards, Gold): how each is read, spent and credited. |
| `rarity.ts` | `RARITIES`, from Common to Ancestral: display name, colour, power multiplier and drop weight, as data. |
| `items.ts` | What an offer grants (`ShopItem`: an amount of a currency, a `bundle` of several currencies, or an entitlement), checking it can be granted before anything is paid, and granting it to its owner. |
| `entitlements.ts` | The permanent perks (`ENTITLEMENTS`), saved in `save.entitlements`, and what the game reads from them: `goldFactor` (read by `RunPurse.gold` in `game/run-purse.ts`), `permanentBoost` (the training boost's end is set to never) and `adsOff`. The Premium Passes (`pass1` to `pass3`) are entitlements too, read by the Goals screen (`goals.ts`) and sold from it as the `passes` category, which the Shop page doesn't list. Erasing progress keeps them. |
| `offers.ts` | The `ShopOffer` model and the catalog (`OFFERS`), the categories and their requirements. |
| `ledger.ts` | The Shop's saved state, `save.shop`: purchase counts per offer (with the Shop day of the last, so the count of an offer with a period starts again), the transaction history (the last 100) and the last confirmed server time. |
| `clock.ts` | The Shop day (`gmtDay`), recording a confirmed server time, and the estimate between confirmations. |
| `transactions.ts` | `purchase`: one transaction, all or nothing. |
| `server.ts` | `ShopServer` and its stub. |

### A purchase

`Game.buyOffer(id, serverNow, paid)` records the confirmed server time, then calls `purchase`, which:

1. checks the offer: its category's and its own requirements, start and end times, whether it only opens the store, its purchase limit, whether its item can be granted (an entitlement not already owned), and its payment (a real-money offer only once the store confirmed it; a currency price only if it can be afforded);
2. pays the price;
3. grants the item to its owner;
4. records the transaction;
5. counts the purchase against the offer.

Every check comes before any change, and granting can't fail once the checks pass, so a refused purchase leaves the save exactly as it was. `tests/shop.test.ts` covers the catalog, the Shop day, the clock, the transactions, the entitlements' effects and the save.

### The offer model

```
ShopOffer
    id, name, category
    item?            what it grants (none: it only opens the store)
    quantity
    price            currency + amount | free | money (sku, default label) | store link
    rarity
    purchaseLimit    a number, or null for unlimited
    period?          the limit counts afresh this many Shop days after the last purchase (1: daily)
    startTime?, endTime?
    requires[]       progression gates
    effects[]        guaranteed effects
    badge?           "10% bonus!"
    tags[]
```

A free reward is just an offer with a free price (the Daily Free Gems), not a separate system.

## Future support

None of these is built yet; the model leaves room for each.

- **Rotating inventory**: a set of offers generated from a rotation seed for each rotation period (saved, so a restart never regenerates it), whose unbought offers expire and whose limits reset at each rotation, leaving what was bought untouched. The Shop day and the ledger's per-period counts are the start of it.
- **Rerolls**: buying a fresh rotation, shown with its cost and confirmed when expensive, keeping what was bought. The cost may rise with each reroll in a rotation, C<sub>r</sub>(n) = C<sub>0</sub>(1 + r)<sup>n</sup>, and rerolls may be limited per rotation. Featured offers are never rerolled.
- **Featured offers**: one or more highlighted offers, generated apart from the ordinary ones, with a struck-through normal price (*Normally 1,000 · Today 750*).
- **Limited-time sales**: offers with start and end times from the server. The model and the page already honour `startTime`, `endTime` and the *Expires in* countdown.
- **Randomized equipment**: `GenerateItem(itemType, rarity, level, seed)` making an item's base stats, modifiers and unique effect from a seeded stream of its own; gem slots with randomized sub-effects and their own reroll currency, with more slots at higher rarities and levels. Its details would list *Guaranteed* effects apart from *Possible* ones. The item is generated before anything is paid, so the transaction stays all or nothing, and a *View in inventory* button follows the purchase.
- **Purchase history for players**: the ledger already keeps the last 100 transactions; today only Dev mode shows them.
- **Dynamic pricing**: prices from the server per player or per region.
- **Special currencies**: tokens and others, each one row in `CURRENCIES` and shown in the Shop's currency bar, as Ascension Shards are.
- **More categories**: Featured, Equipment (Modules, Weapons, Armor), Resources, Consumables, Special and History, as tabs once there are enough of them; some gated by tier rewards (*Reach Tower 8 to unlock*).
- **Notifications**: *NEW*, *SALE*, *EXPIRING* and *FREE* tags on the Shop button and on cards, cleared once seen or claimed.
- **Connected purchases**: restoring entitlements from the store's receipts, and asking the server for the time, the prices and the limited offers.
- **Ads**: when ads exist, Ad-Disable (`adsOff`) skips them wherever they would play, such as the ad Gem button.
