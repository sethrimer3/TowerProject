import type { UpgradeId } from "./config.ts";
import { researched, type ArchivesSave, type ResearchTarget } from "./archives.ts";
import type { Run } from "./runs.ts";

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
  /** The research that adds uses, from its target's base: the uses a run starts with. */
  perRun: ResearchTarget;
  /** The skill that regains it, and the research that shortens the wait, from its target's base. */
  regain: UpgradeId;
  every: ResearchTarget;
  /** The run's count of uses spent. */
  used: "focusUsed" | "ignoreUsed" | "targetUsed";
};
const DEFS: Record<Charge, ChargeDef> = {
  focus: { skill: "focus", perRun: "focusPerRun", regain: "refocus", every: "refocusFloors", used: "focusUsed" },
  ignore: { skill: "ignore", perRun: "ignorePerRun", regain: "ignoreMore", every: "ignoreFloors", used: "ignoreUsed" },
  target: { skill: "target", perRun: "targetPerRun", regain: "targetMore", every: "targetFloors", used: "targetUsed" },
};

/** What the charges read from the profile. */
export type ChargeOwner = { upgrades: Record<UpgradeId, number>; archives: ArchivesSave };

/** Uses of `c` a run starts with: none without its skill. */
export function chargesPerRun(o: ChargeOwner, c: Charge) {
  const d = DEFS[c];
  return o.upgrades[d.skill] ? researched(o.archives, d.perRun) : 0;
}
/** New floors a run climbs to regain a use of `c`, or 0 without its regain
 * skill. */
export function regainEvery(o: ChargeOwner, c: Charge) {
  const d = DEFS[c];
  return o.upgrades[d.regain] ? Math.max(1, researched(o.archives, d.every)) : 0;
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
