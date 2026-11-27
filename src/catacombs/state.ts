// What the Catacombs keep (docs/CATACOMBS.md), and starting a run.
import { random, stream } from "../random.ts";
import { INGOTS, SPIRIT_RARITIES, type IngotId, type SpiritRarity } from "./catalog.ts";
import { CORRIDOR_ROW, ENTRANCE_X, rollSlots, type Slot } from "./hall.ts";
import { heroStats, noPoints, type MagicPoints } from "./magic.ts";

/** A Catacomb run: its hall, that hall's six slots (null: empty), the
 * hero, the index of its next target (`hallTargets`; every earlier one is
 * done), and whether the hero fell last turn, so a restart is next. */
export type CatacombRun = {
  hall: number;
  slots: (Slot | null)[];
  target: number;
  hero: { x: number; y: number; mhp: number };
  fell?: true;
};
/** The Catacombs' clock: when the last real turn fell due (wall clock,
 * ms), the seconds banked, and the haste chosen. */
export type Haste = 1 | 5 | 10 | 100;
export const HASTES: readonly Haste[] = [1, 5, 10, 100];
export type ClockSave = { lastTurnAt: number; bank: number; haste: Haste };
export type CatacombSave = {
  /** The tower number the run belongs to. */
  number: number;
  /** Null before the first entry. */
  run: CatacombRun | null;
  /** The deepest hall reached, by number. */
  best: Record<number, number>;
  /** The spawn stream's state, seeded once from `stream("catacombs")`; null before. */
  rng: number | null;
  clock: ClockSave;
  mxp: number;
  points: MagicPoints;
  spirit: Record<SpiritRarity, number>;
  ingots: Record<IngotId, number>;
};

export const defaultCatacombs = (): CatacombSave => ({
  number: 1, run: null, best: {}, rng: null,
  clock: { lastTurnAt: 0, bank: 0, haste: 1 },
  mxp: 0, points: noPoints(),
  spirit: Object.fromEntries(SPIRIT_RARITIES.map((r) => [r, 0])) as Record<SpiritRarity, number>,
  ingots: Object.fromEntries(INGOTS.map((i) => [i, 0])) as Record<IngotId, number>,
});

/** How far mulberry32's state moves a draw (random.ts), so the saved
 * stream carries on where it stopped. */
const STEP = 0x6d2b79f5;
/** Runs `draw` on the spawn stream and saves where it stopped. */
export function drawing<T>(c: CatacombSave, draw: (rng: () => number) => T): T {
  const state = c.rng ?? Math.floor(stream("catacombs")() * 4294967296), rng = random(state);
  let used = 0;
  const out = draw(() => (used++, rng()));
  c.rng = (state + Math.imul(used, STEP)) >>> 0;
  return out;
}

/** Hall `hall` of the run under way, rolled on the spawn stream, the hero at
 * its entrance with `mhp`. */
export function enterHall(c: CatacombSave, hall: number, mhp: number): CatacombRun {
  const slots = drawing(c, (rng) => rollSlots(hall, c.number, rng));
  return { hall, slots, target: 0, hero: { x: ENTRANCE_X, y: CORRIDOR_ROW, mhp } };
}

/** A new run at Hall 1 of the run's number, MHP full. */
export function startRun(c: CatacombSave) {
  c.run = enterHall(c, 1, heroStats(c.points).mhp);
  c.best[c.number] = Math.max(c.best[c.number] ?? 0, 1);
  return c.run;
}

/** Enters Catacomb `number` from the forest: the same number keeps the run
 * under way (starting one if none is); another starts a new run there. */
export function enterCatacomb(c: CatacombSave, number: number) {
  if (c.run && c.number === number) return c.run;
  c.number = number;
  return startRun(c);
}
