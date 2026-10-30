import { researched } from "./progression/archives.ts";
import { isRecord, time } from "./save/decode.ts";
import type { Save } from "./save/shape.ts";
import { snap } from "./exact.ts";

// Recent Gold per Hour and Offline Gold. Each Tower climb, as it ends, keeps
// the Gold it found and the real time it took; the last ten give the Recent
// Gold per Hour (RGPH). Once the Offline Gold skill is owned, the time the
// app was closed pays a share of it (Offline Gold Multiplier), up to Offline
// Gold Duration, claimed as the app starts again.
//
// Every time here is a wall-clock timestamp (ms), passed in: the local clock
// for now, the game server's in time.

/** How many of the latest Tower climbs the Recent Gold per Hour weighs. */
export const RECENT_CLIMBS = 10;
/** The least time away that counts as offline (ms): less is no time away,
 * and pays nothing. */
export const OFFLINE_MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

/** A Tower climb that ended: the Gold it found and the real time it took (ms). */
export type RecentClimb = { gold: number; ms: number };

/** Offline Gold that is owed: the time away, the most of it that pays, the
 * Recent Gold per Hour and the Offline Gold Multiplier (in tenths of a
 * percent) as the app started, and the Gold they make. */
export type OfflineGrant = { awayMs: number; capMs: number; rgph: number; multiplier: number; gold: number };

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
      .map((c) => ({ gold: c.gold, ms: c.ms }));
  const g = raw.grant;
  if (isRecord(g) && (["awayMs", "capMs", "rgph", "multiplier", "gold"] as const).every((k) => amount(g[k]) !== null))
    d.grant = { awayMs: g.awayMs, capMs: g.capMs, rgph: g.rgph, multiplier: g.multiplier, gold: g.gold };
  return d;
}

/** Keeps a Tower climb that just ended, which found `gold` in `ms` of real
 * time, dropping the oldest past `RECENT_CLIMBS`. */
export function recordClimb(o: OfflineSave, gold: number, ms: number) {
  if (ms <= 0) return;
  o.climbs.push({ gold: Math.max(0, gold), ms });
  if (o.climbs.length > RECENT_CLIMBS) o.climbs.splice(0, o.climbs.length - RECENT_CLIMBS);
}

/** The Recent Gold per Hour: the latest climbs' Gold over their real time,
 * so a long climb weighs more than a short one; 0 before any. */
export function recentGoldPerHour(o: OfflineSave) {
  const ms = o.climbs.reduce((n, c) => n + c.ms, 0);
  return ms > 0 ? (o.climbs.reduce((n, c) => n + c.gold, 0) * HOUR_MS) / ms : 0;
}

/** The app starts at `now`: the time since it was last seen open, if a
 * minute or more, is time offline. It is left out of the Tower climb under
 * way (`climbing`), and, once Offline Gold is owned, owes a grant (unless
 * one is owed already). Returns the grant owed, if any. */
export function arrive(save: Save, now: number, climbing: boolean): OfflineGrant | null {
  const o = save.offline, away = o.seenAt ? now - o.seenAt : 0;
  o.seenAt = now;
  if (away >= OFFLINE_MIN_MS) {
    if (climbing) o.climbAway += away;
    if (save.upgrades.offlineGold && !o.grant) o.grant = offlineGrant(save, away);
  }
  return o.grant;
}

/** What `awayMs` offline pays now. */
export function offlineGrant(save: Save, awayMs: number): OfflineGrant {
  const capMs = researched(save.archives, "offlineGoldMinutes") * 60_000, rgph = recentGoldPerHour(save.offline);
  const multiplier = researched(save.archives, "offlineGoldMultiplier");
  const gold = Math.floor((rgph * (Math.min(awayMs, capMs) / HOUR_MS) * multiplier) / 1000);
  return { awayMs, capMs, rgph, multiplier, gold: snap(gold) };
}
