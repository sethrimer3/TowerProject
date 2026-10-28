/** A screen is shown empty for 100ms before the hero walks in. This is
 * presentation state; the saved hero already occupies the safe landing tile. */
export const FOREST_ARRIVAL_PAUSE_MS = 100;
export const FOREST_ARRIVAL_WALK_MS = 300;
export type ForestArrival = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  started: number | null;
};
export function forestArrivalPose(arrival: ForestArrival, now: number, walkMs: number) {
  const elapsed = now - (arrival.started ?? now);
  const progress = walkMs ? Math.max(0, Math.min(1, (elapsed - FOREST_ARRIVAL_PAUSE_MS) / walkMs)) : 1;
  return {
    x: arrival.from.x + (arrival.to.x - arrival.from.x) * progress,
    y: arrival.from.y + (arrival.to.y - arrival.from.y) * progress,
    visible: elapsed >= FOREST_ARRIVAL_PAUSE_MS,
  };
}
