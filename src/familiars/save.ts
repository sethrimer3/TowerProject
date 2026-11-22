import type { Point } from "../entities.ts";
import { isRecord, wholeIn } from "../save/decode.ts";
import { FAMILIAR_IDS, statAt, type FamiliarId, type FamiliarLevels } from "./catalog.ts";

// What is kept of Familiars (docs/agents/familiars.md): between runs, those
// hatched with their levels and switches (`save.familiars`); in a run, where
// each stands in its path, cooldown and effect (`run.familiars`).

/** A familiar hatched: its levels, in its catalog order, and whether the player switched it off. */
export type FamiliarOwned = { levels: FamiliarLevels; off?: true };
/** The familiars hatched. The next egg's price is by how many, so their order isn't kept. */
export type FamiliarsSave = Partial<Record<FamiliarId, FamiliarOwned>>;

/** What a run keeps of one familiar: the turns it has moved, the cooldown's
 * turns left, its effect's turns left, and for the Wolf its dashes so far and
 * the point it is planted on (while `left`). */
export type FamiliarState = { turns: number; timer?: number; left?: number; casts?: number; at?: Point };
export type FamiliarsRun = Partial<Record<FamiliarId, FamiliarState>>;

export const defaultFamiliars = (): FamiliarsSave => ({});

export function decodeFamiliars(raw: unknown): FamiliarsSave {
  const out = defaultFamiliars();
  if (!isRecord(raw)) return out;
  for (const id of FAMILIAR_IDS) {
    const owned = raw[id];
    if (!isRecord(owned)) continue;
    const saved: unknown[] = Array.isArray(owned.levels) ? owned.levels : [];
    // A level past its stat's last is held there, so a shortened table keeps what was bought.
    const levels = [0, 1, 2, 3].map((slot) => {
      const level = saved[slot];
      return wholeIn(level, 0, 1e6) ? Math.min(level, statAt(id, slot).levels) : 0;
    }) as FamiliarLevels;
    out[id] = { levels, ...(owned.off === true ? { off: true as const } : {}) };
  }
  return out;
}

const MOST = 1e12;
const optional = (v: unknown, most: number) => v === undefined || wholeIn(v, 1, most);
const coordinate = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MOST;
const validPoint = (v: unknown) => isRecord(v) && coordinate(v.x) && coordinate(v.y);

function validState(id: string, v: unknown) {
  if (!isRecord(v) || !wholeIn(v.turns, 0, MOST) || !optional(v.timer, 1e6) || !optional(v.left, 1e6)) return false;
  if (id !== "wolf") return v.casts === undefined && v.at === undefined;
  // Planted only while its effect lasts, and always then.
  return optional(v.casts, MOST) && (v.left === undefined ? v.at === undefined : validPoint(v.at));
}

export const validFamiliarsRun = (v: unknown): v is FamiliarsRun =>
  isRecord(v) && Object.entries(v).every(([id, state]) => (FAMILIAR_IDS as readonly string[]).includes(id) && validState(id, state));
