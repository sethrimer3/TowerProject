import type { TrainingId } from "./config.ts";

/** Training a rank takes time, on the wall clock like the Archives'
 * research, and on the same schedule as their long projects: a stat's first
 * four ranks are quick (15 s, 1 min, 5 min, 10 min), then the m-th rank
 * after them takes m quarter hours (15 min, 30 min, 45 min …). */
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

/** One rank being trained: it counts when `completesAt` (ms) is reached. */
export type TrainingJob = { id: TrainingId; startedAt: number; completesAt: number };

/** Seconds the next rank takes for a stat that already has `ranks` ranks. */
export const trainingSeconds = (ranks: number) =>
  Math.min(TRAINING_LONGEST_SECONDS, TRAINING_START_SECONDS[ranks] ?? TRAINING_STEP_SECONDS * (ranks + 1 - TRAINING_START_SECONDS.length));

/** How many stats can be in training at once: the first slot, and one for
 * each trainer bought. */
export const trainingSlots = (save: { trainers: number }) => TRAINING_SLOTS + save.trainers;
/** The Gems the next trainer costs, or null once every one is bought. */
export const nextTrainerGems = (save: { trainers: number }) => TRAINER_GEMS[save.trainers] ?? null;
/** The Gems that finish a rank with `ms` left at once (none once it's due). */
export const finishGems = (ms: number) => Math.max(0, Math.ceil(ms / (FINISH_GEM_SECONDS * 1000)));

/** The job training `id`, if any. */
export const trainingJob = (jobs: readonly TrainingJob[], id: TrainingId) => jobs.find((j) => j.id === id);
