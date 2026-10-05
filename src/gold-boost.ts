import type { Save } from "./entities.ts";

/** The Gold ad: each one watched (no ad plays yet) stores real time in
 * which all Gold a run finds is multiplied, up to a cap. */

/** What the boost multiplies Gold by. */
export const GOLD_BOOST_FACTOR = 1.5;
/** The time one ad stores. */
export const GOLD_BOOST_MS = 20 * 60 * 1000;
/** The most time that can be stored. */
export const GOLD_BOOST_MAX_MS = 2 * 60 * 60 * 1000;

/** The boost time left at `now` (ms). */
export const goldBoostLeft = (save: Pick<Save, "goldBoostUntil">, now: number) => Math.max(0, save.goldBoostUntil - now);

/** What Gold found at `now` is multiplied by: the boost's factor while it lasts. */
export const goldBoostFactor = (save: Pick<Save, "goldBoostUntil">, now: number) => (now < save.goldBoostUntil ? GOLD_BOOST_FACTOR : 1);

/** Whether another ad can add time: the store isn't full. */
export const canClaimGoldBoost = (save: Pick<Save, "goldBoostUntil">, now: number) => goldBoostLeft(save, now) < GOLD_BOOST_MAX_MS;

/** Adds one ad's time to what is stored, up to the cap; false when it is full. */
export function claimGoldBoost(save: Pick<Save, "goldBoostUntil">, now: number) {
  if (!canClaimGoldBoost(save, now)) return false;
  save.goldBoostUntil = now + Math.min(goldBoostLeft(save, now) + GOLD_BOOST_MS, GOLD_BOOST_MAX_MS);
  return true;
}
