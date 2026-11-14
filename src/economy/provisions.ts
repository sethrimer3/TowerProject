import { researched, type ArchivesSave, type ResearchTarget } from "../progression/archives.ts";

/** How much a Vanguard Banner or Aegis charm raises its stat, in percent, and
 * for how many turns, before research: the bases of their Archives targets. */
export const PROVISION_BOOST_PERCENT = 20;
export const PROVISION_BOOST_TURNS = 50;
/** A boosting provision's line on the Gear page, for what one gives. */
export function boostText(id: "edge" | "guard", percent: number, turns: number) {
  return id === "edge"
    ? `One more Vanguard Banner every climb: use for +${percent}% ATK for ${turns} turns`
    : `One more Aegis charm every climb: use for +${percent}% DEF for ${turns} turns`;
}
/** Provisions, bought with Gold on the Gear page and kept for good: each
 * one owned is one use every run carries, never a stat at its start. The
 * Traveler's elixir fills HP (`Game.useProvision`), the Vanguard Banner and
 * Aegis charm raise ATK or DEF by `PROVISION_BOOST_PERCENT` for
 * `PROVISION_BOOST_TURNS` turns, raised by their Archives research
 * (`provisionBoost`), a Bomb is thrown at an enemy (`Game.arm`),
 * and each Gold Key hands the run a gold key every `PROVISION_KEY_FLOORS`
 * floors. Each costs `price.base` Gold (100), and each one after `ratio` (100) times
 * the last (`schedulePrice`). None is sold from the start: each `requires`
 * its skill (the elixir, Vanguard Banner and Aegis charm on the Inspiration
 * tree, the Gold Key and Bomb on the Breakthrough tree), and shows, and sells,
 * only once that is owned. */
export const GOLD_SHOP = [
  {
    id: "heal",
    name: "Traveler's elixir",
    description: "One more elixir every climb: use to fill HP to max",
    price: { base: 100, ratio: 100 },
    requires: "elixirProvision",
  },
  {
    id: "guard",
    name: "Aegis charm",
    description: boostText("guard", PROVISION_BOOST_PERCENT, PROVISION_BOOST_TURNS),
    price: { base: 100, ratio: 100 },
    requires: "aegisProvision",
  },
  {
    id: "edge",
    name: "Vanguard Banner",
    description: boostText("edge", PROVISION_BOOST_PERCENT, PROVISION_BOOST_TURNS),
    price: { base: 100, ratio: 100 },
    requires: "whetstoneProvision",
  },
  {
    id: "yellowKey",
    name: "Gold Key",
    description: "One more gold key gained every 100 floors of a climb",
    price: { base: 100, ratio: 100 },
    requires: "extraKey",
  },
  {
    id: "bomb",
    name: "Bomb",
    description: "One more Bomb every climb: select it, then an enemy's tile, to deal your ATK as damage, critical hits counted",
    price: { base: 100, ratio: 100 },
    requires: "bombs",
  },
] as const;
/** The provisions pressed from the HUD to use at once (not a Bomb, armed
 * for a board tap, nor the Gold Key, which uses itself). */
export const USED_PROVISIONS = ["heal", "edge", "guard"] as const;
export type UsedProvision = (typeof USED_PROVISIONS)[number];
/** The stat each boosting provision raises while it lasts. */
export const PROVISION_BOOSTS = { edge: "attack", guard: "defense" } as const satisfies Partial<Record<UsedProvision, string>>;
/** The most turns a boost can run, all its Duration research done (50 + 25 × 10). */
export const PROVISION_BOOST_MAX_TURNS = 300;
/** Each boosting provision's Archives targets: its Multiplier's percent and its Duration's turns. */
const BOOST_RESEARCH = {
  edge: { percent: "vanguardBannerPercent", turns: "vanguardBannerTurns" },
  guard: { percent: "aegisCharmPercent", turns: "aegisCharmTurns" },
} as const satisfies Record<keyof typeof PROVISION_BOOSTS, { percent: ResearchTarget; turns: ResearchTarget }>;
/** What a Vanguard Banner (`edge`) or Aegis charm (`guard`) used now gives:
 * the percent it raises its stat by and the turns it lasts, its research
 * read at the moment it is used. */
export const provisionBoost = (a: ArchivesSave, id: keyof typeof PROVISION_BOOSTS) =>
  ({ percent: researched(a, BOOST_RESEARCH[id].percent), turns: researched(a, BOOST_RESEARCH[id].turns) });
/** The floors between a Gold Key provision's keys. */
export const PROVISION_KEY_FLOORS = 100;
export type GoldItemId = (typeof GOLD_SHOP)[number]["id"];
