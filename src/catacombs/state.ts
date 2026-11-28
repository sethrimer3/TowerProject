// What the Catacombs keep (docs/CATACOMBS.md), and starting a run.
import { random, stream, type StreamName } from "../random.ts";
import { DROP_IDS, DROPS, INGOTS, SPIRIT_RARITIES, type DropId, type IngotId, type SpiritRarity } from "./catalog.ts";
import { CORRIDOR_ROW, ENTRANCE_X, rollSlots, type Slot } from "./hall.ts";
import { magician, noPoints, type MagicPoints } from "./magic.ts";
import { defaultAbilities, noBuffs, type AbilityId, type AbilityState, type TapUnlock } from "./abilities.ts";
import { noUpgrades, type SpiritUpgradeId } from "./spirit-upgrades.ts";

/** A Catacomb run: its hall, that hall's six slots (null: empty), the
 * hero, the index of its next target (`hallTargets`; every earlier one is
 * done), the potions lying on the hall's side tiles, and whether the hero
 * fell last turn, so a restart is next. */
export type CatacombRun = {
  hall: number;
  slots: (Slot | null)[];
  target: number;
  hero: { x: number; y: number; mhp: number };
  potions: [number, number][];
  fell?: true;
};
/** The Catacombs' clock: when the last real turn fell due (wall clock,
 * ms), the seconds banked, and the haste chosen (×0: paused, each second
 * banked instead of played). */
export type Haste = 0 | 1 | 2 | 5 | 10 | 25 | 100;
export const HASTES: readonly Haste[] = [0, 1, 2, 5, 10, 25, 100];
export type ClockSave = { lastTurnAt: number; bank: number; haste: Haste };

/** The Catacombs' saved random streams, one a purpose, so drawing from one
 * never shifts another: the halls' spawns, the undead's drops, the
 * Magician's MCrits, crosshairs and potions. */
export const CATACOMB_STREAMS = ["spawns", "drops", "crits", "crosshairs", "potions"] as const;
export type CatacombStream = (typeof CATACOMB_STREAMS)[number];
/** The named stream each saved stream is seeded from, once. */
const SEEDS: Record<CatacombStream, StreamName> = { spawns: "catacombs", drops: "catacombDrops", crits: "catacombCrits", crosshairs: "crosshairs", potions: "potions" };

export type CatacombSave = {
  /** The tower number the run belongs to. */
  number: number;
  /** Null before the first entry. */
  run: CatacombRun | null;
  /** The deepest hall reached, by number. */
  best: Record<number, number>;
  /** Each saved stream's state; null before its first draw. */
  rng: Record<CatacombStream, number | null>;
  clock: ClockSave;
  mxp: number;
  points: MagicPoints;
  spirit: Record<SpiritRarity, number>;
  ingots: Record<IngotId, number>;
  /** Attacks left at double speed from Speed Drops: kept through a fall. */
  speed: number;
  /** Each ability's charges, cooldown and Auto. */
  abilities: Record<AbilityId, AbilityState>;
  /** Attacks left on each ability's buff. */
  buffs: Record<AbilityId, number>;
  /** The Spirit upgrades' levels. */
  upgrades: Record<SpiritUpgradeId, number>;
  /** The tap unlocks (Spirit Potion, Zap) whose lesson has been dismissed. */
  taught: TapUnlock[];
};

export const noRng = (): Record<CatacombStream, number | null> => ({ spawns: null, drops: null, crits: null, crosshairs: null, potions: null });
export const defaultCatacombs = (): CatacombSave => ({
  number: 1, run: null, best: {}, rng: noRng(),
  clock: { lastTurnAt: 0, bank: 0, haste: 1 },
  mxp: 0, points: noPoints(),
  spirit: Object.fromEntries(SPIRIT_RARITIES.map((r) => [r, 0])) as Record<SpiritRarity, number>,
  ingots: Object.fromEntries(INGOTS.map((i) => [i, 0])) as Record<IngotId, number>,
  speed: 0, abilities: defaultAbilities(), buffs: noBuffs(), upgrades: noUpgrades(), taught: [],
});

/** How far mulberry32's state moves a draw (random.ts), so the saved
 * stream carries on where it stopped. */
const STEP = 0x6d2b79f5;
/** Runs `draw` on saved stream `which` and saves where it stopped. */
export function drawing<T>(c: CatacombSave, which: CatacombStream, draw: (rng: () => number) => T): T {
  const state = c.rng[which] ?? Math.floor(stream(SEEDS[which])() * 4294967296), rng = random(state);
  let used = 0;
  const out = draw(() => (used++, rng()));
  c.rng[which] = (state + Math.imul(used, STEP)) >>> 0;
  return out;
}

/** Rolls each undead's drops at `chances` (percent): a draw a drop, and a
 * draw for the amount of each that lands, every whole amount in its range
 * as likely. */
export function rollDrops(slots: (Slot | null)[], chances: Record<DropId, number>, rng: () => number) {
  for (const slot of slots) {
    if (!slot) continue;
    for (const d of DROP_IDS) {
      if (chances[d] <= 0 || rng() * 100 >= chances[d]) continue;
      const { lo, hi } = DROPS[d];
      (slot.drops ??= {})[d] = lo + Math.floor(rng() * (hi - lo + 1));
    }
  }
  return slots;
}

/** Hall `hall` of the run under way, rolled on the spawn stream and its
 * drops on theirs, the hero at its entrance with `mhp`. */
export function enterHall(c: CatacombSave, hall: number, mhp: number): CatacombRun {
  const slots = drawing(c, "spawns", (rng) => rollSlots(hall, c.number, rng)), chances = magician(c).drops;
  if (DROP_IDS.some((d) => chances[d] > 0)) drawing(c, "drops", (rng) => rollDrops(slots, chances, rng));
  return { hall, slots, target: 0, hero: { x: ENTRANCE_X, y: CORRIDOR_ROW, mhp }, potions: [] };
}

/** A new run at Hall 1 of the run's number, MHP full. */
export function startRun(c: CatacombSave) {
  c.run = enterHall(c, 1, magician(c).mhp);
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
