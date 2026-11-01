import { tileRandom } from "./random.ts";

// Floor Environments: rules a whole floor (in the Delve, each equivalent
// floor) may be given, each at its own chance. Each rolls the floor's own
// fixed number under its own salt, so a floor has its environments from the
// moment it is generated, environments overlap freely, and rolling one
// never shifts another or any stream. A floor with none is a plain floor.

/** A run's seed and each environment's percent chance (none without): what
 * it fixed as it went inside, with `withBloom`'s added. */
export type EnvironmentRun = { seed: number; treasureFloor?: number; goldenFloor?: number; stellarFloor?: number };

export type EnvironmentId = "treasure" | "golden" | "stellar";
type Environment = {
  /** The name the player sees. */
  name: string;
  /** What each floor's fixed number is salted with for this environment. */
  salt: number;
  /** The run's percent chance a floor has it. */
  chance(run: EnvironmentRun): number;
};

/** Every environment, in the order the enemy stats box lists them.
 * Treasure Floor (CHEST's tree): a floor's ATK and DEF shards and potions
 * are treasure chests. Golden Floor (Golden Floor Chance research, Aurum
 * Bloom): all Gold and Silver found on it is multiplied by Golden Floor
 * Multiplier. Stellar Floor (Aurum Bloom): all of it by `STELLAR_FACTOR`. */
export const ENVIRONMENTS: Readonly<Record<EnvironmentId, Environment>> = {
  treasure: { name: "Treasure Floor", salt: 0x7f10c, chance: (run) => run.treasureFloor ?? 0 },
  golden: { name: "Golden Floor", salt: 0x601de, chance: (run) => run.goldenFloor ?? 0 },
  stellar: { name: "Stellar Floor", salt: 0x57e11a, chance: (run) => run.stellarFloor ?? 0 },
};
export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS) as EnvironmentId[];

/** What a Stellar Floor multiplies its Gold and Silver by. */
export const STELLAR_FACTOR = 10;

/** What Aurum Bloom gives while the run holds it on: the Golden Floor's factor
 * it alone makes (`bonus`, from ×1) and, in percent, what it adds to the Golden
 * (`chance`) and Stellar Floor (`stellar`) chances. */
export type FloorBloom = { bonus: number; chance: number; stellar: number };

/** `run`'s chances with `bloom`'s added. They are read, never saved, so a
 * toggle or a level counts at once and undo can't touch them. */
export const withBloom = (run: EnvironmentRun, bloom: FloorBloom | undefined): EnvironmentRun =>
  bloom ? { seed: run.seed, treasureFloor: run.treasureFloor, goldenFloor: (run.goldenFloor ?? 0) + bloom.chance, stellarFloor: (run.stellarFloor ?? 0) + bloom.stellar } : run;

/** Whether equivalent floor `floor` (from 1) of a run seeded `seed` has
 * environment `id` at `chance` percent: the floor's own fixed number, so a
 * higher chance only ever adds floors. */
export const environmentOn = (id: EnvironmentId, seed: number, floor: number, chance: number) =>
  chance > 0 && tileRandom(floor, 0, seed ^ ENVIRONMENTS[id].salt) * 100 < chance;

/** Whether equivalent floor `floor` (from 1) of `run` has environment `id`. */
export const hasEnvironment = (run: EnvironmentRun, id: EnvironmentId, floor: number) =>
  environmentOn(id, run.seed, floor, ENVIRONMENTS[id].chance(run));

/** The environments `run` may give a floor, each with its percent chance:
 * only those with a chance above none. */
export const possibleEnvironments = (run: EnvironmentRun) =>
  ENVIRONMENT_IDS.map((id) => ({ id, name: ENVIRONMENTS[id].name, chance: ENVIRONMENTS[id].chance(run) })).filter((e) => e.chance > 0);
