# The Shop

The Shop is a meta-game page, opened from the cart button in the HUD's top-right panel (also from inside a run, like Settings, with a Back button to the board). It sells **offers**; what an offer grants belongs to its owner (a currency's balance, the save's entitlements), never to the Shop.

This document is the reference for the Shop's design: what Version 1 does, how it is built, and what is planned. The code is in `src/shop/` and `src/ui/shop-page.ts`.

## Version 1

### The page, top to bottom

1. **Currencies**: the pages' currencies bar (Gold, Gems and Arcanite held), as on the other pages that spend them; its chevron opens every currency held.
   For a Champion, **Champion Status** follows (see [Champion Status](#champion-status-and-the-champions-club)): a green banner reading *Champion Status* between two gold stars, *Thanks for your support! Enjoy!* under it, the Champion's tier and VIP Points earned (the crown icon), and the **Champion's Club** button.
2. **Limited Offers**, in two columns: the Arcanite packs, each bought at most once every two weeks (14 Shop days from the day of its last purchase; until then its button reads *Purchased* with *Next in 13d hh:mm:ss* under it):

   | Offer | Grants | Default price |
   |---|---|---|
   | 300 Arcanite Pack | 300 Arcanite + 250 Gems | $29.99 |
   | 750 Arcanite Pack | 750 Arcanite + 600 Gems | $59.99 |

   **Arcanite** are a limited currency, kept between runs (`save.arcanite`), with a green crystal icon wherever they are shown: after Gems in the currencies bar of the Upgrades, Research, Deck and Gear pages, in the Shop's currencies, and in the forest's purse under Gems (the purse's lines close up there to make room). Nothing spends them yet. An offer can also be a banner that only opens the store (*Go to store*), and an offer with an end time shows *Expires in hh:mm:ss*, and it can't be bought once that time has passed, whatever the page still shows.
3. **Premium Offers**: one offer at a time (two for a Champion), the next appearing once one is bought (`premiumOffers`); once all are, the section reads *Thanks for your support! More offers to come in the future.* Each is bought once, and what it gives is kept by Erase All and given again on every load (`settlePerks` in `shop/perks.ts`):

   | Offer | Grants | Default price |
   |---|---|---|
   | Extra Researcher | +1 archivist slot (beside the four Gems hire, not counted in their prices); the legendary relic Archivist Badge: +5% research speed | $9.99 |
   | Extra Trainer | +1 trainer; the legendary relic Training Accolade: trainers 5% faster, +10% XP | $9.99 |
   | Stellar Bundle | 500 Gems; the legendary relic Astral Ribbon: +1% Stellar Floor chance, +1% Stellar Gem chance | $9.99 |

4. **One-Time Offers** not yet owned. Each can be bought once, with real money; prices come from the server, with these defaults until it answers:

   | Offer | Does | Default price |
   |---|---|---|
   | Permanent Ad-Disable | No ads (the ad Gem button just pays, and the in-run Gold ad goes, with any boost time it stored, the Gem button taking its place); the trainers' ×2 boost for good, with no ad; ×1.5 Gold | $9.95 ($4.95 for 24 hours as the ad series' last prize: see [Ads Watch](gameplay/currencies-and-shop.md#ads-watch)) |
   | Special Gold Bundle | 150 Gems; ×2 Gold, on all Gold earned; training ×1.5 for good, multiplying with the boost and the Champion's Bundle | $9.95 |
   | Champion's Bundle | 750 Gems; ×3 Gold, multiplying with ×2 and every other bonus; training ×2 for good, multiplying with the boost and the Special Gold Bundle (×6 with all three training packs); Champion Status (below) | $29.95 |

   The Champion's Bundle can be bought only once both Permanent Ad-Disable and the Special Gold Bundle are (`after` on its offer, the `after` refusal): until then its price button is greyed out, with *Available once Permanent Ad-Disable and the Special Gold Bundle are purchased.* under it.

   A line under them says *All Gold bonuses are multiplicative and apply forever.* The Gold bonuses multiply each other: all three make ×9. They apply to every Gold the hero banks in the Tower and the Delve (kills, treasure, Spare Change, the end of a run).
5. **Gems**, in two columns:

   | Column 1 | Column 2 |
   |---|---|
   | Daily Free Gems: 25, once per Shop day | 1,150 Gem Pack: $19.99 (15% bonus!) |
   | 250 Gem Pack: $4.99 | 2,500 Gem Pack: $39.99 (25% bonus!) |
   | 550 Gem Pack: $9.99 (10% bonus!) | 7,500 Gem Pack: $99.99 (50% bonus!) |

6. **Owned**: the one-time and Premium Offers already bought move to the bottom, marked *Owned*.
7. **Purchase history**: every transaction, shown only in Dev mode.

### VIP Points

Every real-money purchase pays **VIP Points** (`save.vip`, a `CURRENCIES` row with a brass crown icon), a fixed amount for its price: each money `Price` carries its `vip`, 16 for each dollar of its base price in US dollars, rounded to the dollar (`money(sku, dollars)` and `VIP_PER_DOLLAR` in `offers.ts`). The amount belongs to the price, not to what the store charges, so a store selling in another currency pays the same; a discount is its own price, so the half-price Ad-Disable ($4.95) pays 80. `purchase` credits them with the item, Dev free purchases included; free claims and currency prices pay none. They show only to a Champion: then each card shows its price's points as a tile beside what it grants, the banner shows the total earned, and the currencies list has a row for them. Erase All keeps them, and nothing spends them: the total earned sets the Champion's tier.

Each card shows what its offer grants as large icons, each over its amount (`rewards` in `ui/shop-page.ts`, read from the offer's item): a one-time pack's Gold multiplier on the Gold coin (*×2*), then the currencies, never written out, and its other effects in a few words (*×1.5 training speed forever*). Tapping a card shows its details without buying: its rarity, its guaranteed effects, the quantity, the price, the balance left after a currency price, and its purchase limit. A card's own button buys it. A Gem price of 200 or more asks for confirmation first. When an offer can't be afforded, what the player has is written under its button (*You have 312 Gems*). A Gem price stays pressable and prominent, as every Gem purchase in the game does: pressing it short of Gems says so and scrolls to the Gem packs. Any other currency's button is disabled. A category can be gated by progress; a locked one shows *🔒 Name* and what unlocks it (*Reach Tower VIII to unlock.*) instead of disappearing.

The Shop button shows a dot while the Daily Free Gems can be claimed.

### Champion Status and the Champion's Club

Owning the Champion's Bundle makes the player a **Champion** (`shop/champion.ts`, `isChampion`). The bundle itself gives, for good:

- ×2 the most offline time Offline Gold pays (and Offline Gems), and Offline Gold even without the Offline Gold skill;
- +25% XP from kills, a factor of its own;
- the unique legendary relic **Champion's Cape**: +5% ATK and +5% DEF (`shop.coins3`);
- −20 s off the ad Gem button's cooldown;
- **Daily Training Points**: 1 Training Point to claim on the Training page once each Shop day (00:00 GMT); the button shows *Claim* and the points, then the countdown to the next and the points; the Club's tiers may multiply a claim;
- the next two Premium Offers shown instead of one;
- the Champion's Club, whose tiers raise permanent bonuses as VIP Points are earned.

**The Champion's Club** (the button under the banner) lists every tier and what it gives: those reached in white with a check, their bonuses at their current values; the rest in grey at their first value. Each tier's bonus starts at its tier and grows by its step for every tier reached past it, up to its cap, and counts even where the research, skill or card it adds to isn't open yet.

| Tier | VIP Points | Bonus (step a later tier, cap) |
|---|---|---|
| Base | the bundle | +5% Offline Gold rate (+2%, 95%); Offline Gems 5% (+2%, 50%) |
| 1 | 960 | 12% chance of ×2 Daily Training Points (+6%, 78%) |
| 2 | 1,440 | −10 s Gem button cooldown (−5 s, −60 s), on top of the bundle's −20 s (−80 s in all) |
| 3 | 2,080 | +5% Gold (+3%) |
| 4 | 2,880 | +10% Silver (+5%) |
| 5 | 3,920 | +5% Golden Gem chance (+3%, 30%) |
| 6 | 5,360 | +2 Gem button bank (+1, 9) |
| 7 | 7,440 | 16% chance of ×3 Daily Training Points (+8%, 64%) |
| 8 | 9,920 | +2 Gems from the Gem button (+1, 7) |
| 9 | 12,480 | +1% Stellar Floor chance (+1%, 8%) |
| 10 | 16,000 | +1 Dash tile, +1 End Rush tile (+1 End Rush), added to the research's, with or without it |
| 11 | 21,600 | 10% chance of ×5 Daily Training Points (+2%, 20%) |
| 12 | 28,800 | +0.5% Gem chance a floor (+0.25%, 2%) |
| 13 | 37,200 | 0.25% chance a Gem button reward pays 100 Gems (+0.25%, 2%) |
| 14+ | 46,800, then every 9,600 | a One Piece Ticket each |

A Daily Training Points claim rolls ×5 at its chance, else ×3 at its, else ×2 at its. Offline Gems are the Offline Gems share of the Gems the Recent Floors per Minute (each Tower climb's new floors over its time, kept with the Recent Gold per Hour) would have found in the time paid: the floors' Gem timer (one a cooldown, a floor at most) and Gem chance, each at its kinds' average worth. The Club's Gold is its own line in the Gold multipliers (*Champion's Club*), and its Silver a factor of its own on Silver found.

The Tier 14+ row shows how many **One Piece Tickets** the tiers have opened and how many were claimed, with a Claim button while one waits (the Club button wears a dot then). A ticket, held in `save.champion.tickets`, is redeemed on the Equipment page's Acquire view: its box opens a list of every Unique of the open categories, and the one chosen comes at Ancestral with five Stars, leaving future Gem pulls like a five-Star copy merged. The currencies list shows One Piece Tickets once one has been claimed.

### The Shop day and server time

The Shop's day runs from 00:00 to 00:00 GMT on the **server's** clock. A claim or purchase asks the server for the time at that moment, and only that answer counts: moving the device clock forward never earns another day's Gems. If the server can't be reached, the claim is refused. The last confirmed server time is saved (it never moves back), and between confirmations the page estimates the time for its countdowns and the Shop button's dot, never for a purchase. A real-money purchase the store has confirmed is granted even if the server's time can't be reached.

### The server and the store (stubbed)

`ShopServer` (`src/shop/server.ts`) is everything the Shop asks of the outside world: the time, real-money prices by sku, taking payment for a sku, and opening the store. Until they are set up, `stubServer` stands in: the device clock serves as the server's (so the shard packs' two weeks count on it for now), the default prices show, the store confirms the Gem packs and the Arcanite packs without payment (`stubConfirms`, so they can be tried out) and nothing else, and *Go to store* does nothing. Dev mode's free purchases grant real-money offers without the store, for testing.

## How it is built

Offers, items, currencies, entitlements, the ledger and the Shop's clock are separate systems, so the Shop never owns items or works out game stats.

| Module | Holds |
|---|---|
| `currency.ts` | The currencies offers can be priced in or grant (`CURRENCIES`: Gems, Arcanite, Gold): how each is read, spent and credited. |
| `rarity.ts` | `RARITIES`, from Common to Ancestral: display name, colour, power multiplier and drop weight, as data. |
| `items.ts` | What an offer grants (`ShopItem`: an amount of a currency, a `bundle` of several currencies, an entitlement, or the running Event's booster, `eventBoost`, bought once an event and sold on the Events page in the `passes` category: docs/EVENTS.md), checking it can be granted before anything is paid, and granting it to its owner. |
| `entitlements.ts` | The permanent perks (`ENTITLEMENTS`), saved in `save.entitlements`, and what the game reads from them: `goldFactor` (read by `RunPurse.gold` in `game/run-purse.ts`), `permanentBoost` (the training boost's end is set to never), `adsOff`, and the Premium Offers' `premiumArchivists`, `premiumTrainers` (read by `trainingSlots`) and `entitlementRelics`. The Premium Passes (`pass1` to `pass3`) are entitlements too, read by the Goals screen (`goals.ts`) and sold from it as the `passes` category, which the Shop page doesn't list. Erasing progress keeps them. |
| `offers.ts` | The `ShopOffer` model and the catalog (`OFFERS`), the categories and their requirements, real-money prices with their VIP Points (`money`), and the Premium Offer showing (`premiumOffer`). |
| `perks.ts` | `settlePerks`: hands the entitlements' relics and archivist slots to their owners where missing, on every load and after Erase All. |
| `ledger.ts` | The Shop's saved state, `save.shop`: purchase counts per offer (with the Shop day of the last, so the count of an offer with a period starts again), the transaction history (the last 100) and the last confirmed server time. |
| `clock.ts` | The Shop day (`gmtDay`), recording a confirmed server time, and the estimate between confirmations. |
| `transactions.ts` | `purchase`: one transaction, all or nothing. |
| `server.ts` | `ShopServer` and its stub. |

### A purchase

`game.shop.buy(id, serverNow, paid)` (`ShopDesk`) records the confirmed server time, then calls `purchase`, which:

1. checks the offer: its category's and its own requirements, start and end times, whether it only opens the store, its purchase limit, whether its item can be granted (an entitlement not already owned), and its payment (a real-money offer only once the store confirmed it; a currency price only if it can be afforded);
2. pays the price;
3. grants the item to its owner (a Premium Offer's archivist slot and relic among it), and pays a real-money price's VIP Points;
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
- **Special currencies**: tokens and others, each one row in `CURRENCIES` and shown in the Shop's currency bar, as Arcanite are.
- **More categories**: Featured, Equipment (Modules, Weapons, Armor), Resources, Consumables, Special and History, as tabs once there are enough of them; some gated by tier rewards (*Reach Tower 8 to unlock*).
- **Notifications**: *NEW*, *SALE*, *EXPIRING* and *FREE* tags on the Shop button and on cards, cleared once seen or claimed.
- **Connected purchases**: restoring entitlements from the store's receipts, and asking the server for the time, the prices and the limited offers.
- **Ads**: until Ad-Disable (`adsOff`) is owned, every ad button opens the Ads Watch dialog (`ui/ads-watch.ts`) before its ad plays; with it, the button pays at once.
