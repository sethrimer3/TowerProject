import { tileRandom } from "./random.ts";

// Floor Environments: rules a whole floor (in the Delve, each equivalent
// floor) may be given, each at its own chance. Each rolls the floor's own
// fixed number under its own salt, so a floor has its environments from the
// moment it is generated, environments overlap freely, and rolling one
// never shifts another or any stream. A floor with none is a plain floor.

/** What a run fixes about its environments as it goes inside: its seed and
 * each environment's percent chance (none without). */
export type EnvironmentRun = { seed: number; treasureFloor?: number; goldenFloor?: number };

export type EnvironmentId = "treasure" | "golden";
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
 * are treasure chests. Golden Floor (Golden Floor Chance research): every
 * Gold found on it is multiplied by Golden Floor Multiplier. */
export const ENVIRONMENTS: Readonly<Record<EnvironmentId, Environment>> = {
  treasure: { name: "Treasure Floor", salt: 0x7f10c, chance: (run) => run.treasureFloor ?? 0 },
  golden: { name: "Golden Floor", salt: 0x601de, chance: (run) => run.goldenFloor ?? 0 },
};
export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS) as EnvironmentId[];

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
