import { FOCUS_PER_RUN, IGNORE_PER_RUN, REGAIN_FLOORS, TARGET_PER_RUN, type UpgradeId } from "./config.ts";
import { researched, type ArchivesSave, type ResearchTarget } from "./archives.ts";
import type { Run } from "./entities.ts";

// A run's charges: the uses of Focus, Ignore and Target it has. Each opens
// with its skill, starts every run with its research's count, and, once its
// regain skill is owned (Refocus, Ignore More, Target More), comes back one
// use every so many new floors climbed. The run keeps only what the player
// did (uses spent) and the floors counted toward the next regain, so research
// completed mid-run counts at once and undo never rolls it back.

export type Charge = "focus" | "ignore" | "target";
export const CHARGES: readonly Charge[] = ["focus", "ignore", "target"];

type ChargeDef = {
  /** The skill that opens it. */
  skill: UpgradeId;
  /** Uses a run starts with, and the research that adds more. */
  perRun: ResearchTarget;
  base: number;
  /** The skill that regains it, and the research that shortens the wait. */
  regain: UpgradeId;
  every: ResearchTarget;
  /** The run's count of uses spent. */
  used: "focusUsed" | "ignoreUsed" | "targetUsed";
};
const DEFS: Record<Charge, ChargeDef> = {
  focus: { skill: "focus", perRun: "focusPerRun", base: FOCUS_PER_RUN, regain: "refocus", every: "refocusFloors", used: "focusUsed" },
  ignore: { skill: "ignore", perRun: "ignorePerRun", base: IGNORE_PER_RUN, regain: "ignoreMore", every: "ignoreFloors", used: "ignoreUsed" },
  target: { skill: "target", perRun: "targetPerRun", base: TARGET_PER_RUN, regain: "targetMore", every: "targetFloors", used: "targetUsed" },
};

/** What the charges read from the profile. */
export type ChargeOwner = { upgrades: Record<UpgradeId, number>; archives: ArchivesSave };

/** Uses of `c` a run starts with: none without its skill. */
export function chargesPerRun(o: ChargeOwner, c: Charge) {
  const d = DEFS[c];
  return o.upgrades[d.skill] ? researched(o.archives, d.perRun, d.base) : 0;
}
/** New floors a run climbs to regain a use of `c`, or 0 without its regain
 * skill. */
export function regainEvery(o: ChargeOwner, c: Charge) {
  const d = DEFS[c];
  return o.upgrades[d.regain] ? Math.max(1, researched(o.archives, d.every, REGAIN_FLOORS)) : 0;
}
/** Uses of `c` the run has spent. */
export const chargesUsed = (run: Run, c: Charge) => run[DEFS[c].used] ?? 0;
/** Uses of `c` left in the run. */
export const chargesLeft = (o: ChargeOwner, run: Run, c: Charge) => Math.max(0, chargesPerRun(o, c) - chargesUsed(run, c));
/** Spends one use of `c`. */
export function spendCharge(run: Run, c: Charge) {
  run[DEFS[c].used] = chargesUsed(run, c) + 1;
}
/** A new floor climbed for the first time in the run: each charge that is
 * below its full count and has its regain skill counts it, and regains a
 * use once it has counted enough (a full charge's count waits). Returns
 * the charges regained. */
export function climbFloor(o: ChargeOwner, run: Run): Charge[] {
  const regained: Charge[] = [];
  for (const c of CHARGES) {
    const every = regainEvery(o, c);
    if (!every || chargesUsed(run, c) < 1 || chargesLeft(o, run, c) >= chargesPerRun(o, c)) continue;
    const counted = (run.regain?.[c] ?? 0) + 1;
    if (counted < every) {
      (run.regain ??= {})[c] = counted;
      continue;
    }
    run[DEFS[c].used] = chargesUsed(run, c) - 1;
    if (run.regain) delete run.regain[c];
    regained.push(c);
  }
  return regained;
}
/** Floors still to climb before `c` regains a use, or null when it isn't
 * regaining (no regain skill, or nothing spent). */
export function floorsToRegain(o: ChargeOwner, run: Run, c: Charge) {
  const every = regainEvery(o, c);
  if (!every || chargesLeft(o, run, c) >= chargesPerRun(o, c)) return null;
  return Math.max(1, every - (run.regain?.[c] ?? 0));
}
