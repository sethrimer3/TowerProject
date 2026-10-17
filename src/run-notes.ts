import type { KeyColor } from "./config.ts";
import { isRecord } from "./decode.ts";
import { snap } from "./exact.ts";

// Run Notes: the trivia a run keeps for the Note Taking research's dialog
// (ui/run-notes-dialog.ts), counted on every run whether or not it is
// researched, so the notes are whole the moment it completes. What undo
// takes back with the run (steps, keys, doors, pickups, Silver) is kept in
// the run (`run.notes`); what undo never takes back (materials, Cells, Gems,
// equipment, like the Gold in `runGold`) is kept beside it, in the mode's
// `runFinds`, so a kill fought again after an undo, which pays nothing
// twice, isn't counted twice either.

/** The notes kept in the run, so undo takes them back with it. */
export type RunNotes = {
  /** When the run went inside (wall clock, ms). */
  startedAt: number;
  /** Steps taken inside. */
  steps: number;
  /** Keys picked up, by colour (a badge's scale can make one a fraction). */
  keys: Partial<Record<KeyColor, number>>;
  /** Doors opened or broken, by the door's name. */
  doors: Record<string, number>;
  potions: number;
  attackShards: number;
  defenseShards: number;
  /** Silver found (spending never takes it off). */
  silver: number;
};

/** The finds kept beside the run, which undo never takes back. */
export type RunFinds = {
  /** Chests' metal bars and Equipment's upgrade materials, by id. */
  materials: Record<string, number>;
  cells: number;
  gems: number;
  /** Equipment pieces kept from bosses. */
  equipment: number;
};

export const newNotes = (startedAt: number): RunNotes =>
  ({ startedAt, steps: 0, keys: {}, doors: {}, potions: 0, attackShards: 0, defenseShards: 0, silver: 0 });
export const defaultFinds = (): RunFinds => ({ materials: {}, cells: 0, gems: 0, equipment: 0 });

/** The run's notes, started (with no start time) for a run inside without
 * any; null in the forest, which keeps none. */
export function notesOf(run: { outside?: boolean; notes?: RunNotes }): RunNotes | null {
  if (run.outside) return null;
  return (run.notes ??= newNotes(0));
}

/** A key obtained (picked up, traded or siphoned), counted in the run's
 * notes (none in the forest). */
export function noteKey(run: { outside?: boolean; notes?: RunNotes }, color: KeyColor, amount: number) {
  const notes = notesOf(run);
  if (notes) tallyIn(notes.keys, color, amount);
}

/** Adds `amount` to `record[key]`. */
export function tallyIn<K extends string>(record: Partial<Record<K, number>>, key: K, amount = 1) {
  if (amount > 0) record[key] = snap((record[key] ?? 0) + amount);
}

const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const counts = (v: unknown) => isRecord(v) && Object.values(v).every(count);

/** Whether saved run notes are well formed (a malformed one is dropped). */
export const validNotes = (v: any) =>
  isRecord(v) && (["startedAt", "steps", "potions", "attackShards", "defenseShards", "silver"] as const).every((k) => count(v[k])) &&
  counts(v.keys) && Object.keys(v.keys).every((k) => k === "yellow" || k === "blue" || k === "red") && counts(v.doors);

export function decodeFinds(raw: any): RunFinds {
  const d = defaultFinds();
  if (!isRecord(raw)) return d;
  if (counts(raw.materials)) d.materials = { ...raw.materials };
  for (const k of ["cells", "gems", "equipment"] as const) if (count(raw[k])) d[k] = raw[k];
  return d;
}
