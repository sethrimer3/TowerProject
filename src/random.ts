/** A seeded random stream (mulberry32): each call returns the next number
 * in [0, 1). The same seed always gives the same stream, which is what
 * makes worlds, decor and replays deterministic. */
export function random(seed: number) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed number in [0, 1) for tile (x, y) under `seed`, with no stream
 * to consume. */
export function tileRandom(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The game's independent random streams, one per purpose, so drawing from
 * one never shifts another: `game` for what decides play outside the world
 * itself (new run seeds, enemy drops, treasure loot), `effects` for what
 * only shows (particles and the like), `badges` for the card badges
 * a Gem purchase draws (seeding the stream saved with the profile, which
 * draws carry on from: badges.ts), `equipment` for Gem equipment pulls
 * (seeding their saved stream the same way: equipment/acquire.ts). Worlds don't use these: each board
 * is a pure function of its run seed (`random`, `tileRandom`). A new purpose,
 * such as a chance-based effect or a minigame, gets its own name here. */
export type StreamName = "game" | "effects" | "badges" | "equipment";
const STREAMS: StreamName[] = ["game", "effects", "badges", "equipment"];
let streams = seeded(startSeed("game"));

/** The start-up seed of the named set of streams: the one a test pinned
 * (`globalThis.__pinnedSeeds`), so no seed depends on which module happened
 * to draw first, or else a fresh one from Math.random. */
function startSeed(name: string) {
  return (globalThis as { __pinnedSeeds?: Record<string, number> }).__pinnedSeeds?.[name] ?? Math.floor(Math.random() * 4294967296);
}

/** Every stream started afresh from one seed: each stream's own seed comes
 * from it and the stream's place in the list, never from another's use. */
function seeded(seed: number) {
  return Object.fromEntries(STREAMS.map((name, i) => [name, random(seed ^ Math.imul(i + 1, 0x9e3779b9))])) as Record<StreamName, () => number>;
}

/** Draws from the named stream as it stands at each draw. */
export const stream = (name: StreamName) => () => streams[name]();

/** Runs `body` with the named stream replaced by `rng` (tests), then
 * restores it. */
export function withStream<T>(name: StreamName, rng: () => number, body: () => T): T {
  const saved = streams[name];
  streams = { ...streams, [name]: rng };
  try { return body(); } finally { streams = { ...streams, [name]: saved }; }
}
