import { TRAINING } from "./config.ts";
import { fraction, isRecord, time } from "./decode.ts";
import type { Save } from "./save-shape.ts";
import { snap } from "./exact.ts";
import { seedCardBuys } from "./card-buys.ts";
import { stream } from "./random.ts";

/** The currencies whose lifetime earnings the player profile tallies. */
export const LIFETIME_CURRENCIES = ["gold", "silver", "gems", "ascensionShards", "cells", "medals", "inspiration", "courage", "tickets", "trialPoints"] as const;
export type LifetimeCurrency = (typeof LIFETIME_CURRENCIES)[number];

/** The lifetime tallies the Settings page's Stats dialog shows: kept as
 * they happen, never derived from what is held now, so spending never
 * lowers what was earned. */
export type Profile = {
  /** When the profile was made (wall clock, ms); 0 until the app stamps it. */
  createdAt: number;
  /** Each currency earned over the profile's life: found, won, claimed or
   * bought (nothing spent is taken off). Silver found in a run is taken
   * back by undo, with the run. */
  earned: Record<LifetimeCurrency, number>;
  /** Training ranks gained, by training points or trainers (a reset never
   * takes them off). */
  trainingLevels: number;
  /** Research levels completed. */
  researchLevels: number;
  /** Gold paid to trainers, less what came back (a rank stopped, a reset). */
  trainingGold: number;
  /** Gold paid for research, less what came back (research stopped). */
  researchGold: number;
};

/** The tallies that are counts rather than a currency earned. */
export type ProfileCount = "trainingLevels" | "researchLevels" | "trainingGold" | "researchGold";

/** Anything holding a profile: a `Save`, or a part of one a module reads
 * (the Archives' owner); a test's bare owner may have none. */
type Holder = { profile?: Profile };

export function defaultProfile(): Profile {
  return {
    createdAt: 0,
    earned: Object.fromEntries(LIFETIME_CURRENCIES.map((c) => [c, 0])) as Profile["earned"],
    trainingLevels: 0,
    researchLevels: 0,
    trainingGold: 0,
    researchGold: 0,
  };
}

/** Adds `amount` of currency `c` to what the profile has earned. */
export function earn(o: Holder, c: LifetimeCurrency, amount: number) {
  if (o.profile && amount > 0) o.profile.earned[c] = snap(o.profile.earned[c] + amount);
}

/** Moves count `k` by `amount` (less for Gold given back), never below 0. */
export function tally(o: Holder, k: ProfileCount, amount: number) {
  if (o.profile && amount) o.profile[k] = Math.max(0, snap(o.profile[k] + amount));
}

/** Stamps the profile's creation at `now`, unless it has one, and seeds
 * its card buys' stream, unless it is seeded. */
export function stampProfile(save: Save, now: number) {
  if (!save.profile.createdAt) save.profile.createdAt = now;
  // The profile's own card buys stream, seeded once and never again.
  seedCardBuys(save.cardBuys, stream("cardBuys"));
}

export function decodeProfile(raw: unknown): Profile {
  const d = defaultProfile();
  if (!isRecord(raw)) return d;
  d.createdAt = time(raw.createdAt);
  for (const c of LIFETIME_CURRENCIES) d.earned[c] = fraction(raw.earned?.[c], 0);
  for (const k of ["trainingLevels", "researchLevels", "trainingGold", "researchGold"] as const) d[k] = fraction(raw[k], 0);
  return d;
}

/** Raises each tally to at least what the rest of `save` proves (a save
 * from before the profile kept them): the currencies held, the Training
 * ranks held and the Gold paid for them, and the research levels done. */
export function backfillProfile(save: Save) {
  const p = save.profile, at = (c: LifetimeCurrency, held: number) => (p.earned[c] = Math.max(p.earned[c], held));
  at("gold", save.gold);
  at("gems", save.gems);
  at("ascensionShards", save.ascensionShards);
  at("cells", save.cells);
  at("medals", save.medals);
  at("inspiration", save.tower.inspiration);
  at("courage", save.delve.courage);
  at("tickets", save.tournament.tickets);
  at("trialPoints", save.trialAccess.points);
  const ranks = TRAINING.reduce((n, t) => n + save.training[t.id], 0);
  const gold = TRAINING.reduce((n, t) => snap(n + save.trainingPaid[t.id].gold), 0);
  const levels = Object.values(save.archives.levels).reduce<number>((n, l) => n + (l ?? 0), 0);
  p.trainingLevels = Math.max(p.trainingLevels, ranks);
  p.trainingGold = Math.max(p.trainingGold, gold);
  p.researchLevels = Math.max(p.researchLevels, levels);
}
