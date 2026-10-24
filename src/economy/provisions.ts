/** Provisions, bought with Gold on the Gear page and kept for good: each
 * one owned is one use every run carries, never a stat at its start. The
 * Traveler's elixir fills HP (`Game.useProvision`), the Whetstone and
 * Aegis charm raise ATK or DEF by `PROVISION_BOOST_PERCENT` for
 * `PROVISION_BOOST_TURNS` turns, a Bomb is thrown at an enemy (`Game.arm`),
 * and each Gold Key hands the run a gold key every `PROVISION_KEY_FLOORS`
 * floors. Each costs `price.base` Gold (100), and each one after `ratio` (100) times
 * the last (`schedulePrice`). One with `requires` shows, and sells, only
 * once that upgrade is owned. */
export const GOLD_SHOP = [
  {
    id: "heal",
    name: "Traveler's elixir",
    description: "One more elixir every run: press it to fill HP to max HP",
    price: { base: 100, ratio: 100 },
  },
  {
    id: "guard",
    name: "Aegis charm",
    description: "One more Aegis charm every run: press it for +20% DEF for 100 turns",
    price: { base: 100, ratio: 100 },
  },
  {
    id: "edge",
    name: "Whetstone",
    description: "One more Whetstone every run: press it for +20% ATK for 100 turns",
    price: { base: 100, ratio: 100 },
  },
  {
    id: "yellowKey",
    name: "Gold Key",
    description: "One more gold key every 100 floors of a run, from the floor it starts on",
    price: { base: 100, ratio: 100 },
    requires: "extraKey",
  },
  {
    id: "bomb",
    name: "Bomb",
    description: "One more Bomb every run: press it, then an enemy's tile, to deal that enemy your ATK",
    price: { base: 100, ratio: 100 },
  },
] as const;
/** The provisions pressed from the HUD to use at once (not a Bomb, armed
 * for a board tap, nor the Gold Key, which uses itself). */
export const USED_PROVISIONS = ["heal", "edge", "guard"] as const;
export type UsedProvision = (typeof USED_PROVISIONS)[number];
/** The stat each boosting provision raises while it lasts. */
export const PROVISION_BOOSTS = { edge: "attack", guard: "defense" } as const satisfies Partial<Record<UsedProvision, string>>;
/** How much a Whetstone or Aegis charm raises its stat, in percent, and
 * for how many turns. */
export const PROVISION_BOOST_PERCENT = 20;
export const PROVISION_BOOST_TURNS = 100;
/** The floors between a Gold Key provision's keys. */
export const PROVISION_KEY_FLOORS = 100;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];
