import { giftAmount } from "./economy/gift-effects.ts";
import { bestWorn } from "./equipment/effects.ts";
import { relicAmount, relicFactor } from "./economy/relic-effects.ts";
import { GEM_COOLDOWN_MS, GEM_VALUE } from "./economy/gems.ts";
import { gemCardBonus } from "./cards/gem-card.ts";
import { CHAMPION_OFFLINE_TIME, championValue, isChampion } from "./shop/champion.ts";
import { researched } from "./progression/archives.ts";
import { isRecord, time } from "./save/decode.ts";
import type { Save } from "./save/shape.ts";
import { snap } from "./exact.ts";

// Recent Gold per Hour and Offline Gold. Each Tower climb, as it ends, keeps
// the Gold it found and the real time it took; the last ten give the Recent
// Gold per Hour (RGPH). Once the Offline Gold skill is owned, the time the
// app was closed pays a share of it (Offline Gold Multiplier), up to Offline
// Gold Duration, claimed as the app starts again. Champion Status
// (shop/champion.ts) pays it too, without the skill, at its own rate added,
// for twice the time, and Offline Gems besides: a share of the Gems the
// Recent Floors per Minute would have found on the floors' Gem timer and
// Gem chance, at their kinds' average value.
//
// Every time here is a wall-clock timestamp (ms), passed in: the local clock
// for now, the game server's in time.

/** How many of the latest Tower climbs the Recent Gold per Hour weighs. */
export const RECENT_CLIMBS = 10;
/** The least time away that counts as offline (ms): less is no time away,
 * and pays nothing. */
export const OFFLINE_MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

/** A Tower climb that ended: the Gold it found, the real time it took (ms)
 * and the floors new to it (none for one kept before they were counted). */
export type RecentClimb = { gold: number; ms: number; floors?: number };

/** Offline Gold that is owed: the time away, the most of it that pays, the
 * Recent Gold per Hour and the Offline Gold Multiplier (in tenths of a
 * percent) as the app started, and the Gold they make. */
export type OfflineGrant = { awayMs: number; capMs: number; rgph: number; multiplier: number; gold: number; gems: number };

export type OfflineSave = {
  /** When the app was last seen open (wall clock, ms); 0 before it was. */
  seenAt: number;
  /** The latest Tower climbs, oldest first, at most `RECENT_CLIMBS`. */
  climbs: RecentClimb[];
  /** Time offline (ms) during the Tower climb under way, which its real time leaves out. */
  climbAway: number;
  /** Offline Gold owed and not yet claimed, or null. */
  grant: OfflineGrant | null;
};

export const defaultOffline = (): OfflineSave => ({ seenAt: 0, climbs: [], climbAway: 0, grant: null });

const amount = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null);

export function decodeOffline(raw: unknown): OfflineSave {
  const d = defaultOffline();
  if (!isRecord(raw)) return d;
  d.seenAt = time(raw.seenAt);
  d.climbAway = time(raw.climbAway);
  if (Array.isArray(raw.climbs))
    d.climbs = raw.climbs
      .filter((c): c is RecentClimb => isRecord(c) && amount(c.gold) !== null && (amount(c.ms) ?? 0) > 0)
      .slice(-RECENT_CLIMBS)
      .map((c) => ({ gold: c.gold, ms: c.ms, ...(amount(c.floors) ? { floors: c.floors } : {}) }));
  const g = raw.grant;
  // A grant that pays nothing (saved before such grants were dropped) isn't owed.
  const gems = isRecord(g) ? amount(g.gems) ?? 0 : 0;
  if (isRecord(g) && (["awayMs", "capMs", "rgph", "multiplier", "gold"] as const).every((k) => amount(g[k]) !== null) && ((g.gold as number) > 0 || gems > 0))
    d.grant = { awayMs: g.awayMs, capMs: g.capMs, rgph: g.rgph, multiplier: g.multiplier, gold: g.gold, gems };
  return d;
}

/** Keeps a Tower climb that just ended, which found `gold` in `ms` of real
 * time, dropping the oldest past `RECENT_CLIMBS`. */
export function recordClimb(o: OfflineSave, gold: number, ms: number, floors = 0) {
  if (ms <= 0) return;
  o.climbs.push({ gold: Math.max(0, gold), ms, ...(floors > 0 ? { floors } : {}) });
  if (o.climbs.length > RECENT_CLIMBS) o.climbs.splice(0, o.climbs.length - RECENT_CLIMBS);
}

/** The Recent Gold per Hour: the latest climbs' Gold over their real time,
 * so a long climb weighs more than a short one; 0 before any. */
export function recentGoldPerHour(o: OfflineSave) {
  const ms = o.climbs.reduce((n, c) => n + c.ms, 0);
  return ms > 0 ? (o.climbs.reduce((n, c) => n + c.gold, 0) * HOUR_MS) / ms : 0;
}

/** The Recent Floors per Minute: the latest climbs' new floors over their
 * real time; 0 before any. */
export function recentFloorsPerMinute(o: OfflineSave) {
  const ms = o.climbs.reduce((n, c) => n + c.ms, 0);
  return ms > 0 ? (o.climbs.reduce((n, c) => n + (c.floors ?? 0), 0) * 60_000) / ms : 0;
}

/** The app starts at `now`: the time since it was last seen open, if a
 * minute or more, is time offline. It is left out of the Tower climb under
 * way (`climbing`), and, once Offline Gold is owned, owes a grant (unless
 * one is owed already) if it pays any Gold: no Recent
 * Gold per Hour owes nothing, so no dialog shows. Returns the grant owed,
 * if any. */
export function arrive(save: Save, now: number, climbing: boolean): OfflineGrant | null {
  const o = save.offline, away = o.seenAt ? now - o.seenAt : 0;
  o.seenAt = now;
  if (away >= OFFLINE_MIN_MS) {
    if (climbing) o.climbAway += away;
    if ((save.upgrades.offlineGold || isChampion(save)) && !o.grant) {
      const grant = offlineGrant(save, away);
      if (grant.gold > 0 || grant.gems > 0) o.grant = grant;
    }
  }
  return o.grant;
}

/** What `awayMs` offline pays now. */
export function offlineGrant(save: Save, awayMs: number): OfflineGrant {
  const champion = isChampion(save);
  const capMs = researched(save.archives, "offlineGoldMinutes") * 60_000 * (champion ? CHAMPION_OFFLINE_TIME : 1), rgph = recentGoldPerHour(save.offline);
  // Champion Status adds its rate (here in tenths of a percent), with or
  // without the skill; relics raise the multiplier by their percent.
  // The worn Idle Hands substats raise it, a kind of their own.
  const rate = (save.upgrades.offlineGold ? researched(save.archives, "offlineGoldMultiplier") : 0) + championValue(save, "offlineGold") * 10;
  const multiplier = snap((rate * relicFactor(save, "offlineGold") * (100 + bestWorn(save, "offlineGold"))) / 100);
  const paidMs = Math.min(awayMs, capMs);
  const gold = Math.floor((rgph * (paidMs / HOUR_MS) * multiplier) / 1000);
  return { awayMs, capMs, rgph, multiplier, gold: snap(gold), gems: offlineGems(save, paidMs) };
}

/** Offline Gems for `paidMs` away: Champion Status's share of the Gems the
 * Recent Floors per Minute would find in that time, by the floors' Gem
 * timer (one a cooldown at most, and a floor at most) and Gem chance (the
 * GEM card's and Champion Status's), each worth its kinds' average. */
export function offlineGems(save: Save, paidMs: number) {
  const share = championValue(save, "offlineGems"), fpm = recentFloorsPerMinute(save.offline);
  if (!share || !fpm) return 0;
  const floors = (fpm * paidMs) / 60_000, bonus = gemCardBonus(save);
  const timer = Math.min(floors, (paidMs * relicFactor(save, "floorGems")) / GEM_COOLDOWN_MS);
  const chance = (Math.min(100, bonus.gemChance + championValue(save, "gemChance")) / 100) * floors;
  const golden = Math.min(100, bonus.goldenGem + championValue(save, "goldenGem") + giftAmount(save, "goldenGem")) / 100, stellar = Math.min(100, bonus.stellarGem + relicAmount(save, "stellarGem")) / 100;
  const value = (1 - golden) * GEM_VALUE.plain + golden * ((1 - stellar) * GEM_VALUE.golden + stellar * GEM_VALUE.stellar);
  return Math.floor(((timer + chance) * value * share) / 100);
}
