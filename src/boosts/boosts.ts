import { MAX_MOVE_RATE } from "../config.ts";
import { researched, type ArchivesSave } from "../progression/archives.ts";
import { BOOST_RATE, doneAt, trainingSlots, workLeft } from "../progression/training-jobs.ts";
import { trainingRate, type EntitlementId } from "../shop/entitlements.ts";
import { isRecord } from "../save/decode.ts";
import { BOOST_IDS, BOOST_MS, BOOSTS, scaledBoost, type BoostId } from "./catalog.ts";
import { doneAfter, workBetween, type Pace, type RateWindow } from "./pace.ts";

/** The boosts running: when each ends (wall clock ms). Kept with the
 * profile, not a run, so a boost runs on between runs and while the game
 * is closed. A boost's value is read from the Archives each time it's
 * used, so Golden Scarab Effect counts at once. */
export type BoostsSave = Partial<Record<BoostId, number>>;

/** What the boosts read from the save. */
export type BoostOwner = {
  boosts: BoostsSave;
  archives: ArchivesSave;
  upgrades: { archives: number; endRush: number; speedUp: number; gemCard: number; extraTrainer: number };
  equipment: { unlocked: boolean };
  trainers: number;
  entitlements?: EntitlementId[];
  /** What the profile has earned, for the Rubies and Cells boosts. */
  profile: { earned: { rubies: number; cells: number } };
};

/** The boost `id`'s time left at `now` (ms), none once it has run out. */
export const boostLeft = (save: Pick<BoostOwner, "boosts">, id: BoostId, now: number) => Math.max(0, (save.boosts[id] ?? 0) - now);

/** Whether boost `id` runs at `now`. */
export const boostOn = (save: Pick<BoostOwner, "boosts">, id: BoostId, now: number) => boostLeft(save, id, now) > 0;

/** What boost `id` gives now, with the Golden Scarab Effect research the
 * Archives hold: its factor (×1.5 and up) or the steps or tiles it adds. */
export const boostStrength = (save: Pick<BoostOwner, "archives">, id: BoostId) => scaledBoost(id, researched(save.archives, "scarabEffect"));

/** Boost `id`'s factor at `now`: its strength while it runs, else 1. For
 * the boosts that are factors (all but Game Speed and End Rush). */
export const boostFactor = (save: Pick<BoostOwner, "boosts" | "archives">, id: BoostId, now: number) => (boostOn(save, id, now) ? boostStrength(save, id) : 1);

/** What boost `id` adds at `now`: its strength while it runs, else 0. For
 * Game Speed and End Rush. */
export const boostPlus = (save: Pick<BoostOwner, "boosts" | "archives">, id: BoostId, now: number) => (boostOn(save, id, now) ? boostStrength(save, id) : 0);

/** How long one Golden Scarab's boost lasts, with Golden Scarab Duration. */
export const boostDuration = (save: Pick<BoostOwner, "archives">) => Math.round((BOOST_MS * researched(save.archives, "scarabDuration")) / 100);

/** How long after a Golden Scarab is claimed before the next can appear,
 * with Golden Scarab Cooldown. */
export const scarabCooldown = (save: Pick<BoostOwner, "archives">) => researched(save.archives, "scarabCooldown") * 1000;

/** Whether a Golden Scarab may give boost `id` now: what it speeds up is
 * open (research once the Archives are, training once a trainer is hired,
 * End Rush once its skill is owned, Equipment drops once Equipment is open,
 * the Gem Bank once the GEM card is, Rubies and Cells once one has been
 * earned), and Game Speed only while the speed arrows can still go faster
 * than they reach. */
export function boostOpen(save: BoostOwner, id: BoostId) {
  const u = save.upgrades;
  switch (id) {
    case "research": return u.archives > 0;
    case "training": return trainingSlots(save) > 0;
    case "speed": return researched(save.archives, "moveSpeed") + u.speedUp < MAX_MOVE_RATE;
    case "endRush": return u.endRush > 0;
    case "equipmentDrops": return save.equipment.unlocked;
    case "gemBank": return u.gemCard > 0;
    case "rubies": return save.profile.earned.rubies > 0;
    case "cells": return save.profile.earned.cells > 0;
    default: return true;
  }
}

/** The boosts a Golden Scarab may give now, in the catalog's order. */
export const openBoosts = (save: BoostOwner) => BOOST_IDS.filter((id) => boostOpen(save, id));

/** Picks a boost among those open now, each as likely (`rng`, a draw in
 * [0, 1)); null when none is (never: Gold, XP and Card XP always are). */
export function rollBoost(save: BoostOwner, rng: () => number): BoostId | null {
  const open = openBoosts(save);
  return open.length ? open[Math.min(open.length - 1, Math.floor(rng() * open.length))]! : null;
}

/** Adds `ms` to boost `id` from `now`: on top of the time it has left, or
 * from now when it has run out. Returns its new end. */
export function addBoost(save: Pick<BoostOwner, "boosts">, id: BoostId, ms: number, now: number) {
  const until = now + boostLeft(save, id, now) + ms;
  save.boosts[id] = until;
  return until;
}

/** How fast trainers train over the wall clock: the Shop's `rate`, the
 * training ad's ×2 until `until`, and a Golden Scarab's Training Speed
 * boost (`scarab`) while it runs. */
export type TrainingPace = { until: number; rate: number; scarab?: RateWindow };

/** The training pace now. */
export function trainingPace(save: Pick<BoostOwner, "boosts" | "archives" | "entitlements"> & { trainingBoostUntil: number }): TrainingPace {
  const until = save.boosts.training ?? 0, pace: TrainingPace = { until: save.trainingBoostUntil, rate: trainingRate({ entitlements: save.entitlements ?? [] }) };
  return until > 0 ? { ...pace, scarab: { until, factor: boostStrength(save, "training") } } : pace;
}
const paceOf = (p: TrainingPace): Pace => ({ rate: p.rate, windows: [{ until: p.until, factor: BOOST_RATE }, ...(p.scarab ? [p.scarab] : [])] });
/** Whether `p`'s Training Speed boost still runs at `now`. */
const scarabOn = (p: TrainingPace, now: number) => !!p.scarab && p.scarab.until > now;

/** The training (ms at the normal rate) a rank due at `completesAt` still
 * needs at `now`: `workLeft`, the Training Speed boost counted. */
export const trainingLeft = (completesAt: number, now: number, p: TrainingPace) =>
  scarabOn(p, now) ? Math.max(0, workBetween(now, completesAt, paceOf(p))) : workLeft(completesAt, p.until, now, p.rate);

/** When `work` ms of training started at `now` are done: `doneAt`, the
 * Training Speed boost counted. */
export const trainingDoneAt = (work: number, now: number, p: TrainingPace) =>
  scarabOn(p, now) ? Math.round(doneAfter(work, now, paceOf(p))) : doneAt(work, p.until, now, p.rate);

/** How many times as fast as the normal rate training goes at `now`. */
export const trainingSpeedAt = (now: number, p: TrainingPace) =>
  p.rate * (now < p.until ? BOOST_RATE : 1) * (scarabOn(p, now) ? p.scarab!.factor : 1);

/** Whether two training paces are the same. */
export const samePace = (a: TrainingPace, b: TrainingPace) =>
  a.until === b.until && a.rate === b.rate && a.scarab?.until === b.scarab?.until && a.scarab?.factor === b.scarab?.factor;

/** A saved BoostsSave: each boost's end, a whole number of ms after the
 * epoch; anything else is dropped, and so is a boost long over. */
export function decodeBoosts(raw: unknown): BoostsSave {
  const out: BoostsSave = {};
  if (!isRecord(raw)) return out;
  for (const id of BOOST_IDS) {
    const v = raw[id];
    if (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= Number.MAX_SAFE_INTEGER) out[id] = v;
  }
  return out;
}

/** The name of a boost with its value now, as the player reads it: "Gold ×1.5". */
export const boostLabel = (id: BoostId, value: number) => `${BOOSTS[id].name} ${BOOSTS[id].plus ? `+${value}` : `×${Number(value.toFixed(3))}`}`;
