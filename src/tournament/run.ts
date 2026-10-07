import type { Enemy, Mode, Tile } from "../entities.ts";
import { snap } from "../exact.ts";
import { random } from "../random.ts";
import { isLeague, type League } from "./leagues.ts";
import type { TournamentSeeds } from "./server.ts";

// A tournament run (docs/TOURNAMENT.md): a Delve run in the league's cave,
// played from the seeds every entrant of the league shares, among enemies
// stronger than the cave's own. What it carries is saved on the run, so
// undo and reloads keep it.

/** What a tournament run carries: the tournament and league it was entered
 * in, the server's entry id, the shared seeds, how many numbers each of the
 * run's own chance streams has drawn (so undo takes draws back and a reload
 * carries on where it stopped), and where the player came from (the mode
 * and the Delve tier selected), which the forest returns to afterwards. */
export type TournamentRun = {
  id: string;
  league: League;
  entry: string;
  seeds: TournamentSeeds;
  drawn: { game: number; equipment: number };
  back: { mode: Mode; tier: number };
};

/** Tournament enemies' HP, ATK and DEF, in tenths of the cave's: ×1.1. */
export const TOURNAMENT_STAT_TENTHS = 11;

/** `tile` as it stands in a tournament run: an enemy ×1.1 (after its
 * tier's factor), anything else as it was. */
export function tournamentTile(tile: Tile): Tile {
  if (tile.kind !== "enemy" || !tile.enemy) return tile;
  const e: Enemy = tile.enemy, f = (n: number) => snap((n * TOURNAMENT_STAT_TENTHS) / 10);
  return { ...tile, enemy: { ...e, hp: f(e.hp), attack: f(e.attack), defense: f(e.defense) } };
}

/** Every tile of `cells` as it stands in a tournament run. */
export function tournamentCells(cells: Map<string, Tile>) {
  const out = new Map<string, Tile>();
  for (const [k, t] of cells) out.set(k, tournamentTile(t));
  return out;
}

/** The step a mulberry32 stream's state takes each draw (random.ts). */
const STEP = 0x6d2b79f5;

/** One of a tournament run's chance streams: `game` (enemy drops, treasure)
 * or `equipment` (materials and boss pieces). Each draw is the next number
 * of the stream the server's seed starts, counted on the run. */
export function runStream(t: TournamentRun, which: keyof TournamentRun["drawn"]): () => number {
  return () => {
    const n = t.drawn[which];
    t.drawn = { ...t.drawn, [which]: n + 1 };
    return random((t.seeds[which] + Math.imul(n, STEP)) >>> 0)();
  };
}

/** A tournament run's score: the deepest depth it reached, as the HUD
 * counts it (from 1). */
export const tournamentScore = (run: { height: number; maxHeight?: number }) => (run.maxHeight ?? run.height) + 1;

const seed = (raw: unknown) => Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < 2 ** 32;
const drawn = (raw: unknown) => Number.isInteger(raw) && (raw as number) >= 0;

/** Whether `raw` is a saved TournamentRun. */
export function isTournamentRun(raw: any): raw is TournamentRun {
  return !!raw && typeof raw === "object" && typeof raw.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.id) &&
    isLeague(raw.league) && typeof raw.entry === "string" &&
    seed(raw.seeds?.layout) && seed(raw.seeds?.game) && seed(raw.seeds?.equipment) &&
    drawn(raw.drawn?.game) && drawn(raw.drawn?.equipment) &&
    (raw.back?.mode === "tower" || raw.back?.mode === "delve") && Number.isInteger(raw.back?.tier) && raw.back.tier >= 1;
}
