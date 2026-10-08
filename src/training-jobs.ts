import { TRAINER_GOLD_CURVES, type TrainingId } from "./config.ts";

// A Training rank is bought one of two ways: with training points, which
// count at once, or with Gold paid to a trainer, which takes time on the
// wall clock like the Archives' research. Every time here is a wall-clock
// timestamp (ms), passed in, so training runs on while the game is closed
// and tests set the clock.

/** A trainer's rank takes time on the same schedule as the Archives' long
 * projects: a stat's first four ranks are quick (15 s, 1 min, 5 min,
 * 10 min), then the m-th rank after them takes m quarter hours (15 min,
 * 30 min, 45 min …), before Faster Trainers research. */
const TRAINING_START_SECONDS = [15, 60, 300, 600];
export const TRAINING_STEP_SECONDS = 900;
/** The most one rank can take, so a stat trained very far never overflows. */
const TRAINING_LONGEST_SECONDS = 365 * 86400;
/** How many stats the hero can train at once, to start with. */
export const TRAINING_SLOTS = 1;
/** What each trainer bought with Gems costs, in order: each adds a slot. */
export const TRAINER_GEMS = [100, 300, 700, 1200, 1800] as const;
/** Gems that finish a rank in training at once: one per ten minutes left,
 * and one more for any part of ten minutes. */
export const FINISH_GEM_SECONDS = 600;
/** The Gold a trainer asks for a rank: this much for each training point
 * the rank would cost, times the rank's number (20 for Max HP's first,
 * 200 for its tenth, 60 for ATK's first). */
export const TRAINING_GOLD_PER_POINT = 20;
/** The training boost: while it lasts, ranks in training go `BOOST_RATE`
 * times as fast. Each claim adds `BOOST_STEP_MS`, up to `BOOST_MAX_MS`
 * banked, and can't be made while what is banked lies within
 * `BOOST_CLAIM_MARGIN_MS` of that. */
export const BOOST_RATE = 2, BOOST_STEP_MS = 3_600_000, BOOST_MAX_MS = 4 * BOOST_STEP_MS, BOOST_CLAIM_MARGIN_MS = 10 * 60_000;

/** One rank being trained: it counts when `completesAt` (ms) is reached.
 * `gold` is what was paid for it and `ms` the whole training time it
 * takes, both returned (as Gold and time credit) if it is stopped or the
 * stat reset. */
export type TrainingJob = { id: TrainingId; startedAt: number; completesAt: number; gold: number; ms: number };
/** What a stat's ranks were paid with: training points, Gold, and the
 * training time the trainers' ranks took (ms), all returned by a reset. */
export type TrainingPaid = { points: number; gold: number; ms: number };

/** Seconds the next rank takes for a stat that already has `ranks` ranks,
 * before Faster Trainers. */
export const trainingSeconds = (ranks: number) =>
  Math.min(TRAINING_LONGEST_SECONDS, TRAINING_START_SECONDS[ranks] ?? TRAINING_STEP_SECONDS * (ranks + 1 - TRAINING_START_SECONDS.length));
/** The training time (ms) of the next rank of a stat with `ranks` ranks,
 * at `speed` (Faster Trainers: 0.02 a level). */
export const trainingMs = (ranks: number, speed: number) => Math.round((trainingSeconds(ranks) * 1000) / (1 + speed));
/** The Gold a trainer asks for the next rank of `row`, with `ranks`
 * ranks, on the row's curve (`TRAINER_GOLD_CURVES`):
 * `TRAINING_GOLD_PER_POINT` a point of its cost times the rank's number,
 * times 1 + ranks / `growth`, rounded up. */
export const trainingGold = (row: { id: TrainingId; cost: number }, ranks: number) => {
  const { growth } = TRAINER_GOLD_CURVES[row.id];
  return Math.ceil((TRAINING_GOLD_PER_POINT * row.cost * (ranks + 1) * (growth + ranks)) / growth);
};

/** How many stats can be in training at once: the first slot, and one for
 * each trainer bought. */
export const trainingSlots = (save: { trainers: number }) => TRAINING_SLOTS + save.trainers;
/** The Gems the next trainer costs, or null once every one is bought. */
export const nextTrainerGems = (save: { trainers: number }) => TRAINER_GEMS[save.trainers] ?? null;
/** The Gems that finish a rank with `ms` of training left at once (none
 * once it's due). */
export const finishGems = (ms: number) => Math.max(0, Math.ceil(ms / (FINISH_GEM_SECONDS * 1000)));

/** The job training `id`, if any. */
export const trainingJob = (jobs: readonly TrainingJob[], id: TrainingId) => jobs.find((j) => j.id === id);

/** The boost still banked at `now` (ms), none once it has run out. */
export const boostLeft = (boostUntil: number, now: number) => Math.max(0, boostUntil - now);

/** The training still to do (ms, at the normal rate) on a job due at
 * `completesAt`, with the boost running to `boostUntil` and training going
 * `rate` times as fast besides (the Premium Coin Pack's ×3): the boosted
 * part of the wait counts double. This is what the job's timer shows, so
 * it counts down twice as fast while the boost lasts. */
export function workLeft(completesAt: number, boostUntil: number, now: number, rate = 1) {
  const boosted = Math.max(0, Math.min(completesAt, boostUntil) - now);
  return Math.max(0, rate * (BOOST_RATE * boosted + Math.max(0, completesAt - Math.max(now, boostUntil))));
}
/** When `work` ms of training started at `now` are done, with the boost
 * running to `boostUntil` and training going `rate` times as fast besides. */
export function doneAt(work: number, boostUntil: number, now: number, rate = 1) {
  const boosted = boostLeft(boostUntil, now), wall = work / rate;
  return Math.round(wall <= BOOST_RATE * boosted ? now + wall / BOOST_RATE : now + boosted + (wall - BOOST_RATE * boosted));
}
/** The boost's end after one more claim at `now`, or null when it can't be
 * claimed: an hour more, up to `BOOST_MAX_MS` banked, refused while what is
 * banked is within `BOOST_CLAIM_MARGIN_MS` of that. */
export function claimBoost(boostUntil: number, now: number): number | null {
  const left = boostLeft(boostUntil, now);
  return left >= BOOST_MAX_MS - BOOST_CLAIM_MARGIN_MS ? null : now + Math.min(BOOST_MAX_MS, left + BOOST_STEP_MS);
}
