import { isRecord } from "../save/decode.ts";
import { random, stream } from "../random.ts";
import { decodeTimedFields, defaultTimedDrop, spotOf, type TimedDrop } from "../economy/timed-drop.ts";
import { SCARAB_MISSED_FLOORS } from "./catalog.ts";

/** Golden Scarabs: a timed find (`economy/timed-drop.ts`) like the floor
 * Gem, one at a time, on a cooldown of its own (15 minutes before Golden
 * Scarab Cooldown); claimed, it gives a boost (`boosts.ts`), picked from
 * the saved stream `rng` so a reload never picks again. */
export type ScarabDrop = TimedDrop & {
  /** The saved stream the boosts are picked from: seeded once from
   * `stream("scarabs")`; absent before the first pick. */
  rng?: number;
};

export const defaultScarabDrop = (): ScarabDrop => defaultTimedDrop();

/** A saved ScarabDrop, field by field; anything malformed starts afresh. */
export function decodeScarabDrop(raw: unknown): ScarabDrop {
  const d = defaultScarabDrop();
  if (!isRecord(raw)) return d;
  decodeTimedFields(raw, d, SCARAB_MISSED_FLOORS);
  d.out = spotOf(raw.out);
  if (typeof raw.rng === "number" && Number.isInteger(raw.rng) && raw.rng >= 0 && raw.rng < 4294967296) d.rng = raw.rng;
  return d;
}

/** How far mulberry32's state moves each draw (`random.ts`). */
const STEP = 0x6d2b79f5;

/** The next draw in [0, 1) from the scarabs' saved stream, moving it on. */
export function scarabDraw(drop: ScarabDrop) {
  const state = drop.rng ?? Math.floor(stream("scarabs")() * 4294967296), value = random(state)();
  drop.rng = (state + STEP) >>> 0;
  return value;
}
