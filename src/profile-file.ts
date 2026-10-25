/** The profile file: everything the save keeps between runs, with no run in
 * progress, as readable JSON in named sections. The Settings page's dev
 * buttons write it (Export) and read it back over the whole save (Import). */
import { isRecord } from "./save/decode.ts";
import { decodableVersion, decode } from "./save/save.ts";
import type { ModeSave, Save } from "./save/shape.ts";

export const PROFILE_FORMAT = "tower-delve-profile";

/** The save's fields, by the section of the file each goes in. */
export const PROFILE_SECTIONS = {
  profile: ["profile", "tutorials", "seen", "treeNotices"],
  settings: ["settings", "themes"],
  currencies: ["gold", "gems", "breakthrough", "ascensionShards", "medals", "cells", "xp", "goldBoostUntil", "gemDrop"],
  deck: ["hand", "cardLinks", "handSlots", "manualHand", "manualSlots", "cardXp", "cardTrees", "cardBuys", "badges"],
  upgrades: ["upgrades", "relics", "shrines"],
  training: ["bonusTrainingPoints", "training", "trainingPaid", "trainerRanks", "trainingJobs", "trainingAuto", "trainingCredit", "trainingBank", "trainingBoostUntil", "trainers"],
  research: ["archives"],
  premium: ["entitlements", "shop"],
  gear: ["provisions", "equipment"],
  towers: ["tower", "delve"],
  goals: ["goals", "trialAccess"],
  online: ["tournament", "mail", "missions", "events"],
} as const satisfies Record<string, readonly (keyof Save)[]>;

/** The save's fields in no section: its version, which heads the file, and
 * the Proving Grounds' attempt, a run in progress, left out. */
export const UNSECTIONED = ["version", "provingGrounds"] as const satisfies readonly (keyof Save)[];

/** What each mode's slice keeps between runs: its records, tiers and
 * currency. The rest (the run, its undo history and fall, the tiles it
 * looted, what it has found so far, the Delve's Automove memory) is the
 * run's. */
export const KEPT_SLICE = ["best", "reached", "tier", "tiersOpen", "tierRecords"] as const satisfies readonly (keyof ModeSave)[];

const slice = (mode: ModeSave) => Object.fromEntries(KEPT_SLICE.map((k) => [k, mode[k]]));

/** The profile file for `save`, made at `now` (wall clock, ms). */
export function exportProfile(save: Save, now: number): string {
  const kept: Record<string, unknown> = {
    ...save,
    tower: { ...slice(save.tower), inspiration: save.tower.inspiration },
    delve: slice(save.delve),
    // A Gem lying on a floor, and how far the runs have gone, are the runs'.
    gemDrop: { ...save.gemDrop, out: null, reached: { tower: null, delve: null } },
  };
  const sections = Object.fromEntries(Object.entries(PROFILE_SECTIONS).map(([name, keys]) =>
    [name, Object.fromEntries(keys.map((k) => [k, kept[k]]))]));
  return JSON.stringify({ format: PROFILE_FORMAT, version: save.version, exportedAt: new Date(now).toISOString(), ...sections }, null, 2) + "\n";
}

/** The save a profile file holds, decoded as a stored save is (whatever it
 * leaves out starts afresh), or why it can't be read. */
export function importProfile(text: string): { save: Save } | { error: string } {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { error: "The file isn't valid JSON." };
  }
  if (!isRecord(file) || file.format !== PROFILE_FORMAT) return { error: "The file isn't a Tower Delve profile." };
  if (!decodableVersion(file.version)) return { error: `The file's save version (${String(file.version)}) can't be read here.` };
  const raw: Record<string, unknown> = { version: file.version };
  for (const [name, keys] of Object.entries(PROFILE_SECTIONS)) {
    const section = file[name];
    if (section === undefined) continue;
    if (!isRecord(section)) return { error: `The file's ${name} section isn't readable.` };
    for (const k of keys) if (k in section) raw[k] = section[k];
  }
  return { save: decode(JSON.stringify(raw)) };
}
