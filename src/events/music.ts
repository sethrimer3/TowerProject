// Bonus tracks (docs/EVENTS.md): music sold for good in every event's
// Store, each joining the play sequence once bought and paying Gold for
// good (theme-collection.ts, `TRACK_GOLD_PER_MILLE`). None yet: new songs
// come in a later task.

export type BonusTrack = { id: string; name: string };

/** Every bonus track, in the order the Store lists them. */
export const BONUS_TRACKS: readonly BonusTrack[] = [];

/** The Medals each bonus track costs. */
export const TRACK_MEDALS = 200;

/** The saved bonus tracks: known ids, each once. */
export const decodeMusic = (raw: unknown): string[] =>
  Array.isArray(raw) ? BONUS_TRACKS.map((t) => t.id).filter((id) => raw.includes(id)) : [];
