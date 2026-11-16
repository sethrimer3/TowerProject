import type { Save } from "../save/shape.ts";
import { count, isRecord } from "../save/decode.ts";
import { DAY_MS, gmtDay } from "./clock.ts";
import { owns } from "./entitlements.ts";
import { snap } from "../exact.ts";
import { relicAmount } from "../economy/relic-effects.ts";
import { addFiveStar, availableCategories } from "../equipment/inventory.ts";
import { uniquesOf } from "../equipment/catalog.ts";

// Champion Status: what owning the Champion's Bundle (the `coins3`
// entitlement) gives, and the Champion's Club's tiers, each opened by the
// VIP Points earned in all (`save.vip`, which nothing spends). Every bonus
// here counts whether or not the research, skill or card it adds to is
// open: it is another way to the same effect. The systems it raises read
// their values from here (`championValue`).

/** The entitlement that makes the player a Champion. */
export const CHAMPION_ENTITLEMENT = "coins3";
/** Whether the player owns the Champion's Bundle. */
export const isChampion = (save: Pick<Save, "entitlements">) => owns(save, CHAMPION_ENTITLEMENT);

// --- What the bundle itself gives ---

/** Offline Gold's (and Gems') most time paid is multiplied by this. */
export const CHAMPION_OFFLINE_TIME = 2;
/** XP from kills, raised by this percent (its own factor). */
export const CHAMPION_XP = 25;
/** Seconds off the ad Gem button's cooldown. */
export const CHAMPION_GEM_COOLDOWN = 20;
/** Training Points the Daily Training Points pay before their multiplier. */
export const DAILY_TRAINING_POINTS = 1;

/** Premium Offers shown at once to a Champion (one otherwise). */
export const CHAMPION_PREMIUM_SHOWN = 2;
/** Gems an ad Gem reward pays when the Champion's jackpot hits. */
export const AD_JACKPOT_GEMS = 100;

// --- The Club's tiers ---

/** VIP Points earned that open tiers 1 to 13; from tier 14, one more tier
 * every `LATER_TIER_POINTS`. Tier 0 (the Base Tier) comes with the bundle. */
export const TIER_POINTS: readonly number[] = [960, 1440, 2080, 2880, 3920, 5360, 7440, 9920, 12480, 16000, 21600, 28800, 37200];
export const LATER_TIER_POINTS = 9600;
/** The first tier past the named ones: each from it on pays a One Piece Ticket. */
export const TICKET_TIER = TIER_POINTS.length + 1;

/** The VIP Points tier `n` (from 1) opens at. */
export const tierPoints = (n: number) =>
  n <= TIER_POINTS.length ? TIER_POINTS[n - 1]! : TIER_POINTS[TIER_POINTS.length - 1]! + (n - TIER_POINTS.length) * LATER_TIER_POINTS;

/** The tier `vip` VIP Points reach: 0 (Base) below the first threshold. */
export function tierFor(vip: number) {
  const named = TIER_POINTS.filter((p) => vip >= p).length;
  if (named < TIER_POINTS.length) return named;
  return named + Math.floor((vip - TIER_POINTS[TIER_POINTS.length - 1]!) / LATER_TIER_POINTS);
}

/** The Champion's tier now, or null for a player who isn't one. */
export const championTier = (save: Pick<Save, "entitlements" | "vip">) => (isChampion(save) ? tierFor(save.vip) : null);

export type ChampionBonusId =
  | "offlineGold" | "offlineGems" | "dailyDouble" | "gemCooldown" | "gold" | "silver" | "goldenGem" | "gemBank"
  | "dailyTriple" | "adGems" | "stellarFloor" | "dash" | "endRush" | "dailyFive" | "gemChance" | "adJackpot";

/** A tier's bonus: `base` from its tier, `step` more for each tier reached
 * past it, never more than `cap`; `text` says it with its value. */
export type ChampionBonus = { tier: number; base: number; step: number; cap?: number; unit: "%" | "s" | ""; text: (v: number) => string };

const pct = (v: number) => `${Number(v.toFixed(2))}%`;
/** Every Club bonus, in its tier's order. */
export const CHAMPION_BONUSES: Readonly<Record<ChampionBonusId, ChampionBonus>> = {
  offlineGold: { tier: 0, base: 5, step: 2, cap: 95, unit: "%", text: (v) => `+${pct(v)} Offline Gold rate` },
  offlineGems: { tier: 0, base: 5, step: 2, cap: 50, unit: "%", text: (v) => `${pct(v)} of the Gems recent climbs find, while offline` },
  dailyDouble: { tier: 1, base: 12, step: 6, cap: 78, unit: "%", text: (v) => `${pct(v)} chance of ×2 Daily Training Points` },
  gemCooldown: { tier: 2, base: 10, step: 5, cap: 60, unit: "s", text: (v) => `−${v}s Gem button cooldown` },
  gold: { tier: 3, base: 5, step: 3, unit: "%", text: (v) => `+${pct(v)} Gold` },
  silver: { tier: 4, base: 10, step: 5, unit: "%", text: (v) => `+${pct(v)} Silver` },
  goldenGem: { tier: 5, base: 5, step: 3, cap: 30, unit: "%", text: (v) => `+${pct(v)} Golden Gem chance` },
  gemBank: { tier: 6, base: 2, step: 1, cap: 9, unit: "", text: (v) => `+${v} Gem button bank` },
  dailyTriple: { tier: 7, base: 16, step: 8, cap: 64, unit: "%", text: (v) => `${pct(v)} chance of ×3 Daily Training Points` },
  adGems: { tier: 8, base: 2, step: 1, cap: 7, unit: "", text: (v) => `+${v} Gems from the Gem button` },
  stellarFloor: { tier: 9, base: 1, step: 1, cap: 8, unit: "%", text: (v) => `+${pct(v)} Stellar Floor chance` },
  dash: { tier: 10, base: 1, step: 0, unit: "", text: (v) => `+${v} Dash tile${v === 1 ? "" : "s"}, with or without its research` },
  endRush: { tier: 10, base: 1, step: 1, unit: "", text: (v) => `+${v} End Rush tile${v === 1 ? "" : "s"}, with or without its research` },
  dailyFive: { tier: 11, base: 10, step: 2, cap: 20, unit: "%", text: (v) => `${pct(v)} chance of ×5 Daily Training Points` },
  gemChance: { tier: 12, base: 0.5, step: 0.25, cap: 2, unit: "%", text: (v) => `+${pct(v)} Gem chance a floor` },
  adJackpot: { tier: 13, base: 0.25, step: 0.25, cap: 2, unit: "%", text: (v) => `${pct(v)} chance a Gem button reward pays ${AD_JACKPOT_GEMS} Gems` },
};
export const CHAMPION_BONUS_IDS = Object.keys(CHAMPION_BONUSES) as ChampionBonusId[];

/** Bonus `id`'s value at `tier`: none below its own tier. */
export function bonusAt(id: ChampionBonusId, tier: number | null) {
  const b = CHAMPION_BONUSES[id];
  if (tier === null || tier < b.tier) return 0;
  const v = snap(b.base + b.step * (tier - b.tier));
  return b.cap === undefined ? v : Math.min(b.cap, v);
}

/** Bonus `id`'s value for `save` now: none for a player who isn't a Champion. */
export const championValue = (save: Pick<Save, "entitlements" | "vip">, id: ChampionBonusId) => bonusAt(id, championTier(save));

/** The Stellar Floor chance (points) added to every run's, beside Aurum
 * Bloom's: the relics' and Champion Status's. */
export const extraStellarFloor = (save: Pick<Save, "entitlements" | "vip" | "relics">) => snap(relicAmount(save, "stellarFloor") + championValue(save, "stellarFloor"));

/** What the Champion adds to the ad Gem button: rewards its bank holds,
 * seconds off its cooldown (the bundle's and the tier's), Gems a reward,
 * and the percent chance a reward pays `AD_JACKPOT_GEMS` instead. */
export function championAd(save: Pick<Save, "entitlements" | "vip">) {
  if (!isChampion(save)) return { cap: 0, seconds: 0, gems: 0, jackpot: 0 };
  return { cap: championValue(save, "gemBank"), seconds: CHAMPION_GEM_COOLDOWN + championValue(save, "gemCooldown"), gems: championValue(save, "adGems"), jackpot: championValue(save, "adJackpot") };
}

// --- What a Champion keeps ---

export type ChampionSave = {
  /** The Shop day (GMT, `gmtDay`) the Daily Training Points were last claimed on; 0 before. */
  dailyDay: number;
  /** One Piece Tickets claimed, one for each tier from `TICKET_TIER` on. */
  ticketsClaimed: number;
  /** One Piece Tickets held: each redeems a free five-Star Unique. */
  tickets: number;
};
export const defaultChampion = (): ChampionSave => ({ dailyDay: 0, ticketsClaimed: 0, tickets: 0 });
export function decodeChampion(raw: unknown): ChampionSave {
  const d = defaultChampion();
  if (!isRecord(raw)) return d;
  d.dailyDay = count(raw.dailyDay, 0);
  d.ticketsClaimed = count(raw.ticketsClaimed, 0);
  d.tickets = count(raw.tickets, 0);
  return d;
}

// --- Daily Training Points ---

/** Whether the Daily Training Points can be claimed at server time `now`. */
export const dailyReady = (save: Pick<Save, "entitlements" | "champion">, now: number) => isChampion(save) && gmtDay(now) > save.champion.dailyDay;
/** When the next Daily Training Points can be claimed, after one claimed at `now`. */
export const nextDailyAt = (now: number) => (gmtDay(now) + 1) * DAY_MS;

/** The multiplier a claim rolls: ×5 at its chance, else ×3 at its, else
 * ×2 at its, else ×1, each its own draw from `rng`. */
export function rollDaily(save: Pick<Save, "entitlements" | "vip">, rng: () => number) {
  for (const [id, times] of [["dailyFive", 5], ["dailyTriple", 3], ["dailyDouble", 2]] as const) {
    const chance = championValue(save, id);
    if (chance > 0 && rng() * 100 < chance) return times;
  }
  return 1;
}

/** Claims the Daily Training Points at server time `now`: the points paid
 * and their multiplier, or null when none can be claimed. */
export function claimDaily(save: Save, now: number, rng: () => number) {
  if (!dailyReady(save, now)) return null;
  const times = rollDaily(save, rng), points = DAILY_TRAINING_POINTS * times;
  save.champion.dailyDay = gmtDay(now);
  save.bonusTrainingPoints += points;
  return { points, times };
}

// --- One Piece Tickets ---

/** One Piece Tickets the Champion's tier has opened in all. */
export const ticketsEarned = (save: Pick<Save, "entitlements" | "vip">) => Math.max(0, (championTier(save) ?? 0) - TICKET_TIER + 1);
/** One Piece Tickets opened and not yet claimed. */
export const ticketsWaiting = (save: Pick<Save, "entitlements" | "vip" | "champion">) => Math.max(0, ticketsEarned(save) - save.champion.ticketsClaimed);
/** The Uniques a One Piece Ticket may redeem: every one of the Equipment
 * categories open. */
export const onePieceChoices = (save: Pick<Save, "equipment">) => availableCategories(save.equipment).flatMap((c) => uniquesOf(c));

/** Redeems a One Piece Ticket for a five-Star copy of Unique `def`: the
 * piece, or why not (no ticket, not one of the choices, no room). */
export function redeemTicket(save: Pick<Save, "equipment" | "champion">, def: string) {
  if (save.champion.tickets < 1) return "ticket" as const;
  if (!onePieceChoices(save).some((d) => d.id === def)) return "choice" as const;
  const item = addFiveStar(save.equipment, def);
  if (!item) return "room" as const;
  save.champion.tickets--;
  return item;
}

/** Claims one waiting One Piece Ticket; false when none waits. */
export function claimTicket(save: Pick<Save, "entitlements" | "vip" | "champion">) {
  if (!ticketsWaiting(save)) return false;
  save.champion.ticketsClaimed++;
  save.champion.tickets++;
  return true;
}
